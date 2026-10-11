// Simulated Telemetrics head for testing the module without hardware.
// Usage: node tools/mock-head.ts [port]   (default 3001)
import net from 'node:net'

const port = Number(process.argv[2] ?? 3001)
const NEUTRAL = 16383

net
	.createServer((sock) => {
		const who = `${sock.remoteAddress}:${sock.remotePort}`
		console.log(`+ ${who}`)
		let pan = 2048
		let tilt = 2048
		let vPan = NEUTRAL
		let vTilt = NEUTRAL
		let buf = ''
		const tick = setInterval(() => {
			pan = (pan + Math.round((vPan - NEUTRAL) / 2000) + 4081) % 4081
			tilt = (tilt + Math.round((vTilt - NEUTRAL) / 2000) + 4081) % 4081
		}, 100)
		sock.on('data', (d) => {
			buf += d.toString('latin1')
			const lines = buf.split('\r')
			buf = lines.pop() ?? ''
			for (const line of lines) {
				const cmd = line.trim()
				console.log(`< ${JSON.stringify(cmd)}`)
				const pt = /^P\s*(\d+)\s*T\s*(\d+)$/.exec(cmd)
				if (pt) [vPan, vTilt] = [Number(pt[1]), Number(pt[2])]
				else if (/^P\s*\d+$/.test(cmd)) vPan = Number(cmd.slice(1))
				else if (/^T\s*\d+$/.test(cmd)) vTilt = Number(cmd.slice(1))
				else if (cmd === 'R') vPan = vTilt = NEUTRAL
				else if (cmd === 'pt') sock.write(`${pan} ${tilt}\r`)
				else if (cmd.startsWith('\\')) sock.write('\\8\r')
			}
		})
		sock.on('close', () => {
			clearInterval(tick)
			console.log(`- ${who}`)
		})
		sock.on('error', () => {})
	})
	.listen(port, () => console.log(`Mock Telemetrics head on TCP ${port}`))
