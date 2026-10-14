/**
 * Ease-in / ease-out for head moves (same curves as lz-camera-bridge motion/Easing.ts).
 *
 * - `SpeedRamp`: a speed demand does not jump; it glides to the new value. Speeding up takes up to
 *   `attackMs`, slowing down up to `releaseMs`, scaled by the size of the change.
 * - `easedTrajectory`: an absolute move sampled at a fixed interval, every axis on the same eased time line.
 */

export type EaseCurve = 'linear' | 'sine' | 'cubic' | 'quint'

export const EASE_CURVES: EaseCurve[] = ['linear', 'sine', 'cubic', 'quint']

/** Ease in and out, t in 0..1 → 0..1. */
export function ease(t: number, curve: EaseCurve = 'cubic'): number {
	const c = Math.min(1, Math.max(0, t))
	switch (curve) {
		case 'linear':
			return c
		case 'sine':
			return 0 - (Math.cos(Math.PI * c) - 1) / 2
		case 'quint':
			return c < 0.5 ? 16 * c ** 5 : 1 - (-2 * c + 2) ** 5 / 2
		case 'cubic':
		default:
			return c < 0.5 ? 4 * c ** 3 : 1 - (-2 * c + 2) ** 3 / 2
	}
}

export interface RampOptions {
	/** Time from standstill to full speed (ms). 0 = no ramp. */
	attackMs: number
	/** Time from full speed to standstill (ms). 0 = no ramp. */
	releaseMs: number
	curve: EaseCurve
}

export const DEFAULT_RAMP: RampOptions = { attackMs: 350, releaseMs: 450, curve: 'cubic' }

/** Glides a speed value in percent (-100..100) towards a target. */
export class SpeedRamp {
	#from = 0
	#to = 0
	#startedAt = 0
	#durationMs = 0

	opts: RampOptions
	readonly #fullScale: number

	constructor(opts: RampOptions = DEFAULT_RAMP, fullScale = 100) {
		this.opts = opts
		this.#fullScale = fullScale
	}

	/** New target. Returns false if nothing changes. */
	set(target: number, now = Date.now()): boolean {
		if (target === this.#to && this.done(now)) return false
		const current = this.valueAt(now)
		this.#from = current
		this.#to = target
		this.#startedAt = now
		const speedingUp = Math.abs(target) > Math.abs(current) && Math.sign(target) !== -Math.sign(current)
		const base = speedingUp ? this.opts.attackMs : this.opts.releaseMs
		this.#durationMs = base * Math.min(1, Math.abs(target - current) / this.#fullScale)
		return true
	}

	valueAt(now = Date.now()): number {
		if (this.#durationMs <= 0) return this.#to
		const t = (now - this.#startedAt) / this.#durationMs
		if (t >= 1) return this.#to
		return this.#from + (this.#to - this.#from) * ease(t, this.opts.curve)
	}

	done(now = Date.now()): boolean {
		return this.#durationMs <= 0 || now - this.#startedAt >= this.#durationMs
	}

	get target(): number {
		return this.#to
	}

	/** Jump without a glide (emergency stop). */
	hard(value: number): void {
		this.#from = this.#to = value
		this.#durationMs = 0
	}
}

export type Pose = Record<string, number>

/** Samples an eased move from `from` to `to` every `intervalMs`. First sample = start, last = target. */
export function easedTrajectory(
	from: Pose,
	to: Pose,
	durationMs: number,
	intervalMs = 50,
	curve: EaseCurve = 'cubic',
): Pose[] {
	const steps = Math.max(1, Math.round(durationMs / intervalMs))
	const out: Pose[] = []
	for (let i = 0; i <= steps; i++) {
		const e = ease(i / steps, curve)
		const p: Pose = {}
		for (const k of Object.keys(to)) {
			const a = from[k] ?? to[k]
			p[k] = Math.round(a + (to[k] - a) * e)
		}
		out.push(p)
	}
	return out
}
