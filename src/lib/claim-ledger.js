// @ts-check
/**
 * Pure client-side helpers for the public pleno claim ledger:
 * defense-in-depth gating, signal-first sort, faceted filtering, search.
 * Policy lives in ../scraper/claim-public-gate (single source of truth).
 */
import { classifyClaimVisibility } from '../scraper/claim-public-gate'

const VERDICT_RANK = { contradicho: 0, verificado: 1, parcial: 2, 'promesa-repetida': 3 }

/** Drop `hidden` items (recomputed), guaranteeing each survivor has `.visibility`. */
export function gateForDisplay(items) {
  const out = []
  for (const it of items ?? []) {
    const visibility = classifyClaimVisibility(it)
    if (visibility === 'hidden') continue
    out.push(it.visibility ? it : { ...it, visibility })
  }
  return out
}

/** contradicho → verificado → parcial → promesa-repetida, then newest pleno first. */
export function sortSignalFirst(items) {
  return [...(items ?? [])].sort((a, b) => {
    const ra = VERDICT_RANK[a?.verification?.verdict] ?? 99
    const rb = VERDICT_RANK[b?.verification?.verdict] ?? 99
    if (ra !== rb) return ra - rb
    return String(b?.claim?.plenoDate ?? '').localeCompare(String(a?.claim?.plenoDate ?? ''))
  })
}

export function facetCounts(items) {
  const verdict = {}
  const type = {}
  for (const it of items ?? []) {
    const v = it?.verification?.verdict
    if (v) verdict[v] = (verdict[v] ?? 0) + 1
    const t = it?.claim?.type
    if (t) type[t] = (type[t] ?? 0) + 1
  }
  return { verdict, type }
}

/**
 * Filter the (already-gated) set. `query` matches claim.verbatim only and
 * runs over the passed items, so it can never resurface a hidden claim.
 * `showSinDatos=false` drops `toggle` items.
 */
export function filterClaims(items, opts = {}) {
  const { verdict, type, pleno, grupo, query, showSinDatos = false } = opts
  const q = (query ?? '').trim().toLowerCase()
  return (items ?? []).filter((it) => {
    if (!showSinDatos && it.visibility === 'toggle') return false
    if (verdict && it?.verification?.verdict !== verdict) return false
    if (type && it?.claim?.type !== type) return false
    if (pleno && it?.claim?.plenoId !== pleno) return false
    if (grupo && it?.claim?.speakerGroup !== grupo) return false
    if (
      q &&
      !String(it?.claim?.verbatim ?? '')
        .toLowerCase()
        .includes(q)
    )
      return false
    return true
  })
}
