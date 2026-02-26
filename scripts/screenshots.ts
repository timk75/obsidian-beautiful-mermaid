/**
 * Automated screenshot generator for beautiful-mermaid README.
 *
 * Uses `obsidian eval` + Electron's capturePage() to capture diagrams
 * directly from Obsidian's renderer — pixel-perfect, no browser seams.
 *
 * Prerequisites:
 *   - Obsidian running with Engram vault open
 *   - "Beautiful Mermaid Test" note open (4 diagrams: flowchart + sequence, SVG + ASCII)
 *   - Obsidian in light mode for README screenshots
 *
 * Run: bun run scripts/screenshots.ts
 */

import { execSync } from 'child_process'
import { resolve } from 'path'
import { writeFileSync } from 'fs'

// ── Screenshot configs ───────────────────────────────────────────────

interface ScreenshotConfig {
  name: string
  selector: string
  index: number
}

const CONFIGS: ScreenshotConfig[] = [
  { name: 'flowchart-svg',   selector: '.beautiful-mermaid-container', index: 0 },
  { name: 'flowchart-ascii', selector: '.beautiful-mermaid-ascii',     index: 0 },
  { name: 'sequence-svg',    selector: '.beautiful-mermaid-container', index: 1 },
  { name: 'sequence-ascii',  selector: '.beautiful-mermaid-ascii',     index: 1 },
]

const outDir = resolve(import.meta.dir, '..', 'screenshots')
const PAD = 24

// ── Helpers ──────────────────────────────────────────────────────────

function obsidianEval(code: string): string {
  // Write code to a temp file to avoid shell quoting issues
  const tmpFile = '/tmp/_obsidian_eval_code.js'
  writeFileSync(tmpFile, code)
  const result = execSync(
    `obsidian eval code="$(cat ${tmpFile})" 2>/dev/null`,
    { encoding: 'utf-8', timeout: 15000 }
  )
  return result.trim()
}

function sleep(ms: number): void {
  execSync(`sleep ${ms / 1000}`)
}

function ensureLightMode(): void {
  const theme = obsidianEval(
    `document.body.classList.contains('theme-dark') ? 'dark' : 'light'`
  )
  if (theme.includes('dark')) {
    obsidianEval(`app.vault.setConfig('theme', 'moonstone'); 'switched'`)
    sleep(500)
    console.log('  Switched Obsidian to light mode')
  }
}

function ensureTestNoteOpen(): void {
  const active = obsidianEval(`app.workspace.getActiveFile()?.basename`)
  if (!active.includes('Beautiful Mermaid Test')) {
    obsidianEval(
      `app.workspace.openLinkText('Beautiful Mermaid Test', '', false); 'opened'`
    )
    sleep(1000)
    console.log('  Opened "Beautiful Mermaid Test" note')
  }
}

function captureElement(cfg: ScreenshotConfig): void {
  const outPath = `${outDir}/${cfg.name}.png`

  // Step 1: Scroll element into view
  obsidianEval(`
    const el = document.querySelectorAll('${cfg.selector}')[${cfg.index}];
    if (!el) throw new Error('Element not found');
    el.scrollIntoView({ block: 'center' });
    'scrolled'
  `)

  // Wait for scroll + render to settle
  sleep(600)

  // Step 2: Read bounding rect
  const rectJson = obsidianEval(`
    const el = document.querySelectorAll('${cfg.selector}')[${cfg.index}];
    const rect = el.getBoundingClientRect();
    JSON.stringify({
      x: Math.round(rect.x),
      y: Math.round(rect.y),
      width: Math.round(rect.width),
      height: Math.round(rect.height)
    })
  `)

  // Parse rect from "=> {...}" output
  const rectStr = rectJson.replace(/^=>\s*/, '')
  const rect = JSON.parse(rectStr)
  console.log(`  ${cfg.name}: element at (${rect.x},${rect.y}) ${rect.width}x${rect.height}`)

  // Step 3: Capture with capturePage using known coordinates
  const captureRect = {
    x: Math.max(0, rect.x - PAD),
    y: Math.max(0, rect.y - PAD),
    width: rect.width + PAD * 2,
    height: rect.height + PAD * 2,
  }

  obsidianEval(`
    (async () => {
      const { remote } = require('electron');
      const fs = require('fs');
      const wc = remote.getCurrentWebContents();
      const image = await wc.capturePage({
        x: ${captureRect.x},
        y: ${captureRect.y},
        width: ${captureRect.width},
        height: ${captureRect.height}
      });
      fs.writeFileSync('${outPath}', image.toPNG());
    })()
  `)

  // Wait for async capture to complete
  sleep(500)

  console.log(`  ${cfg.name}.png saved`)
}

// ── Main ─────────────────────────────────────────────────────────────

console.log('Screenshot capture via Obsidian + Electron capturePage\n')

console.log('Setup:')
ensureLightMode()
ensureTestNoteOpen()

// Verify diagrams exist
const counts = obsidianEval(`
  document.querySelectorAll('.beautiful-mermaid-container').length +
  ' SVG + ' +
  document.querySelectorAll('.beautiful-mermaid-ascii').length +
  ' ASCII'
`)
console.log(`  Found ${counts.replace('=> ', '')} diagrams\n`)

console.log('Capturing:')
for (const cfg of CONFIGS) {
  captureElement(cfg)
}

console.log('\nDone! Screenshots saved to screenshots/')
