/** Network helpers: UDP 2000 discovery and the DS-4 ownership channel (TCP 3000). */
import dgram from 'node:dgram'
import net from 'node:net'
import {
	DISCOVERY_PORT,
	PKT_FIND_DEVICES,
	PKT_FIND_SERVERS,
	ownerQueryCmd,
	ownerTakeOverCmd,
	parseDiscoveryReply,
	toDiscoveredDevice,
	type DiscoveredDevice,
} from './protocol.ts'

/** Broadcasts both discovery queries (twice) and collects replies for `waitMs`. */
export async function discover(
	opts: { target?: string; port?: number; waitMs?: number } = {},
): Promise<DiscoveredDevice[]> {
	const target = opts.target ?? '255.255.255.255'
	const port = opts.port ?? DISCOVERY_PORT
	return new Promise((resolve, reject) => {
		const sock = dgram.createSocket({ type: 'udp4', reuseAddr: true })
		const found = new Map<string, DiscoveredDevice>()
		let closed = false
		const close = () => {
			if (closed) return
			closed = true
			sock.close()
		}
		sock.on('error', (e) => {
			close()
			reject(e)
		})
		sock.on('message', (msg, rinfo) => {
			const ident = parseDiscoveryReply(msg)
			if (ident) found.set(rinfo.address, toDiscoveredDevice(rinfo.address, ident))
		})
		sock.bind(0, () => {
			sock.setBroadcast(true)
			const burst = () => {
				if (closed) return
				sock.send(PKT_FIND_SERVERS, port, target)
				sock.send(PKT_FIND_DEVICES, port, target)
			}
			burst()
			setTimeout(burst, 400)
			setTimeout(() => {
				close()
				resolve([...found.values()].sort((a, b) => a.ip.localeCompare(b.ip, undefined, { numeric: true })))
			}, opts.waitMs ?? 1500)
		})
	})
}

/**
 * DS-4 admin port: asks who owns `dataPort` (reply = owner IP, `0` = free) and optionally takes it over.
 * Resolves with the owner reported before any takeover, or an explanation if port 3000 does not answer.
 */
export async function ds4Owner(host: string, dataPort: number, takeOver: boolean, adminPort = 3000): Promise<string> {
	const ask = async (cmd: string) =>
		new Promise<string>((resolve) => {
			const s = net.connect({ host, port: adminPort })
			let got = ''
			const done = (v: string) => {
				s.destroy()
				resolve(v)
			}
			s.setTimeout(1500, () => done(got.trim() || 'no answer'))
			s.on('error', () => done('port 3000 not reachable'))
			s.on('connect', () => s.write(cmd))
			s.on('data', (d) => {
				got += d.toString('latin1')
				if (got.includes('\r')) done(got.trim())
			})
		})
	return ask(ownerQueryCmd(dataPort)).then(async (owner) => {
		const busy = owner !== '0' && /^\d+\.\d+\.\d+\.\d+$/.test(owner)
		if (takeOver && busy) await ask(ownerTakeOverCmd(dataPort))
		return owner
	})
}
