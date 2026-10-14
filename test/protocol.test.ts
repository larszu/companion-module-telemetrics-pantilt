import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
	LineSplitter,
	PKT_FIND_DEVICES,
	automationRecallCmd,
	classifyIdentity,
	directionVector,
	frame,
	keyframe,
	lensCmd,
	limitCmd,
	moveToCmd,
	ownerQueryCmd,
	ownerTakeOverCmd,
	panTiltCmd,
	parseColumnHome,
	parseDiscoveryReply,
	parseKeyframe,
	parseLimitStatus,
	parseLine,
	recallShotCmd,
	selectCameraCmd,
	speedToVelocity,
	stepCmd,
	stopAllAxesLines,
	storeShotCmd,
	sts12Checksum,
	toPosition,
	velocityCmd,
} from '../src/protocol.ts'
import { SpeedRamp, ease, easedTrajectory } from '../src/ramp.ts'

test('speed maps onto the 0..32767 velocity range around 16383', () => {
	assert.equal(speedToVelocity(0), 16383)
	assert.equal(speedToVelocity(100), 32767)
	assert.equal(speedToVelocity(-100), 0)
	assert.equal(speedToVelocity(50), 24575)
	assert.equal(speedToVelocity(250), 32767)
})

test('velocity lines are compact like the Telemetrics software sends them', () => {
	assert.deepEqual(directionVector('up-left'), { pan: 1, tilt: 1 })
	assert.deepEqual(directionVector('down-right'), { pan: -1, tilt: -1 })
	assert.equal(panTiltCmd(0, 0), 'P16383T16383')
	assert.equal(velocityCmd({ P: 100, T: -100, Z: 0 }), 'P32767T0Z16383')
	assert.equal(lensCmd('Z', -100), 'Z0')
	assert.equal(lensCmd('I', 100), 'I32767')
	assert.equal(stepCmd('FI', -400), 'FI-255')
	assert.equal(stepCmd('II', 10), 'II10')
	assert.equal(stopAllAxesLines(), '\rP16383\rT16383\rZ16383\rF16383\rX16383\rY16383\r')
})

test('shots: on-head C/E and CX absolute move in field order p t z f x iris ped y time', () => {
	assert.equal(recallShotCmd(12), 'C 12')
	assert.equal(recallShotCmd(12, 5), 'C 12 5')
	assert.equal(recallShotCmd(999, 99), 'C 255 30')
	assert.equal(storeShotCmd(23), 'E 23')
	const p = { pan: 100, tilt: -200, zoom: 300, focus: 400, x: 5, y: 6, black: 7, iris: 8 }
	assert.equal(moveToCmd(p, 2500.4), 'CX 100 -200 300 400 5 8 7 6 2500')
})

test('ptzfxymi reply → position', () => {
	assert.deepEqual(parseLine('1 -2 3 4 5 6 7 8'), { type: 'position', values: [1, -2, 3, 4, 5, 6, 7, 8] })
	assert.deepEqual(toPosition([1, -2, 3, 4, 5, 6, 7, 8]), {
		pan: 1,
		tilt: -2,
		zoom: 3,
		focus: 4,
		x: 5,
		y: 6,
		black: 7,
		iris: 8,
	})
	const prev = toPosition([1, 2, 3, 4, 5, 6, 7, 8])!
	assert.deepEqual(toPosition([10, 20, 30, 40], prev), { ...prev, pan: 10, tilt: 20, zoom: 30, focus: 40 })
	assert.equal(toPosition([1, 2, 3]), null)
})

test('keyframe frame matches the spec worked example', () => {
	const b = keyframe(0x00, { pan: 100000, tilt: -5000, zoom: 30000, focus: 20000, x: 0, y: 0 })
	assert.equal(
		b.toString('hex'),
		'43480000' + '0186a0' + 'ffec78' + '007530' + '004e20' + '000000' + '000000' + '000000' + '000000' + '280d',
	)
	assert.equal(keyframe(0xef).toString('hex'), '434800ef' + '00'.repeat(24) + '7a0d')
	assert.equal(keyframe(0xff).toString('hex'), '434800ff' + '00'.repeat(24) + '8a0d')
	assert.deepEqual(parseKeyframe(b)?.values, [100000, -5000, 30000, 20000, 0, 0, 0])
	assert.deepEqual(parseLine('CH=3'), { type: 'buffer', level: 3 })
})

