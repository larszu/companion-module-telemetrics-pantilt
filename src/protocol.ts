/**
 * Telemetrics pan/tilt protocol: command builders and reply parsers. Pure functions, no I/O.
 *
 * Sources:
 * - PT-HP-S4 user manual, appendix "Serial control" (S4 generation, same as the PT-LP-S4): ASCII lines
 *   terminated by CR, velocities `P T Z F I X Y` 0..32767 (16383 = still), `R` stop, `C n` / `E n` on-head
 *   presets, `CX` absolute move with fade time in ms, soft limits `@LIMS/@LIME/@LIMD`, `<CAN>` (0x18) aborts
 *   a running recall and should precede control lines. See docs/protocol.md.
 * - Telemetrics control software (TM.dll, drivers `TM_S2` for S4 heads and `TM_S5`): compact velocity lines
 *   (`P20000T16383`), `ptzfxymi` position query, `CX` recalls, `@CMD` services (S5), binary `CH` keyframes (S5),
 *   column homing `@CNTR 1010/1011` (S5), DS-4 ownership on TCP 3000, discovery on UDP 2000.
 * - RCCP-1 control manual: `C<shot> [seconds]` and STS-12 camera select `\ unit port cmd chksum` (TCP 2500).
 * - RCP automation port (TCP 5000): `P<page> C<shot> [T<seconds>]`, answers `OK` / `NOP` / `INVCMD`.
 */

export const CR = '\r'
/** Aborts a running preset recall; the head ignores everything else until the recall ends. */
export const CAN = '\x18'

export const VELOCITY_MIN = 0
export const VELOCITY_NEUTRAL = 16383
export const VELOCITY_MAX = 32767

export const SHOT_MIN = 0
export const SHOT_MAX = 255
/** RCCP-1 / automation port move time limit in seconds. */
export const SHOT_TIME_MAX = 30

export type HeadModel = 'S4' | 'S5'

export type Direction = 'up' | 'down' | 'left' | 'right' | 'up-left' | 'up-right' | 'down-left' | 'down-right'

export const DIRECTIONS: Direction[] = ['up-left', 'up', 'up-right', 'left', 'right', 'down-left', 'down', 'down-right']

/** Velocity axes. X/Y/Q are aux axes (column / elevation, trolley, aux Z). */
export type VelocityAxis = 'P' | 'T' | 'Z' | 'F' | 'I' | 'X' | 'Y' | 'Q'
export type ColumnAxis = 'X' | 'Y' | 'Q'

const clamp = (v: number, min: number, max: number): number => Math.min(max, Math.max(min, v))

/**
 * Signed speed -100..100 % to a head velocity value.
 * Manual direction table: high values = pan left, tilt up, zoom wide, focus far, iris open, aux up/left.
 */
export function speedToVelocity(speedPercent: number): number {
	const s = clamp(speedPercent, -100, 100)
	if (Math.abs(s) < 1e-9) return VELOCITY_NEUTRAL
	const span = s > 0 ? VELOCITY_MAX - VELOCITY_NEUTRAL : VELOCITY_NEUTRAL - VELOCITY_MIN
	return clamp(VELOCITY_NEUTRAL + Math.round((s / 100) * span), VELOCITY_MIN, VELOCITY_MAX)
}

/** Signed pan/tilt factors (-1, 0, 1) for a direction. Pan +1 = left, tilt +1 = up. */
export function directionVector(dir: Direction): { pan: number; tilt: number } {
	return {
		pan: dir.includes('left') ? 1 : dir.includes('right') ? -1 : 0,
		tilt: dir.startsWith('up') ? 1 : dir.startsWith('down') ? -1 : 0,
	}
}

/**
 * One velocity line without terminator, compact as the Telemetrics software sends it: `P20000T16383`.
 * Aux axes (X/Y/Q) are put on their own line by the caller; the TM_S2 driver ends every aux term with CR.
 */
export function velocityCmd(speeds: Partial<Record<VelocityAxis, number>>): string {
	return Object.entries(speeds)
		.map(([axis, pct]) => `${axis}${speedToVelocity(pct)}`)
		.join('')
}

export function panTiltCmd(panPercent: number, tiltPercent: number): string {
	return velocityCmd({ P: panPercent, T: tiltPercent })
}

