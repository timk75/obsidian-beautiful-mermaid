/**
 * Font inheritance helper — pure, DOM-free (unit-testable).
 *
 * beautiful-mermaid's `font` option expects a single family NAME, not a stack:
 * it wraps the value in quotes and appends its own fallbacks. Passing a full
 * CSS font-family stack (e.g. Obsidian's `--font-text`) yields broken CSS like
 * `font-family: ''SF Pro', 'system-ui', …', system-ui`. So when inheriting the
 * theme font we extract just the first family, unquoted.
 */

/** Return the first font family from a CSS font-family stack, unquoted.
 *  Empty string if the stack is empty. */
export function firstFontFamily(stack: string): string {
	return (stack.split(',')[0] || '')
		.trim()
		.replace(/^['"]|['"]$/g, '')
		.trim()
}
