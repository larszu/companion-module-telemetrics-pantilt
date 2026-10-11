import { InstanceBase, InstanceStatus, TCPHelper, type SomeCompanionConfigField } from '@companion-module/base'
import { GetConfigFields, type ModuleConfig } from './config.js'
import { UpdateVariableDefinitions, type VariablesSchema } from './variables.js'
import { UpgradeScripts } from './upgrades.js'
import { UpdateActions, type ActionsSchema } from './actions.js'
import { UpdateFeedbacks, type FeedbacksSchema } from './feedbacks.js'
import { UpdatePresets } from './presets.js'
import {
	LineSplitter,
	QUERY_POSITION_CMD,
	TAKE_CONTROL_CMD,
	frame,
	parseLine,
	panTiltCmd,
	selectCameraCmd,
} from './protocol.js'

export type ModuleSchema = {
	config: ModuleConfig
	secrets: undefined
	actions: ActionsSchema
	feedbacks: FeedbacksSchema
	variables: VariablesSchema
}

export { UpgradeScripts }

export default class ModuleInstance extends InstanceBase<ModuleSchema> {
	config!: ModuleConfig // Setup in init()

	lastShot = 0
	selectedCamera = 0
	moving = false

	#tcp: TCPHelper | undefined
	#lines = new LineSplitter()
	#pollTimer: NodeJS.Timeout | undefined

	constructor(internal: unknown) {
		super(internal)
	}

	async init(config: ModuleConfig): Promise<void> {
		this.config = config

		this.updateActions()
		this.updateFeedbacks()
		this.updatePresets()
		this.updateVariableDefinitions()
		this.setVariableValues({ last_shot: 0, selected_camera: 0, pan_position: '', tilt_position: '', last_response: '' })

		this.#connect()
	}

	async destroy(): Promise<void> {
		this.#disconnect()
	}

	async configUpdated(config: ModuleConfig): Promise<void> {
		this.config = config
		this.#connect()
	}

	getConfigFields(): SomeCompanionConfigField[] {
		return GetConfigFields()
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

	/** Sends one protocol command (without CR). Returns false when not connected. */
	send(cmd: string): boolean {
		if (!this.#tcp?.isConnected) {
			this.log('warn', `Not connected, dropped: ${cmd}`)
			return false
		}
		this.log('debug', `> ${cmd}`)
		return this.#tcp.send(frame(cmd, this.config.prefix ?? ''))
	}

	/** Pan/tilt with signed speeds in percent; applies the invert settings. */
	move(panPercent: number, tiltPercent: number): void {
		const pan = this.config.invertPan ? -panPercent : panPercent
		const tilt = this.config.invertTilt ? -tiltPercent : tiltPercent
		if (this.send(panTiltCmd(pan, tilt))) this.setMoving(pan !== 0 || tilt !== 0)
	}

	setMoving(moving: boolean): void {
		if (this.moving === moving) return
		this.moving = moving
		this.checkFeedbacks('moving')
	}

	selectCamera(camera: number): void {
		if (this.send(selectCameraCmd(camera))) {
			this.selectedCamera = camera
			this.setVariableValues({ selected_camera: camera })
			this.checkFeedbacks('selected_camera')
		}
	}

	shotRecalled(shot: number): void {
		this.lastShot = shot
		this.setVariableValues({ last_shot: shot })
		this.checkFeedbacks('last_shot')
	}

	#connect(): void {
		this.#disconnect()
		const { host, port } = this.config
		if (!host || !port) {
			this.updateStatus(InstanceStatus.BadConfig, 'IP address and port required')
			return
		}

		this.updateStatus(InstanceStatus.Connecting)
		const tcp = new TCPHelper(host, port, { reconnect: true, reconnect_interval: 2000 })
		this.#tcp = tcp

		tcp.on('status_change', (status, message) => {
			this.updateStatus(status, message)
			this.checkFeedbacks('connected')
		})
		tcp.on('error', (err) => {
			this.log('error', `TCP: ${err.message}`)
		})
		tcp.on('connect', () => {
			this.log('info', `Connected to ${host}:${port}`)
			this.#lines.reset()
			if (this.config.mode === 'rccp1' && this.config.camera > 0) this.selectCamera(this.config.camera)
			if (this.config.takeControl) this.send(TAKE_CONTROL_CMD)
			this.#startPolling()
		})
		tcp.on('end', () => {
			this.#stopPolling()
			this.setMoving(false)
		})
		tcp.on('data', (data) => {
			for (const line of this.#lines.push(data.toString('latin1'))) this.#handleLine(line)
		})
	}

	#disconnect(): void {
		this.#stopPolling()
		this.#tcp?.destroy()
		this.#tcp = undefined
	}

	#handleLine(line: string): void {
		const msg = parseLine(line)
		if (!msg) return
		this.log('debug', `< ${line}`)
		switch (msg.type) {
			case 'position':
				this.setVariableValues({ pan_position: msg.pan, tilt_position: msg.tilt })
				break
			case 'sts12':
				this.setVariableValues({ last_response: line.trim() })
				break
			case 'other':
				this.setVariableValues({ last_response: msg.text })
				break
		}
	}

	#startPolling(): void {
		this.#stopPolling()
		const interval = this.config.pollInterval
		if (!interval || interval < 100) return
		this.#pollTimer = setInterval(() => {
			if (this.#tcp?.isConnected) this.#tcp.send(frame(QUERY_POSITION_CMD, this.config.prefix ?? ''))
		}, interval)
	}

	#stopPolling(): void {
		if (this.#pollTimer) clearInterval(this.#pollTimer)
		this.#pollTimer = undefined
	}
}
