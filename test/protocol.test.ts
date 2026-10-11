import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
	LineSplitter,
	directionVector,
	frame,
	panTiltCmd,
	parseLine,
	recallShotCmd,
	selectCameraCmd,
	speedToVelocity,
	sts12Checksum,
} from '../src/protocol.ts'

test('speed maps onto the 0..32767 velocity range around 16383', () => {
	assert.equal(speedToVelocity(0), 16383)
	assert.equal(speedToVelocity(100), 32767)
	assert.equal(speedToVelocity(-100), 0)
	assert.equal(speedToVelocity(50), 24575)
	assert.equal(speedToVelocity(250), 32767)
})

test('directions: pan +1 = left, tilt +1 = up', () => {
	assert.deepEqual(directionVector('up-left'), { pan: 1, tilt: 1 })
	assert.deepEqual(directionVector('down-right'), { pan: -1, tilt: -1 })
	assert.deepEqual(directionVector('left'), { pan: 1, tilt: 0 })
	assert.equal(panTiltCmd(0, 0), 'P 16383 T 16383')
})

test('shot recall', () => {
	assert.equal(recallShotCmd(12), 'C12')
	assert.equal(recallShotCmd(12, 5), 'C12 5')
	assert.equal(recallShotCmd(999, 99), 'C240 30')
	assert.equal(recallShotCmd(0), 'C1')
})

test('STS-12 camera select matches the RCCP-1 manual example', () => {
	assert.equal(sts12Checksum(0, 1, 0), 255)
	assert.equal(selectCameraCmd(1), '\\ 0 1 0 255')
	assert.equal(selectCameraCmd(50), '\\ 0 50 0 206')
	assert.equal(frame(selectCameraCmd(1)), '\\ 0 1 0 255\r')
	assert.equal(frame('C3', 'P0'), 'P0C3\r')
})

test('parses position and STS-12 replies across chunk borders', () => {
	const s = new LineSplitter()
	assert.deepEqual(s.push('204'), [])
	const lines = s.push('8 1022\r\\8\r')
	assert.deepEqual(lines.map(parseLine), [
		{ type: 'position', pan: 2048, tilt: 1022 },
		{ type: 'sts12', code: 8 },
	])
	assert.equal(parseLine('  '), null)
})
