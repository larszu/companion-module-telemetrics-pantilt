import type ModuleInstance from './main.ts'
import {
	DIRECTIONS,
	LIMIT_AXES,
	SHOT_MAX,
	SHOT_MIN,
	TAKE_CONTROL_CMD,
	directionVector,
	stepCmd,
	type Direction,
	type LensAxis,
	type LimitAxis,
	type LimitOp,
} from './protocol.ts'

type LensDirection = 'minus' | 'plus' | 'stop'
type ColumnDirection = 'up' | 'down' | 'stop'

export type ActionsSchema = {
	move: { options: { direction: Direction; speed: number } }
	move_stop: { options: Record<string, never> }
	stop: { options: Record<string, never> }
	pan: { options: { speed: number } }
	tilt: { options: { speed: number } }
	zoom: { options: { direction: LensDirection; speed: number } }
	focus: { options: { direction: LensDirection; speed: number } }
	iris: { options: { direction: LensDirection; speed: number } }
	zoom_speed: { options: { speed: number } }
	focus_speed: { options: { speed: number } }
	focus_step: { options: { steps: number } }
	iris_step: { options: { steps: number } }
	iris_mode: { options: { mode: string } }
	extender: { options: { on: boolean } }
	column: { options: { direction: ColumnDirection; speed: number } }
	column_speed: { options: { speed: number } }
	recall_shot: { options: { shot: number; useTime: boolean; time: number } }
	store_shot: { options: { shot: number; useTime: boolean; time: number } }
	delete_shot: { options: { shot: number } }
	cancel_shot: { options: Record<string, never> }
	column_home_arm: { options: Record<string, never> }
	column_home_confirm: { options: Record<string, never> }
	column_home_abort: { options: Record<string, never> }
	soft_limits: { options: { op: LimitOp; axis: LimitAxis } }
	select_camera: { options: { camera: number } }
	take_control: { options: Record<string, never> }
	query_position: { options: Record<string, never> }
	scan_network: { options: Record<string, never> }
	raw: { options: { command: string } }
}

const DIRECTION_LABELS: Record<Direction, string> = {
	up: 'Up',
	down: 'Down',
	left: 'Left',
	right: 'Right',
	'up-left': 'Up left',
	'up-right': 'Up right',
	'down-left': 'Down left',
	'down-right': 'Down right',
}

const SIGN: Record<LensDirection, number> = { minus: -1, plus: 1, stop: 0 }

const speedOption = {
	id: 'speed' as const,
	type: 'number' as const,
	label: 'Speed (%)',
	default: 50,
	min: 1,
	max: 100,
	range: true,
}
const signedSpeedOption = {
	id: 'speed' as const,
	type: 'number' as const,
	label: 'Speed (%)',
	default: 0,
	min: -100,
	max: 100,
	range: true,
}
const timeOptions = (label: string) => [
	{ id: 'useTime' as const, type: 'checkbox' as const, label, default: false, disableAutoExpression: true },
	{
		id: 'time' as const,
		type: 'number' as const,
		label: 'Move time (s)',
		default: 3,
		min: 0,
		max: 120,
		step: 0.1,
		isVisibleExpression: '$(options:useTime)',
	},
]

