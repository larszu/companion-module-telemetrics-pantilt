/**
 * Session logic for one Telemetrics connection, independent of Companion so it can be tested against
 * tools/mock-head.ts. The Companion instance (main.ts) owns the TCP socket and forwards bytes.
 */
import { EventEmitter } from 'node:events'
import {
	CAN,
	CR,
	HOME_COLUMN_ABORT,
	HOME_COLUMN_START,
	KF_APPEND,
	KF_QUERY,
	KF_START,
	LineSplitter,
	ON_SHOT_WINDOW,
	QUERY_COLUMN_HOME,
	QUERY_POSITION_CMD,
	QUERY_SYSTEM_ERROR,
	STABLE_WINDOW,
	STOP_CMD,
	TAKE_CONTROL_CMD,
	COLUMN_HOME_ERRORS,
	COLUMN_HOME_STATES,
	SYSTEM_ERRORS,
	automationRecallCmd,
	frame,
	keyframe,
	limitCmd,
	moveToCmd,
	parseColumnHome,
	parseLimitStatus,
	parseLine,
	parseSystemError,
	recallShotCmd,
	selectCameraCmd,
	speedToVelocity,
	stopAllAxesLines,
	storeShotCmd,
	toPosition,
	withinWindow,
	type ColumnAxis,
	type HeadModel,
	type HeadPosition,
	type LimitAxis,
	type LimitOp,
	type LimitStatus,
	type VelocityAxis,
} from './protocol.ts'
import { DEFAULT_RAMP, SpeedRamp, easedTrajectory, type EaseCurve, type RampOptions } from './ramp.ts'

/** Where the TCP connection goes. */
export type Target = 'direct' | 'rccp1' | 'automation'
/** Where shots live: poses stored by the module (CX / keyframes) or the head's own preset memory (C/E). */
export type ShotMode = 'module' | 'head'

export interface HeadOptions {
	target: Target
	model: HeadModel
	prefix: string
	invertPan: boolean
	invertTilt: boolean
	columnAxis: ColumnAxis
	ramp: RampOptions
	shotMode: ShotMode
	/** S5 only: play module shots as an eased keyframe stream instead of a CX move. */
	keyframes: boolean
	moveCurve: EaseCurve
	defaultShotTimeMs: number
	automationPage: number
	pollIntervalMs: number
	allowLimitChanges: boolean
	takeControl: boolean
	camera: number
}

export const DEFAULT_OPTIONS: HeadOptions = {
	target: 'direct',
	model: 'S4',
	prefix: '',
	invertPan: false,
	invertTilt: false,
	columnAxis: 'X',
	ramp: DEFAULT_RAMP,
	shotMode: 'module',
	keyframes: true,
	moveCurve: 'cubic',
	defaultShotTimeMs: 3000,
	automationPage: 0,
	pollIntervalMs: 250,
	allowLimitChanges: false,
	takeControl: false,
	camera: 0,
}

export interface StoredShot {
	pos: HeadPosition
	timeMs: number
}

export type ShotStatus = 'none' | 'moving' | 'onshot' | 'offshot' | 'sent'

export type ColumnHomePhase = 'idle' | 'armed' | 'running' | 'done' | 'error' | 'aborted'

export interface HeadState {
	connected: boolean
	position?: HeadPosition
	moving: boolean
	shot: { number: number; status: ShotStatus }
	columnHome: { phase: ColumnHomePhase; state?: number; error?: number; text: string }
	limits: { axis?: LimitAxis; status: LimitStatus; text: string }
	systemError?: { code: number; text: string }
	selectedCamera: number
	lastResponse: string
}

export type ChangeKind = 'position' | 'moving' | 'shot' | 'columnHome' | 'limits' | 'response' | 'camera' | 'system'

const TICK_MS = 40
/** Focus/iris on the S5 are relative steps; full speed = this many steps per second. */
const STEPS_PER_SECOND = 200
const KF_INTERVAL_MS = 50
const ARM_TIMEOUT_MS = 10_000
const HOMING_TIMEOUT_MS = 600_000
const LIMIT_CAPTURE_MS = 800

