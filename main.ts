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
import { neutralizeXychartColors } from './xychart-colors'
import { firstFontFamily } from './theme-font'
import { fitZoom } from './ascii-fit'

type RenderMode = 'svg' | 'ascii'

const LIGHT_THEMES = ['zinc-light', 'tokyo-night-light', 'catppuccin-latte', 'nord-light', 'github-light', 'solarized-light']
const DARK_THEMES = ['zinc-dark', 'tokyo-night', 'tokyo-night-storm', 'catppuccin-mocha', 'nord', 'dracula', 'github-dark', 'solarized-dark', 'one-dark']

/** Maps beautiful-mermaid color slots to the Obsidian CSS variables that carry
 *  the equivalent color in the active theme. Read live so 'auto' diagrams track
 *  whatever Obsidian theme (and light/dark mode) is currently applied.
 *
 *  Deliberately only bg/fg plus the neutral grey text tones. We do NOT map an
 *  accent, surface, or border: beautiful-mermaid derives those from bg+fg into a
 *  clean neutral baseline (subtle box contrast, accent rarely visible). Injecting
 *  Obsidian's --interactive-accent/--text-accent here would splash the theme's
 *  action color onto every arrowhead — the opposite of the intended monochrome
 *  look. Color in a diagram should come only from inline `style`/`linkStyle`
 *  directives in the source, which always override the theme. */
const AUTO_VAR_MAP: Record<string, string> = {
	bg: '--background-primary',
	fg: '--text-normal',
	line: '--text-muted',
	muted: '--text-faint',
}

