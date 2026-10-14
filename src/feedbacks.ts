import type ModuleInstance from './main.ts'
import type { ColumnHomePhase, ShotStatus } from './head.ts'

export type FeedbacksSchema = {
	connected: { type: 'boolean'; options: Record<string, never> }
	moving: { type: 'boolean'; options: Record<string, never> }
	current_shot: { type: 'boolean'; options: { shot: number; status: string } }
	last_shot: { type: 'boolean'; options: { shot: number } }
	shot_stored: { type: 'boolean'; options: { shot: number } }
	column_home: { type: 'boolean'; options: { phase: ColumnHomePhase } }
	limits_enabled: { type: 'boolean'; options: Record<string, never> }
	selected_camera: { type: 'boolean'; options: { camera: number } }
}

const SHOT_STATUS_CHOICES: { id: string; label: string }[] = [
	{ id: 'any', label: 'Any status' },
	{ id: 'onshot', label: 'On shot (arrived)' },
	{ id: 'moving', label: 'Moving to the shot' },
	{ id: 'offshot', label: 'Off shot (cancelled or not reached)' },
	{ id: 'sent', label: 'Sent (RCCP-1 / automation port)' },
]

export function UpdateFeedbacks(self: ModuleInstance): void {
	self.setFeedbackDefinitions({
		connected: {
			name: 'Connected',
			type: 'boolean',
			defaultStyle: { bgcolor: 0x00a000, color: 0xffffff },
			options: [],
			callback: () => self.isConnected,
		},
		moving: {
			name: 'Head moving (speed demand or shot move)',
			type: 'boolean',
			defaultStyle: { bgcolor: 0xc08000, color: 0xffffff },
			options: [],
			callback: () => self.head.state.moving,
		},
		current_shot: {
			name: 'Current shot',
			description: 'The shot was recalled last; optionally only in one status.',
			type: 'boolean',
			defaultStyle: { bgcolor: 0xc00000, color: 0xffffff },
			options: [
				{ id: 'shot', type: 'number', label: 'Shot', default: 1, min: 0, max: 255 },
				{ id: 'status', type: 'dropdown', label: 'Status', default: 'any', choices: SHOT_STATUS_CHOICES },
			],
			callback: ({ options }) => {
				const s = self.head.state.shot
				if (s.number !== options.shot) return false
				return options.status === 'any' || s.status === (options.status as ShotStatus)
			},
		},
		last_shot: {
			name: 'Shot was recalled last (0.1)',
			type: 'boolean',
			defaultStyle: { bgcolor: 0xc00000, color: 0xffffff },
			options: [{ id: 'shot', type: 'number', label: 'Shot', default: 1, min: 0, max: 255 }],
			callback: ({ options }) => self.head.state.shot.number === options.shot,
		},
		shot_stored: {
			name: 'Shot is stored (module storage)',
			type: 'boolean',
			defaultStyle: { color: 0xffd000 },
			options: [{ id: 'shot', type: 'number', label: 'Shot', default: 1, min: 0, max: 255 }],
			callback: ({ options }) => self.head.shots.has(options.shot),
		},
		column_home: {
			name: 'Column homing state (S5)',
			type: 'boolean',
			defaultStyle: { bgcolor: 0xc06000, color: 0xffffff },
			options: [
				{
					id: 'phase',
					type: 'dropdown',
					label: 'Phase',
					default: 'armed',
					choices: [
						{ id: 'armed', label: 'Armed (waiting for confirm)' },
						{ id: 'running', label: 'Running' },
						{ id: 'done', label: 'Done' },
						{ id: 'error', label: 'Error' },
						{ id: 'aborted', label: 'Aborted' },
						{ id: 'idle', label: 'Idle' },
					],
				},
			],
			callback: ({ options }) => self.head.state.columnHome.phase === options.phase,
		},
		limits_enabled: {
			name: 'Soft limits enabled (last shown axis)',
			type: 'boolean',
			defaultStyle: { bgcolor: 0x006000, color: 0xffffff },
			options: [],
			callback: () => self.head.state.limits.status.enabled === true,
		},
		selected_camera: {
			name: 'RCCP-1: camera selected',
			type: 'boolean',
			defaultStyle: { bgcolor: 0x0060c0, color: 0xffffff },
			options: [{ id: 'camera', type: 'number', label: 'Camera', default: 1, min: 1, max: 50 }],
			callback: ({ options }) => self.head.state.selectedCamera === options.camera,
		},
	})
}
