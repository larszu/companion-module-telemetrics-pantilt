import type { ModuleSchema } from './main.ts'
import type ModuleInstance from './main.ts'
import type { CompanionPresetDefinitions, CompanionPresetSection } from '@companion-module/base'
import { DIRECTIONS, type Direction } from './protocol.ts'

const ARROWS: Record<Direction, string> = {
	up: '⬆',
	down: '⬇',
	left: '⬅',
	right: '➡',
	'up-left': '⬉',
	'up-right': '⬈',
	'down-left': '⬋',
	'down-right': '⬊',
}

const SHOT_PRESETS = 16
const CAMERA_PRESETS = 8
const WHITE = 0xffffff
const BLACK = 0x000000
const DARK = 0x202020

export function UpdatePresets(self: ModuleInstance): void {
	const presets: CompanionPresetDefinitions<ModuleSchema> = {}

	// ---- pan/tilt pad
	for (const dir of DIRECTIONS) {
		presets[`move_${dir}`] = {
			type: 'simple',
			name: `Move ${dir}`,
			style: { text: ARROWS[dir], size: '30', color: WHITE, bgcolor: BLACK },
			steps: [
				{
					down: [{ actionId: 'move', options: { direction: dir, speed: 50 } }],
					up: [{ actionId: 'move_stop', options: {} }],
				},
			],
			feedbacks: [],
		}
	}
	presets['stop'] = {
		type: 'simple',
		name: 'Stop all',
		style: { text: 'STOP', size: '18', color: WHITE, bgcolor: 0x800000 },
		steps: [{ down: [{ actionId: 'stop', options: {} }], up: [] }],
		feedbacks: [{ feedbackId: 'moving', options: {}, style: { bgcolor: 0xff0000 } }],
	}
	presets['status'] = {
		type: 'simple',
		name: 'Connection and position',
		style: {
			text: 'P $(this:pan_position)\\nT $(this:tilt_position)',
			size: '14',
			color: WHITE,
			bgcolor: 0x400000,
		},
		steps: [{ down: [{ actionId: 'query_position', options: {} }], up: [] }],
		feedbacks: [{ feedbackId: 'connected', options: {}, style: { bgcolor: 0x006000 } }],
	}

	// ---- lens
	const lensIds: string[] = []
	const lens: [string, 'zoom' | 'focus' | 'iris', 'minus' | 'plus', string][] = [
		['zoom_tele', 'zoom', 'minus', 'ZOOM\\nIN'],
		['zoom_wide', 'zoom', 'plus', 'ZOOM\\nOUT'],
		['focus_near', 'focus', 'minus', 'FOCUS\\nNEAR'],
		['focus_far', 'focus', 'plus', 'FOCUS\\nFAR'],
		['iris_open', 'iris', 'plus', 'IRIS\\nOPEN'],
		['iris_close', 'iris', 'minus', 'IRIS\\nCLOSE'],
	]
	for (const [id, actionId, direction, text] of lens) {
		lensIds.push(id)
		presets[id] = {
			type: 'simple',
			name: text.replace('\\n', ' ').toLowerCase(),
			style: { text, size: '14', color: WHITE, bgcolor: DARK },
			steps: [
				{
					down: [{ actionId, options: { direction, speed: 50 } }],
					up: [{ actionId, options: { direction: 'stop', speed: 50 } }],
				},
			],
			feedbacks: [],
		}
	}
	presets['zoom_position'] = {
		type: 'simple',
		name: 'Zoom and focus position',
		style: { text: 'Z $(this:zoom_position)\\nF $(this:focus_position)', size: '14', color: WHITE, bgcolor: BLACK },
		steps: [{ down: [], up: [] }],
		feedbacks: [],
	}
	lensIds.push('zoom_position')

	// ---- column
	const columnIds = [
		'column_up',
		'column_down',
		'column_position',
		'column_home_arm',
		'column_home_confirm',
		'column_home_abort',
	]
	for (const [id, direction, text] of [
		['column_up', 'up', 'COLUMN\\n⬆'],
		['column_down', 'down', 'COLUMN\\n⬇'],
	] as const) {
		presets[id] = {
			type: 'simple',
			name: `Column ${direction}`,
			style: { text, size: '14', color: WHITE, bgcolor: DARK },
			steps: [
				{
					down: [{ actionId: 'column', options: { direction, speed: 40 } }],
					up: [{ actionId: 'column', options: { direction: 'stop', speed: 40 } }],
				},
			],
			feedbacks: [],
		}
	}
	presets['column_position'] = {
		type: 'simple',
		name: 'Column position',
		style: { text: 'COLUMN\\n$(this:column_position)', size: '14', color: WHITE, bgcolor: BLACK },
		steps: [{ down: [], up: [] }],
		feedbacks: [],
	}
	presets['column_home_arm'] = {
		type: 'simple',
		name: 'Column homing 1/2: arm',
		style: { text: 'HOME\\nCOLUMN\\narm', size: '14', color: WHITE, bgcolor: DARK },
		steps: [{ down: [{ actionId: 'column_home_arm', options: {} }], up: [] }],
		feedbacks: [{ feedbackId: 'column_home', options: { phase: 'armed' }, style: { bgcolor: 0xc06000 } }],
	}
	presets['column_home_confirm'] = {
		type: 'simple',
		name: 'Column homing 2/2: confirm',
		style: { text: 'HOME\\nCONFIRM\\n$(this:column_home_phase)', size: '14', color: WHITE, bgcolor: DARK },
		steps: [{ down: [{ actionId: 'column_home_confirm', options: {} }], up: [] }],
		feedbacks: [
			{ feedbackId: 'column_home', options: { phase: 'armed' }, style: { bgcolor: 0xc00000 } },
			{ feedbackId: 'column_home', options: { phase: 'running' }, style: { bgcolor: 0xc06000 } },
			{ feedbackId: 'column_home', options: { phase: 'done' }, style: { bgcolor: 0x006000 } },
			{ feedbackId: 'column_home', options: { phase: 'error' }, style: { bgcolor: 0xff0000 } },
		],
	}
	presets['column_home_abort'] = {
		type: 'simple',
		name: 'Column homing: abort',
		style: { text: 'HOME\\nABORT', size: '14', color: WHITE, bgcolor: 0x800000 },
		steps: [{ down: [{ actionId: 'column_home_abort', options: {} }], up: [] }],
		feedbacks: [],
	}

	// ---- shots
	const shotIds: string[] = []
	for (let shot = 1; shot <= SHOT_PRESETS; shot++) {
		const id = `shot_${shot}`
		shotIds.push(id)
		presets[id] = {
			type: 'simple',
			name: `Shot ${shot}`,
			style: { text: `SHOT\\n${shot}`, size: '18', color: 0x808080, bgcolor: BLACK },
			steps: [
				{
					down: [],
					up: [{ actionId: 'recall_shot', options: { shot, useTime: false, time: 3 } }],
					2000: {
						options: { runWhileHeld: true },
						actions: [{ actionId: 'store_shot', options: { shot, useTime: false, time: 3 } }],
					},
				},
			],
			feedbacks: [
				{ feedbackId: 'shot_stored', options: { shot }, style: { color: WHITE } },
				{ feedbackId: 'current_shot', options: { shot, status: 'moving' }, style: { bgcolor: 0xc08000, color: WHITE } },
				{ feedbackId: 'current_shot', options: { shot, status: 'onshot' }, style: { bgcolor: 0xc00000, color: WHITE } },
				{ feedbackId: 'current_shot', options: { shot, status: 'sent' }, style: { bgcolor: 0xc00000, color: WHITE } },
			],
		}
	}
	presets['shot_cancel'] = {
		type: 'simple',
		name: 'Cancel shot move',
		style: { text: 'CANCEL\\nSHOT', size: '14', color: WHITE, bgcolor: 0x600000 },
		steps: [{ down: [{ actionId: 'cancel_shot', options: {} }], up: [] }],
		feedbacks: [],
	}
	presets['shot_status'] = {
		type: 'simple',
		name: 'Shot status',
		style: { text: 'SHOT $(this:current_shot)\\n$(this:shot_status)', size: '14', color: WHITE, bgcolor: BLACK },
		steps: [{ down: [], up: [] }],
		feedbacks: [],
	}
	shotIds.push('shot_cancel', 'shot_status')

	// ---- soft limits (column axis by default)
	const limitIds = ['limits_show', 'limits_enable', 'limits_disable']
	for (const [id, op, text] of [
		['limits_show', 'show', 'LIMITS\\n$(this:limits_enabled)'],
		['limits_enable', 'enable', 'LIMITS\\nON'],
		['limits_disable', 'disable', 'LIMITS\\nOFF'],
	] as const) {
		presets[id] = {
			type: 'simple',
			name: `Soft limits column: ${op}`,
			style: { text, size: '14', color: WHITE, bgcolor: DARK },
			steps: [{ down: [{ actionId: 'soft_limits', options: { op, axis: 'x' } }], up: [] }],
			feedbacks: op === 'show' ? [{ feedbackId: 'limits_enabled', options: {}, style: { bgcolor: 0x006000 } }] : [],
		}
	}

	// ---- RCCP-1 cameras
	const cameraIds: string[] = []
	for (let camera = 1; camera <= CAMERA_PRESETS; camera++) {
		const id = `camera_${camera}`
		cameraIds.push(id)
		presets[id] = {
			type: 'simple',
			name: `Camera ${camera}`,
			style: { text: `CAM\\n${camera}`, size: '18', color: WHITE, bgcolor: BLACK },
			steps: [{ down: [{ actionId: 'select_camera', options: { camera } }], up: [] }],
			feedbacks: [{ feedbackId: 'selected_camera', options: { camera }, style: { bgcolor: 0x0060c0, color: WHITE } }],
		}
	}

	const structure: CompanionPresetSection[] = [
		{
			id: 'pantilt',
			name: 'Pan/Tilt',
			definitions: [
				{
					id: 'pad',
					name: 'Direction pad',
					description: 'Moves while pressed with a soft start, glides to a stop on release.',
					type: 'simple',
					presets: [...DIRECTIONS.map((d) => `move_${d}`), 'stop', 'status'],
				},
			],
		},
		{
			id: 'lens',
			name: 'Lens',
			definitions: [
				{
					id: 'lens',
					name: 'Zoom, focus, iris',
					description: 'Moves while pressed, stops on release. Iris only if the lens is driven by the head.',
					type: 'simple',
					presets: lensIds,
				},
			],
		},
		{
			id: 'column',
			name: 'Column',
			definitions: [
				{
					id: 'column',
					name: 'Elevation column',
					description: 'Up/down while pressed. Homing (S5) needs arm, then confirm within 10 s.',
					type: 'simple',
					presets: columnIds,
				},
			],
		},
		{
			id: 'shots',
			name: 'Shots',
			definitions: [
				{
					id: 'shots',
					name: 'Recall and store shots',
					description:
						'Short press recalls, holding 2 s stores the current position. Grey text = empty, orange = moving, red = on shot.',
					type: 'simple',
					presets: shotIds,
				},
			],
		},
		{
			id: 'limits',
			name: 'Soft limits',
			definitions: [
				{
					id: 'limits',
					name: 'Column soft limits',
					description: 'Show is read only. Enable/disable must be allowed in the connection settings.',
					type: 'simple',
					presets: limitIds,
				},
			],
		},
		{
			id: 'rccp1',
			name: 'RCCP-1',
			definitions: [{ id: 'cameras', name: 'Select camera (STS-12)', type: 'simple', presets: cameraIds }],
		},
	]

	self.setPresetDefinitions(structure, presets)
}
