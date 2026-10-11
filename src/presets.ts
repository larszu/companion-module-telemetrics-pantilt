import type { ModuleSchema } from './main.js'
import type ModuleInstance from './main.js'
import type { CompanionPresetDefinitions, CompanionPresetSection } from '@companion-module/base'
import { DIRECTIONS, type Direction } from './protocol.js'

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

export function UpdatePresets(self: ModuleInstance): void {
	const presets: CompanionPresetDefinitions<ModuleSchema> = {}

	for (const dir of DIRECTIONS) {
		presets[`move_${dir}`] = {
			type: 'simple',
			name: `Move ${dir}`,
			style: { text: ARROWS[dir], size: '30', color: 0xffffff, bgcolor: 0x000000 },
			steps: [
				{
					down: [{ actionId: 'move', options: { direction: dir, speed: 50 } }],
					up: [{ actionId: 'stop', options: {} }],
				},
			],
			feedbacks: [],
		}
	}
	presets['stop'] = {
		type: 'simple',
		name: 'Stop',
		style: { text: 'STOP', size: '18', color: 0xffffff, bgcolor: 0x800000 },
		steps: [{ down: [{ actionId: 'stop', options: {} }], up: [] }],
		feedbacks: [{ feedbackId: 'moving', options: {}, style: { bgcolor: 0xff0000 } }],
	}

	const shotIds: string[] = []
	for (let shot = 1; shot <= SHOT_PRESETS; shot++) {
		const id = `shot_${shot}`
		shotIds.push(id)
		presets[id] = {
			type: 'simple',
			name: `Shot ${shot}`,
			style: { text: `SHOT\\n${shot}`, size: '18', color: 0xffffff, bgcolor: 0x000000 },
			steps: [
				{
					down: [],
					up: [{ actionId: 'recall_shot', options: { shot, useTime: false, time: 3 } }],
					2000: { options: { runWhileHeld: true }, actions: [{ actionId: 'store_shot', options: { shot } }] },
				},
			],
			feedbacks: [{ feedbackId: 'last_shot', options: { shot }, style: { bgcolor: 0xc00000, color: 0xffffff } }],
		}
	}

	const lensIds: string[] = []
	const lens: [string, 'zoom' | 'focus', 'minus' | 'plus', string][] = [
		['zoom_tele', 'zoom', 'minus', 'ZOOM\\nIN'],
		['zoom_wide', 'zoom', 'plus', 'ZOOM\\nOUT'],
		['focus_near', 'focus', 'minus', 'FOCUS\\nNEAR'],
		['focus_far', 'focus', 'plus', 'FOCUS\\nFAR'],
	]
	for (const [id, actionId, direction, text] of lens) {
		lensIds.push(id)
		presets[id] = {
			type: 'simple',
			name: text.replace('\\n', ' ').toLowerCase(),
			style: { text, size: '14', color: 0xffffff, bgcolor: 0x202020 },
			steps: [
				{
					down: [{ actionId, options: { direction, speed: 50 } }],
					up: [{ actionId, options: { direction: 'stop', speed: 50 } }],
				},
			],
			feedbacks: [],
		}
	}

	const cameraIds: string[] = []
	for (let camera = 1; camera <= CAMERA_PRESETS; camera++) {
		const id = `camera_${camera}`
		cameraIds.push(id)
		presets[id] = {
			type: 'simple',
			name: `Camera ${camera}`,
			style: { text: `CAM\\n${camera}`, size: '18', color: 0xffffff, bgcolor: 0x000000 },
			steps: [{ down: [{ actionId: 'select_camera', options: { camera } }], up: [] }],
			feedbacks: [
				{ feedbackId: 'selected_camera', options: { camera }, style: { bgcolor: 0x0060c0, color: 0xffffff } },
			],
		}
	}

	presets['status'] = {
		type: 'simple',
		name: 'Connection and position',
		style: {
			text: 'P $(this:pan_position)\\nT $(this:tilt_position)',
			size: '14',
			color: 0xffffff,
			bgcolor: 0x400000,
		},
		steps: [{ down: [{ actionId: 'query_position', options: {} }], up: [] }],
		feedbacks: [{ feedbackId: 'connected', options: {}, style: { bgcolor: 0x006000 } }],
	}

	const structure: CompanionPresetSection[] = [
		{
			id: 'pantilt',
			name: 'Pan/Tilt',
			definitions: [
				{
					id: 'pad',
					name: 'Direction pad',
					description: 'Moves while pressed, stops on release.',
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
					name: 'Zoom and focus',
					description: 'Moves while pressed, stops on release.',
					type: 'simple',
					presets: lensIds,
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
					description: 'Short press recalls the shot, holding for 2 seconds stores the current position.',
					type: 'simple',
					presets: shotIds,
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
