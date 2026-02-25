/**
 * Beautiful Mermaid — Obsidian plugin
 *
 * Replaces Obsidian's default Mermaid rendering with beautiful-mermaid,
 * providing themed, high-quality SVG output for all Mermaid code blocks.
 *
 * Per-diagram mode override: add `%% ascii` or `%% svg` as the first
 * comment line in a mermaid block to override the global default.
 */

import { Plugin, PluginSettingTab, App, Setting } from 'obsidian'
import { EditorView, ViewPlugin, ViewUpdate } from '@codemirror/view'
import { renderMermaidSVG, THEMES } from 'beautiful-mermaid'
import { renderMermaidASCII } from 'beautiful-mermaid'
import type { RenderOptions } from 'beautiful-mermaid'
import type { AsciiRenderOptions } from 'beautiful-mermaid'

type RenderMode = 'svg' | 'ascii'

interface BeautifulMermaidSettings {
	theme: string
	font: string
	transparent: boolean
	defaultMode: RenderMode
}

const DEFAULT_SETTINGS: BeautifulMermaidSettings = {
	theme: 'catppuccin-latte',
	font: 'Inter',
	transparent: false,
	defaultMode: 'svg',
}

/** Check for a `%% ascii` or `%% svg` directive and return [mode, cleanedSource]. */
function extractModeDirective(source: string, fallback: RenderMode): [RenderMode, string] {
	const lines = source.split('\n')
	for (let i = 0; i < lines.length; i++) {
		const trimmed = lines[i].trim()
		if (trimmed === '' || trimmed.startsWith('%%')) {
			const lower = trimmed.replace(/^%%\s*/, '').toLowerCase()
			if (lower === 'ascii') {
				lines.splice(i, 1)
				return ['ascii', lines.join('\n')]
			}
			if (lower === 'svg') {
				lines.splice(i, 1)
				return ['svg', lines.join('\n')]
			}
			continue
		}
		break // stop scanning once we hit a non-comment line
	}
	return [fallback, source]
}

// ── CM6 Live Preview ──────────────────────────────────────────────

const MARKER_ATTR = 'data-beautiful-mermaid'

function buildMermaidPlugin(plugin: BeautifulMermaidPlugin) {
	return ViewPlugin.fromClass(
		class {
			constructor(view: EditorView) {
				this.processBlocks(view)
			}
			update(update: ViewUpdate) {
				if (update.docChanged || update.viewportChanged || update.geometryChanged) {
					this.processBlocks(update.view)
				}
			}
			processBlocks(view: EditorView) {
				// Find Obsidian's rendered mermaid embed blocks in the DOM
				const blocks = view.dom.querySelectorAll<HTMLElement>(
					'.cm-preview-code-block.cm-lang-mermaid',
				)
				const settingsKey = `${plugin.settings.theme}:${plugin.settings.font}:${plugin.settings.transparent}:${plugin.settings.defaultMode}`

				for (const block of blocks) {
					// Skip if already processed with current settings
					if (block.getAttribute(MARKER_ATTR) === settingsKey) continue

					// Extract source from the document state via DOM position
					const pos = view.posAtDOM(block)
					const source = extractSourceAtPos(view, pos)
					if (!source) continue

					plugin.renderIntoElement(source, block)
					block.setAttribute(MARKER_ATTR, settingsKey)
				}
			}
		},
	)
}

