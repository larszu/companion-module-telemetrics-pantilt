// Simulated Telemetrics head for testing the module without hardware.
//
//   node tools/mock-head.ts [port] [--model S4|S5] [--admin <port>] [--discovery <port>] [--automation <port>]
//
// Covers: velocities P T Z F I X Y Q, R, FI/II steps, ptzfxymi (any subset), CX absolute moves with fade time,
// on-head presets E/C, STS-12 select, soft limits @LIMS/@LIME/@LIMD, and on S5: @CMD 20/51, @CMD2 0,
// column homing @CNTR 1010/1011 and binary CH keyframes with CH= flow control.
// Optional: DS-4 ownership port (O <port> 2|1), UDP discovery reply, RCP automation port (P<page> C<shot> T<s>).
import net from 'node:net'
import dgram from 'node:dgram'
import { pathToFileURL } from 'node:url'
import { parseKeyframe } from '../src/protocol.ts'

const NEUTRAL = 16383

export interface MockOptions {
	port: number
	model?: 'S4' | 'S5'
	adminPort?: number
	discoveryPort?: number
	automationPort?: number
	quiet?: boolean
	/** Listen address, default 127.0.0.1. */
	host?: string
}

export interface MockPosition {
	p: number
	t: number
	z: number
	f: number
	x: number
	y: number
	m: number
	i: number
}

export interface MockHead {
	pos: MockPosition
	vel: Record<string, number>
	received: string[]
	keyframes: number[][]
	presets: Map<number, MockPosition>
	limits: Map<number, boolean>
	home: { state: number; error: number }
	owner: string
	close(): Promise<void>
}

