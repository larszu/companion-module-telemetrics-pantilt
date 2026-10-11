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
	recallShotCmd,
	speedToVelocity,
	type Direction,
} from './protocol.js'

export type ActionsSchema = {
	move: { options: { direction: Direction; speed: number } }
	stop: { options: Record<string, never> }
	pan: { options: { speed: number } }
	tilt: { options: { speed: number } }
	recall_shot: { options: { shot: number; useTime: boolean; time: number } }
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

export function UpdateActions(self: ModuleInstance): void {
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
			name: 'Pan/tilt: stop',
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
		recall_shot: {
			name: 'Recall shot',
			options: [
				{ id: 'shot', type: 'number', label: 'Shot', default: 1, min: SHOT_MIN, max: SHOT_MAX },
				{ id: 'useTime', type: 'checkbox', label: 'Override move time', default: false, disableAutoExpression: true },
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
				if (self.send(recallShotCmd(options.shot, options.useTime ? options.time : undefined))) {
					self.shotRecalled(options.shot)
				}
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
			name: 'Take control (L 1)',
			options: [],
			callback: async () => {
				self.send(TAKE_CONTROL_CMD)
			},
		},
		query_position: {
			name: 'Query position',
			options: [],
			callback: async () => {
				self.send(QUERY_POSITION_CMD)
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
