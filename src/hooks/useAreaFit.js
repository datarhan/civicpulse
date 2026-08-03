// @ts-check
import { useJsonFetch } from './useJsonFetch'
import { usePromises, isPromiseFrozen } from './usePromises'

// 404-fallback (module-level constant → stable ref). An absent file means the
// surface renders nothing, never a row of blanks about a named person.
const EMPTY_FIT = { generatedAt: null, mandate: null, note: null, method: null, rows: [] }
const EMPTY_REQ = { generatedAt: null, note: null, roles: [], sources: [] }

/**
 * «Encaje declarado» — what formación and experiencia the holder of each área
 * declares, curator-signed, one row per (official × portfolio).
 *
 * Frozen under LOREG art. 50: during an electoral period the whole block stops
 * rendering, mirroring the overdue flag on /promesas. A statement that a named
 * candidate declares no training related to the área they run is exactly the
 * kind of thing the freeze exists to keep off the site mid-campaign — the facts
 * do not change, but publishing them then does.
 */
export function useAreaFit() {
  const fit = useJsonFetch('/data/area-fit.json', EMPTY_FIT)
  const { data: promises } = usePromises()
  const frozen = isPromiseFrozen(promises)
  return { ...fit, frozen, data: frozen ? EMPTY_FIT : fit.data }
}

/** What the law actually requires per role, cited to the BOE. */
export function useRequisitosCargo() {
  return useJsonFetch('/data/requisitos-cargo.json', EMPTY_REQ)
}

/** Rows for one official, in the order their portfolios are declared. */
export function fitRowsForSlug(data, slug) {
  return (data?.rows || []).filter((r) => r.officialSlug === slug)
}

/**
 * Áreas where a field reads `relacionada` — NAMES, never a count.
 *
 * "3 de 4" is a score with extra steps, and this surface deliberately does not
 * grade anyone. See src/scraper/area-fit.ts for why.
 */
export function relatedAreaNames(rows, field) {
  return (rows || []).filter((r) => r?.[field]?.value === 'relacionada').map((r) => r.portfolio)
}

/**
 * The single value to show for a field across all of an official's áreas.
 *
 * `relacionada` if any área matched (the names say which); otherwise
 * `no-consta` only when EVERY área is no-consta — one área lacking data must not
 * erase a relation declared elsewhere, and "we have no CV" must not be reported
 * where "the CV does not relate" is what we actually found.
 */
export function overallValue(rows, field) {
  const values = (rows || []).map((r) => r?.[field]?.value).filter(Boolean)
  if (!values.length) return null
  if (values.includes('relacionada')) return 'relacionada'
  if (values.every((v) => v === 'no-consta')) return 'no-consta'
  return 'sin-relacion-declarada'
}

/** Corporation-wide counts for the /departamentos aggregate. Names nobody. */
export function fitAggregate(data) {
  const rows = data?.rows || []
  if (!rows.length) return null
  const bySlug = new Map()
  for (const r of rows) {
    if (!bySlug.has(r.officialSlug)) bySlug.set(r.officialSlug, [])
    bySlug.get(r.officialSlug).push(r)
  }
  let conFormacion = 0
  let sinRelacion = 0
  let noConsta = 0
  for (const [, group] of bySlug) {
    const v = overallValue(group, 'formacion')
    if (v === 'relacionada') conFormacion += 1
    else if (v === 'no-consta') noConsta += 1
    else if (v === 'sin-relacion-declarada') sinRelacion += 1
  }
  return { cargos: bySlug.size, conFormacion, sinRelacion, noConsta }
}