export type LensAxis = 'Z' | 'F' | 'I'

/** Lens velocity. Positive = wide (zoom), far (focus), open (iris). */
export function lensCmd(axis: LensAxis, speedPercent: number): string {
	return velocityCmd({ [axis]: speedPercent })
}

/** Relative focus/iris step, -255..255. Iris: positive closes. */
export function stepCmd(axis: 'FI' | 'II', steps: number): string {
	return `${axis}${clamp(Math.round(steps), -255, 255)}`
}

export const STOP_CMD = 'R'
export const TAKE_CONTROL_CMD = 'L 1'
/** Position query used by the Telemetrics software for S4 and S5 heads: pan tilt zoom focus x y black iris. */
export const QUERY_POSITION_CMD = 'ptzfxymi'

/** All velocity axes to neutral, as the TM software sends it after keyframes. Each term on its own line. */
export function stopAllAxesLines(): string {
	return ['P', 'T', 'Z', 'F', 'X', 'Y'].map((a) => `${CR}${a}${VELOCITY_NEUTRAL}`).join('') + CR
}

// ---------------------------------------------------------------- shots

export function storeShotCmd(shot: number): string {
	return `E ${clamp(Math.round(shot), SHOT_MIN, SHOT_MAX)}`
}

/** On-head preset recall (`C n`). Through an RCCP-1 a move time in seconds may follow. */
export function recallShotCmd(shot: number, seconds?: number): string {
	const n = clamp(Math.round(shot), SHOT_MIN, SHOT_MAX)
	if (seconds === undefined || Number.isNaN(seconds)) return `C ${n}`
	return `C ${n} ${clamp(Math.round(seconds), 0, SHOT_TIME_MAX)}`
}

/** Head positions as returned by `ptzfxymi`. Units are raw encoder counts. */
export interface HeadPosition {
	pan: number
	tilt: number
	zoom: number
	focus: number
	x: number
	y: number
	black: number
	iris: number
}

export const POSITION_KEYS: (keyof HeadPosition)[] = ['pan', 'tilt', 'zoom', 'focus', 'x', 'y', 'black', 'iris']

/** `CX <pan> <tilt> <zoom> <focus> <x> <iris> <ped> <y> <time_ms>`: absolute move, the head plans the fade. */
export function moveToCmd(p: HeadPosition, timeMs: number): string {
	const r = Math.round
	return `CX ${r(p.pan)} ${r(p.tilt)} ${r(p.zoom)} ${r(p.focus)} ${r(p.x)} ${r(p.iris)} ${r(p.black)} ${r(p.y)} ${Math.max(0, r(timeMs))}`
}

/** Window per axis inside which a position counts as "on shot" (RCP's OffShotWindow, S2 values for P/T). */
export const ON_SHOT_WINDOW: Record<keyof HeadPosition, number> = {
	pan: 2000,
	tilt: 2000,
	zoom: 200,
	focus: 100,
	x: 8000,
	y: 8000,
	black: Number.POSITIVE_INFINITY,
	iris: Number.POSITIVE_INFINITY,
}

/** Window inside which two consecutive reads count as stable when a shot is stored (RCP's ShotEnterPositionWindow). */
export const STABLE_WINDOW: Record<keyof HeadPosition, number> = {
	pan: 400,
	tilt: 400,
	zoom: 100,
	focus: 100,
	x: 400,
	y: 400,
	black: 100,
	iris: 100,
}

export function withinWindow(a: HeadPosition, b: HeadPosition, window: Record<keyof HeadPosition, number>): boolean {
	return POSITION_KEYS.every((k) => Math.abs(a[k] - b[k]) <= window[k])
}

// ---------------------------------------------------------------- S5 keyframes

/** Binary keyframe commands (S5): reset/start, append, query buffer level. */
export const KF_START = 0xff
export const KF_APPEND = 0x00
export const KF_QUERY = 0xef