type Writer = (data: string | Buffer) => boolean

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

type HeadEvents = {
	change: [kind: ChangeKind]
	shots: [shots: Map<number, StoredShot>]
	log: [level: LogLevel, message: string]
}

export class HeadSession extends EventEmitter<HeadEvents> {
	opts: HeadOptions
	state: HeadState = {
		connected: false,
		moving: false,
		shot: { number: -1, status: 'none' },
		columnHome: { phase: 'idle', text: '' },
		limits: { status: {}, text: '' },
		selectedCamera: 0,
		lastResponse: '',
	}
	shots = new Map<number, StoredShot>()

	#write: Writer
	#lines = new LineSplitter()
	#ramps = new Map<VelocityAxis, SpeedRamp>()
	#sentVelocity = new Map<VelocityAxis, number>()
	#stepAcc = { F: 0, I: 0 }
	#tickTimer: NodeJS.Timeout | undefined
	#lastTick = 0
	#pollTimer: NodeJS.Timeout | undefined
	#statusTimer: NodeJS.Timeout | undefined
	#armTimer: NodeJS.Timeout | undefined
	#homingStarted = 0
	#homingProgress = false
	#posWaiters: ((p: HeadPosition) => void)[] = []
	#shotTarget: HeadPosition | undefined
	#shotStarted = 0
	#shotTimeMs = 0
	#prevPoll: HeadPosition | undefined
	#moveToken = 0
	#bufferLevel: { n: number; at: number } | null = null
	#limitCaptureUntil = 0
	#limitLines: string[] = []

	constructor(opts: Partial<HeadOptions>, write: Writer) {
		super()
		this.opts = { ...DEFAULT_OPTIONS, ...opts }
		this.#write = write
	}

	setOptions(opts: Partial<HeadOptions>): void {
		this.opts = { ...this.opts, ...opts }
		for (const r of this.#ramps.values()) r.opts = this.opts.ramp
	}

	#changed(kind: ChangeKind): void {
		this.emit('change', kind)
	}

