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
 *   - A parseable JSON array whose EVERY element is a box we can read → those
 *     boxes. An empty array is a *successful* "nothing sensitive found" result
 *     and returns [].
 *   - One element we cannot read THROWS, and the orchestrator holds the photo.
 *     Until 2026-09-27 such elements were dropped one by one: if the model
 *     answered in its native `box_2d` format, or in pixels, EVERY box was
 *     dropped, the result was `[]` — "nothing to hide" — and the photo was
 *     published with no mosaic at all. An element we cannot read is a face we
 *     cannot locate.
 *   - Anything with no JSON array at all (a refusal, prose-only, garbled
 *     output) THROWS too.
 *
 * Two shapes are read: `{x,y,w,h}` as 0..1 fractions (what the prompt asks for)
 * and Gemini's native `{box_2d: [ymin, xmin, ymax, xmax]}` on a 0..1000 scale.
 * A box that runs past the right or bottom edge is trimmed, not dropped: it is
 * still a face.
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

  return arr.map((item, i) => {
    const caja = leerCaja(item)
    if (!caja) {
      throw new Error(`vision response element ${i} is not a box we can read — holding the photo`)
    }
    return caja
  })
}

const esNumero = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n)

/** One element of the model's answer as a normalized box, or null if it cannot be read. */
function leerCaja(item: unknown): NormBox | null {
  if (!item || typeof item !== 'object' || Array.isArray(item)) return null
  const rec = item as Record<string, unknown>
  const label = typeof rec.label === 'string' ? rec.label : undefined

  if ('box_2d' in rec) {
    const b = rec.box_2d
    if (!Array.isArray(b) || b.length !== 4 || !b.every(esNumero)) return null
    const [ymin, xmin, ymax, xmax] = b as number[]
    if ([ymin, xmin, ymax, xmax].some((n) => n < 0 || n > 1000)) return null
    if (ymax <= ymin || xmax <= xmin) return null
    return recortar({
      x: xmin / 1000,
      y: ymin / 1000,
      w: (xmax - xmin) / 1000,
      h: (ymax - ymin) / 1000,
      label,
    })
  }

  const { x, y, w, h } = rec
  if (!esNumero(x) || !esNumero(y) || !esNumero(w) || !esNumero(h)) return null
  // Fractions of the image. Anything outside is another scale (pixels?) and a
  // box read on the wrong scale lands somewhere else in the photo.
  if (x < 0 || y < 0 || x >= 1 || y >= 1) return null
  if (w <= 0 || h <= 0 || w > 1 || h > 1) return null
  return recortar({ x, y, w, h, label })
}

/** Trim a box that runs past the right or bottom edge. */
function recortar(b: NormBox): NormBox {
  return { ...b, w: Math.min(b.w, 1 - b.x), h: Math.min(b.h, 1 - b.y) }
}