/** One 30-byte keyframe: 'C' 'H' 0 cmd, 7 × 24-bit big-endian (pan tilt zoom focus x y z), 3 × 0, sum, CR. */
export function keyframe(cmd: number, p?: Partial<HeadPosition> & { z?: number }): Buffer {
	const b = Buffer.alloc(30)
	b[0] = 0x43
	b[1] = 0x48
	b[2] = 0x00
	b[3] = cmd
	const vals = p ? [p.pan, p.tilt, p.zoom, p.focus, p.x, p.y, p.z] : []
	for (let i = 0; i < 7; i++) {
		const n = Math.round(vals[i] ?? 0) & 0xffffff
		b[4 + i * 3] = (n >> 16) & 0xff
		b[5 + i * 3] = (n >> 8) & 0xff
		b[6 + i * 3] = n & 0xff
	}
	let sum = 0
	for (let i = 0; i < 28; i++) sum += b[i]
	b[28] = sum & 0xff
	b[29] = 0x0d
	return b
}

/** Decodes a keyframe (for the mock head and tests). Returns null if the checksum is wrong. */
export function parseKeyframe(b: Buffer): { cmd: number; values: number[] } | null {
	if (b.length < 30 || b[0] !== 0x43 || b[1] !== 0x48 || b[29] !== 0x0d) return null
	let sum = 0
	for (let i = 0; i < 28; i++) sum += b[i]
	if ((sum & 0xff) !== b[28]) return null
	const values: number[] = []
	for (let i = 0; i < 7; i++) {
		let n = (b[4 + i * 3] << 16) | (b[5 + i * 3] << 8) | b[6 + i * 3]
		if (n & 0x800000) n -= 0x1000000
		values.push(n)
	}
	return { cmd: b[3], values }
}

// ---------------------------------------------------------------- S5 services, column, limits

/** S5 elevation column homing: drives to both end stops, then to the centre, and resets the position. */
export const HOME_COLUMN_START = '@CNTR 1010'
export const HOME_COLUMN_ABORT = '@CNTR 1011'
/** S5 `@CMD 51 0 0`: column homing state. */
export const QUERY_COLUMN_HOME = '@CMD 51 0 0'
/** S5 `@CMD 20 0 0`: current system error. */
export const QUERY_SYSTEM_ERROR = '@CMD 20 0 0'

export const COLUMN_HOME_STATES: Record<number, string> = {
	0: 'start',
	1: 'driving up',
	2: 'waiting (up)',
	3: 'driving up slowly',
	4: 'waiting (up, slow)',
	5: 'stop 1',
	6: 'driving "one"',
	7: 'waiting ("one")',
	8: 'stop 2',
	9: 'driving down',
	10: 'waiting (down)',
	11: 'stop 3',
	12: 'driving to centre',
	13: 'waiting (centre)',
	14: 'stop 4',
	15: 'resetting position',
	16: 'verifying zero',
	17: 'abort',
	18: 'stop and abort now',
	19: 'stop 5',
	255: 'done',
}

export const COLUMN_HOME_ERRORS: Record<number, string> = {
	0: 'no error',
	1: 'timeout',
	2: 'cancelled by user',
	3: 'X1/X2 over-current',
	4: 'max speed reached (up)',
	5: 'max speed reached ("one")',
	6: 'max speed reached (down)',
}

export const SYSTEM_ERRORS: Record<number, string> = {
	0: 'OK',
	61440: 'possible column encoder failure',
	61441: 'columns out of sync (master/slave > 10 mm apart)',
	61442: 'aux init failed (check wiring)',
}

/** Soft limit axis numbers from the manual: P=1, T=2, X=3, Z=4, F=5, Y=7. */
export const LIMIT_AXES = { pan: 1, tilt: 2, x: 3, zoom: 4, focus: 5, y: 7 } as const
export type LimitAxis = keyof typeof LIMIT_AXES

export type LimitOp = 'show' | 'enable' | 'disable'

/** `@LIMS<n>` show, `@LIME<n>` enable, `@LIMD<n>` disable. Writing limit values is deliberately not offered. */
export function limitCmd(op: LimitOp, axis: LimitAxis): string {
	const code = op === 'show' ? 'S' : op === 'enable' ? 'E' : 'D'
	return `@LIM${code}${LIMIT_AXES[axis]}`
}

export interface LimitStatus {
	enabled?: boolean
	upperSoft?: number
	lowerSoft?: number
	upperPhysical?: number
	lowerPhysical?: number
}

