/**
 * Beautiful Mermaid — Obsidian plugin
 *
 * Replaces Obsidian's default Mermaid rendering with beautiful-mermaid,
 * providing themed, high-quality SVG output for all Mermaid code blocks.
 *
 * Per-diagram mode override: add `%% ascii` or `%% svg` as the first
 * comment line in a mermaid block to override the global default.
 */

import { Plugin, PluginSettingTab, App, Setting, Menu, Modal, Notice } from 'obsidian'
import { EditorView, ViewPlugin, ViewUpdate } from '@codemirror/view'
import { renderMermaidSVG, THEMES } from 'beautiful-mermaid'
import { renderMermaidASCII } from 'beautiful-mermaid'
import type { RenderOptions } from 'beautiful-mermaid'
import type { AsciiRenderOptions } from 'beautiful-mermaid'

type RenderMode = 'svg' | 'ascii'

const LIGHT_THEMES = ['zinc-light', 'tokyo-night-light', 'catppuccin-latte', 'nord-light', 'github-light', 'solarized-light']
const DARK_THEMES = ['zinc-dark', 'tokyo-night', 'tokyo-night-storm', 'catppuccin-mocha', 'nord', 'dracula', 'github-dark', 'solarized-dark', 'one-dark']

interface BeautifulMermaidSettings {
	themeLight: string
	themeDark: string
	font: string
	transparent: boolean
	defaultMode: RenderMode
	customBg: string
	customFg: string
}

const DEFAULT_SETTINGS: BeautifulMermaidSettings = {
	themeLight: 'catppuccin-latte',
	themeDark: 'catppuccin-mocha',
	font: 'Inter',
	transparent: false,
	defaultMode: 'svg',
	customBg: '',
	customFg: '',
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
				const settingsKey = `${plugin.activeTheme()}:${plugin.settings.font}:${plugin.settings.transparent}:${plugin.settings.defaultMode}:${plugin.settings.customBg}:${plugin.settings.customFg}`

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
	private wasDark = document.body.classList.contains('theme-dark')

	async onload() {
		await this.loadSettings()

		// Reading View: registered processor replaces Obsidian's built-in mermaid
		this.registerMarkdownCodeBlockProcessor('mermaid', (source, el, ctx) => {
			this.renderIntoElement(source, el)
		}, -100)

		// Live Preview: ViewPlugin swaps Obsidian's embed block content post-render
		this.registerEditorExtension(buildMermaidPlugin(this))

		// Re-render on dark/light theme change
		this.registerEvent(
			this.app.workspace.on('css-change', () => {
				const isDark = document.body.classList.contains('theme-dark')
				if (isDark !== this.wasDark) {
					this.wasDark = isDark
					this.app.workspace.updateOptions()
				}
			}),
		)

		// Context menu for SVG export
		this.registerDomEvent(document, 'contextmenu', (evt: MouseEvent) => {
			const target = evt.target as HTMLElement
			const container = target.closest('.beautiful-mermaid-container')
			if (!container) return

			const svg = container.querySelector('svg')
			if (!svg) return

			const menu = new Menu()
			const svgString = `<?xml version="1.0" encoding="UTF-8"?>\n${svg.outerHTML}`

			menu.addItem(item =>
				item.setTitle('Copy SVG to clipboard').setIcon('clipboard-copy').onClick(() => {
					navigator.clipboard.writeText(svgString)
					new Notice('SVG copied to clipboard')
				}),
			)

			menu.addItem(item =>
				item.setTitle('Export as SVG file').setIcon('download').onClick(() => {
					const blob = new Blob([svgString], { type: 'image/svg+xml' })
					const url = URL.createObjectURL(blob)
					const a = document.createElement('a')
					a.href = url
					a.download = `diagram-${Date.now()}.svg`
					document.body.appendChild(a)
					a.click()
					document.body.removeChild(a)
					URL.revokeObjectURL(url)
				}),
			)

			menu.showAtMouseEvent(evt)
		})

		// Click to open full-size scrollable modal
		this.registerDomEvent(document, 'click', (evt: MouseEvent) => {
			const target = evt.target as HTMLElement

			// Don't open modal when clicking source toggle or source view
			if (target.closest('.beautiful-mermaid-source-toggle, .beautiful-mermaid-source')) return

			const container = target.closest('.beautiful-mermaid-container, .beautiful-mermaid-ascii')
			if (!container) return

			// Don't open modal if user is selecting text
			const selection = window.getSelection()
			if (selection && selection.toString().length > 0) return

			const modal = new DiagramModal(this.app, container as HTMLElement)
			modal.open()
		})

		this.addSettingTab(new BeautifulMermaidSettingTab(this.app, this))
	}

	/** Render beautiful-mermaid output into a container element. */
	renderIntoElement(source: string, el: HTMLElement) {
		el.empty()
		const [mode, cleanSource] = extractModeDirective(source, this.settings.defaultMode)

		const wrapper = el.createDiv({ cls: 'beautiful-mermaid-wrapper' })

		if (mode === 'ascii') {
			this.renderAscii(cleanSource, wrapper)
		} else {
			this.renderSvg(cleanSource, wrapper)
		}

		// Source toggle button
		const toggleBtn = wrapper.createEl('button', {
			cls: 'beautiful-mermaid-source-toggle',
			text: '</>',
		})

		let showingSource = false
		let sourceEl: HTMLElement | null = null

		toggleBtn.addEventListener('click', (e) => {
			e.stopPropagation()
			e.preventDefault()

			if (showingSource) {
				// Switch back to rendered view
				if (sourceEl) {
					sourceEl.remove()
					sourceEl = null
				}
				const rendered = wrapper.querySelector('.beautiful-mermaid-container, .beautiful-mermaid-ascii') as HTMLElement
				if (rendered) rendered.style.display = ''
				showingSource = false
			} else {
				// Switch to raw source
				const rendered = wrapper.querySelector('.beautiful-mermaid-container, .beautiful-mermaid-ascii') as HTMLElement
				if (rendered) rendered.style.display = 'none'
				sourceEl = wrapper.createEl('pre', {
					cls: 'beautiful-mermaid-source',
					text: cleanSource.trim(),
				})
				showingSource = true
			}
		})
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

			// Scale down wide ASCII diagrams to fit container width.
			// Double-rAF ensures styles are applied and layout is complete before measuring.
			requestAnimationFrame(() => requestAnimationFrame(() => {
				const naturalWidth = pre.offsetWidth
				const containerWidth = container.clientWidth
				if (naturalWidth > containerWidth && containerWidth > 0) {
					const ratio = containerWidth / naturalWidth;
					(pre.style as unknown as Record<string, string>).zoom = `${ratio}`
				}
			}))
		} catch (err: unknown) {
			const msg = err instanceof Error ? err.message : String(err)
			container.createDiv({
				cls: 'beautiful-mermaid-error',
				text: `Mermaid render error: ${msg}`,
			})
		}
	}

	/** Return the active theme name based on Obsidian's current appearance mode. */
	activeTheme(): string {
		const isDark = document.body.classList.contains('theme-dark')
		return isDark ? this.settings.themeDark : this.settings.themeLight
	}

	buildSvgOptions(): RenderOptions {
		const opts: RenderOptions = {}
		const theme = this.activeTheme()
		const { font, transparent, customBg, customFg } = this.settings

		if (theme === 'custom') {
			if (customBg) opts.bg = customBg
			if (customFg) opts.fg = customFg
		} else if (theme && theme in THEMES) {
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
		const saved = await this.loadData() ?? {}
		// Migrate old single `theme` setting to light/dark split
		if (saved.theme && !saved.themeLight && !saved.themeDark) {
			const t = saved.theme as string
			if (DARK_THEMES.includes(t)) {
				saved.themeDark = t
			} else {
				saved.themeLight = t
			}
			delete saved.theme
		}
		this.settings = Object.assign({}, DEFAULT_SETTINGS, saved)
	}

	async saveSettings() {
		await this.saveData(this.settings)
		this.app.workspace.updateOptions()
	}
}

