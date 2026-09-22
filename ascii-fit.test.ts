import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fitZoom } from './ascii-fit.ts'

test('wide diagram shrinks to container width', () => {
	assert.equal(fitZoom(1000, 500), 0.5)
})

test('narrow diagram keeps natural size', () => {
	assert.equal(fitZoom(300, 700), 1)
})

test('exact fit keeps natural size', () => {
	assert.equal(fitZoom(700, 700), 1)
})

test('unmeasured container (not laid out yet) returns null', () => {
	assert.equal(fitZoom(1000, 0), null)
})

test('unmeasured diagram returns null', () => {
	assert.equal(fitZoom(0, 700), null)
})
