import { generateEslintConfig } from '@companion-module/tools/eslint/config.mjs'

const config = await generateEslintConfig({
	enableTypescript: true,
})

// Tests and the mock head run directly with Node's type stripping, outside the module build.
export default [{ ignores: ['test/**', 'tools/**'] }, ...config]
