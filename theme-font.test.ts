import { test } from 'node:test'
import assert from 'node:assert/strict'
import { firstFontFamily } from './theme-font.ts'

test('firstFontFamily: extracts and unquotes the first family from a stack', () => {
	assert.equal(firstFontFamily("'SF Pro', 'system-ui', Inter, ui-sans-serif"), 'SF Pro')
	assert.equal(firstFontFamily('Inter, sans-serif'), 'Inter')
	assert.equal(firstFontFamily('  "Foo Bar" , x'), 'Foo Bar')
})

test('firstFontFamily: single family, no commas', () => {
	assert.equal(firstFontFamily('Inter'), 'Inter')
	assert.equal(firstFontFamily("'Georgia'"), 'Georgia')
})

test('firstFontFamily: empty stack returns empty string (caller falls back)', () => {
	assert.equal(firstFontFamily(''), '')
	assert.equal(firstFontFamily('   '), '')
})
