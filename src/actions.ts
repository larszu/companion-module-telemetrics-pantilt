import type ModuleInstance from './main.js'
import {
	DIRECTIONS,
	QUERY_POSITION_CMD,
	SHOT_MAX,
	SHOT_MIN,
	SHOT_TIME_MAX,
	STOP_CMD,
	TAKE_CONTROL_CMD,
	directionVector,
	lensCmd,
	recallShotCmd,
	speedToVelocity,
	stepCmd,
	storeShotCmd,
	type Direction,
	type LensAxis,
} from './protocol.js'

type LensDirection = 'minus' | 'plus' | 'stop'

export type ActionsSchema = {
	move: { options: { direction: Direction; speed: number } }
	stop: { options: Record<string, never> }
	pan: { options: { speed: number } }
	tilt: { options: { speed: number } }
	zoom: { options: { direction: LensDirection; speed: number } }
	focus: { options: { direction: LensDirection; speed: number } }
	iris: { options: { direction: LensDirection; speed: number } }
	focus_step: { options: { steps: number } }
	iris_step: { options: { steps: number } }
	iris_mode: { options: { mode: string } }
	extender: { options: { on: boolean } }
	recall_shot: { options: { shot: number; useTime: boolean; time: number } }
	store_shot: { options: { shot: number } }
	select_camera: { options: { camera: number } }
	take_control: { options: Record<string, never> }
	query_position: { options: Record<string, never> }
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

export function UpdateActions(self: ModuleInstance): void {
	/** Lens velocity: "minus" moves towards 0 (tele / near / close), "plus" towards 32767. */
	const lensAction = (name: string, axis: LensAxis, minus: string, plus: string) => ({
		name,
		description: 'Moves until stopped. In presets: move on press, stop on release.',
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
			{ id: 'speed' as const, type: 'number' as const, label: 'Speed (%)', default: 50, min: 1, max: 100, range: true },
		],
		callback: async ({ options }: { options: { direction: LensDirection; speed: number } }) => {
			self.send(lensCmd(axis, SIGN[options.direction] * options.speed))
		},
	})

	self.setActionDefinitions({
		move: {
			name: 'Pan/tilt: move',
			description: 'Moves until a stop is sent. In presets: move on press, stop on release.',
			options: [
				{
					id: 'direction',
					type: 'dropdown',
					label: 'Direction',
					default: 'up',
					choices: DIRECTIONS.map((d) => ({ id: d, label: DIRECTION_LABELS[d] })),
				},
				{ id: 'speed', type: 'number', label: 'Speed (%)', default: 50, min: 1, max: 100, range: true },
			],
			callback: async ({ options }) => {
				const v = directionVector(options.direction)
				self.move(v.pan * options.speed, v.tilt * options.speed)
			},
		},
		stop: {
			name: 'Stop all motion',
			description: 'R: stops pan, tilt, zoom, focus and iris.',
			options: [],
			callback: async () => {
				if (self.send(STOP_CMD)) self.setMoving(false)
			},
		},
		pan: {
			name: 'Pan: set speed',
			description: 'Signed speed, positive = left, 0 = stop pan. Suited to rotary encoders.',
			options: [{ id: 'speed', type: 'number', label: 'Speed (%)', default: 0, min: -100, max: 100, range: true }],
			callback: async ({ options }) => {
				const speed = self.config.invertPan ? -options.speed : options.speed
				self.send(`P ${speedToVelocity(speed)}`)
			},
		},
		tilt: {
			name: 'Tilt: set speed',
			description: 'Signed speed, positive = up, 0 = stop tilt.',
			options: [{ id: 'speed', type: 'number', label: 'Speed (%)', default: 0, min: -100, max: 100, range: true }],
			callback: async ({ options }) => {
				const speed = self.config.invertTilt ? -options.speed : options.speed
				self.send(`T ${speedToVelocity(speed)}`)
			},
		},
		zoom: lensAction('Lens: zoom', 'Z', 'Tele (in)', 'Wide (out)'),
		focus: lensAction('Lens: focus', 'F', 'Near', 'Far'),
		iris: lensAction('Lens: iris', 'I', 'Close', 'Open'),
		focus_step: {
			name: 'Lens: focus step',
			description: 'FI: relative focus step, -255..255.',
			options: [{ id: 'steps', type: 'number', label: 'Steps', default: 10, min: -255, max: 255 }],
			callback: async ({ options }) => {
				self.send(stepCmd('FI', options.steps))
			},
		},
		iris_step: {
			name: 'Lens: iris step',
			description: 'II: relative iris step, -255..255. Positive closes.',
			options: [{ id: 'steps', type: 'number', label: 'Steps', default: 10, min: -255, max: 255 }],
			callback: async ({ options }) => {
				self.send(stepCmd('II', options.steps))
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
				self.send(options.mode === 'IL' ? 'IL' : 'IA')
			},
		},
		extender: {
			name: 'Lens: extender',
			options: [{ id: 'on', type: 'checkbox', label: 'On', default: true }],
			callback: async ({ options }) => {
				self.send(options.on ? 'G' : 'g')
			},
		},
		recall_shot: {
			name: 'Recall shot',
			options: [
				{ id: 'shot', type: 'number', label: 'Shot', default: 1, min: SHOT_MIN, max: SHOT_MAX },
				{
					id: 'useTime',
					type: 'checkbox',
					label: 'Override move time (RCCP-1 only)',
					default: false,
					disableAutoExpression: true,
				},
				{
					id: 'time',
					type: 'number',
					label: 'Move time (s)',
					default: 3,
					min: 0,
					max: SHOT_TIME_MAX,
					isVisibleExpression: '$(options:useTime)',
				},
			],
			callback: async ({ options }) => {
				const time = options.useTime && self.config.mode === 'rccp1' ? options.time : undefined
				if (self.send(recallShotCmd(options.shot, time))) self.shotRecalled(options.shot)
			},
		},
		store_shot: {
			name: 'Store shot',
			description: 'E: stores the current position under this shot number.',
			options: [{ id: 'shot', type: 'number', label: 'Shot', default: 1, min: SHOT_MIN, max: SHOT_MAX }],
			callback: async ({ options }) => {
				if (self.send(storeShotCmd(options.shot))) self.shotRecalled(options.shot)
			},
		},
		select_camera: {
			name: 'RCCP-1: select camera',
			description: 'STS-12 switch command; following commands go to this camera.',
			options: [{ id: 'camera', type: 'number', label: 'Camera', default: 1, min: 1, max: 50 }],
			callback: async ({ options }) => {
				self.selectCamera(options.camera)
			},
		},
		take_control: {
			name: 'Take control (L 1, older PT-LP heads)',
			options: [],
			callback: async () => {
				self.send(TAKE_CONTROL_CMD)
			},
		},
		query_position: {
			name: 'Query position',
			options: [],
			callback: async () => {
				self.send(QUERY_POSITION_CMD, false)
			},
		},
		raw: {
			name: 'Send raw command',
			description: 'Sent as typed, followed by CR. For testing commands that have no action yet.',
			options: [{ id: 'command', type: 'textinput', label: 'Command', default: '' }],
			callback: async ({ options }) => {
				if (options.command) self.send(options.command)
			},
		},
	})
}
