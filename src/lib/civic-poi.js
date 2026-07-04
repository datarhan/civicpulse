// @ts-check
/**
 * Display config + grouping for the civic-POI map layer. Category keys match the
 * scraper's PoiCategory enum (src/scraper/civic-poi.ts) — keep the two in sync.
 * Pure, unit-tested; no React.
 */

/** Label + marker colour per civic category. Order = legend order. */
export const POI_CATEGORIES = {
  educacion: { label: 'Educación', color: '#2563EB' },
  salud: { label: 'Salud', color: '#DC2626' },
  verde: { label: 'Zonas verdes', color: '#16A34A' },
  deporte: { label: 'Deporte', color: '#EA580C' },
  cultura: { label: 'Cultura', color: '#7C3AED' },
  civico: { label: 'Servicios públicos', color: '#475569' },
}

/**
 * Group POIs into a Map<category, {label, color, items[]}>, in POI_CATEGORIES
 * order, omitting categories with no POIs (so the legend never lists an empty
 * bucket).
 * @param {Array<{category:string}>} [pois]
 * @returns {Map<string, {label:string, color:string, items:any[]}>}
 */
export function groupPoiByCategory(pois) {
  const out = new Map()
  for (const key of Object.keys(POI_CATEGORIES)) {
    const items = (pois ?? []).filter((p) => p.category === key)
    if (items.length === 0) continue
    out.set(key, { label: POI_CATEGORIES[key].label, color: POI_CATEGORIES[key].color, items })
  }
  return out
}
