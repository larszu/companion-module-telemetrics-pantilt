import type ModuleInstance from './main.js'

export type FeedbacksSchema = {
	connected: { type: 'boolean'; options: Record<string, never> }
	moving: { type: 'boolean'; options: Record<string, never> }
	last_shot: { type: 'boolean'; options: { shot: number } }
	selected_camera: { type: 'boolean'; options: { camera: number } }
}

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
			name: 'Head moving (by this module)',
			type: 'boolean',
			defaultStyle: { bgcolor: 0xc08000, color: 0xffffff },
			options: [],
			callback: () => self.moving,
		},
		last_shot: {
			name: 'Shot was recalled last',
			type: 'boolean',
			defaultStyle: { bgcolor: 0xc00000, color: 0xffffff },
			options: [{ id: 'shot', type: 'number', label: 'Shot', default: 1, min: 0, max: 255 }],
			callback: ({ options }) => self.lastShot === options.shot,
		},
		selected_camera: {
			name: 'RCCP-1: camera selected',
			type: 'boolean',
			defaultStyle: { bgcolor: 0x0060c0, color: 0xffffff },
			options: [{ id: 'camera', type: 'number', label: 'Camera', default: 1, min: 1, max: 50 }],
			callback: ({ options }) => self.selectedCamera === options.camera,
		},
	})
}
