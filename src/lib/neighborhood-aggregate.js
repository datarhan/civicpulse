// @ts-check
/**
 * Pure joins for the interactive-neighborhood map layer. No React, no fetch —
 * unit-tested in isolation. Combines geo neighborhoods + tender-geo located
 * spend + citizen quejas into one honest per-barrio snapshot. Shared with the
 * /quejas heatmap (computePerNeighborhood) so both surfaces bucket identically.
 */

/**
 * Health signal for a neighborhood from its queja counts. NEUTRAL when there
 * are zero quejas — we never colour a barrio red/green from an absence of data,
 * only from what citizens actually reported. silencio ≥30% → crit (red),
 * ≥10% → warn (amber), else resolved ≥50% → ok (green), else civic (blue).
 * @param {number} total
 * @param {number} resueltas
 * @param {number} silencios
 * @returns {{color:string, resolvedPct:number, silencioPct:number, level:string}}
 */
export function healthFromCounts(total, resueltas, silencios) {
  if (!total || total <= 0) {
    return { color: '#9AA3B2', resolvedPct: 0, silencioPct: 0, level: 'neutral' }
  }
  const resolvedPct = (resueltas / total) * 100
  const silencioPct = (silencios / total) * 100
  if (silencioPct >= 30) return { color: '#DC2626', resolvedPct, silencioPct, level: 'crit' }
  if (silencioPct >= 10) return { color: '#D97706', resolvedPct, silencioPct, level: 'warn' }
  if (resolvedPct >= 50) return { color: '#16A34A', resolvedPct, silencioPct, level: 'ok' }
  return { color: '#60A5FA', resolvedPct, silencioPct, level: 'civic' }
}

/**
 * Tally a neighborhood's quejas from the raw items (matched by slug).
 * @returns {{total:number, resueltas:number, pendientes:number, silencios:number}}
 */
function tallyQuejas(quejaItems, slug) {
  let total = 0
  let resueltas = 0
  let silencios = 0
  let pendientes = 0
  for (const q of quejaItems ?? []) {
    if (q.address_string !== slug) continue
    total += 1
    if (q.status === 'resuelta') resueltas += 1
    else if (q.status === 'silencio_negativo' || q.status === 'escalada_sindic') silencios += 1
    else pendientes += 1
  }
  return { total, resueltas, pendientes, silencios }
}

/**
 * Full civic snapshot for ONE neighborhood, joining geo (population) +
 * tender-geo (located spend, from the matching zone) + quejas. Honest zeros
 * throughout: a barrio with no located contracts reports amount 0 (not hidden),
 * a barrio with no quejas reports neutral health.
 * @param {{neighborhood:any, zones?:any[], quejaItems?:any[]}} input
 */
export function aggregateNeighborhood({ neighborhood, zones = [], quejaItems = [] }) {
  const slug = neighborhood.slug
  const zone = (zones ?? []).find((z) => z.slug === slug) || null
  const quejas = tallyQuejas(quejaItems, slug)
  return {
    slug,
    name: neighborhood.name,
    centroid: neighborhood.centroid,
    population: neighborhood.population ?? null,
    contractCount: zone?.contractCount ?? 0,
    amount: zone?.amount ?? 0,
    danaAmount: zone?.danaAmount ?? 0,
    quejas,
    health: healthFromCounts(quejas.total, quejas.resueltas, quejas.silencios),
  }
}

/**
 * Bucket quejas by neighborhood slug into {total,resueltas,silencios,pendientes}
 * rows, keeping only barrios with ≥1 queja. Slugs with no geo entry are ignored
 * (never fabricated). Moved verbatim from QuejasHeatmap so the map layer and the
 * /quejas heatmap share one join.
 * @param {any[]} items
 * @param {any[]} neighborhoods
 */
export function computePerNeighborhood(items, neighborhoods) {
  const bySlug = new Map()
  for (const n of neighborhoods ?? []) {
    bySlug.set(n.slug, {
      slug: n.slug,
      name: n.name,
      centroid: n.centroid,
      total: 0,
      resueltas: 0,
      silencios: 0,
      pendientes: 0,
    })
  }
  for (const q of items ?? []) {
    const slug = q.address_string
    if (!slug) continue
    if (!bySlug.has(slug)) continue
    const agg = bySlug.get(slug)
    agg.total += 1
    if (q.status === 'resuelta') agg.resueltas += 1
    else if (q.status === 'silencio_negativo' || q.status === 'escalada_sindic') agg.silencios += 1
    else agg.pendientes += 1
  }
  return [...bySlug.values()].filter((v) => v.total > 0)
}
