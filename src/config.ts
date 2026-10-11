import { Regex, type SomeCompanionConfigField } from '@companion-module/base'

export type ModuleConfig = {
	host: string
	port: number
	mode: 'direct' | 'rccp1'
	camera: number
	takeControl: boolean
	invertPan: boolean
	invertTilt: boolean
	pollInterval: number
	prefix: string
}

export function GetConfigFields(): SomeCompanionConfigField[] {
	return [
		{
			type: 'static-text',
			id: 'info',
			width: 12,
			label: 'Connection',
			value:
				'Direct: the head (or a DS-4 serial port) over TCP, usually port 3001. ' +
				'RCCP-1: the control panel over TCP, usually port 2500; the camera is selected with STS-12 first.',
		},
		{
			type: 'textinput',
			id: 'host',
			label: 'IP address',
			width: 8,
			regex: Regex.IP,
		},
		{
			type: 'number',
			id: 'port',
			label: 'TCP port',
			width: 4,
			min: 1,
			max: 65535,
			default: 3001,
		},
		{
			type: 'dropdown',
			id: 'mode',
			label: 'Target',
			width: 6,
			default: 'direct',
			choices: [
				{ id: 'direct', label: 'Pan/tilt head or DS-4 port' },
				{ id: 'rccp1', label: 'RCCP-1 control panel (STS-12)' },
			],
		},
		{
			type: 'number',
			id: 'camera',
			label: 'Camera on connect (RCCP-1, 0 = none)',
			width: 6,
			min: 0,
			max: 50,
			default: 1,
		},
		{
			type: 'checkbox',
			id: 'takeControl',
			label: 'Take control on connect (L 1)',
			width: 4,
			default: true,
		},
		{
			type: 'checkbox',
			id: 'invertPan',
			label: 'Invert pan',
			width: 4,
			default: false,
		},
		{
			type: 'checkbox',
			id: 'invertTilt',
			label: 'Invert tilt',
			width: 4,
			default: false,
		},
		{
			type: 'number',
			id: 'pollInterval',
			label: 'Position poll interval in ms (0 = off)',
			width: 6,
			min: 0,
			max: 60000,
			default: 1000,
		},
		{
			type: 'textinput',
			id: 'prefix',
			label: 'Command prefix (normally empty)',
			tooltip: 'Some Telemetrics servers expect an address prefix such as "P0" in front of every command.',
			width: 6,
			default: '',
		},
	]
}
