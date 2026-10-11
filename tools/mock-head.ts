// Simulated Telemetrics S4 head for testing the module without hardware.
// Usage: node tools/mock-head.ts [port]   (default 3001)
import net from 'node:net'

const port = Number(process.argv[2] ?? 3001)
const NEUTRAL = 16383

net
	.createServer((sock) => {
		const who = `${sock.remoteAddress}:${sock.remotePort}`
		console.log(`+ ${who}`)
		const pos = { p: 0, t: 0, z: 512, f: 512 }
		const vel = { P: NEUTRAL, T: NEUTRAL, Z: NEUTRAL, F: NEUTRAL, I: NEUTRAL }
		const presets = new Map<number, typeof pos>()
		let buf = ''
		const clamp = (v: number) => Math.min(1024, Math.max(0, v))
		const tick = setInterval(() => {
			pos.p += Math.round((vel.P - NEUTRAL) / 200)
			pos.t += Math.round((vel.T - NEUTRAL) / 200)
			pos.z = clamp(pos.z + Math.round((vel.Z - NEUTRAL) / 2000))
			pos.f = clamp(pos.f + Math.round((vel.F - NEUTRAL) / 2000))
		}, 100)
		sock.on('data', (d) => {
			buf += d.toString('latin1')
			const lines = buf.split('\r')
			buf = lines.pop() ?? ''
			for (const raw of lines) {
				const line = raw.replace(/\x18/g, '').trim()
				console.log(`< ${JSON.stringify(raw)}`)
				// queries: p t z f in the requested order
				if (/^[ptzf](\s*[ptzf])*$/.test(line)) {
					const order = line.replace(/\s/g, '').split('') as (keyof typeof pos)[]
					sock.write(`${order.map((k) => pos[k]).join(' ')}\r`)
					continue
				}
				if (line.startsWith('\\')) {
					sock.write('\\8\r')
					continue
				}
				for (const [, cmd, val] of line.matchAll(/([A-Z]+)\s*(-?\d+)?/g)) {
					const n = Number(val)
					if (cmd in vel) vel[cmd as keyof typeof vel] = n
					else if (cmd === 'R') for (const k of Object.keys(vel)) vel[k as keyof typeof vel] = NEUTRAL
					else if (cmd === 'E') presets.set(n, { ...pos })
					else if (cmd === 'C' && presets.has(n)) Object.assign(pos, presets.get(n))
				}
				sock.write('\r')
			}
		})
		sock.on('close', () => {
			clearInterval(tick)
			console.log(`- ${who}`)
		})
		sock.on('error', () => {})
	})
	.listen(port, () => console.log(`Mock Telemetrics head on TCP ${port}`))