export async function startMockHead(opts: MockOptions): Promise<MockHead> {
	const model = opts.model ?? 'S4'
	const zmax = model === 'S5' ? 65535 : 1024
	const log = (...a: unknown[]) => {
		if (!opts.quiet) console.log(...a)
	}
	const pos: MockPosition = { p: 0, t: 0, z: Math.round(zmax / 2), f: Math.round(zmax / 2), x: 0, y: 0, m: 0, i: 128 }
	const vel: Record<string, number> = {
		P: NEUTRAL,
		T: NEUTRAL,
		Z: NEUTRAL,
		F: NEUTRAL,
		I: NEUTRAL,
		X: NEUTRAL,
		Y: NEUTRAL,
		Q: NEUTRAL,
	}
	const presets = new Map<number, MockPosition>()
	const limits = new Map<number, boolean>()
	const received: string[] = []
	const keyframes: number[][] = []
	const kfQueue: number[][] = []
	const home = { state: 255, error: 0 }
	let homeTimer: NodeJS.Timeout | undefined
	let move: { from: MockPosition; to: MockPosition; start: number; ms: number } | undefined
	const clampLens = (v: number) => Math.min(zmax, Math.max(0, v))

	const tick = setInterval(() => {
		if (move) {
			const k = move.ms <= 0 ? 1 : Math.min(1, (Date.now() - move.start) / move.ms)
			for (const key of Object.keys(pos) as (keyof MockPosition)[])
				pos[key] = Math.round(move.from[key] + (move.to[key] - move.from[key]) * k)
			if (k >= 1) move = undefined
			return
		}
		const next = kfQueue.shift()
		if (next) {
			;[pos.p, pos.t, pos.z, pos.f, pos.x, pos.y] = next
			return
		}
		pos.p += Math.round((vel.P - NEUTRAL) / 20)
		pos.t += Math.round((vel.T - NEUTRAL) / 20)
		pos.x += Math.round((vel.X - NEUTRAL) / 20)
		pos.y += Math.round((vel.Y - NEUTRAL) / 20)
		pos.z = clampLens(pos.z + Math.round(((vel.Z - NEUTRAL) / NEUTRAL) * (zmax / 50)))
		pos.f = clampLens(pos.f + Math.round(((vel.F - NEUTRAL) / NEUTRAL) * (zmax / 50)))
	}, 50)

	const handleLine = (sock: net.Socket, raw: string) => {
		const line = raw.replace(/\x18/g, '').trim()
		if (line === '') return
		received.push(line)
		log(`< ${JSON.stringify(raw)}`)
		const reply = (s: string) => sock.write(`${s}\r`)
		// queries: any subset of p t z f x y m i, in the requested order
		if (/^[ptzfxymi](\s*[ptzfxymi])*$/.test(line)) {
			const order = line.replace(/\s/g, '').split('') as (keyof MockPosition)[]
			reply(order.map((k) => pos[k]).join(' '))
			return
		}
		if (line.startsWith('\\')) return reply('\\8')
		if (line === 'IA' || line === 'IL' || line === 'G' || line === 'g' || line === 'L 1') return reply('')
		let m = /^@LIM([SED])\s*=?\s*(\d)$/.exec(line)
		if (m) {
			const axis = Number(m[2])
			if (m[1] === 'E') limits.set(axis, true)
			else if (m[1] === 'D') limits.set(axis, false)
			else
				sock.write(
					[
						'Aux SoftLimit Status/Setting',
						`Limits -> ${limits.get(axis) ? 'Enable' : 'Disable'}`,
						'Upper Physical Limit (1) = 0',
						'Lower Physical Limit (2) = 0',
						'Upper Soft Limit (1) =-2000',
						'Lower Soft Limit (2) =-1000',
						'Upper Window (1) = 2000',
						'Lower Window (2) =-1000',
					].join('\r\n') + '\r',
				)
			return reply('')
		}
		if (model === 'S5') {
			if (/^@CMD\s*51\s+0\s+0$/.test(line)) return reply(`#CMD 51 0 0 ${home.state} ${home.error}`)
			if (/^@CMD\s*20\s+0\s+0$/.test(line)) return reply('#CMD 20 0 0 0')
			if (/^@CMD2\s+0$/.test(line))
				return reply(String(move ? Math.max(0, move.ms - (Date.now() - move.start)) : kfQueue.length * 50))
			if (/^@CNTR\s*1010$/.test(line)) {
				home.state = 0
				home.error = 0
				if (homeTimer) clearInterval(homeTimer)
				homeTimer = setInterval(() => {
					home.state = home.state >= 16 ? 255 : home.state + 1
					if (home.state === 255 && homeTimer) clearInterval(homeTimer)
				}, 100)
				return reply('')
			}
			if (/^@CNTR\s*1011$/.test(line)) {
				if (homeTimer) clearInterval(homeTimer)
				home.state = 17
				home.error = 2
				return reply('')
			}
		}
		m = /^CX\s+(.+)$/.exec(line)
		if (m) {
			const n = m[1].trim().split(/\s+/).map(Number)
			const fade = n[n.length - 1]
			const to: MockPosition = { ...pos, p: n[0], t: n[1], z: n[2], f: n[3], x: n[4] }
			if (n.length >= 9) Object.assign(to, { i: n[5], m: n[6], y: n[7] })
			move = { from: { ...pos }, to, start: Date.now(), ms: fade }
			return reply('')
		}
		for (const [, cmd, val] of line.matchAll(/([A-Z]+)\s*(-?\d+)?/g)) {
			const n = Number(val)
			if (cmd in vel) {
				vel[cmd] = n
				move = undefined
			} else if (cmd === 'R') {
				for (const k of Object.keys(vel)) vel[k] = NEUTRAL
				move = undefined
				kfQueue.length = 0
			} else if (cmd === 'FI') pos.f = clampLens(pos.f + n)
			else if (cmd === 'II') pos.i = Math.min(255, Math.max(0, pos.i - n))
			else if (cmd === 'E') presets.set(n, { ...pos })
			else if (cmd === 'C' && presets.has(n))
				move = { from: { ...pos }, to: { ...presets.get(n)! }, start: Date.now(), ms: 1000 }
		}
		reply('')
	}

	const server = net.createServer((sock) => {
		const who = `${sock.remoteAddress}:${sock.remotePort}`
		log(`+ ${who}`)
		let buf = Buffer.alloc(0)
		sock.on('data', (d) => {
			buf = Buffer.concat([buf, d])
			for (;;) {
				// binary keyframe: 'C' 'H' 0x00
				if (buf.length >= 3 && buf[0] === 0x43 && buf[1] === 0x48 && buf[2] === 0x00) {
					if (buf.length < 30) break
					const kf = parseKeyframe(buf.subarray(0, 30))
					buf = buf.subarray(30)
					if (!kf || model !== 'S5') continue
					if (kf.cmd === 0xff) {
						kfQueue.length = 0
						move = undefined
						if (kf.values.some((v) => v !== 0)) kfQueue.push(kf.values.slice(0, 6))
					} else if (kf.cmd === 0x00) {
						kfQueue.push(kf.values.slice(0, 6))
						keyframes.push(kf.values.slice(0, 6))
					}
					sock.write(`CH=${kfQueue.length}\r`)
					continue
				}
				const cr = buf.indexOf(0x0d)
				if (cr < 0) break
				// a binary frame may start inside the pending text; text never contains "CH\0"
				const line = buf.subarray(0, cr).toString('latin1')
				buf = buf.subarray(cr + 1)
				handleLine(sock, line)
			}
		})
		sock.on('close', () => log(`- ${who}`))
		sock.on('error', () => {})
	})
	await new Promise<void>((r) => server.listen(opts.port, opts.host ?? '127.0.0.1', r))
	log(`Mock Telemetrics ${model} head on TCP ${opts.port}`)

	const state: MockHead = {
		pos,
		vel,
		received,
		keyframes,
		presets,
		limits,
		home,
		owner: '0',
		close: async () => {
			clearInterval(tick)
			if (homeTimer) clearInterval(homeTimer)
			await Promise.all(closers.map(async (c) => c()))
		},
	}
	const closers: (() => Promise<void>)[] = [async () => new Promise<void>((r) => server.close(() => r()))]
	// connections are not tracked; destroy them on close
	const sockets = new Set<net.Socket>()
	server.on('connection', (s) => {
		sockets.add(s)
		s.on('close', () => sockets.delete(s))
	})
	closers.unshift(async () => {
		for (const s of sockets) s.destroy()
	})

	if (opts.adminPort) {
		const admin = net.createServer((sock) => {
			sock.on('data', (d) => {
				const m = /^O\s+(\d+)\s+([12])/.exec(d.toString('latin1').trim())
				if (!m) return void sock.write('?\r')
				if (m[2] === '2') sock.write(`${state.owner}\r`)
				else {
					state.owner = sock.remoteAddress?.replace(/^::ffff:/, '') ?? '0'
					sock.write('OK\r')
				}
			})
			sock.on('error', () => {})
		})
		await new Promise<void>((r) => admin.listen(opts.adminPort, opts.host ?? '127.0.0.1', r))
		closers.push(async () => new Promise<void>((r) => admin.close(() => r())))
		log(`DS-4 admin port on TCP ${opts.adminPort}`)
	}

	if (opts.discoveryPort) {
		const udp = dgram.createSocket('udp4')
		udp.on('message', (msg, rinfo) => {
			if (msg[0] !== 0xff || msg[5] !== 0x8f) return
			const ident = Buffer.from(`Telemetrics PT-LP-${model} : MOCK`, 'latin1')
			const out = Buffer.concat([
				Buffer.from([0xff, 0x00, ident.length + 1, 0x00, 0xff, 0x8f, 0x02]),
				ident,
				Buffer.from([0]),
			])
			out[out.length - 1] = (256 - (out.reduce((a, v) => a + v, 0) % 256)) % 256
			udp.send(out, rinfo.port, rinfo.address)
		})
		await new Promise<void>((r) => udp.bind(opts.discoveryPort, opts.host ?? '127.0.0.1', r))
		closers.push(async () => new Promise<void>((r) => udp.close(() => r())))
		log(`Discovery reply on UDP ${opts.discoveryPort}`)
	}

	if (opts.automationPort) {
		const auto = net.createServer((sock) => {
			sock.write('Connected\r')
			let buf = ''
			sock.on('data', (d) => {
				buf += d.toString('latin1')
				const lines = buf.split('\r')
				buf = lines.pop() ?? ''
				for (const l of lines) {
					received.push(l.trim())
					const shot = /C(\d+)/.exec(l)
					if (!/P\d+/.test(l) || !shot) sock.write('INVCMD\r\r')
					else sock.write(presets.has(Number(shot[1])) ? 'OK\r\r' : 'NOP\r\r')
				}
			})
			sock.on('error', () => {})
		})
		await new Promise<void>((r) => auto.listen(opts.automationPort, opts.host ?? '127.0.0.1', r))
		closers.push(async () => new Promise<void>((r) => auto.close(() => r())))
		log(`Automation port on TCP ${opts.automationPort}`)
	}

	return state
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
	const args = process.argv.slice(2)
	const flag = (name: string) => {
		const i = args.indexOf(name)
		return i >= 0 ? args[i + 1] : undefined
	}
	const port = /^\d+$/.test(args[0] ?? '') ? Number(args[0]) : 3001
	const num = (v: string | undefined) => (v ? Number(v) : undefined)
	void startMockHead({
		port,
		host: '0.0.0.0',
		model: flag('--model') === 'S5' ? 'S5' : 'S4',
		adminPort: num(flag('--admin')),
		discoveryPort: num(flag('--discovery')),
		automationPort: num(flag('--automation')),
	})
}
