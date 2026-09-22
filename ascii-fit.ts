/**
 * ASCII fit-to-width helper — pure, DOM-free (unit-testable).
 *
 * Wide ASCII diagrams are shrunk with CSS `zoom` so they fit the content
 * column. Returns the zoom factor, or null when either width is not yet
 * measurable (element not laid out) — the caller must retry on resize.
 */
export function fitZoom(naturalWidth: number, containerWidth: number): number | null {
	if (naturalWidth <= 0 || containerWidth <= 0) return null
	return naturalWidth > containerWidth ? containerWidth / naturalWidth : 1
}