/** Extract mermaid source from document at the position of an embed block. */
function extractSourceAtPos(view: EditorView, pos: number): string | null {
	const doc = view.state.doc
	const line = doc.lineAt(pos)

	// Find the opening fence (might be this line or before)
	let startLine = line.number
	for (let i = line.number; i >= 1; i--) {
		const text = doc.line(i).text.trimStart()
		if (/^```+\s*mermaid\s*$/.test(text)) {
			startLine = i
			break
		}
		if (i < line.number && !text.startsWith('```') && i === 1) return null
	}

	// Collect body lines until closing fence
	const bodyLines: string[] = []
	for (let i = startLine + 1; i <= doc.lines; i++) {
		const text = doc.line(i).text
		if (/^\s*```+\s*$/.test(text)) break
		bodyLines.push(text)
	}

	const source = bodyLines.join('\n')
	return source.trim() ? source : null
}

// ── Plugin ────────────────────────────────────────────────────────

export default class BeautifulMermaidPlugin extends Plugin {
	settings: BeautifulMermaidSettings = DEFAULT_SETTINGS

	async onload() {
		await this.loadSettings()

		// Reading View: registered processor replaces Obsidian's built-in mermaid
		this.registerMarkdownCodeBlockProcessor('mermaid', (source, el, ctx) => {
			this.renderIntoElement(source, el)
		}, -100)

		// Live Preview: ViewPlugin swaps Obsidian's embed block content post-render
		this.registerEditorExtension(buildMermaidPlugin(this))

		this.addSettingTab(new BeautifulMermaidSettingTab(this.app, this))
	}

	/** Render beautiful-mermaid output into a container element. */
	renderIntoElement(source: string, el: HTMLElement) {
		el.empty()
		const [mode, cleanSource] = extractModeDirective(source, this.settings.defaultMode)
		if (mode === 'ascii') {
			this.renderAscii(cleanSource, el)
		} else {
			this.renderSvg(cleanSource, el)
		}
	}

	renderSvg(source: string, el: HTMLElement) {
		const container = el.createDiv({ cls: 'beautiful-mermaid-container' })

		try {
			const opts = this.buildSvgOptions()
			const svg = renderMermaidSVG(source.trim(), opts)
			container.innerHTML = svg
		} catch (err: unknown) {
			const msg = err instanceof Error ? err.message : String(err)
			container.createDiv({
				cls: 'beautiful-mermaid-error',
				text: `Mermaid render error: ${msg}`,
			})
		}
	}

	renderAscii(source: string, el: HTMLElement) {
		const container = el.createDiv({ cls: 'beautiful-mermaid-ascii' })

		try {
			const opts: AsciiRenderOptions = {
				colorMode: 'none',
				useAscii: false, // use Unicode box-drawing
			}
			const text = renderMermaidASCII(source.trim(), opts)
			const pre = container.createEl('pre', { cls: 'beautiful-mermaid-ascii-pre' })
			if (this.settings.transparent) pre.classList.add('beautiful-mermaid-transparent')
			pre.textContent = text
		} catch (err: unknown) {
			const msg = err instanceof Error ? err.message : String(err)
			container.createDiv({
				cls: 'beautiful-mermaid-error',
				text: `Mermaid render error: ${msg}`,
			})
		}
	}

	buildSvgOptions(): RenderOptions {
		const opts: RenderOptions = {}
		const { theme, font, transparent } = this.settings

		if (theme && theme in THEMES) {
			const colors = THEMES[theme as keyof typeof THEMES]
			opts.bg = colors.bg
			opts.fg = colors.fg
			if (colors.line) opts.line = colors.line
			if (colors.accent) opts.accent = colors.accent
			if (colors.muted) opts.muted = colors.muted
			if (colors.surface) opts.surface = colors.surface
			if (colors.border) opts.border = colors.border
		}

		if (font) opts.font = font
		if (transparent) opts.transparent = true

		return opts
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData())
	}

	async saveSettings() {
		await this.saveData(this.settings)
		this.app.workspace.updateOptions()
	}
}

class BeautifulMermaidSettingTab extends PluginSettingTab {
	plugin: BeautifulMermaidPlugin

	constructor(app: App, plugin: BeautifulMermaidPlugin) {
		super(app, plugin)
		this.plugin = plugin
	}

	display(): void {
		const { containerEl } = this
		containerEl.empty()

		const themeNames = Object.keys(THEMES)

		new Setting(containerEl)
			.setName('Default render mode')
			.setDesc('SVG (themed vector) or ASCII (Unicode box-drawing). Override per diagram with %% ascii or %% svg.')
			.addDropdown(drop => {
				drop.addOption('svg', 'SVG')
				drop.addOption('ascii', 'ASCII')
				drop.setValue(this.plugin.settings.defaultMode)
				drop.onChange(async (value) => {
					this.plugin.settings.defaultMode = value as RenderMode
					await this.plugin.saveSettings()
				})
			})

		new Setting(containerEl)
			.setName('Theme')
			.setDesc('Color theme for SVG diagrams')
			.addDropdown(drop => {
				for (const name of themeNames) {
					drop.addOption(name, name)
				}
				drop.setValue(this.plugin.settings.theme)
				drop.onChange(async (value) => {
					this.plugin.settings.theme = value
					await this.plugin.saveSettings()
				})
			})

		new Setting(containerEl)
			.setName('Font')
			.setDesc('Font family for diagram text (default: Inter)')
			.addText(text => {
				text.setPlaceholder('Inter')
				text.setValue(this.plugin.settings.font)
				text.onChange(async (value) => {
					this.plugin.settings.font = value
					await this.plugin.saveSettings()
				})
			})

		new Setting(containerEl)
			.setName('Transparent background')
			.setDesc('Render SVG diagrams with no background color')
			.addToggle(toggle => {
				toggle.setValue(this.plugin.settings.transparent)
				toggle.onChange(async (value) => {
					this.plugin.settings.transparent = value
					await this.plugin.saveSettings()
				})
			})
	}
}
