# companion-module-telemetrics-pantilt

Bitfocus Companion module for Telemetrics robotic pan/tilt heads (S4/S2 such as the PT-LP-S4, S5 such as the PT-LP/HP/CP-S5 and RoboEye2), DS-4 device servers, the RCCP-1 control panel and the automation port of the Telemetrics RCP software. User documentation: [HELP.md](./companion/HELP.md). Protocol reference with manual page numbers: [docs/protocol.md](./docs/protocol.md).

Module API `@companion-module/base` ~2.1.3. Companion 5.0.5 does not accept API 2.2, so keep this version.

## Features

| Area           | What it does                                                                                                                                                                                                                             |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pan/tilt, zoom | Velocity on press, ramped stop on release. Speed changes glide along an ease curve: attack when speeding up, release when slowing down. Curve and times are set in the connection settings.                                              |
| Focus, iris    | S4: `F`/`I` velocity. S5: repeated `FI`/`II` steps, because the S5 driver uses no focus or iris velocity. Iris works only if the lens is driven by the head (`IL`).                                                                      |
| Column         | Up/down on the configured aux axis (`X` by default, or `Y`/`Q`), ramped.                                                                                                                                                                 |
| Shots          | _Module_ storage reads the pose with `ptzfxymi` (two stable reads) and recalls it with `CX … <ms>`. On S5 heads the recall is streamed as eased binary keyframes (`CH`, 50 ms, flow control on `CH=`). _Head memory_ uses `E n` / `C n`. |
| Stop           | `R`, all axes neutral, keyframe reset, abort of a running column homing.                                                                                                                                                                 |
| Soft limits    | Show (`@LIMS<n>`, parsed into variables). Enable/disable (`@LIME`/`@LIMD`) are locked until allowed in the settings. **Writing limit values is not implemented**: the write commands are unverified on S5 heads.                         |
| Column homing  | S5 only, two steps: _arm_ (10 s window, nothing is sent), then _confirm_ sends `@CNTR 1010`. Progress from `@CMD 51`. Abort `@CNTR 1011`. Blocked on S4 heads, where `@CNTR1010` resets the pan/tilt position.                           |
| DS-4           | Optional owner query / takeover on the admin port 3000 (`O <port> 2` / `O <port> 1`) before connecting to a data port 3001–3004.                                                                                                         |
| Discovery      | UDP broadcast to port 2000 (both Telemetrics query packets). Found devices appear as a dropdown in the connection settings.                                                                                                              |
| Transports     | Direct (head, DS-4 port, serial bridge), RCCP-1 (TCP 2500: STS-12 select, `C <n> <s>`), RCP automation port (TCP 5000: `P<page> C<shot> T<s>`, reply `OK`/`NOP`/`INVCMD`).                                                               |

Feedbacks: connected, moving, current shot (any/moving/on shot/off shot), shot stored, column homing phase, soft limits enabled, RCCP-1 camera. Variables: pan, tilt, zoom, focus, column (aux X), aux Y, iris, black positions; shot number and status; homing phase and state; soft limit values; system error (S5); DS-4 owner; discovered devices.

Presets: direction pad, lens, column with homing, 16 shots (press = recall, hold 2 s = store), soft limits, RCCP-1 cameras.

## Hardware: head on a network–serial bridge

If the head is not reached through its own Ethernet port or a Telemetrics DS-4, put a generic network–serial bridge in front of its serial port.

| Item              | Setting                                                                                                                                                                                          |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Interface         | 9-pin D on the head, RS-232 (up to ~30 m) or RS-422 (up to ~1200 m). Selected on the serial data board: DIP S2 pins 1+2 off = RS-232, on = RS-422 (older 53915 boards: DIP S1-8). Prefer RS-422. |
| Serial parameters | **9600 baud, 8 data bits, no parity, 1 stop bit, no flow control** (manual). 8-bit clean, no XON/XOFF.                                                                                           |
| Bridge mode       | **Raw TCP server**, one client, no banner, no keepalive text, no Telnet/RFC 2217 negotiation. Companion connects as a client to `<bridge-ip>:<port>`.                                            |
| Port              | Any. With a port outside 3001–3004 the DS-4 ownership step is skipped; inside that range set "DS-4 port ownership" to Off unless the bridge answers `O <port> 2` on TCP 3000.                    |
| Packing           | Network → serial: forward immediately. Serial → network: inter-character timeout about 5–10 ms. Do not pack on CR only; S5 keyframe replies and tunnel frames can contain 0x0D.                  |
| Timeouts          | Disable short inactivity timeouts. The module polls `ptzfxymi` every 250 ms (configurable), which is the only keepalive.                                                                         |
| Multi-drop        | None. One head per serial line and per TCP connection; the protocol has no address.                                                                                                              |
| Latency           | Keep it below about 20 ms for smooth S5 keyframe moves.                                                                                                                                          |

Pinout of the head's 9-pin D (PT-HP-S4 manual p. 47, identical in the S2 manual). "From P/T" = output of the head.

| Pin | RS-232             | RS-422               |
| --- | ------------------ | -------------------- |
| 1   | –                  | TX Data + (from P/T) |
| 2   | TX Data (from P/T) | TX Data − (from P/T) |
| 3   | RX Data (to P/T)   | RX Data − (to P/T)   |
| 4   | –                  | RX Data + (to P/T)   |
| 5   | Ground             | Ground               |
| 6–9 | –                  | –                    |

Wiring to an RS-422 bridge (4-wire, full duplex): head TX+/TX− (pins 1/2) → bridge RX+/RX−; bridge TX+/TX− → head RX+/RX− (pins 4/3); GND to pin 5. Terminate long runs with 120 Ω at the receiving end. For RS-232: head pin 2 → bridge RXD, bridge TXD → head pin 3, GND pin 5 (null-modem view from the bridge's DTE port). The manual lists an RJ-45 with serial plus power (p. 49: 1 TX+, 2 TX−, 3 RX+, 6 RX−, 4/5/7/8 power) and, on S4 heads, a 10/100 Ethernet RJ-45. Check which one a head has before plugging it into a switch.

## Development

```sh
yarn                 # install (or npm/npx with the same lockfile versions)
yarn build           # compile to dist/
yarn test            # protocol + end-to-end tests against the simulated head
yarn package         # telemetrics-pantilt-<version>.tgz for import in Companion
node tools/mock-head.ts 3901 --model S5 --admin 3900 --discovery 2000 --automation 5000
```

`tools/mock-head.ts` simulates a head: velocities, `ptzfxymi`, `CX` with fade time, `E`/`C`, soft limits, STS-12, and for S5 `@CMD 20/51`, `@CMD2 0`, column homing and keyframes; optionally the DS-4 admin port, the discovery reply and the automation port. Companion 5 can load the working copy directly with `--extra-module-path` pointing at a folder that contains this repository.

## Status

- Tested against the simulated head (21 tests) and loaded in Companion 5.0.5 (module starts, connection settings render, connects and polls the mock).
- **Not tested on a real head.** Open points for the first hardware test: pan/tilt direction and the zoom/focus range per head; whether the S4 head answers `ptzfxymi` with 8 values; `CX` without the optional fields; keyframe pacing on a real S5; the exact `#CMD 51` reply format during column homing; the `@LIMS` text on S5 firmware.
- Writing soft limit values is deliberately not implemented.

## License

MIT
