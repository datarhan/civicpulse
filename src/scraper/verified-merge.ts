/**
 * Base/overlay merge for pleno-claims-verified.json (P2, fixes audit R4/B5).
 *
 * The deterministic pass writes `pleno-claims-verified-base.json`; second-pass
 * runners (NLI/LLM) and curator downgrades write `pleno-claims-overlay.json`.
 * The published `pleno-claims-verified.json` is the pure merge of the two, so a
 * deterministic re-run rebuilds the base and re-applies the overlay — it can no
 * longer clobber second-pass or curator decisions.
 *
 * Pure module — no fs, no Date (callers pass timestamps). See
 * docs/superpowers/specs/2026-06-23-factcheck-rebuild-p2-design.md.
 */
import type { PlenoClaim } from './pleno-claim'
import type { ClaimVerdict, ClaimVerification } from './claim-verifier'

export interface VerifiedItem {
  claim: PlenoClaim
  verification: ClaimVerification
}

export type OverlaySource = 'nli' | 'llm' | 'curator-downgrade'

export interface OverlayEntry {
  verification: ClaimVerification
  source: OverlaySource
  /** Required (≥20 chars) for curator-downgrade entries. */
  reason?: string
  /** Curator name, for curator-downgrade entries. */
  editor?: string
  appliedAt: string
}

export interface Overlay {
  version: number
  generatedAt: string
  entries: Record<string, OverlayEntry>
}

/**
 * base items in their original order; for each, the overlay entry (matched by
 * claimId) replaces the verification when present. Overlay entries whose claimId
 * is absent from base are dropped (the claim was removed upstream).
 */
export function mergeVerified(baseItems: VerifiedItem[], overlay: Overlay): VerifiedItem[] {
  const entries = overlay?.entries ?? {}
  return baseItems.map((it) => {
    const e = entries[it.claim.id]
    return e ? { claim: it.claim, verification: e.verification } : it
  })
}

// Certainty rank for the three graded verdicts. `contradicho` is handled
// explicitly (it may only relax toward parcial/sin-datos). `promesa-repetida`
// is out of scope for the downgrade tool.
const RANK: Partial<Record<ClaimVerdict, number>> = {
  verificado: 3,
  parcial: 2,
  'sin-datos': 1,
}

/**
 * True iff moving `from`→`to` is a downgrade (toward less certainty). Used to
 * gate the curator CLI so it can never raise a verdict (libel-increasing).
 */
export function isDowngrade(from: ClaimVerdict, to: ClaimVerdict): boolean {
  if (from === to) return false
  if (to === 'contradicho' || to === 'promesa-repetida') return false // never a downgrade target
  if (from === 'contradicho') return to === 'parcial' || to === 'sin-datos'
  const a = RANK[from]
  const b = RANK[to]
  if (a == null || b == null) return false
  return b < a
}
