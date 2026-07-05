// @ts-check
import { useJsonFetch } from './useJsonFetch'

const EMPTY = { links: [], stats: {} }

/**
 * Loads public/data/queja-contract-relations.json — the deterministic
 * queja ↔ contract relation links. Empty when none have been generated yet
 * (a 404 resolves to the empty snapshot), so callers render nothing rather
 * than a loading state.
 */
export function useQuejaContractRelations() {
  return useJsonFetch('/data/queja-contract-relations.json', EMPTY)
}

/**
 * Renderable links for a queja: Tier A / curator-approved only
 * (`requiresHumanApproval === false`). Tier-B suggestions are NEVER surfaced
 * publicly until promoted.
 */
export function relationsForQueja(data, quejaId) {
  return (data?.links || []).filter((l) => l.quejaId === quejaId && !l.requiresHumanApproval)
}

/** Renderable links for a contract (reverse direction — used by later views). */
export function relationsForTender(data, permalink) {
  return (data?.links || []).filter(
    (l) => l.tenderPermalink === permalink && !l.requiresHumanApproval,
  )
}

/**
 * Contract-side reverse view rows: the renderable links for a contract joined to
 * each queja's public description + category. `quejaItems` is the array from
 * useQuejas().data.items. Neutral by construction — the caller only ever gets
 * Tier-A / curator-approved links.
 */
export function relatedQuejasForContract(data, quejaItems, permalink) {
  const byId = new Map((quejaItems || []).map((q) => [q.service_request_id, q]))
  return relationsForTender(data, permalink).map((l) => {
    const qj = byId.get(l.quejaId)
    return {
      quejaId: l.quejaId,
      relationLabel: l.relationLabel,
      description: qj?.description || '',
      category: qj?.service_code || null,
    }
  })
}
