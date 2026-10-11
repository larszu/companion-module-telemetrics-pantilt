/**
 * Telemetrics pan/tilt serial protocol (ASCII, CR-terminated).
 *
 * Sources:
 * - PT-HP-S4 user manual, appendix "Serial control" (same S4 generation as the PT-LP-S4):
 *   velocities `P` `T` `Z` `F` `I` 0..32767 (16383 = still), `R` stop all,
 *   `C n` / `E n` recall / store preset 0..255, queries `p` `t` `z` `f` `i`,
 *   `<CAN>` (0x18) aborts a running recall and should precede control lines.
 *   Queries in one line answer in order: `p t z f` -> "<pan> <tilt> <zoom> <focus>".
 * - PT-LP manual as implemented in github.com/shanereetz/telemetrics-moco: `L 1` take control.
 * - RCCP-1 control manual (quoted in bitfocus/companion-module-requests#1157):
 *   `C<shot> [seconds]` recall shot, STS-12 camera select `\ unit port cmd chksum`.
 */

export const CR = '\r'
/** Aborts a running preset recall; the head ignores everything else until the recall ends. */
export const CAN = '\x18'

export const VELOCITY_MIN = 0
export const VELOCITY_NEUTRAL = 16383
export const VELOCITY_MAX = 32767

export const SHOT_MIN = 0
export const SHOT_MAX = 255
export const SHOT_TIME_MAX = 30

export type Direction = 'up' | 'down' | 'left' | 'right' | 'up-left' | 'up-right' | 'down-left' | 'down-right'

export const DIRECTIONS: Direction[] = ['up-left', 'up', 'up-right', 'left', 'right', 'down-left', 'down', 'down-right']

const clamp = (v: number, min: number, max: number): number => Math.min(max, Math.max(min, v))

/** Signed speed -100..100 % to a head velocity value. Positive = pan left / tilt up. */
export function speedToVelocity(speedPercent: number): number {
	const s = clamp(Math.round(speedPercent), -100, 100)
	if (s === 0) return VELOCITY_NEUTRAL
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

export function panCmd(speedPercent: number): string {
	return `P ${speedToVelocity(speedPercent)}`
}

export function tiltCmd(speedPercent: number): string {
	return `T ${speedToVelocity(speedPercent)}`
}

export function panTiltCmd(panPercent: number, tiltPercent: number): string {
	return `P ${speedToVelocity(panPercent)} T ${speedToVelocity(tiltPercent)}`
}

export type LensAxis = 'Z' | 'F' | 'I'

/** Lens velocity. Positive = wide (zoom), far (focus), open (iris). */
export function lensCmd(axis: LensAxis, speedPercent: number): string {
	return `${axis} ${speedToVelocity(speedPercent)}`
}

/** Relative focus/iris step, -255..255. Iris: positive closes. */
export function stepCmd(axis: 'FI' | 'II', steps: number): string {
	return `${axis} ${clamp(Math.round(steps), -255, 255)}`
}

export function storeShotCmd(shot: number): string {
	return `E ${clamp(Math.round(shot), SHOT_MIN, SHOT_MAX)}`
}

export const STOP_CMD = 'R'
export const TAKE_CONTROL_CMD = 'L 1'
export const QUERY_POSITION_CMD = 'p t z f'

export function recallShotCmd(shot: number, seconds?: number): string {
	const n = clamp(Math.round(shot), SHOT_MIN, SHOT_MAX)
	if (seconds === undefined || Number.isNaN(seconds)) return `C ${n}`
	return `C ${n} ${clamp(Math.round(seconds), 0, SHOT_TIME_MAX)}`
}

/** STS-12 checksum: unit + port + cmd + chksum = 0 (mod 256). */
export function sts12Checksum(unit: number, port: number, cmd: number): number {
	return (256 - ((unit + port + cmd) % 256)) % 256
}

/** STS-12 camera select as used by the RCCP-1 (port 1..50, cmd 0 = connect). */
export function selectCameraCmd(port: number, unit = 0, cmd = 0): string {
	return `\\ ${unit} ${port} ${cmd} ${sts12Checksum(unit, port, cmd)}`
}

/** Frame a command for the wire: optional prefix (some servers expect e.g. "P0") and CR. */
export function frame(cmd: string, prefix = '', cancel = false): string {
	return `${cancel ? CAN : ''}${prefix}${cmd}${CR}`
}

export type HeadMessage =
	| { type: 'position'; pan: number; tilt: number; zoom?: number; focus?: number }
	| { type: 'sts12'; code: number }
	| { type: 'other'; text: string }

export function parseLine(line: string): HeadMessage | null {
	const text = line.trim()
	if (text === '') return null
	const pos = /^(-?\d+)\s+(-?\d+)(?:\s+(\d+)\s+(\d+))?$/.exec(text)
	if (pos) {
		const [, pan, tilt, zoom, focus] = pos
		return zoom === undefined
			? { type: 'position', pan: Number(pan), tilt: Number(tilt) }
			: { type: 'position', pan: Number(pan), tilt: Number(tilt), zoom: Number(zoom), focus: Number(focus) }
	}
	const sts = /^\\\s*(\d+)$/.exec(text)
	if (sts) return { type: 'sts12', code: Number(sts[1]) }
	return { type: 'other', text }
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