/** Parses the text block of `@LIMS<n>` (see docs/protocol.md §9). */
export function parseLimitStatus(text: string): LimitStatus {
	const num = (re: RegExp) => {
		const m = re.exec(text)
		return m ? Number(m[1]) : undefined
	}
	const en = /Limits\s*->\s*(\w+)/i.exec(text)?.[1]
	return {
		enabled: en === undefined ? undefined : /^enable/i.test(en),
		upperSoft: num(/Upper Soft Limit\s*\(1\)\s*=\s*(-?\d+)/i),
		lowerSoft: num(/Lower Soft Limit\s*\(2\)\s*=\s*(-?\d+)/i),
		upperPhysical: num(/Upper Physical Limit\s*\(1\)\s*=\s*(-?\d+)/i),
		lowerPhysical: num(/Lower Physical Limit\s*\(2\)\s*=\s*(-?\d+)/i),
	}
}

// ---------------------------------------------------------------- RCCP-1 / automation port

/** STS-12 checksum: unit + port + cmd + chksum = 0 (mod 256). */
export function sts12Checksum(unit: number, port: number, cmd: number): number {
	return (256 - ((unit + port + cmd) % 256)) % 256
}

/** STS-12 camera select as used by the RCCP-1 (port 1..50, cmd 0 = connect). */
export function selectCameraCmd(port: number, unit = 0, cmd = 0): string {
	return `\\ ${unit} ${port} ${cmd} ${sts12Checksum(unit, port, cmd)}`
}

/** RCP automation port (TCP 5000): `P<page> C<shot> [T<seconds>]`. */
export function automationRecallCmd(page: number, shot: number, seconds?: number): string {
	const base = `P${Math.max(0, Math.round(page))} C${Math.max(0, Math.round(shot))}`
	return seconds === undefined || Number.isNaN(seconds) ? base : `${base} T${Math.max(0, Math.round(seconds))}`
}

// ---------------------------------------------------------------- DS-4 ownership

/** DS-4 admin port 3000: query owner of a data port (reply: owner IP or `0`). */
export function ownerQueryCmd(dataPort: number): string {
	return `O ${dataPort} 2${CR}`
}

/** DS-4 admin port 3000: take over a data port (kicks the current owner). */
export function ownerTakeOverCmd(dataPort: number): string {
	return `O ${dataPort} 1${CR}`
}

// ---------------------------------------------------------------- framing and replies

/** Frame a command for the wire: optional CAN, optional prefix (some servers expect e.g. "P0") and CR. */
export function frame(cmd: string, prefix = '', cancel = false): string {
	return `${cancel ? CAN : ''}${prefix}${cmd}${CR}`
}

export type HeadMessage =
	| { type: 'position'; values: number[] }
	| { type: 'cmd'; id: number; fields: string[] }
	| { type: 'buffer'; level: number }
	| { type: 'sts12'; code: number }
	| { type: 'automation'; result: 'OK' | 'NOP' | 'INVCMD' | 'Connected' }
	| { type: 'other'; text: string }

export function parseLine(line: string): HeadMessage | null {
	const text = line.replace(/\n/g, '').trim()
	if (text === '') return null
	if (/^-?\d+([\s,;]+-?\d+)+$/.test(text)) return { type: 'position', values: text.split(/[\s,;]+/).map(Number) }
	const cmd = /^#CMD\s*(\d+)\s*(.*)$/.exec(text)
	if (cmd) return { type: 'cmd', id: Number(cmd[1]), fields: cmd[2].split(/\s+/).filter(Boolean) }
	const ch = /^CH=(-?\d+)$/.exec(text)
	if (ch) return { type: 'buffer', level: Number(ch[1]) }
	const sts = /^\\\s*(\d+)$/.exec(text)
	if (sts) return { type: 'sts12', code: Number(sts[1]) }
	if (text === 'OK' || text === 'NOP' || text === 'INVCMD' || text === 'Connected')
		return { type: 'automation', result: text }
	return { type: 'other', text }
}

