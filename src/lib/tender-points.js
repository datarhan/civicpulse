// @ts-check
/**
 * Pure client helper for the landing map's precise "obras situadas" pins.
 * Mirrors zoneAmountsAt (src/lib/tender-geo.js) but groups by the resolved
 * PLACE (street/POI/urbanización/barrio) instead of the barrio zone, so each
 * pin sits at the exact point the contract title named.
 */

/**
 * Per-place aggregate for assignments situated at a precise point and dated
 * on/before `at` (cumulative), optionally restricted to DANA and/or to obra
 * (construction) contracts. Assignments with no point/place (zone-only) or no
 * date are excluded — they have no pin on the timeline.
 * @param {any[]} assignments
 * @param {{at?: number, danaOnly?: boolean, obrasOnly?: boolean}} [opts]
 * @returns {Map<string,{sourceId:string,point:[number,number],name:string,kind:string,amount:number,count:number,dana:boolean}>}
 */
export function placeAmountsAt(
  assignments,
  { at = Infinity, danaOnly = false, obrasOnly = false } = {},
) {
  const m = new Map()
  for (const a of assignments || []) {
    if (!a || !a.point || !a.place || !a.place.sourceId) continue
    if (danaOnly && !a.dana) continue
    if (obrasOnly && a.contractType !== 'construction') continue
    if (!a.date || new Date(a.date).getTime() > at) continue
    const key = a.place.sourceId
    const cur = m.get(key) || {
      sourceId: key,
      point: a.point,
      name: a.place.name,
      kind: a.place.kind,
      amount: 0,
      count: 0,
      dana: false,
    }
    cur.amount += a.amount
    cur.count += 1
    if (a.dana) cur.dana = true
    m.set(key, cur)
  }
  return m
}