/** Resolve the active Obsidian theme's colors into beautiful-mermaid options. */
function resolveAutoColors(): Partial<RenderOptions> {
	const cs = getComputedStyle(document.body)
	const out: Record<string, string> = {}
	for (const [slot, varName] of Object.entries(AUTO_VAR_MAP)) {
		const val = cs.getPropertyValue(varName).trim()
		if (val) out[slot] = val
	}
	return out as Partial<RenderOptions>
}


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
	themeLight: 'auto',
	themeDark: 'auto',
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
				const settingsKey = plugin.settingsSignature()

				for (const block of blocks) {
					// Skip if already processed with current settings
					if (block.getAttribute(MARKER_ATTR) === settingsKey) continue

					// Extract source from the document state via DOM position
					const pos = view.posAtDOM(block)
					const source = extractSourceAtPos(view, pos)
					if (!source) continue

					// Compute position of first content line inside the code block
				const fenceLine = view.state.doc.lineAt(pos)
				let contentLineFrom = fenceLine.to + 1 // line after fence
				// Verify we're on the fence; if not, search backward
				if (!/^```+\s*mermaid\s*$/.test(fenceLine.text.trimStart())) {
					for (let i = fenceLine.number; i >= 1; i--) {
						const l = view.state.doc.line(i)
						if (/^```+\s*mermaid\s*$/.test(l.text.trimStart())) {
							contentLineFrom = l.to + 1
							break
						}
					}
				}
				plugin.renderIntoElement(source, block, view, contentLineFrom)
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

	// Refits wide ASCII diagrams whenever their container width changes. A
	// one-shot measure is not enough: Live Preview often builds the block before
	// it is laid out (width 0), and pane resizes change the available width.
	private asciiFitWidths = new WeakMap<Element, number>()
	private asciiFitObserver = new ResizeObserver((entries) => {
		for (const entry of entries) {
			const container = entry.target as HTMLElement
			const width = container.clientWidth
			if (this.asciiFitWidths.get(container) === width) continue
			const pre = container.querySelector<HTMLElement>('.beautiful-mermaid-ascii-pre')
			if (!pre) continue
			const style = pre.style as unknown as Record<string, string>
			style.zoom = ''
			const ratio = fitZoom(pre.offsetWidth, width)
			if (ratio === null) continue
			this.asciiFitWidths.set(container, width)
			if (ratio < 1) style.zoom = `${ratio}`
		}
	})

	async onload() {
		await this.loadSettings()
		this.register(() => this.asciiFitObserver.disconnect())

		// Reading View: registered processor replaces Obsidian's built-in mermaid
		this.registerMarkdownCodeBlockProcessor('mermaid', (source, el, ctx) => {
			this.renderIntoElement(source, el)
		}, -100)

		// Live Preview: ViewPlugin swaps Obsidian's embed block content post-render
		this.registerEditorExtension(buildMermaidPlugin(this))

		// Re-render on any appearance change: dark/light toggle, community-theme
		// switch, or snippet edit. 'auto' diagrams inherit live Obsidian colors, so
		// they must recolor on every css-change — the settings signature guard
		// (see settingsSignature) skips blocks whose resolved colors are unchanged.
		this.registerEvent(
			this.app.workspace.on('css-change', () => {
				this.wasDark = document.body.classList.contains('theme-dark')
				this.app.workspace.updateOptions() // Live Preview
				// Reading View: re-render stashed diagrams in place. Deferred a frame
				// so the new theme's CSS variables are applied before we read them.
				requestAnimationFrame(() => {
					document.querySelectorAll<HTMLElement>('[data-bm-source]').forEach(el => {
						const src = el.dataset.bmSource
						if (src != null) this.renderIntoElement(src, el)
					})
				})
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

	/** Render beautiful-mermaid output into a container element.
	 *  When called from Live Preview, editorView and contentPos enable the source
	 *  toggle to place the cursor into the code block for native editing.
	 *  contentPos should point to the first content line (after the opening fence).
	 */
	renderIntoElement(source: string, el: HTMLElement, editorView?: EditorView, contentPos?: number) {
		el.empty()
		// Reading View renders once and never re-fires on theme change. Stash the
		// source so the css-change handler can recolor it in place (Live Preview
		// re-renders via updateOptions, so it doesn't need this).
		if (!editorView) el.dataset.bmSource = source
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

			if (editorView && contentPos !== undefined) {
				// Live Preview: place cursor inside the code block to trigger native editing.
				// Defer to next frame so the click event finishes before CM6 processes the selection.
				requestAnimationFrame(() => {
					editorView.focus()
					editorView.dispatch({
						selection: { anchor: contentPos },
					})
				})
				return
			}

			// Reading View: toggle read-only source display
			if (showingSource) {
				if (sourceEl) {
					sourceEl.remove()
					sourceEl = null
				}
				const rendered = wrapper.querySelector('.beautiful-mermaid-container, .beautiful-mermaid-ascii') as HTMLElement
				if (rendered) rendered.style.display = ''
				showingSource = false
			} else {
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
			let svg = renderMermaidSVG(source.trim(), opts)
			// In auto mode, force xychart's hardcoded blue palette to the theme's
			// neutral greys so charts stay monochrome like every other diagram type.
			if (this.activeTheme() === 'auto') svg = neutralizeXychartColors(svg)
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

			// Scale down wide ASCII diagrams to fit container width (see asciiFitObserver).
			this.asciiFitObserver.observe(container)
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

	/** Resolve the active theme's color slots. 'auto' reads live Obsidian CSS
	 *  variables; 'custom' uses the user's pickers; a named theme uses its preset. */
	resolveColors(): Partial<RenderOptions> {
		const theme = this.activeTheme()

		if (theme === 'auto') {
			return resolveAutoColors()
		}

		if (theme === 'custom') {
			const out: Partial<RenderOptions> = {}
			if (this.settings.customBg) out.bg = this.settings.customBg
			if (this.settings.customFg) out.fg = this.settings.customFg
			return out
		}

		if (theme && theme in THEMES) {
			const colors = THEMES[theme as keyof typeof THEMES]
			const out: Partial<RenderOptions> = { bg: colors.bg, fg: colors.fg }
			if (colors.line) out.line = colors.line
			if (colors.accent) out.accent = colors.accent
			if (colors.muted) out.muted = colors.muted
			if (colors.surface) out.surface = colors.surface
			if (colors.border) out.border = colors.border
			return out
		}

		return {}
	}

	/** Font to render with. In auto mode, inherit Obsidian's --font-text (first
	 *  family only — the lib wants a name, not a stack); otherwise the setting. */
	effectiveFont(): string {
		if (this.activeTheme() === 'auto') {
			const fam = firstFontFamily(getComputedStyle(document.body).getPropertyValue('--font-text').trim())
			if (fam) return fam
		}
		return this.settings.font
	}

	buildSvgOptions(): RenderOptions {
		const opts: RenderOptions = { ...this.resolveColors() }
		const font = this.effectiveFont()
		if (font) opts.font = font
		if (this.settings.transparent) opts.transparent = true
		return opts
	}

	/** Stable signature of everything that affects rendered output. Used as the
	 *  processed-marker so blocks re-render exactly when their colors change —
	 *  including 'auto' blocks after an Obsidian theme switch (resolved colors move). */
	settingsSignature(): string {
		const colorSig = Object.entries(this.resolveColors())
			.map(([k, v]) => `${k}=${v}`)
			.join(',')
		const { transparent, defaultMode } = this.settings
		return `${colorSig}:${this.effectiveFont()}:${transparent}:${defaultMode}`
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
			.setDesc('Theme used when Obsidian is in light mode. Auto inherits the active Obsidian theme’s colors.')
			.addDropdown(drop => {
				drop.addOption('auto', 'Auto (inherit from Obsidian)')
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
			.setDesc('Theme used when Obsidian is in dark mode. Auto inherits the active Obsidian theme’s colors.')
			.addDropdown(drop => {
				drop.addOption('auto', 'Auto (inherit from Obsidian)')
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
