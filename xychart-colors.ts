/**
 * xychart color neutralization — pure, DOM-free helpers (unit-testable).
 *
 * beautiful-mermaid renders every diagram type from the theme's bg/fg except
 * xychart, which carries a hardcoded blue categorical palette
 * (`--xychart-color-0: var(--accent, #3b82f6)`, `--xychart-color-1: #5f79f2`, …)
 * that no RenderOptions field reaches. In Auto/neutral mode we rewrite those
 * color definitions to a monochrome ramp built from the SVG's own theme vars,
 * so charts stay monochrome like every other diagram. Bar fills reference
 * `var(--xychart-color-N)`, so they follow the override automatically.
 */

/** Monochrome ramp entry for xychart series `index`. Uses the SVG's own theme
 *  vars so it stays theme-driven; series beyond the ramp fade toward the bg
 *  while staying distinct in lightness. */
export function xySeriesColor(index: number): string {
	const ramp = ['var(--fg)', 'var(--line)', 'var(--muted)']
	if (index < ramp.length) return ramp[index]
	const pct = Math.max(20, 55 - (index - ramp.length) * 12)
	return `color-mix(in srgb, var(--fg) ${pct}%, var(--bg))`
}

/** Rewrite every `--xychart-color-N` definition in an SVG string to the
 *  monochrome ramp. Only affects xychart SVGs (others lack the pattern), so it
 *  is safe to call on any rendered diagram. */
export function neutralizeXychartColors(svg: string): string {
	return svg.replace(/--xychart-color-(\d+):\s*[^;]+/g,
		(_m, n: string) => `--xychart-color-${n}: ${xySeriesColor(parseInt(n, 10))}`)
}