export function UpdateActions(self: ModuleInstance): void {
	const head = () => self.head

	/** Lens velocity: "minus" = tele / near / close, "plus" = wide / far / open. Ramped. */
	const lensAction = (name: string, axis: LensAxis, minus: string, plus: string) => ({
		name,
		description: 'Moves until stopped, with attack/release ramp. In presets: move on press, stop on release.',
		options: [
			{
				id: 'direction' as const,
				type: 'dropdown' as const,
				label: 'Direction',
				default: 'minus' as const,
				choices: [
					{ id: 'minus' as const, label: minus },
					{ id: 'plus' as const, label: plus },
					{ id: 'stop' as const, label: 'Stop' },
				],
			},
			speedOption,
		],
		callback: async ({ options }: { options: { direction: LensDirection; speed: number } }) => {
			head().setSpeed(axis, SIGN[options.direction] * options.speed)
		},
	})

	self.setActionDefinitions({
		move: {
			name: 'Pan/tilt: move',
			description: 'Moves with attack ramp until "Pan/tilt: stop (ramped)" or "Stop all". Presets: move on press.',
			options: [
				{
					id: 'direction',
					type: 'dropdown',
					label: 'Direction',
					default: 'up',
					choices: DIRECTIONS.map((d) => ({ id: d, label: DIRECTION_LABELS[d] })),
				},
				speedOption,
			],
			callback: async ({ options }) => {
				const v = directionVector(options.direction)
				head().move(v.pan * options.speed, v.tilt * options.speed)
			},
		},
		move_stop: {
			name: 'Pan/tilt: stop (ramped)',
			description: 'Brings pan and tilt to a standstill along the release ramp.',
			options: [],
			callback: async () => head().move(0, 0),
		},
		stop: {
			name: 'Stop all motion',
			description: 'Immediate: R, all axes neutral, cancels shot moves and keyframes, aborts column homing.',
			options: [],
			callback: async () => head().stopAll(),
		},
		pan: {
			name: 'Pan: set speed',
			description: 'Signed speed, positive = left, 0 = stop. Ramped. Suited to rotary encoders.',
			options: [signedSpeedOption],
			callback: async ({ options }) => head().setSpeed('P', options.speed),
		},
		tilt: {
			name: 'Tilt: set speed',
			description: 'Signed speed, positive = up, 0 = stop. Ramped.',
			options: [signedSpeedOption],
			callback: async ({ options }) => head().setSpeed('T', options.speed),
		},
		zoom: lensAction('Lens: zoom', 'Z', 'Tele (in)', 'Wide (out)'),
		focus: lensAction('Lens: focus', 'F', 'Near', 'Far'),
		iris: lensAction('Lens: iris (if the lens supports head iris)', 'I', 'Close', 'Open'),
		zoom_speed: {
			name: 'Lens: zoom speed',
			description: 'Signed speed, positive = wide, negative = tele, 0 = stop. Ramped.',
			options: [signedSpeedOption],
			callback: async ({ options }) => head().setSpeed('Z', options.speed),
		},
		focus_speed: {
			name: 'Lens: focus speed',
			description: 'Signed speed, positive = far. S4: F velocity; S5: repeated FI steps. Ramped.',
			options: [signedSpeedOption],
			callback: async ({ options }) => head().setSpeed('F', options.speed),
		},
		focus_step: {
			name: 'Lens: focus step',
			description: 'FI: relative focus step, -255..255 (positive = far).',
			options: [{ id: 'steps', type: 'number', label: 'Steps', default: 10, min: -255, max: 255 }],
			callback: async ({ options }) => {
				head().send(stepCmd('FI', options.steps))
			},
		},
		iris_step: {
			name: 'Lens: iris step',
			description: 'II: relative iris step, -255..255. Positive closes. Needs iris mode "local".',
			options: [{ id: 'steps', type: 'number', label: 'Steps', default: 10, min: -255, max: 255 }],
			callback: async ({ options }) => {
				head().send(stepCmd('II', options.steps))
			},
		},
		iris_mode: {
			name: 'Lens: iris mode',
			options: [
				{
					id: 'mode',
					type: 'dropdown',
					label: 'Mode',
					default: 'IA',
					choices: [
						{ id: 'IA', label: 'Auto (camera controls iris)' },
						{ id: 'IL', label: 'Local (head controls iris)' },
					],
				},
			],
			callback: async ({ options }) => {
				head().send(options.mode === 'IL' ? 'IL' : 'IA')
			},
		},
		extender: {
			name: 'Lens: extender',
			options: [{ id: 'on', type: 'checkbox', label: 'On', default: true }],
			callback: async ({ options }) => {
				head().send(options.on ? 'G' : 'g')
			},
		},
		column: {
			name: 'Column: up / down',
			description:
				'Elevation column on the configured aux axis (X/Y/Q). Ramped. Presets: move on press, stop on release.',
			options: [
				{
					id: 'direction',
					type: 'dropdown',
					label: 'Direction',
					default: 'up',
					choices: [
						{ id: 'up', label: 'Up' },
						{ id: 'down', label: 'Down' },
						{ id: 'stop', label: 'Stop' },
					],
				},
				speedOption,
			],
			callback: async ({ options }) => {
				const sign = options.direction === 'up' ? 1 : options.direction === 'down' ? -1 : 0
				head().setColumnSpeed(sign * options.speed)
			},
		},
		column_speed: {
			name: 'Column: set speed',
			description: 'Signed speed, positive = up, 0 = stop. Ramped.',
			options: [signedSpeedOption],
			callback: async ({ options }) => head().setColumnSpeed(options.speed),
		},
		recall_shot: {
			name: 'Shot: recall',
			description:
				'Module storage: absolute move (CX) or eased keyframes (S5) in the stored move time. Head memory: C n. ' +
				'RCCP-1 / automation port: C n [s] / P C [T].',
			options: [
				{ id: 'shot', type: 'number', label: 'Shot', default: 1, min: SHOT_MIN, max: SHOT_MAX },
				...timeOptions('Override move time'),
			],
			callback: async ({ options }) => {
				await head().recallShot(options.shot, options.useTime ? Math.round(options.time * 1000) : undefined)
			},
		},
		store_shot: {
			name: 'Shot: store current position',
			description: 'Module storage: reads the pose (two stable reads) and keeps it with a move time. Head memory: E n.',
			options: [
				{ id: 'shot', type: 'number', label: 'Shot', default: 1, min: SHOT_MIN, max: SHOT_MAX },
				...timeOptions('Set move time (otherwise keep / default)'),
			],
			callback: async ({ options }) => {
				try {
					await head().storeShot(options.shot, options.useTime ? Math.round(options.time * 1000) : undefined)
				} catch (e) {
					self.log('error', `Store shot ${options.shot}: ${(e as Error).message}`)
				}
			},
		},
		delete_shot: {
			name: 'Shot: delete (module storage)',
			options: [{ id: 'shot', type: 'number', label: 'Shot', default: 1, min: SHOT_MIN, max: SHOT_MAX }],
			callback: async ({ options }) => head().deleteShot(options.shot),
		},
		cancel_shot: {
			name: 'Shot: cancel running move',
			description: 'Sends CAN; stops a keyframe stream.',
			options: [],
			callback: async () => head().cancelShot(),
		},
		column_home_arm: {
			name: 'Column homing 1/2: arm (S5)',
			description:
				'Arms column homing for 10 s; nothing is sent. Homing drives the column to both end stops – clear the area first.',
			options: [],
			callback: async () => {
				head().armColumnHoming()
			},
		},
		column_home_confirm: {
			name: 'Column homing 2/2: confirm and start (S5)',
			description: 'Starts homing (@CNTR 1010) only if armed in the last 10 s. Verify the soft limits afterwards.',
			options: [],
			callback: async () => {
				head().confirmColumnHoming()
			},
		},
		column_home_abort: {
			name: 'Column homing: abort / disarm (S5)',
			options: [],
			callback: async () => {
				head().abortColumnHoming()
			},
		},
		soft_limits: {
			name: 'Soft limits',
			description:
				'Show reads the limits (@LIMS). Enable/disable (@LIME/@LIMD) only work if allowed in the connection settings. ' +
				'Writing limit values is not supported.',
			options: [
				{
					id: 'op',
					type: 'dropdown',
					label: 'Operation',
					default: 'show',
					choices: [
						{ id: 'show', label: 'Show (read only)' },
						{ id: 'enable', label: 'Enable' },
						{ id: 'disable', label: 'Disable' },
					],
				},
				{
					id: 'axis',
					type: 'dropdown',
					label: 'Axis',
					default: 'x',
					choices: (Object.keys(LIMIT_AXES) as LimitAxis[]).map((a) => ({
						id: a,
						label: `${a === 'x' ? 'x (column / aux X)' : a} (${LIMIT_AXES[a]})`,
					})),
				},
			],
			callback: async ({ options }) => {
				head().limit(options.op, options.axis)
			},
		},
		select_camera: {
			name: 'RCCP-1: select camera',
			description: 'STS-12 switch command; following commands go to this camera.',
			options: [{ id: 'camera', type: 'number', label: 'Camera', default: 1, min: 1, max: 50 }],
			callback: async ({ options }) => {
				head().selectCamera(options.camera)
			},
		},
		take_control: {
			name: 'Take control (L 1, older PT-LP heads)',
			options: [],
			callback: async () => {
				head().send(TAKE_CONTROL_CMD)
			},
		},
		query_position: {
			name: 'Query position',
			options: [],
			callback: async () => head().queryPosition(),
		},
		scan_network: {
			name: 'Scan network for Telemetrics devices',
			description: 'UDP 2000 broadcast. Results appear in the connection settings and in $(telemetrics:discovered).',
			options: [],
			callback: async () => self.scanNetwork(),
		},
		raw: {
			name: 'Send raw command',
			description: 'Sent as typed, followed by CR. For testing commands that have no action yet.',
			options: [{ id: 'command', type: 'textinput', label: 'Command', default: '' }],
			callback: async ({ options }) => {
				if (options.command) head().send(options.command)
			},
		},
	})
}
