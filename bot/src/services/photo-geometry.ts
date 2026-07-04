/**
 * Pure geometry + vision-response parsing for the queja-photo anonymizer.
 *
 * Kept dependency-free (no sharp, no network) so the region math and the
 * fail-closed parse contract are unit-testable in isolation. The heavy
 * lifting (image mosaic, the actual vision call) lives in
 * `photo-anonymize.ts`, which imports these helpers.
 */

/** A rectangle in absolute image pixels, top-left origin. */
export interface PixelRect {
  left: number
  top: number
  width: number
  height: number
}

/** A detection box normalized to 0..1 fractions of the image, top-left origin. */
export interface NormBox {
  x: number
  y: number
  w: number
  h: number
  label?: string
}

/**
 * Clamp a pixel rect to the image bounds, shrinking rather than translating.
 * Returns null when the rect has no positive-area intersection with the image
 * (a detection entirely off-canvas contributes nothing to mosaic).
 */
export function clampRect(r: PixelRect, imgW: number, imgH: number): PixelRect | null {
  let { left, top, width, height } = r
  if (left < 0) {
    width += left // left is negative → shrink width
    left = 0
  }
  if (top < 0) {
    height += top
    top = 0
  }
  if (left + width > imgW) width = imgW - left
  if (top + height > imgH) height = imgH - top
  if (width <= 0 || height <= 0 || left >= imgW || top >= imgH) return null
  return {
    left: Math.round(left),
    top: Math.round(top),
    width: Math.round(width),
    height: Math.round(height),
  }
}

/** Project a 0..1 normalized detection box onto pixel space, clamped. */
export function normToPixelRect(b: NormBox, imgW: number, imgH: number): PixelRect | null {
  if (![b.x, b.y, b.w, b.h].every((n) => typeof n === 'number' && Number.isFinite(n))) return null
  if (b.w <= 0 || b.h <= 0) return null
  return clampRect(
    { left: b.x * imgW, top: b.y * imgH, width: b.w * imgW, height: b.h * imgH },
    imgW,
    imgH,
  )
}

/**
 * Grow a rect by `marginFrac` of its own width/height on every side, then
 * clamp back inside the image. A margin buffers imperfect detector boxes so
 * the mosaic covers a little more than the model claimed.
 */
export function expandRect(
  r: PixelRect,
  marginFrac: number,
  imgW: number,
  imgH: number,
): PixelRect | null {
  const dx = r.width * marginFrac
  const dy = r.height * marginFrac
  return clampRect(
    { left: r.left - dx, top: r.top - dy, width: r.width + 2 * dx, height: r.height + 2 * dy },
    imgW,
    imgH,
  )
}

/**
 * Parse the vision model's raw text into normalized detection boxes.
 *
 * Contract (deliberate, for fail-closed anonymization):
 *   - A parseable JSON array → the valid boxes inside it (invalid/out-of-range
 *     entries are dropped individually). An empty array is a *successful*
 *     "nothing sensitive found" result and returns [].
 *   - Anything with no JSON array at all (a refusal, prose-only, garbled
 *     output) THROWS. The orchestrator turns that throw into "hold the photo",
 *     so a failed detection never publishes an un-anonymized image.
 */
export function parseVisionBoxes(raw: string): NormBox[] {
  if (typeof raw !== 'string') throw new Error('vision response is not a string')
  const start = raw.indexOf('[')
  const end = raw.lastIndexOf(']')
  if (start === -1 || end === -1 || end < start) {
    throw new Error('no JSON array found in vision response')
  }
  let arr: unknown
  try {
    arr = JSON.parse(raw.slice(start, end + 1))
  } catch {
    throw new Error('vision response JSON array did not parse')
  }
  if (!Array.isArray(arr)) throw new Error('vision response is not an array')

  const out: NormBox[] = []
  for (const item of arr) {
    if (!item || typeof item !== 'object') continue
    const rec = item as Record<string, unknown>
    const { x, y, w, h } = rec
    if (![x, y, w, h].every((n) => typeof n === 'number' && Number.isFinite(n))) continue
    const nx = x as number
    const ny = y as number
    const nw = w as number
    const nh = h as number
    if (nx < 0 || ny < 0 || nx > 1 || ny > 1) continue
    if (nw <= 0 || nh <= 0 || nw > 1 || nh > 1) continue
    out.push({
      x: nx,
      y: ny,
      w: nw,
      h: nh,
      label: typeof rec.label === 'string' ? (rec.label as string) : undefined,
    })
  }
  return out
}
