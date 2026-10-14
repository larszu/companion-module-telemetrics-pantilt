// End-to-end: HeadSession (the module's session logic) against tools/mock-head.ts over real TCP.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import net from 'node:net'
import { startMockHead, type MockHead } from '../tools/mock-head.ts'
import { HeadSession, type HeadOptions } from '../src/head.ts'
import { discover, ds4Owner } from '../src/discovery.ts'

let nextPort = 39100 + Math.floor(Math.random() * 500)
const port = () => nextPort++
const sleep = async (ms: number) => new Promise((r) => setTimeout(r, ms))

async function until(cond: () => boolean, ms = 3000, what = 'condition'): Promise<void> {
	const end = Date.now() + ms
	while (!cond()) {
		if (Date.now() > end) throw new Error(`timeout waiting for ${what}`)
		await sleep(20)
	}
}

async function connect(
	opts: Partial<HeadOptions>,
	mockOpts: { model?: 'S4' | 'S5'; automation?: boolean } = {},
): Promise<{ head: HeadSession; mock: MockHead; close: () => Promise<void> }> {
	const p = port()
	const ap = mockOpts.automation ? port() : undefined
	const model = mockOpts.model ?? opts.model
	const mock = await startMockHead({ port: p, model, automationPort: ap, quiet: true })
	const sock = net.connect({ host: '127.0.0.1', port: ap ?? p })
	await new Promise<void>((r) => sock.once('connect', () => r()))
	const head = new HeadSession({ pollIntervalMs: 100, ...opts }, (d) =>
		sock.write(typeof d === 'string' ? Buffer.from(d, 'latin1') : d),
	)
	sock.on('data', (d) => head.onData(d))
	head.onConnect()
	return {
		head,
		mock,
		close: async () => {
			head.destroy()
			sock.destroy()
			await mock.close()
		},
	}
}

test('S4: ramped pan, release ramp, stop all', async () => {
	const { head, mock, close } = await connect({ model: 'S4', ramp: { attackMs: 300, releaseMs: 300, curve: 'cubic' } })
	try {
		head.move(100, 0)
		await sleep(80)
		assert.ok(mock.vel.P > 16383 && mock.vel.P < 32767, `ramping up, got ${mock.vel.P}`)
		await until(() => mock.vel.P === 32767, 1000, 'full speed')
		assert.ok(head.state.moving)
		head.move(0, 0)
		await sleep(80)
		assert.ok(mock.vel.P > 16383 && mock.vel.P < 32767, 'ramping down')
		await until(() => mock.vel.P === 16383, 1000, 'standstill')
		await until(() => !head.state.moving, 500, 'moving flag off')
		head.setColumnSpeed(-50)
		await until(() => mock.vel.X < 16383, 1000, 'column down')
		head.stopAll()
		await until(() => mock.vel.X === 16383 && mock.vel.P === 16383, 500, 'stop all')
		assert.ok(mock.received.some((l) => l === 'R'))
	} finally {
		await close()
	}
})

test('S4: module shots store via ptzfxymi and recall via CX with move time', async () => {
	const { head, mock, close } = await connect({ model: 'S4', shotMode: 'module' })
	try {
		Object.assign(mock.pos, { p: 5000, t: -3000, z: 700, f: 300, x: 1200 })
		assert.ok(await head.storeShot(1, 600))
		assert.equal(head.shots.get(1)?.pos.pan, 5000)
		assert.equal(head.shots.get(1)?.timeMs, 600)
		Object.assign(mock.pos, { p: 0, t: 0, z: 100, f: 100, x: 0 })
		assert.ok(await head.recallShot(1))
		assert.equal(head.state.shot.status, 'moving')
		await until(() => mock.received.some((l) => /^CX 5000 -3000 700 300 1200 \d+ \d+ \d+ 600$/.test(l)), 1000, 'CX')
		await until(() => head.state.shot.status === 'onshot', 3000, 'on shot')
		assert.equal(head.state.shot.number, 1)
		assert.equal(await head.recallShot(9), false, 'empty shot')
	} finally {
		await close()
	}
})

test('S4: head memory shots use E/C', async () => {
	const { head, mock, close } = await connect({ model: 'S4', shotMode: 'head' })
	try {
		await head.storeShot(4)
		await head.recallShot(4)
		await until(() => mock.received.includes('C 4'), 1000, 'C 4')
		assert.ok(mock.received.includes('E 4'))
		await until(() => head.state.shot.status === 'onshot', 3000, 'settled')
	} finally {
		await close()
	}
})

test('S5: keyframe recall streams eased CH frames with flow control', async () => {
	const { head, mock, close } = await connect({ model: 'S5', keyframes: true, shotMode: 'module' })
	try {
		await until(() => head.state.position !== undefined, 1000, 'first position')
		head.shots.set(2, {
			pos: { pan: 40000, tilt: 1000, zoom: 20000, focus: 30000, x: 0, y: 0, black: 0, iris: 0 },
			timeMs: 500,
		})
		assert.ok(await head.recallShot(2))
		await until(() => mock.keyframes.length >= 10, 3000, 'keyframes')
		const pans = mock.keyframes.map((k) => k[0])
		assert.equal(pans[pans.length - 1], 40000)
		assert.ok(pans[0] < pans[pans.length - 1] / 4, 'soft start')
		await until(() => head.state.shot.status === 'onshot', 3000, 'on shot')
	} finally {
		await close()
	}
})

