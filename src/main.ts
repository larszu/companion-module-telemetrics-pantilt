import { InstanceBase, InstanceStatus, TCPHelper, type SomeCompanionConfigField } from '@companion-module/base'
import { GetConfigFields, resolveEndpoint, type ModuleConfig } from './config.ts'
import { UpdateVariableDefinitions, type VariablesSchema } from './variables.ts'
import { UpgradeScripts } from './upgrades.ts'
import { UpdateActions, type ActionsSchema } from './actions.ts'
import { UpdateFeedbacks, type FeedbacksSchema } from './feedbacks.ts'
import { UpdatePresets } from './presets.ts'
import { HeadSession, type ChangeKind, type HeadOptions, type StoredShot } from './head.ts'
import { discover, ds4Owner } from './discovery.ts'
import type { DiscoveredDevice, HeadPosition } from './protocol.ts'

export type ModuleSchema = {
	config: ModuleConfig
	secrets: undefined
	actions: ActionsSchema
	feedbacks: FeedbacksSchema
	variables: VariablesSchema
}

export { UpgradeScripts }

export default class ModuleInstance extends InstanceBase<ModuleSchema> {
	config!: ModuleConfig
	head!: HeadSession
	discovered: DiscoveredDevice[] = []

	#tcp: TCPHelper | undefined
	#connectSeq = 0

	constructor(internal: unknown) {
		super(internal)
	}

	async init(config: ModuleConfig): Promise<void> {
		this.config = config
		this.head = new HeadSession(this.#headOptions(), (data) => this.#write(data))
		this.head.shots = parseShotStore(config.shotStore)
		this.head.on('change', (kind) => this.#onHeadChange(kind))
		this.head.on('shots', (shots) => this.#saveShots(shots))
		this.head.on('log', (level, message) => this.log(level, message))

		this.updateActions()
		this.updateFeedbacks()
		this.updatePresets()
		this.updateVariableDefinitions()
		this.#updateAllVariables()

		void this.scanNetwork()
		void this.#connect()
	}

	async destroy(): Promise<void> {
		this.#connectSeq++
		this.#disconnect()
		this.head.destroy()
	}

	async configUpdated(config: ModuleConfig): Promise<void> {
		this.config = config
		this.head.setOptions(this.#headOptions())
		// The in-memory shots win: the config form may carry an older copy of the store.
		const store = JSON.stringify(Object.fromEntries(this.head.shots))
		if (config.shotStore !== store) {
			this.config.shotStore = store
			this.saveConfig(this.config, undefined)
		}
		void this.#connect()
	}

	getConfigFields(): SomeCompanionConfigField[] {
		void this.scanNetwork()
		return GetConfigFields(this.discovered)
	}

	updateActions(): void {
		UpdateActions(this)
	}

	updateFeedbacks(): void {
		UpdateFeedbacks(this)
	}

	updatePresets(): void {
		UpdatePresets(this)
	}

	updateVariableDefinitions(): void {
		UpdateVariableDefinitions(this)
	}

	get isConnected(): boolean {
		return this.#tcp?.isConnected ?? false
	}

	async scanNetwork(): Promise<void> {
		try {
			this.discovered = await discover()
			this.setVariableValues({
				discovered: this.discovered.map((d) => `${d.model} ${d.ip}`).join(', '),
			})
		} catch (e) {
			this.log('debug', `Discovery failed: ${(e as Error).message}`)
		}
	}

	#headOptions(): Partial<HeadOptions> {
		const c = this.config
		const ep = resolveEndpoint(c)
		return {
			target: c.mode ?? 'direct',
			model: ep.model ?? c.model ?? 'S4',
			prefix: c.prefix ?? '',
			invertPan: !!c.invertPan,
			invertTilt: !!c.invertTilt,
			columnAxis: c.columnAxis ?? 'X',
			ramp: { attackMs: c.attackMs ?? 350, releaseMs: c.releaseMs ?? 450, curve: c.curve ?? 'cubic' },
			moveCurve: c.curve ?? 'cubic',
			shotMode: c.shotMode ?? 'module',
			keyframes: c.keyframes ?? true,
			defaultShotTimeMs: Math.round((c.defaultShotTime ?? 3) * 1000),
			automationPage: c.automationPage ?? 0,
			pollIntervalMs: c.pollInterval ?? 250,
			allowLimitChanges: !!c.allowLimitChanges,
			takeControl: !!c.takeControl,
			camera: c.camera ?? 0,
		}
	}

	#write(data: string | Buffer): boolean {
		if (!this.#tcp?.isConnected) return false
		return this.#tcp.send(typeof data === 'string' ? Buffer.from(data, 'latin1') : data)
	}

	#saveShots(shots: Map<number, StoredShot>): void {
		this.config.shotStore = JSON.stringify(Object.fromEntries(shots))
		this.saveConfig(this.config, undefined)
		this.checkFeedbacks('shot_stored')
	}

	async #connect(): Promise<void> {
		const seq = ++this.#connectSeq
		this.#disconnect()
		const { host, port } = resolveEndpoint(this.config)
		if (!host || !port) {
			this.updateStatus(InstanceStatus.BadConfig, 'IP address and port required')
			return
		}
		this.updateStatus(InstanceStatus.Connecting)

		const ownership = this.config.ds4Ownership ?? 'off'
		if (this.config.mode === 'direct' && ownership !== 'off' && port >= 3001 && port <= 3004) {
			const owner = await ds4Owner(host, port, ownership === 'takeover')
			if (seq !== this.#connectSeq) return
			this.setVariableValues({ ds4_owner: owner })
			this.log(
				'info',
				`DS-4 port ${port} owner: ${owner}${ownership === 'takeover' && owner !== '0' ? ' (taken over)' : ''}`,
			)
		}

		const tcp = new TCPHelper(host, port, { reconnect: true, reconnect_interval: 2000 })
		this.#tcp = tcp
		tcp.on('status_change', (status, message) => {
			this.updateStatus(status, message)
			this.checkFeedbacks('connected')
		})
		tcp.on('error', (err) => this.log('error', `TCP: ${err.message}`))
		tcp.on('connect', () => {
			this.log('info', `Connected to ${host}:${port}`)
			this.head.onConnect()
			this.checkFeedbacks('connected')
		})
		tcp.on('end', () => {
			this.head.onDisconnect()
			this.checkFeedbacks('connected')
		})
		tcp.on('data', (data) => this.head.onData(data))
	}

	#disconnect(): void {
		this.head?.onDisconnect()
		this.#tcp?.destroy()
		this.#tcp = undefined
	}

	#onHeadChange(kind: ChangeKind): void {
		const s = this.head.state
		switch (kind) {
			case 'position':
				if (s.position) this.setVariableValues(positionVariables(s.position))
				break
			case 'moving':
				this.checkFeedbacks('moving')
				break
			case 'shot':
				this.setVariableValues({
					current_shot: s.shot.number >= 0 ? s.shot.number : '',
					last_shot: s.shot.number >= 0 ? s.shot.number : '',
					shot_status: s.shot.status,
				})
				this.checkFeedbacks('current_shot', 'last_shot', 'moving')
				break
			case 'columnHome':
				this.setVariableValues({ column_home_phase: s.columnHome.phase, column_home_state: s.columnHome.text })
				this.checkFeedbacks('column_home')
				break
			case 'limits':
				this.setVariableValues({
					limits_axis: s.limits.axis ?? '',
					limits_enabled: s.limits.status.enabled === undefined ? '' : s.limits.status.enabled ? 'enabled' : 'disabled',
					limits_upper: s.limits.status.upperSoft ?? '',
					limits_lower: s.limits.status.lowerSoft ?? '',
					limits_text: s.limits.text,
				})
				this.checkFeedbacks('limits_enabled')
				break
			case 'system':
				this.setVariableValues({ system_error: s.systemError?.text ?? '' })
				break
			case 'response':
				this.setVariableValues({ last_response: s.lastResponse })
				break
			case 'camera':
				this.setVariableValues({ selected_camera: s.selectedCamera })
				this.checkFeedbacks('selected_camera')
				break
		}
	}

