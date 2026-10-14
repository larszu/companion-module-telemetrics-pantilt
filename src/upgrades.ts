import type {
	CompanionStaticUpgradeProps,
	CompanionStaticUpgradeResult,
	CompanionStaticUpgradeScript,
	CompanionUpgradeContext,
} from '@companion-module/base'
import type { ModuleConfig } from './config.ts'

export const UpgradeScripts: CompanionStaticUpgradeScript<ModuleConfig>[] = [
	/** 0.2.0: new connection settings get their defaults; 0.1 connections keep their poll interval. */
	function v020Config(
		_context: CompanionUpgradeContext<ModuleConfig>,
		props: CompanionStaticUpgradeProps<ModuleConfig, undefined>,
	): CompanionStaticUpgradeResult<ModuleConfig, undefined> {
		const config = props.config
		if (!config) return { updatedConfig: null, updatedActions: [], updatedFeedbacks: [] }
		const defaults: Partial<ModuleConfig> = {
			discovered: 'manual',
			model: 'S4',
			automationPage: 0,
			ds4Ownership: 'off',
			columnAxis: 'X',
			attackMs: 350,
			releaseMs: 450,
			curve: 'cubic',
			shotMode: 'head',
			keyframes: true,
			defaultShotTime: 3,
			allowLimitChanges: false,
			shotStore: '{}',
		}
		const updated: ModuleConfig = { ...defaults, ...config }
		return { updatedConfig: updated, updatedActions: [], updatedFeedbacks: [] }
	},
]
