import { Regex, type SomeCompanionConfigField } from '@companion-module/base'
import type { DiscoveredDevice } from './protocol.ts'

export type ModuleConfig = {
	discovered: string
	host: string
	port: number
	mode: 'direct' | 'rccp1' | 'automation'
	model: 'S4' | 'S5'
	camera: number
	automationPage: number
	ds4Ownership: 'off' | 'query' | 'takeover'
	takeControl: boolean
	invertPan: boolean
	invertTilt: boolean
	columnAxis: 'X' | 'Y' | 'Q'
	attackMs: number
	releaseMs: number
	curve: 'linear' | 'sine' | 'cubic' | 'quint'
	shotMode: 'module' | 'head'
	keyframes: boolean
	defaultShotTime: number
	pollInterval: number
	allowLimitChanges: boolean
	prefix: string
	/** Shots stored by the module (JSON), managed by the module itself. */
	shotStore: string
}

const CURVES = [
	{ id: 'cubic', label: 'Cubic (default)' },
	{ id: 'sine', label: 'Sine (gentle)' },
	{ id: 'quint', label: 'Quint (strong)' },
	{ id: 'linear', label: 'Linear (no easing)' },
]

export function GetConfigFields(discovered: DiscoveredDevice[]): SomeCompanionConfigField[] {
	const found = discovered.flatMap((d) =>
		d.ports.map((port) => ({ id: `${d.ip}:${port}:${d.kind}`, label: `${d.model} – ${d.ip}:${port}` })),
	)
	return [
		{
			type: 'static-text',
			id: 'info',
			width: 12,
			label: 'Connection',
			value:
				'Direct: the head or a DS-4 serial port over TCP (port 3001, DS-4 ports 3001–3004), or a network–serial bridge ' +
				'in raw TCP server mode. RCCP-1: the control panel (TCP 2500); a camera is selected with STS-12 first. ' +
				'Automation port: the Telemetrics RCP software (TCP 5000), shot recall only.',
		},
		{
			type: 'dropdown',
			id: 'discovered',
			label: 'Found on the network (UDP 2000)',
			tooltip: 'Scanned when the module starts and with the "Scan network" action. Reopen this page to refresh.',
			width: 12,
			default: 'manual',
			choices: [{ id: 'manual', label: 'Enter manually' }, ...found],
		},
		{
			type: 'textinput',
			id: 'host',
			label: 'IP address',
			width: 8,
			regex: Regex.IP,
			isVisibleExpression: `$(options:discovered) == 'manual'`,
		},
		{
			type: 'number',
			id: 'port',
			label: 'TCP port',
			width: 4,
			min: 1,
			max: 65535,
			default: 3001,
			isVisibleExpression: `$(options:discovered) == 'manual'`,
		},
		{
			type: 'dropdown',
			id: 'mode',
			label: 'Target',
			width: 6,
			default: 'direct',
			choices: [
				{ id: 'direct', label: 'Pan/tilt head, DS-4 port or serial bridge' },
				{ id: 'rccp1', label: 'RCCP-1 control panel (TCP 2500)' },
				{ id: 'automation', label: 'RCP automation port (TCP 5000, shots only)' },
			],
		},
		{
			type: 'dropdown',
			id: 'model',
			label: 'Head generation',
			width: 6,
			default: 'S4',
			choices: [
				{ id: 'S4', label: 'S4 / S2 (PT-LP-S4, PT-HP-S4, PT-CP-S4)' },
				{ id: 'S5', label: 'S5 (PT-LP-S5, PT-HP-S5, PT-CP-S5, RoboEye2)' },
			],
			isVisibleExpression: `$(options:mode) == 'direct'`,
		},
		{
			type: 'number',
			id: 'camera',
			label: 'Camera on connect (RCCP-1, 0 = none)',
			width: 6,
			min: 0,
			max: 50,
			default: 1,
			isVisibleExpression: `$(options:mode) == 'rccp1'`,
		},
		{
			type: 'number',
			id: 'automationPage',
			label: 'Shot page (automation port, 0 = story page)',
			width: 6,
			min: 0,
			max: 99,
			default: 0,
			isVisibleExpression: `$(options:mode) == 'automation'`,
		},
		{
			type: 'dropdown',
			id: 'ds4Ownership',
			label: 'DS-4 port ownership (TCP 3000)',
			tooltip:
				'Only for DS-4 data ports 3001–3004. "Take over" disconnects another controller (e.g. RCP) that owns the port.',
			width: 6,
			default: 'off',
			choices: [
				{ id: 'off', label: 'Off' },
				{ id: 'query', label: 'Show owner only' },
				{ id: 'takeover', label: 'Take over the port on connect' },
			],
			isVisibleExpression: `$(options:mode) == 'direct'`,
		},
		{
			type: 'checkbox',
			id: 'takeControl',
			label: 'Send L 1 on connect (older PT-LP heads)',
			width: 6,
			default: false,
			isVisibleExpression: `$(options:mode) == 'direct'`,
		},
		{
			type: 'static-text',
			id: 'motionInfo',
			width: 12,
			label: 'Motion',
			value: 'Speed changes glide along an ease curve: attack when speeding up, release when slowing down.',
		},
		{ type: 'checkbox', id: 'invertPan', label: 'Invert pan', width: 3, default: false },
		{ type: 'checkbox', id: 'invertTilt', label: 'Invert tilt', width: 3, default: false },
		{
			type: 'dropdown',
			id: 'columnAxis',
			label: 'Column / elevation axis',
			width: 6,
			default: 'X',
			choices: [
				{ id: 'X', label: 'X (aux X, usual for the elevation column)' },
				{ id: 'Y', label: 'Y (aux Y)' },
				{ id: 'Q', label: 'Q (aux Z, rover/pedestal)' },
			],
		},
		{ type: 'number', id: 'attackMs', label: 'Attack (ms, 0 = none)', width: 4, min: 0, max: 5000, default: 350 },
		{ type: 'number', id: 'releaseMs', label: 'Release (ms, 0 = none)', width: 4, min: 0, max: 5000, default: 450 },
		{ type: 'dropdown', id: 'curve', label: 'Ease curve', width: 4, default: 'cubic', choices: CURVES },
		{
			type: 'static-text',
			id: 'shotInfo',
			width: 12,
			label: 'Shots',
			value:
				'Module: the module reads the pose (ptzfxymi) and recalls it with an absolute move (CX) and a move time; ' +
				'S5 heads can play it as an eased keyframe stream. Head memory: the head stores and recalls its own presets (E/C).',
			isVisibleExpression: `$(options:mode) == 'direct'`,
		},
		{
			type: 'dropdown',
			id: 'shotMode',
			label: 'Shot storage',
			width: 6,
			default: 'module',
			choices: [
				{ id: 'module', label: 'Module (pose + move time)' },
				{ id: 'head', label: 'Head memory (C / E)' },
			],
			isVisibleExpression: `$(options:mode) == 'direct'`,
		},
		{
			type: 'number',
			id: 'defaultShotTime',
			label: 'Default move time (s)',
			width: 3,
			min: 0,
			max: 120,
			step: 0.1,
			default: 3,
			isVisibleExpression: `$(options:mode) == 'direct'`,
		},
		{
			type: 'checkbox',
			id: 'keyframes',
			label: 'S5: eased keyframe moves',
			width: 3,
			default: true,
			isVisibleExpression: `$(options:mode) == 'direct' && $(options:model) == 'S5'`,
		},
		{
			type: 'number',
			id: 'pollInterval',
			label: 'Position poll interval in ms (0 = off)',
			width: 6,
			min: 0,
			max: 60000,
			default: 250,
			isVisibleExpression: `$(options:mode) == 'direct'`,
		},
		{
			type: 'checkbox',
			id: 'allowLimitChanges',
			label: 'Allow soft limit enable/disable',
			tooltip: 'Off: soft limits can only be shown. Writing limit values is not supported.',
			width: 6,
			default: false,
			isVisibleExpression: `$(options:mode) == 'direct'`,
		},
		{
			type: 'textinput',
			id: 'prefix',
			label: 'Command prefix (normally empty)',
			tooltip: 'Some Telemetrics servers expect an address prefix such as "P0" in front of every command.',
			width: 6,
			default: '',
		},
		{
			type: 'textinput',
			id: 'shotStore',
			label: 'Stored shots (managed by the module)',
			width: 12,
			default: '{}',
			isVisibleExpression: 'false',
		},
	]
}

/** Host, port and head generation, taking a discovered device into account. */
export function resolveEndpoint(config: ModuleConfig): { host: string; port: number; model?: 'S4' | 'S5' } {
	if (config.discovered && config.discovered !== 'manual') {
		const [host, port, kind] = config.discovered.split(':')
		const model = kind === 'S5' || kind === 'RoboEye2' ? 'S5' : kind === 'S4' ? 'S4' : undefined
		return { host, port: Number(port), model }
	}
	return { host: config.host, port: config.port }
}