	#updateAllVariables(): void {
		this.setVariableValues({
			pan_position: '',
			tilt_position: '',
			zoom_position: '',
			focus_position: '',
			column_position: '',
			aux_y_position: '',
			iris_position: '',
			black_position: '',
			current_shot: '',
			last_shot: '',
			shot_status: 'none',
			selected_camera: 0,
			column_home_phase: 'idle',
			column_home_state: '',
			limits_axis: '',
			limits_enabled: '',
			limits_upper: '',
			limits_lower: '',
			limits_text: '',
			system_error: '',
			ds4_owner: '',
			discovered: '',
			last_response: '',
		})
	}
}

function positionVariables(p: HeadPosition): Partial<VariablesSchema> {
	return {
		pan_position: p.pan,
		tilt_position: p.tilt,
		zoom_position: p.zoom,
		focus_position: p.focus,
		column_position: p.x,
		aux_y_position: p.y,
		iris_position: p.iris,
		black_position: p.black,
	}
}

export function parseShotStore(raw: string | undefined): Map<number, StoredShot> {
	const out = new Map<number, StoredShot>()
	if (!raw) return out
	try {
		const obj = JSON.parse(raw) as Record<string, StoredShot>
		for (const [k, v] of Object.entries(obj)) {
			if (v && typeof v === 'object' && v.pos && typeof v.timeMs === 'number') out.set(Number(k), v)
		}
	} catch {
		/* ignore a broken store */
	}
	return out
}
