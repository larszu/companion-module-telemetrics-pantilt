import type ModuleInstance from './main.ts'

export type VariablesSchema = {
	pan_position: number | string
	tilt_position: number | string
	zoom_position: number | string
	focus_position: number | string
	column_position: number | string
	aux_y_position: number | string
	iris_position: number | string
	black_position: number | string
	current_shot: number | string
	last_shot: number | string
	shot_status: string
	selected_camera: number
	column_home_phase: string
	column_home_state: string
	limits_axis: string
	limits_enabled: string
	limits_upper: number | string
	limits_lower: number | string
	limits_text: string
	system_error: string
	ds4_owner: string
	discovered: string
	last_response: string
}

export function UpdateVariableDefinitions(self: ModuleInstance): void {
	self.setVariableDefinitions({
		pan_position: { name: 'Pan position (encoder counts)' },
		tilt_position: { name: 'Tilt position (encoder counts)' },
		zoom_position: { name: 'Zoom position (S4: 0–1024, S5: 0–65535)' },
		focus_position: { name: 'Focus position (S4: 0–1024, S5: 0–65535)' },
		column_position: { name: 'Column / aux X position (counts)' },
		aux_y_position: { name: 'Aux Y position (counts)' },
		iris_position: { name: 'Iris position' },
		black_position: { name: 'Master black / pedestal position' },
		current_shot: { name: 'Current shot (last recalled)' },
		last_shot: { name: 'Last recalled shot (same as current_shot, kept for 0.1 buttons)' },
		shot_status: { name: 'Shot status: none, moving, onshot, offshot, sent' },
		selected_camera: { name: 'Selected camera (RCCP-1)' },
		column_home_phase: { name: 'Column homing: idle, armed, running, done, error, aborted' },
		column_home_state: { name: 'Column homing state text from the head' },
		limits_axis: { name: 'Soft limits: axis last shown' },
		limits_enabled: { name: 'Soft limits: enabled / disabled' },
		limits_upper: { name: 'Soft limits: upper soft limit' },
		limits_lower: { name: 'Soft limits: lower soft limit' },
		limits_text: { name: 'Soft limits: raw reply' },
		system_error: { name: 'System error (S5)' },
		ds4_owner: { name: 'DS-4 port owner before connect (0 = free)' },
		discovered: { name: 'Devices found on the network' },
		last_response: { name: 'Last text response from the device' },
	})
}