	#log(level: LogLevel, message: string): void {
		this.emit('log', level, message)
	}

	get isS5(): boolean {
		return this.opts.model === 'S5'
	}

	get isDirect(): boolean {
		return this.opts.target === 'direct'
	}

	// ------------------------------------------------------------ wire

	/** One command line. Control lines to a head get a leading CAN (aborts a running recall). */
	send(cmd: string, control = true): boolean {
		if (!this.state.connected) {
			this.#log('warn', `Not connected, dropped: ${cmd}`)
			return false
		}
		this.#log('debug', `> ${cmd}`)
		return this.#write(frame(cmd, this.opts.prefix, control && this.isDirect))
	}

	/** S5 style: leading CR flushes a partial line in the head's parser. */
	#sendFlushed(cmd: string): boolean {
		if (!this.state.connected) return false
		this.#log('debug', `> ${cmd}`)
		return this.#write(`${CR}${this.opts.prefix}${cmd}${CR}`)
	}

	#sendRaw(data: string | Buffer): boolean {
		if (!this.state.connected) return false
		return this.#write(data)
	}

	// ------------------------------------------------------------ lifecycle

	onConnect(): void {
		this.state.connected = true
		this.#lines.reset()
		this.#sentVelocity.clear()
		if (this.isDirect) {
			this.#sendRaw(CR)
			if (this.opts.takeControl) this.send(TAKE_CONTROL_CMD)
			if (this.isS5) {
				this.#sendFlushed(QUERY_SYSTEM_ERROR)
				this.#sendFlushed(QUERY_COLUMN_HOME)
			}
			this.#startPolling()
		} else if (this.opts.target === 'rccp1' && this.opts.camera > 0) {
			this.selectCamera(this.opts.camera)
		}
		this.#changed('moving')
	}

	onDisconnect(): void {
		this.state.connected = false
		this.#stopPolling()
		this.#stopTick()
		this.#moveToken++
		for (const r of this.#ramps.values()) r.hard(0)
		this.#setMoving(false)
		if (this.state.columnHome.phase === 'armed') this.#setColumnHome('idle', 'disarmed (disconnected)')
	}

	destroy(): void {
		this.onDisconnect()
		if (this.#armTimer) clearTimeout(this.#armTimer)
		this.removeAllListeners()
	}

	onData(chunk: Buffer | string): void {
		const text = typeof chunk === 'string' ? chunk : chunk.toString('latin1')
		for (const line of this.#lines.push(text)) this.#handleLine(line)
	}

	// ------------------------------------------------------------ replies

	#handleLine(line: string): void {
		const msg = parseLine(line)
		if (!msg) return
		this.#log('debug', `< ${line.trim()}`)
		if (this.#limitCaptureUntil > Date.now() && msg.type === 'other') {
			this.#limitLines.push(msg.text)
			this.state.limits = {
				axis: this.state.limits.axis,
				text: this.#limitLines.join(' | '),
				status: parseLimitStatus(this.#limitLines.join('\n')),
			}
			this.#changed('limits')
			return
		}
		switch (msg.type) {
			case 'position': {
				const pos = toPosition(msg.values, this.state.position)
				if (!pos) return
				this.state.position = pos
				for (const w of this.#posWaiters.splice(0)) w(pos)
				this.#updateShot(pos)
				this.#changed('position')
				return
			}
			case 'buffer':
				this.#bufferLevel = { n: msg.level, at: Date.now() }
				return
			case 'cmd':
				return this.#handleCmd(msg.id, msg.fields)
			case 'sts12':
				this.#setResponse(line.trim())
				return
			case 'automation':
				this.#setResponse(msg.result)
				if (this.state.shot.status === 'sent' && (msg.result === 'NOP' || msg.result === 'INVCMD')) {
					this.state.shot = { ...this.state.shot, status: 'offshot' }
					this.#changed('shot')
				}
				return
			case 'other':
				this.#setResponse(msg.text)
				return
		}
	}

	#setResponse(text: string): void {
		this.state.lastResponse = text
		this.#changed('response')
	}

	#handleCmd(id: number, fields: string[]): void {
		if (id === 51) {
			const h = parseColumnHome(fields)
			if (!h) return
			const stateText = COLUMN_HOME_STATES[h.state] ?? `state ${h.state}`
			const errText = COLUMN_HOME_ERRORS[h.error] ?? `error ${h.error}`
			const phase = this.state.columnHome.phase
			let next: ColumnHomePhase = phase
			if (phase === 'running') {
				// A reply sent before the start command can still report the old "done"; trust it only after progress.
				if (h.state !== 255) this.#homingProgress = true
				if (!this.#homingProgress && Date.now() - this.#homingStarted < 3000) next = 'running'
				else if (h.error !== 0) next = 'error'
				else if (h.state === 255) next = 'done'
				else if (h.state === 17 || h.state === 18) next = 'aborted'
			}
			this.state.columnHome = {
				phase: next,
				state: h.state,
				error: h.error,
				text: h.error ? `${stateText}, ${errText}` : stateText,
			}
			if (next !== 'running' && phase === 'running') this.#stopStatusPoll()
			this.#changed('columnHome')
		} else if (id === 20) {
			const code = parseSystemError(fields)
			if (code === null) return
			this.state.systemError = { code, text: SYSTEM_ERRORS[code] ?? `code ${code}` }
			this.#changed('system')
		}
	}

	// ------------------------------------------------------------ polling

	#startPolling(): void {
		this.#stopPolling()
		const interval = this.opts.pollIntervalMs
		if (!interval || interval < 50) return
		this.#pollTimer = setInterval(() => this.queryPosition(), interval)
	}

	#stopPolling(): void {
		if (this.#pollTimer) clearInterval(this.#pollTimer)
		this.#pollTimer = undefined
		this.#stopStatusPoll()
	}

	queryPosition(): void {
		if (this.isDirect) this.send(QUERY_POSITION_CMD, false)
	}

	/** Next position reply (sends a query). */
	async nextPosition(timeoutMs = 1500): Promise<HeadPosition> {
		return new Promise((resolve, reject) => {
			const timer = setTimeout(() => {
				this.#posWaiters = this.#posWaiters.filter((w) => w !== waiter)
				reject(new Error('no position reply from the head'))
			}, timeoutMs)
			const waiter = (p: HeadPosition) => {
				clearTimeout(timer)
				resolve(p)
			}
			this.#posWaiters.push(waiter)
			this.queryPosition()
		})
	}

	/** Two consecutive reads that agree (as the Telemetrics software does before storing a shot). */
	async readStablePosition(timeoutMs = 2000): Promise<HeadPosition> {
		const end = Date.now() + timeoutMs
		let a = await this.nextPosition()
		while (Date.now() < end) {
			const b = await this.nextPosition()
			if (withinWindow(a, b, STABLE_WINDOW)) return b
			a = b
		}
		this.#log('warn', 'Head still moving while storing; stored the last position')
		return a
	}

	// ------------------------------------------------------------ velocity with ramps

	#ramp(axis: VelocityAxis): SpeedRamp {
		let r = this.#ramps.get(axis)
		if (!r) {
			r = new SpeedRamp(this.opts.ramp)
			this.#ramps.set(axis, r)
		}
		return r
	}

	/** Signed speed -100..100 for one axis. Ramped (attack/release) unless `immediate`. */
	setSpeed(axis: VelocityAxis, percent: number, immediate = false): void {
		let v = Math.max(-100, Math.min(100, percent))
		if (axis === 'P' && this.opts.invertPan) v = -v
		if (axis === 'T' && this.opts.invertTilt) v = -v
		if (v !== 0) this.cancelShot(false)
		const r = this.#ramp(axis)
		if (immediate) r.hard(v)
		else r.set(v)
		this.#tick()
		if (!this.#tickTimer) {
			this.#lastTick = Date.now()
			this.#tickTimer = setInterval(() => this.#tick(), TICK_MS)
		}
	}

	move(panPercent: number, tiltPercent: number): void {
		this.setSpeed('P', panPercent)
		this.setSpeed('T', tiltPercent)
	}

	/** Column (aux elevation) speed on the configured aux axis. */
	setColumnSpeed(percent: number): void {
		this.setSpeed(this.opts.columnAxis, percent)
	}

	/** S5 heads take focus and iris as relative steps only (FI/II); S4 heads take F/I velocities. */
	#isStepAxis(axis: VelocityAxis): axis is 'F' | 'I' {
		return this.isS5 && (axis === 'F' || axis === 'I')
	}

	#tick(): void {
		if (!this.state.connected) return this.#stopTick()
		const now = Date.now()
		const dt = Math.min(200, now - this.#lastTick)
		this.#lastTick = now
		const line: Partial<Record<VelocityAxis, number>> = {}
		const auxLines: string[] = []
		let active = false
		let moving = false
		for (const [axis, ramp] of this.#ramps) {
			const value = ramp.valueAt(now)
			if (!ramp.done(now) || value !== 0) active = true
			if (value !== 0) moving = true
			if (this.#isStepAxis(axis)) {
				this.#stepAcc[axis] += (value / 100) * STEPS_PER_SECOND * (dt / 1000)
				const n = Math.trunc(this.#stepAcc[axis])
				if (n !== 0) {
					this.#stepAcc[axis] -= n
					// Positive focus = far; iris: positive II closes, so open (+) = negative steps.
					this.send(`${axis}I${axis === 'I' ? -n : n}`)
				}
				if (value === 0) this.#stepAcc[axis] = 0
				continue
			}
			const vel = speedToVelocity(value)
			if (this.#sentVelocity.get(axis) === vel) continue
			this.#sentVelocity.set(axis, vel)
			if (axis === 'X' || axis === 'Y' || axis === 'Q') auxLines.push(`${axis}${vel}`)
			else line[axis] = value
		}
		const parts = Object.keys(line).length
			? [
					Object.entries(line)
						.map(([a, v]) => `${a}${speedToVelocity(v)}`)
						.join(''),
				]
			: []
		for (const p of [...parts, ...auxLines]) this.send(p)
		this.#setMoving(moving || this.state.shot.status === 'moving')
		if (!active) this.#stopTick()
	}

	#stopTick(): void {
		if (this.#tickTimer) clearInterval(this.#tickTimer)
		this.#tickTimer = undefined
	}

	#setMoving(moving: boolean): void {
		if (this.state.moving === moving) return
		this.state.moving = moving
		this.#changed('moving')
	}

	/** Emergency stop: no ramp, cancels recalls and keyframes, stops all axes, aborts column homing. */
	stopAll(): void {
		this.#moveToken++
		for (const r of this.#ramps.values()) r.hard(0)
		this.#stopTick()
		this.#stepAcc = { F: 0, I: 0 }
		if (this.isDirect) {
			this.send(STOP_CMD)
			this.#sendRaw(stopAllAxesLines())
			if (this.isS5) {
				this.#sendRaw(keyframe(KF_START))
				if (this.state.columnHome.phase === 'running') this.abortColumnHoming()
			}
		} else {
			this.send(STOP_CMD)
		}
		for (const a of this.#ramps.keys()) this.#sentVelocity.set(a, speedToVelocity(0))
		if (this.state.shot.status === 'moving') this.state.shot = { ...this.state.shot, status: 'offshot' }
		this.#changed('shot')
		this.#setMoving(false)
	}

	// ------------------------------------------------------------ shots

	/** Stores a shot. Module mode reads the pose (ptzfxymi); head mode sends `E n`. */
	async storeShot(n: number, timeMs?: number): Promise<boolean> {
		if (this.opts.target !== 'direct') {
			this.#log('warn', 'Storing shots needs a direct connection to the head')
			return false
		}
		if (this.opts.shotMode === 'head') return this.send(storeShotCmd(n))
		const pos = await this.readStablePosition()
		const prev = this.shots.get(n)
		this.shots.set(n, { pos, timeMs: timeMs ?? prev?.timeMs ?? this.opts.defaultShotTimeMs })
		this.emit('shots', this.shots)
		this.#log('info', `Shot ${n} stored`)
		return true
	}

	deleteShot(n: number): void {
		if (this.shots.delete(n)) this.emit('shots', this.shots)
	}

	/** Recalls a shot. `timeMs` overrides the stored move time. */
	async recallShot(n: number, timeMs?: number): Promise<boolean> {
		switch (this.opts.target) {
			case 'rccp1': {
				const sec = timeMs === undefined ? undefined : timeMs / 1000
				return this.#markSent(n, this.send(recallShotCmd(n, sec)))
			}
			case 'automation': {
				const sec = timeMs === undefined ? undefined : timeMs / 1000
				return this.#markSent(n, this.send(automationRecallCmd(this.opts.automationPage, n, sec), false))
			}
		}
		if (this.opts.shotMode === 'head') {
			if (!this.send(recallShotCmd(n))) return false
			this.#beginShot(n, undefined, 0)
			return true
		}
		const stored = this.shots.get(n)
		if (!stored) {
			this.#log('warn', `Shot ${n} is empty`)
			return false
		}
		return this.moveTo(stored.pos, timeMs ?? stored.timeMs, n)
	}

	#markSent(n: number, ok: boolean): boolean {
		if (ok) {
			this.state.shot = { number: n, status: 'sent' }
			this.#changed('shot')
		}
		return ok
	}

	/** Absolute move: eased keyframe stream on S5 heads (if enabled), otherwise CX with the move time. */
	async moveTo(target: HeadPosition, timeMs: number, shot = -1): Promise<boolean> {
		if (!this.state.connected) return false
		const token = ++this.#moveToken
		for (const r of this.#ramps.values()) r.hard(0)
		this.#stopTick()
		if (this.isS5 && this.opts.keyframes) {
			let from = this.state.position
			if (!from) from = await this.nextPosition().catch(() => undefined)
			if (from && token === this.#moveToken) {
				this.#beginShot(shot, target, timeMs)
				void this.#playKeyframes(from, target, timeMs, token)
				return true
			}
		}
		if (!this.send(moveToCmd(target, timeMs))) return false
		this.#beginShot(shot, target, timeMs)
		return true
	}

	#beginShot(n: number, target: HeadPosition | undefined, timeMs: number): void {
		this.#shotTarget = target
		this.#shotStarted = Date.now()
		this.#shotTimeMs = timeMs
		this.#prevPoll = undefined
		this.state.shot = { number: n, status: 'moving' }
		this.#changed('shot')
		this.#setMoving(true)
	}

	/** Cancels a running recall or keyframe move (CAN). */
	cancelShot(sendCancel = true): void {
		if (this.state.shot.status !== 'moving') return
		this.#moveToken++
		if (this.isDirect) {
			if (this.isS5 && this.opts.keyframes && this.opts.shotMode === 'module') {
				this.#sendRaw(stopAllAxesLines())
				this.#sendRaw(keyframe(KF_START))
			}
			if (sendCancel) this.#sendRaw(`${CAN}${CR}`)
		}
		this.state.shot = { ...this.state.shot, status: 'offshot' }
		this.#changed('shot')
	}

	#updateShot(pos: HeadPosition): void {
		if (this.state.shot.status !== 'moving') return
		const elapsed = Date.now() - this.#shotStarted
		let arrived: boolean
		if (this.#shotTarget) arrived = elapsed > 300 && withinWindow(pos, this.#shotTarget, ON_SHOT_WINDOW)
		else arrived = elapsed > 600 && !!this.#prevPoll && withinWindow(pos, this.#prevPoll, STABLE_WINDOW)
		this.#prevPoll = pos
		if (arrived) this.state.shot = { ...this.state.shot, status: 'onshot' }
		else if (elapsed > this.#shotTimeMs + 5000 && this.#shotTarget)
			this.state.shot = { ...this.state.shot, status: 'offshot' }
		else return
		this.#changed('shot')
		this.#setMoving([...this.#ramps.values()].some((r) => r.valueAt() !== 0))
	}

	async #playKeyframes(from: HeadPosition, to: HeadPosition, timeMs: number, token: number): Promise<void> {
		const axes: (keyof HeadPosition)[] = ['pan', 'tilt', 'zoom', 'focus', 'x', 'y']
		const pick = (p: HeadPosition) => Object.fromEntries(axes.map((a) => [a, p[a]]))
		const frames = easedTrajectory(
			pick(from),
			pick(to),
			Math.max(timeMs, KF_INTERVAL_MS),
			KF_INTERVAL_MS,
			this.opts.moveCurve,
		)
		this.#bufferLevel = null
		this.#sendRaw(keyframe(KF_START, frames[0]))
		for (let i = 1; i < frames.length; i++) {
			if (token !== this.#moveToken) return
			if (!(await this.#waitForRoom(token))) {
				if (token === this.#moveToken) {
					this.#log('warn', 'Keyframe move aborted (no buffer reply from the head)')
					this.#sendRaw(stopAllAxesLines())
					this.#sendRaw(keyframe(KF_START))
					this.state.shot = { ...this.state.shot, status: 'offshot' }
					this.#changed('shot')
				}
				return
			}
			this.#sendRaw(keyframe(KF_APPEND, frames[i]))
		}
	}

	/** Waits for a `CH=` reply with room in the head's buffer (< 10 frames). */
	async #waitForRoom(token: number): Promise<boolean> {
		const start = Date.now()
		let lastQuery = 0
		for (;;) {
			if (token !== this.#moveToken || !this.state.connected) return false
			const lvl = this.#bufferLevel
			if (lvl && lvl.n < 0) return false
			if (lvl && lvl.at >= start - 60 && lvl.n < 10) {
				this.#bufferLevel = null
				return true
			}
			if (Date.now() - start > 1000) return false
			if (Date.now() - lastQuery > 100) {
				this.#sendRaw(keyframe(KF_QUERY))
				lastQuery = Date.now()
			}
			await new Promise((r) => setTimeout(r, 10))
		}
	}

	// ------------------------------------------------------------ RCCP-1

	selectCamera(camera: number): boolean {
		if (!this.send(selectCameraCmd(camera), false)) return false
		this.state.selectedCamera = camera
		this.#changed('camera')
		return true
	}

	// ------------------------------------------------------------ column homing (S5, two-step)

	#setColumnHome(phase: ColumnHomePhase, text: string): void {
		this.state.columnHome = { ...this.state.columnHome, phase, text }
		this.#changed('columnHome')
	}

	/** Step 1: arm column homing for 10 s. Nothing is sent to the head. */
	armColumnHoming(): boolean {
		if (!this.isS5 || !this.isDirect) {
			this.#log('warn', 'Column homing exists only on S5 heads (direct connection)')
			return false
		}
		if (this.state.columnHome.phase === 'running') return false
		if (this.#armTimer) clearTimeout(this.#armTimer)
		this.#armTimer = setTimeout(() => {
			if (this.state.columnHome.phase === 'armed') this.#setColumnHome('idle', 'disarmed (timeout)')
		}, ARM_TIMEOUT_MS)
		this.#setColumnHome('armed', 'armed, confirm within 10 s')
		return true
	}

	/** Step 2: start homing, only while armed. The column drives to both end stops. */
	confirmColumnHoming(): boolean {
		if (this.state.columnHome.phase !== 'armed') {
			this.#log('warn', 'Column homing not armed; press "arm" first')
			return false
		}
		if (this.#armTimer) clearTimeout(this.#armTimer)
		if (!this.#sendFlushed(HOME_COLUMN_START)) return false
		this.#homingStarted = Date.now()
		this.#homingProgress = false
		this.#setColumnHome('running', 'started')
		this.#stopStatusPoll()
		this.#statusTimer = setInterval(() => {
			if (Date.now() - this.#homingStarted > HOMING_TIMEOUT_MS) {
				this.#stopStatusPoll()
				this.#setColumnHome('error', 'timeout (10 min)')
				return
			}
			this.#sendFlushed(QUERY_COLUMN_HOME)
		}, 1000)
		return true
	}

	abortColumnHoming(): boolean {
		if (this.#armTimer) clearTimeout(this.#armTimer)
		if (this.state.columnHome.phase === 'armed') {
			this.#setColumnHome('idle', 'disarmed')
			return true
		}
		if (!this.isS5 || !this.isDirect) return false
		const ok = this.#sendFlushed(HOME_COLUMN_ABORT)
		if (this.state.columnHome.phase === 'running') this.#setColumnHome('aborted', 'abort sent')
		this.#sendFlushed(QUERY_COLUMN_HOME)
		return ok
	}

	#stopStatusPoll(): void {
		if (this.#statusTimer) clearInterval(this.#statusTimer)
		this.#statusTimer = undefined
	}

	// ------------------------------------------------------------ soft limits

	/** Show (read) is always allowed; enable/disable only with the config switch. Writing values is not offered. */
	limit(op: LimitOp, axis: LimitAxis): boolean {
		if (!this.isDirect) return false
		if (op !== 'show' && !this.opts.allowLimitChanges) {
			this.#log('warn', 'Soft limit enable/disable is locked; allow it in the connection settings first')
			return false
		}
		if (op === 'show') {
			this.#limitLines = []
			this.#limitCaptureUntil = Date.now() + LIMIT_CAPTURE_MS
			this.state.limits = { axis, status: {}, text: '' }
			this.#changed('limits')
		}
		return this.send(limitCmd(op, axis))
	}
}
