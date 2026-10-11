import type ModuleInstance from './main.js'

export type VariablesSchema = {
	pan_position: number | string
	tilt_position: number | string
	last_shot: number
	selected_camera: number
	last_response: string
}

export function UpdateVariableDefinitions(self: ModuleInstance): void {
	self.setVariableDefinitions({
		pan_position: { name: 'Pan encoder position' },
		tilt_position: { name: 'Tilt encoder position' },
		last_shot: { name: 'Last recalled shot' },
		selected_camera: { name: 'Selected camera (RCCP-1)' },
		last_response: { name: 'Last response from the device' },
	})
}