test('S5 services: column homing and soft limits', () => {
	assert.deepEqual(parseLine('#CMD 51 0 0 12 0'), { type: 'cmd', id: 51, fields: ['0', '0', '12', '0'] })
	assert.deepEqual(parseColumnHome(['0', '0', '255', '0']), { state: 255, error: 0 })
	assert.equal(parseColumnHome(['0', '1', '3', '4']), null)
	assert.equal(limitCmd('show', 'x'), '@LIMS3')
	assert.equal(limitCmd('enable', 'y'), '@LIME7')
	assert.equal(limitCmd('disable', 'pan'), '@LIMD1')
	const st = parseLimitStatus(
		'Aux SoftLimit Status/Setting\nLimits -> Disable\nUpper Physical Limit (1) = 0\nLower Physical Limit (2) = 0\n' +
			'Upper Soft Limit (1) =-2000\nLower Soft Limit (2) =-1000',
	)
	assert.deepEqual(st, { enabled: false, upperSoft: -2000, lowerSoft: -1000, upperPhysical: 0, lowerPhysical: 0 })
})

test('RCCP-1, automation port, DS-4 ownership', () => {
	assert.equal(sts12Checksum(0, 1, 0), 255)
	assert.equal(selectCameraCmd(1), '\\ 0 1 0 255')
	assert.equal(selectCameraCmd(50), '\\ 0 50 0 206')
	assert.equal(automationRecallCmd(0, 3), 'P0 C3')
	assert.equal(automationRecallCmd(2, 7, 4.4), 'P2 C7 T4')
	assert.deepEqual(parseLine('NOP'), { type: 'automation', result: 'NOP' })
	assert.equal(ownerQueryCmd(3001), 'O 3001 2\r')
	assert.equal(ownerTakeOverCmd(3002), 'O 3002 1\r')
	assert.equal(frame('C3', 'P0'), 'P0C3\r')
	assert.equal(frame('R', '', true), '\x18R\r')
})

test('discovery replies (both families) and model mapping', () => {
	assert.equal(PKT_FIND_DEVICES.toString('hex'), 'ff000400ff8f016e')
	const ident = Buffer.from('Telemetrics PT-LP-S4 : MOCK', 'latin1')
	const b = Buffer.concat([Buffer.from([0xff, 0, ident.length + 1, 0, 0xff, 0x8f, 2]), ident, Buffer.from([0])])
	b[b.length - 1] = (256 - (b.reduce((a, v) => a + v, 0) % 256)) % 256
	assert.equal(parseDiscoveryReply(b), 'Telemetrics PT-LP-S4 : MOCK')
	b[8] ^= 1
	assert.equal(parseDiscoveryReply(b), null)
	const a = Buffer.concat([Buffer.from([1, 9, 0, 0, 0, 0, 0, 0]), Buffer.from('9254549 DS4\0', 'latin1')])
	assert.equal(parseDiscoveryReply(a), '9254549 DS4')
	assert.equal(classifyIdentity('9254549 x').kind, 'DS-4')
	assert.equal(classifyIdentity('Telemetrics PT-HP-S5 : 1').kind, 'S5')
	assert.equal(classifyIdentity('Telemetrics PT-LP-S4 : 1').model, 'Telemetrics PT-LP-S4')
})

test('ease ramps glide and land exactly on target', () => {
	assert.equal(ease(0), 0)
	assert.equal(ease(1), 1)
	assert.equal(ease(0.5), 0.5)
	const r = new SpeedRamp({ attackMs: 400, releaseMs: 800, curve: 'cubic' })
	r.set(100, 0)
	assert.ok(r.valueAt(100) > 0 && r.valueAt(100) < 50)
	assert.equal(r.valueAt(400), 100)
	r.set(0, 400)
	assert.ok(r.valueAt(600) > 50)
	assert.equal(r.valueAt(1200), 0)
	const t = easedTrajectory({ pan: 0 }, { pan: 1000 }, 500, 50)
	assert.equal(t.length, 11)
	assert.equal(t[0].pan, 0)
	assert.equal(t[10].pan, 1000)
	assert.ok(t[1].pan < 100, 'soft start')
})

test('line splitter keeps tails across chunks', () => {
	const s = new LineSplitter()
	assert.deepEqual(s.push('204'), [])
	assert.deepEqual(s.push('8 1022\r\\8\r'), ['2048 1022', '\\8'])
	assert.deepEqual(parseLine('\\8'), { type: 'sts12', code: 8 })
	assert.equal(parseLine('  '), null)
})