class DiagramModal extends Modal {
	private sourceContainer: HTMLElement

	constructor(app: App, sourceContainer: HTMLElement) {
		super(app)
		this.sourceContainer = sourceContainer
	}

	onOpen() {
		const { contentEl, modalEl } = this
		modalEl.addClass('beautiful-mermaid-modal')
		contentEl.addClass('beautiful-mermaid-modal-content')

		const svg = this.sourceContainer.querySelector('svg')
		if (svg) {
			const clone = svg.cloneNode(true) as SVGElement
			clone.removeAttribute('width')
			clone.removeAttribute('height')
			clone.style.maxWidth = 'none'
			clone.style.width = 'auto'
			clone.style.height = 'auto'
			contentEl.appendChild(clone)
		} else {
			const pre = this.sourceContainer.querySelector('pre')
			if (pre) {
				const clone = pre.cloneNode(true) as HTMLElement
				clone.style.maxWidth = 'none'
				clone.style.whiteSpace = 'pre'
				contentEl.appendChild(clone)
			}
		}
	}

	onClose() {
		this.contentEl.empty()
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
			.setName('Light theme')
			.setDesc('Theme used when Obsidian is in light mode')
			.addDropdown(drop => {
				for (const name of LIGHT_THEMES) drop.addOption(name, name)
				drop.addOption('custom', 'Custom')
				drop.setValue(this.plugin.settings.themeLight)
				drop.onChange(async (value) => {
					this.plugin.settings.themeLight = value
					await this.plugin.saveSettings()
					this.display()
				})
			})

		new Setting(containerEl)
			.setName('Dark theme')
			.setDesc('Theme used when Obsidian is in dark mode')
			.addDropdown(drop => {
				for (const name of DARK_THEMES) drop.addOption(name, name)
				drop.addOption('custom', 'Custom')
				drop.setValue(this.plugin.settings.themeDark)
				drop.onChange(async (value) => {
					this.plugin.settings.themeDark = value
					await this.plugin.saveSettings()
					this.display()
				})
			})

		if (this.plugin.settings.themeLight === 'custom' || this.plugin.settings.themeDark === 'custom') {
			new Setting(containerEl)
				.setName('Custom background')
				.setDesc('Background color for custom theme')
				.addColorPicker(picker => {
					picker.setValue(this.plugin.settings.customBg || '#ffffff')
					picker.onChange(async (value) => {
						this.plugin.settings.customBg = value
						await this.plugin.saveSettings()
					})
				})

			new Setting(containerEl)
				.setName('Custom foreground')
				.setDesc('Text/line color for custom theme')
				.addColorPicker(picker => {
					picker.setValue(this.plugin.settings.customFg || '#000000')
					picker.onChange(async (value) => {
						this.plugin.settings.customFg = value
						await this.plugin.saveSettings()
					})
				})
		}

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
