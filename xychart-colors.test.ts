import { test } from 'node:test'
import assert from 'node:assert/strict'
import { xySeriesColor, neutralizeXychartColors } from './xychart-colors.ts'

test('xySeriesColor: first three series map to distinct theme vars', () => {
	assert.equal(xySeriesColor(0), 'var(--fg)')
	assert.equal(xySeriesColor(1), 'var(--line)')
	assert.equal(xySeriesColor(2), 'var(--muted)')
})

test('xySeriesColor: beyond the ramp, series fade toward bg but stay distinct', () => {
	const c3 = xySeriesColor(3)
	const c4 = xySeriesColor(4)
	assert.match(c3, /color-mix\(in srgb, var\(--fg\) \d+%, var\(--bg\)\)/)
	assert.notEqual(c3, c4) // distinct lightness per index
})

test('xySeriesColor: lightness percentage never drops below the 20% floor', () => {
	const far = xySeriesColor(50)
	const pct = Number(far.match(/var\(--fg\) (\d+)%/)[1])
	assert.equal(pct, 20)
})

test('neutralizeXychartColors: rewrites every color def to the monochrome ramp', () => {
	const svg = '<style>--xychart-color-0: var(--accent, #3b82f6);'
		+ '--xychart-color-1: #5f79f2;'
		+ '--xychart-bar-fill-0: color-mix(in srgb, var(--bg) 75%, var(--xychart-color-0) 25%);</style>'
	const out = neutralizeXychartColors(svg)
	assert.equal((out.match(/#3b82f6|#5f79f2/g) || []).length, 0, 'no hardcoded blues remain')
	assert.match(out, /--xychart-color-0: var\(--fg\)/)
	assert.match(out, /--xychart-color-1: var\(--line\)/)
	// bar-fill references var(--xychart-color-N), so it must be left intact to follow
	assert.match(out, /--xychart-bar-fill-0: color-mix\(in srgb, var\(--bg\) 75%, var\(--xychart-color-0\) 25%\)/)
})

test('neutralizeXychartColors: handles 3+ series', () => {
	const svg = '--xychart-color-0: #3b82f6;--xychart-color-1: #5f79f2;--xychart-color-2: #abc123;'
	const out = neutralizeXychartColors(svg)
	assert.match(out, /--xychart-color-2: var\(--muted\)/)
	assert.equal((out.match(/#[0-9a-fA-F]{6}/g) || []).length, 0)
})

test('neutralizeXychartColors: leaves non-xychart SVGs byte-identical', () => {
	const flow = '<svg style="--bg:#100f0f;--fg:#cecdc3"><path fill="var(--_arrow)"/></svg>'
	assert.equal(neutralizeXychartColors(flow), flow)
})
