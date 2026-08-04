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

/**
 * The single backing value shared by a card's assessments, or null when they
 * disagree — or when nothing is cited at all.
 *
 * Returning null on divergence is what tells the UI to fall back to per-item
 * marks. While every assessment agrees, the surface states the backing ONCE: a
 * badge repeated identically beside every assessment distinguishes nothing,
 * which is exactly how the `cargoPublicoPrevio` chip died (see
 * src/scraper/area-fit.ts). Every published respaldo currently reads
 * `autodeclarada` — that uniformity IS the finding, and one sentence states it
 * better than a wall of identical marks. No count here on purpose: it moves with
 * every promotion, and a stale number outlives the measurement behind it.
 *
 * An assessment that cites nothing carries no respaldo, so it contributes no
 * value here: "no citation" is not a third opinion about backing, and letting it
 * count would report divergence where there is only silence. When NOTHING cites
 * anything the result is null and the caller renders no backing line at all —
 * there is no citation whose backing could be described.
 *
 * `fields` narrows the question to one axis, for the divergent branch: the card
 * aggregates several áreas per field, so it must be able to ask "do all the
 * formación assessments agree?" without also folding in experiencia.
 */
export function sharedRespaldo(rows, fields = ['formacion', 'experiencia']) {
  const values = (rows || []).flatMap((r) => fields.map((f) => r?.[f]?.respaldo)).filter(Boolean)
  if (!values.length) return null
  return values.every((v) => v === values[0]) ? values[0] : null
}

/**
 * True when NOT ONE assessment on these rows cites anything.
 *
 * The other half of `sharedRespaldo` returning null. Null means one of two very
 * different things — the assessments DISAGREE about their backing, or NOBODY
 * cited anything — and the surface owes the reader a different sentence for
 * each. Conflating them is what left the three cards whose every assessment
 * reads «sin relación declarada» with two bare negative labels and no statement
 * of what they had been compared against: a finding no component asserts.
 *
 * Keyed on `respaldo` rather than on `evidence.length` because the two are the
 * same fact by construction — `stampRespaldo` in src/scraper/area-fit.ts leaves
 * a non-citing assessment WITHOUT a respaldo, and `areafit-respaldo-classified`
 * in relations-check.ts fails the build if a citing one ever lacks it.
 */
export function citesNothing(rows, fields = ['formacion', 'experiencia']) {
  return !(rows || []).some((r) => fields.some((f) => r?.[f]?.respaldo))
}

/**
 * Signed warning mappings for one official, optionally on one axis.
 *
 * Reads only what a curator signed: drafts live in the gitignored queue and
 * never reach this data. Zero signed avisos is the normal state and must render
 * as nothing, never as an empty box implying something is missing.
 */
export function avisosForSlug(data, slug, eje) {
  return (data?.avisos || []).filter((a) => a.officialSlug === slug && (!eje || a.eje === eje))
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
