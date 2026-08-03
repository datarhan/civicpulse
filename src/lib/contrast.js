// @ts-check
/**
 * WCAG contrast maths, and the one decision it exists to make: given a brand
 * colour we do NOT control, which text colour is legible on top of it?
 *
 * The case that forced this: the Metrovalencia line badges. Their colours are
 * the operator's own — L1 is that yellow, L10 is that lime, and changing them
 * to satisfy a contrast checker would make the legend wrong. But white text on
 * them measured 1.54:1 (L10), 1.79:1 (L1), 1.87:1 (L8) — unreadable, and far
 * under the 4.5 floor. Keeping the brand fill and flipping the INK per colour
 * fixes legibility without falsifying the map.
 *
 * Pure and dependency-free so both components and tests can use it.
 */

/** Near-black page ink. Pairs with light fills. */
export const INK_DARK = '#0B0F19'
/** Pairs with dark fills. */
export const INK_LIGHT = '#FFFFFF'

/** @param {string} hex `#rgb` or `#rrggbb` @returns {[number,number,number]} */
export function parseHex(hex) {
  let h = String(hex).trim().replace(/^#/, '')
  if (h.length === 3)
    h = h
      .split('')
      .map((c) => c + c)
      .join('')
  const n = parseInt(h, 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

/** Relative luminance per WCAG 2.x. @param {string} hex @returns {number} */
export function luminance(hex) {
  const [r, g, b] = parseHex(hex).map((v) => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/**
 * Contrast ratio between two opaque colours, 1–21.
 * @param {string} a @param {string} b @returns {number}
 */
export function contrastRatio(a, b) {
  const la = luminance(a)
  const lb = luminance(b)
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

/**
 * The more legible of black/white on `background` — whichever scores higher,
 * so it degrades gracefully on a mid-tone where NEITHER reaches 4.5:1 rather
 * than pretending there is a right answer.
 *
 * @param {string} background
 * @returns {string} INK_DARK or INK_LIGHT
 */
export function readableInk(background) {
  return contrastRatio(background, INK_DARK) >= contrastRatio(background, INK_LIGHT)
    ? INK_DARK
    : INK_LIGHT
}

/**
 * @param {string} fg @param {string} bg
 * @param {{ large?: boolean }} [opts] large = ≥18.66px bold or ≥24px
 * @returns {boolean} whether the pair meets WCAG AA
 */
export function meetsAA(fg, bg, opts = {}) {
  return contrastRatio(fg, bg) >= (opts.large ? 3 : 4.5)
}
