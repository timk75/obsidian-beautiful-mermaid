/**
 * Automated screenshot generator for beautiful-mermaid README.
 *
 * Uses Playwright (headless Chromium) to render SVG and ASCII diagrams
 * produced by beautiful-mermaid, then captures clean PNG screenshots.
 *
 * Run: bun run scripts/screenshots.ts
 */

import { chromium } from 'playwright'
import { renderMermaidSVG, renderMermaidASCII, THEMES } from 'beautiful-mermaid'
import type { RenderOptions } from 'beautiful-mermaid'
import type { AsciiRenderOptions } from 'beautiful-mermaid'
import { resolve } from 'path'

// ── Diagram sources ──────────────────────────────────────────────────

const FLOWCHART_SOURCE = `graph TD
  Start[Start] --> Creds[Enter Credentials]
  Creds --> Validate{Validate}
  Validate -->|Valid| Success[Access Granted]
  Validate -->|Invalid| Retry[Show Error]
  Retry --> Creds`

const SEQUENCE_SOURCE = `sequenceDiagram
  Client->>Server: POST /login
  Server->>DB: SELECT user
  DB-->>Server: user row
  Server-->>Client: 200 OK + token`

// ── Screenshot configs ───────────────────────────────────────────────

const latte = THEMES['catppuccin-latte']
const mocha = THEMES['catppuccin-mocha']

interface ScreenshotConfig {
  name: string
  mode: 'svg' | 'ascii'
  source: string
  theme: typeof latte
}

const CONFIGS: ScreenshotConfig[] = [
  { name: 'flowchart-svg', mode: 'svg', source: FLOWCHART_SOURCE, theme: latte },
  { name: 'sequence-svg', mode: 'svg', source: SEQUENCE_SOURCE, theme: latte },
  { name: 'flowchart-ascii', mode: 'ascii', source: FLOWCHART_SOURCE, theme: latte },
  { name: 'sequence-ascii', mode: 'ascii', source: SEQUENCE_SOURCE, theme: latte },
]

// ── Rendering helpers ────────────────────────────────────────────────

function renderSvgHtml(source: string, theme: typeof latte): string {
  const opts: RenderOptions = {
    bg: theme.bg,
    fg: theme.fg,
    line: theme.line,
    accent: theme.accent,
    muted: theme.muted,
    surface: theme.surface,
    border: theme.border,
    font: 'Inter',
  }
  const svg = renderMermaidSVG(source, opts)

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      background: ${theme.bg};
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 32px;
    }
    #diagram { display: inline-block; }
  </style>
</head>
<body>
  <div id="diagram">${svg}</div>
</body>
</html>`
}

function renderAsciiHtml(source: string, theme: typeof mocha): string {
  const opts: AsciiRenderOptions = {
    colorMode: 'none',
    useAscii: false,
  }
  const text = renderMermaidASCII(source, opts)

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      background: ${theme.bg};
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 32px;
    }
    #diagram {
      font-family: 'JetBrains Mono', monospace;
      font-size: 16px;
      line-height: 0.95;
      letter-spacing: 0;
      color: ${theme.fg};
      white-space: pre;
      padding: 24px;
      border-radius: 8px;
      background: ${theme.bg};
    }
  </style>
</head>
<body>
  <div id="diagram">${escapeHtml(text)}</div>
</body>
</html>`
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// ── Main ─────────────────────────────────────────────────────────────

const outDir = resolve(import.meta.dir, '..', 'screenshots')

async function main() {
  const browser = await chromium.launch()

  for (const cfg of CONFIGS) {
    console.log(`Rendering ${cfg.name}...`)

    const html =
      cfg.mode === 'svg'
        ? renderSvgHtml(cfg.source, cfg.theme)
        : renderAsciiHtml(cfg.source, cfg.theme)

    const page = await browser.newPage({
      deviceScaleFactor: 2,
      viewport: { width: 1200, height: 2000 },
    })
    await page.setContent(html, { waitUntil: 'networkidle' })

    // Wait for fonts to load (important for consistent rendering)
    await page.evaluate(() => document.fonts.ready)

    const el = page.locator('#diagram')
    const box = await el.boundingBox()

    if (!box) {
      console.error(`  Could not find #diagram for ${cfg.name}, skipping`)
      await page.close()
      continue
    }

    // Use element screenshot with padding via clip on body
    const pad = 32
    const bg = cfg.theme.bg
    await page.screenshot({
      path: `${outDir}/${cfg.name}.png`,
      clip: {
        x: Math.max(0, box.x - pad),
        y: Math.max(0, box.y - pad),
        width: box.width + pad * 2,
        height: box.height + pad * 2,
      },
    })

    console.log(`  Saved ${cfg.name}.png (${Math.round(box.width)}x${Math.round(box.height)})`)
    await page.close()
  }

  await browser.close()
  console.log('\nDone! Screenshots saved to screenshots/')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