/** `ptzfxymi` reply (8 values; 4 for `p t z f`; 2 for `p t`) to a position, filling missing axes from `prev`. */
export function toPosition(values: number[], prev?: HeadPosition): HeadPosition | null {
	if (values.length !== 8 && values.length !== 4 && values.length !== 2 && values.length < 9) return null
	const base: HeadPosition = prev ?? { pan: 0, tilt: 0, zoom: 0, focus: 0, x: 0, y: 0, black: 0, iris: 0 }
	const out = { ...base }
	values.slice(0, 8).forEach((v, i) => {
		out[POSITION_KEYS[i]] = v
	})
	return out
}

/** `#CMD 51 <x> 0 <state> <error>` → column homing state. */
export function parseColumnHome(fields: string[]): { state: number; error: number } | null {
	if (fields.length < 4 || fields[1] !== '0') return null
	return { state: Number(fields[2]), error: Number(fields[3]) }
}

/** `#CMD 20 <x> 0 <code>` → system error code. */
export function parseSystemError(fields: string[]): number | null {
	if (fields.length < 3) return null
	return Number(fields[fields.length - 1])
}

/** Splits a CR/LF-delimited stream into lines, keeping the unfinished tail. */
export class LineSplitter {
	#buf = ''

	push(chunk: string): string[] {
		this.#buf += chunk
		const parts = this.#buf.split(/\r\n|\r|\n/)
		this.#buf = parts.pop() ?? ''
		return parts
	}

	reset(): void {
		this.#buf = ''
	}
}

// ---------------------------------------------------------------- discovery (UDP 2000)

export const DISCOVERY_PORT = 2000
/** Rabbit QUERY (DS-4, RoboEye): reply `01 09 …` with identity at offset 8. */
export const PKT_FIND_SERVERS = Buffer.from([0x01, 0, 0, 0, 0, 0, 0, 0])
/** Telemetrics find devices: reply `FF .. .. .. FF 8F ..` identity at offset 7, last byte checksum (sum 0). */
export const PKT_FIND_DEVICES = Buffer.from([0xff, 0x00, 0x04, 0x00, 0xff, 0x8f, 0x01, 0x6e])

export type DeviceKind = 'DS-4' | 'S5' | 'S4' | 'RoboEye' | 'RoboEye2' | 'RCCP' | 'other'

export interface DiscoveredDevice {
	ip: string
	kind: DeviceKind
	model: string
	/** TCP data ports that carry a head: DS-4 → 3001..3004, heads → 3001. */
	ports: number[]
}

export function classifyIdentity(ident: string): { kind: DeviceKind; model: string } {
	const model = ident.split(' : ')[0].trim()
	if (ident.startsWith('9254549')) return { kind: 'DS-4', model: 'Telemetrics DS-4' }
	if (ident.includes('PT-RE1')) return { kind: 'RoboEye', model: 'Telemetrics RoboEye' }
	if (ident.startsWith('9260000') || ident.includes('PT-RE-2') || ident.includes('PT-RE2'))
		return { kind: 'RoboEye2', model: 'Telemetrics RoboEye2' }
	if (/PT-.*-S5/.test(ident)) return { kind: 'S5', model }
	if (/PT-.*-S4/.test(ident)) return { kind: 'S4', model }
	if (ident.includes('RCCP-STUDIO')) return { kind: 'RCCP', model }
	return { kind: 'other', model }
}

/** Identity string of a discovery reply, or null. */
export function parseDiscoveryReply(msg: Buffer): string | null {
	const clean = (b: Buffer) =>
		b
			.toString('latin1')
			.replace(/\0+$/, '')
			.replace(/[^\x20-\x7e]/g, '')
			.trim()
	if (msg.length > 8 && msg[0] === 0x01 && msg[1] === 0x09) return clean(msg.subarray(8))
	if (msg.length > 8 && msg[0] === 0xff && msg[4] === 0xff && msg[5] === 0x8f) {
		const sum = msg.reduce((a, v) => (a + v) & 0xff, 0)
		if (sum === 0) return clean(msg.subarray(7, msg.length - 1))
	}
	return null
}

export function toDiscoveredDevice(ip: string, ident: string): DiscoveredDevice {
	const { kind, model } = classifyIdentity(ident)
	const ports = kind === 'DS-4' ? [3001, 3002, 3003, 3004] : kind === 'RCCP' || kind === 'other' ? [] : [3001]
	return { ip, kind, model, ports }
}
