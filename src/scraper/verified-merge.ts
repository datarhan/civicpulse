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
import type { ClaimVerdict, ClaimVerification, ClaimEvidence } from './claim-verifier'

export interface VerifiedItem {
  claim: PlenoClaim
  verification: ClaimVerification
}

export type OverlaySource = 'nli' | 'llm' | 'curator-downgrade' | 'verdict-engine'

export interface OverlayEntry {
  verification: ClaimVerification
  source: OverlaySource
  /** Required (≥20 chars) for curator-downgrade AND verdict-engine entries. */
  reason?: string
  /** Curator name (curator-downgrade) or model id (verdict-engine). */
  editor?: string
  appliedAt: string
}

export interface Overlay {
  version: number
  generatedAt: string
  entries: Record<string, OverlayEntry>
}

/**
 * Remove exact-duplicate evidence rows (same kind + ref + snippet) within one
 * claim's evidence array, preserving first-seen order. The deterministic verifier
 * can match a single contract via more than one path (amount + text similarity),
 * pushing the same {kind,ref,snippet} row twice; the UI (/declaraciones,
 * /hallazgos) renders the first rows verbatim, so the dup surfaces as the same
 * citation shown twice. A shared snippet with a DIFFERENT ref is kept — those are
 * two genuinely distinct contracts that happen to share a title.
 */
export function dedupeEvidence(evidence: ClaimEvidence[]): ClaimEvidence[] {
  if (!Array.isArray(evidence) || evidence.length < 2) return evidence ?? []
  const seen = new Set<string>()
  const out: ClaimEvidence[] = []
  for (const e of evidence) {
    const key = JSON.stringify([e.kind, e.ref ?? '', (e.snippet ?? '').trim()])
    if (seen.has(key)) continue
    seen.add(key)
    out.push(e)
  }
  return out
}

/** Same verification when nothing was duplicated (keeps a byte-identical
 *  round-trip for un-affected claims); a fresh object with deduped evidence
 *  otherwise. Preserves key order so JSON output is stable. */
function withDedupedEvidence(v: ClaimVerification): ClaimVerification {
  const ev = v.evidence
  if (!Array.isArray(ev) || ev.length < 2) return v
  const deduped = dedupeEvidence(ev)
  return deduped.length === ev.length ? v : { ...v, evidence: deduped }
}

/**
 * base items in their original order; for each, the overlay entry (matched by
 * claimId) replaces the verification when present. Overlay entries whose claimId
 * is absent from base are dropped (the claim was removed upstream). Evidence is
 * deduped on the way out (base- AND overlay-origin), so the published monolith +
 * chunks never carry a citation twice.
 */
export function mergeVerified(baseItems: VerifiedItem[], overlay: Overlay): VerifiedItem[] {
  const entries = overlay?.entries ?? {}
  return baseItems.map((it) => {
    const e = entries[it.claim.id]
    const verification = withDedupedEvidence(e ? e.verification : it.verification)
    return verification === it.verification ? it : { claim: it.claim, verification }
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

export interface ApplyEntry {
  claimId: string
  verification: ClaimVerification
  source: OverlaySource
  reason?: string
  editor?: string
}

const VALID_SOURCES: OverlaySource[] = ['nli', 'llm', 'curator-downgrade', 'verdict-engine']

/** Throws on a malformed overlay (called on every write — defence in depth). */
export function validateOverlay(o: Overlay): void {
  if (!o || typeof o.version !== 'number' || !o.entries || typeof o.entries !== 'object') {
    throw new Error('[overlay] malformed: missing version/entries')
  }
  for (const [id, e] of Object.entries(o.entries)) {
    if (!e || typeof e !== 'object') throw new Error(`[overlay] ${id}: entry not an object`)
    if (!e.verification || typeof e.verification.verdict !== 'string') {
      throw new Error(`[overlay] ${id}: missing verification`)
    }
    if (!VALID_SOURCES.includes(e.source))
      throw new Error(`[overlay] ${id}: bad source ${e.source}`)
    if (typeof e.appliedAt !== 'string') throw new Error(`[overlay] ${id}: missing appliedAt`)
    if (e.source === 'curator-downgrade' && (!e.reason || e.reason.trim().length < 20)) {
      throw new Error(`[overlay] ${id}: curator-downgrade needs a reason of at least 20 chars`)
    }
    if (e.source === 'verdict-engine') {
      if (!e.reason || e.reason.trim().length < 20) {
        throw new Error(`[overlay] ${id}: verdict-engine needs a reason of at least 20 chars`)
      }
      if (e.verification.verdict === 'contradicho') {
        throw new Error(`[overlay] ${id}: verdict-engine may never emit contradicho`)
      }
    }
  }
}

/**
 * Add/overwrite overlay entries (pure — returns a new Overlay, input untouched).
 * `curator-downgrade` entries are gated: reason ≥20 chars AND the move must be a
 * real downgrade vs the base verdict (`baseVerdict` lookup required).
 */
export function applyOverlayEntries(
  overlay: Overlay,
  entries: ApplyEntry[],
  stampIso: string,
  baseVerdict?: Map<string, ClaimVerdict>,
): Overlay {
  const next: Overlay = {
    version: overlay?.version ?? 1,
    generatedAt: stampIso,
    entries: { ...(overlay?.entries ?? {}) },
  }
  for (const e of entries) {
    if (e.source === 'curator-downgrade') {
      if (!e.reason || e.reason.trim().length < 20) {
        throw new Error(
          `[overlay] ${e.claimId}: curator-downgrade needs a reason of at least 20 chars`,
        )
      }
      const from = baseVerdict?.get(e.claimId)
      if (!from) throw new Error(`[overlay] ${e.claimId}: not found in base — cannot downgrade`)
      if (!isDowngrade(from, e.verification.verdict)) {
        throw new Error(
          `[overlay] ${e.claimId}: ${from} → ${e.verification.verdict} is not a downgrade`,
        )
      }
    }
    if (e.source === 'verdict-engine') {
      // Re-derivation by the local engine. Downgrade-only policy is enforced by
      // the runner (vs the current published verdict); here we guard the
      // invariants: a grounded reason, and never contradicho.
      if (!e.reason || e.reason.trim().length < 20) {
        throw new Error(
          `[overlay] ${e.claimId}: verdict-engine needs a reason of at least 20 chars`,
        )
      }
      if (e.verification.verdict === 'contradicho') {
        throw new Error(`[overlay] ${e.claimId}: verdict-engine may never emit contradicho`)
      }
    }
    next.entries[e.claimId] = {
      verification: e.verification,
      source: e.source,
      ...(e.reason ? { reason: e.reason } : {}),
      ...(e.editor ? { editor: e.editor } : {}),
      appliedAt: stampIso,
    }
  }
  validateOverlay(next)
  return next
}
