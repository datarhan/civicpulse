// @ts-check
/**
 * Schematic L9 train position — pure, deterministic, unit-tested. A single
 * marker glides back and forth along the ordered L9 station centroids on a
 * fixed cycle. This is a REPRESENTATION of service, not a real-time position:
 * the FGV timetable in our data expired (2025), and L9's OSM geometry is a set
 * of disjoint ways, so we ease between the real station points rather than claim
 * on-rails precision. The UI labels it "representativo · horario 2025".
 */

function dist(a, b) {
  return Math.hypot(a[0] - b[0], a[1] - b[1])
}

function lerp(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]
}

/** Point at cumulative arc-length fraction `frac` (0..1) along a polyline. */
function pointAlong(pts, frac) {
  const segLen = []
  let total = 0
  for (let i = 1; i < pts.length; i++) {
    const d = dist(pts[i - 1], pts[i])
    segLen.push(d)
    total += d
  }
  if (total === 0) return pts[0]
  let target = frac * total
  for (let i = 0; i < segLen.length; i++) {
    if (target <= segLen[i]) {
      const t = segLen[i] === 0 ? 0 : target / segLen[i]
      return lerp(pts[i], pts[i + 1], t)
    }
    target -= segLen[i]
  }
  return pts[pts.length - 1]
}

/**
 * @param {Array<{id?:string, pos:[number,number]}>} orderedStations
 * @param {number} tMs      elapsed ms (0 = reduced-motion / parked frame)
 * @param {number} cycleMs  full A→…→end→…→A round-trip period
 * @returns {Array<{id:string, pos:[number,number], heading:'forward'|'back'}>}
 */
export function trainPositionsAt(orderedStations, tMs, cycleMs) {
  const pts = (orderedStations || []).map((s) => s.pos).filter((p) => Array.isArray(p))
  if (pts.length < 2) return []
  const period = cycleMs > 0 ? cycleMs : 1
  const phase = (((tMs % period) + period) % period) / period // 0..1
  // Triangle wave: 0→1 over the first half (outbound), 1→0 over the second.
  const frac = phase < 0.5 ? phase * 2 : 2 - phase * 2
  const heading = phase < 0.5 ? 'forward' : 'back'
  return [{ id: 'l9-train', pos: pointAlong(pts, frac), heading }]
}
