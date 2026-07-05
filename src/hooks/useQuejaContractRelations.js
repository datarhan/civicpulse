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

const EMPTY_APPROVALS = { approvals: [] }

/**
 * Curator-promoted Tier-B approvals (public/data/queja-contract-relations-
 * approved.json). Separate, human-curated file the nightly scraper never
 * touches — so a promotion survives regeneration of the machine snapshot.
 */
export function useQuejaRelationApprovals() {
  return useJsonFetch('/data/queja-contract-relations-approved.json', EMPTY_APPROVALS)
}

/** True when a curator has approved this exact (queja, contract) pair. */
export function isApproved(approvals, quejaId, tenderId) {
  return (approvals || []).some((a) => a.quejaId === quejaId && a.tenderId === tenderId)
}

/** A link is renderable when it's Tier A (not gated) OR curator-approved. */
function renderable(l, approvals) {
  return !l.requiresHumanApproval || isApproved(approvals, l.quejaId, l.tenderId)
}

/**
 * Renderable links for a queja: Tier A + any curator-approved Tier B. Un-approved
 * Tier-B suggestions are NEVER surfaced publicly.
 */
export function relationsForQueja(data, quejaId, approvals = []) {
  return (data?.links || []).filter((l) => l.quejaId === quejaId && renderable(l, approvals))
}

/** Renderable links for a contract (reverse direction). */
export function relationsForTender(data, permalink, approvals = []) {
  return (data?.links || []).filter(
    (l) => l.tenderPermalink === permalink && renderable(l, approvals),
  )
}

/**
 * Contract-side reverse view rows: the renderable links for a contract joined to
 * each queja's public description + category. `quejaItems` is the array from
 * useQuejas().data.items. Neutral by construction — the caller only ever gets
 * Tier-A / curator-approved links.
 */
export function relatedQuejasForContract(data, quejaItems, permalink, approvals = []) {
  const byId = new Map((quejaItems || []).map((q) => [q.service_request_id, q]))
  return relationsForTender(data, permalink, approvals).map((l) => {
    const qj = byId.get(l.quejaId)
    return {
      quejaId: l.quejaId,
      relationLabel: l.relationLabel,
      description: qj?.description || '',
      category: qj?.service_code || null,
    }
  })
}