test('S5: CX fallback when keyframes are off; focus speed uses FI steps', async () => {
	const { head, mock, close } = await connect({
		model: 'S5',
		keyframes: false,
		ramp: { attackMs: 0, releaseMs: 0, curve: 'linear' },
	})
	try {
		await head.moveTo({ pan: 100, tilt: 0, zoom: 0, focus: 0, x: 0, y: 0, black: 0, iris: 0 }, 300)
		await until(() => mock.received.some((l) => l.startsWith('CX 100 ')), 1000, 'CX')
		head.setSpeed('F', 100)
		await until(() => mock.received.some((l) => /^FI\d+$/.test(l)), 1000, 'FI steps')
		head.setSpeed('F', 0)
		assert.ok(!mock.received.some((l) => /^F\d+$/.test(l)), 'no F velocity on S5')
	} finally {
		await close()
	}
})

test('S5: column homing needs arm + confirm, reports done', async () => {
	const { head, mock, close } = await connect({ model: 'S5' })
	try {
		assert.equal(head.confirmColumnHoming(), false, 'confirm without arm is refused')
		await sleep(50)
		assert.ok(!mock.received.some((l) => l.includes('@CNTR')))
		assert.ok(head.armColumnHoming())
		assert.equal(head.state.columnHome.phase, 'armed')
		assert.ok(head.confirmColumnHoming())
		await until(() => head.state.columnHome.phase === 'done', 5000, 'homing done')
		assert.ok(mock.received.includes('@CNTR 1010'))
		assert.ok(head.armColumnHoming())
		assert.ok(head.confirmColumnHoming())
		await sleep(150)
		head.abortColumnHoming()
		await until(() => head.state.columnHome.phase === 'aborted', 3000, 'aborted')
	} finally {
		await close()
	}
})

test('S4: column homing is refused (no column homing on S4; @CNTR1010 resets P/T there)', async () => {
	const { head, close } = await connect({ model: 'S4' })
	try {
		assert.equal(head.armColumnHoming(), false)
	} finally {
		await close()
	}
})

test('soft limits: show is read only, enable/disable locked by default', async () => {
	const { head, mock, close } = await connect({ model: 'S4' })
	try {
		assert.equal(head.limit('enable', 'x'), false)
		assert.ok(head.limit('show', 'x'))
		await until(() => head.state.limits.status.upperSoft === -2000, 2000, 'limits parsed')
		assert.equal(head.state.limits.status.enabled, false)
		head.setOptions({ allowLimitChanges: true })
		assert.ok(head.limit('enable', 'x'))
		await sleep(900)
		head.limit('show', 'x')
		await until(() => head.state.limits.status.enabled === true, 2000, 'enabled')
		assert.equal(mock.limits.get(3), true)
		assert.ok(!mock.received.some((l) => /UW=|LW=|@\wLIM/.test(l)), 'no limit writes')
	} finally {
		await close()
	}
})

test('automation port: P C T recall with OK / NOP', async () => {
	const { head, mock, close } = await connect({ target: 'automation', automationPage: 1 }, { automation: true })
	try {
		mock.presets.set(3, { ...mock.pos })
		await head.recallShot(3, 4000)
		await until(() => head.state.lastResponse === 'OK', 1000, 'OK')
		assert.ok(mock.received.includes('P1 C3 T4'))
		await head.recallShot(5)
		await until(() => head.state.shot.status === 'offshot', 1000, 'NOP → offshot')
	} finally {
		await close()
	}
})

test('RCCP-1: camera select then C n s', async () => {
	const { head, mock, close } = await connect({ target: 'rccp1', camera: 2 })
	try {
		await until(() => head.state.lastResponse === '\\8', 1000, 'STS-12 ack')
		await head.recallShot(7, 5000)
		await until(() => mock.received.includes('C 7 5'), 1000, 'C 7 5')
		assert.ok(!mock.received.some((l) => l.includes('\x18')))
	} finally {
		await close()
	}
})

test('DS-4 ownership and UDP discovery against the mock', async () => {
	const p = port()
	const admin = port()
	const disc = port()
	const mock = await startMockHead({ port: p, adminPort: admin, discoveryPort: disc, quiet: true })
	try {
		assert.equal(await ds4Owner('127.0.0.1', 3001, false, admin), '0')
		mock.owner = '10.0.0.9'
		assert.equal(await ds4Owner('127.0.0.1', 3001, true, admin), '10.0.0.9')
		assert.equal(mock.owner, '127.0.0.1', 'taken over')
		const found = await discover({ target: '127.0.0.1', port: disc, waitMs: 400 })
		assert.equal(found.length, 1)
		assert.equal(found[0].kind, 'S4')
		assert.deepEqual(found[0].ports, [3001])
	} finally {
		await mock.close()
	}
})
