/**
 * Base/overlay merge for pleno-claims-verified.json (P2, fixes audit R4/B5).
 *
 * The deterministic pass writes `pleno-claims-verified-base.json`; second-pass
 * runners (NLI/LLM) and curator downgrades write `pleno-claims-overlay.json`.
 * The published `pleno-claims-verified.json` is the pure merge of the two, so a
 * deterministic re-run rebuilds the base and re-applies the overlay — it can no
 * longer clobber second-pass or curator decisions.
 *
 * A third, optional layer joined later: `pleno-claim-reclassifications.json`,
 * the curator sidecar for a claim whose TYPE the extractor got wrong (the
 * overlay owns verdicts and deliberately cannot touch the claim). Same merge
 * discipline: the base stays machine-reproducible, the sidecar is committed and
 * precious, and any rebuild re-applies it.
 *
 * Pure module — no fs, no Date (callers pass timestamps). See
 * docs/superpowers/specs/2026-06-23-factcheck-rebuild-p2-design.md.
 */
import { ALLOWED_CLAIM_TYPES, type ClaimType, type PlenoClaim } from './pleno-claim'
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
 * One curator type-correction. `from` records the published type the curator
 * moved away from — the entry corrects a SPECIFIC observed state, so a base
 * whose type moved upstream makes the entry stale (skipped, counted) rather
 * than silently re-applied to something the curator never judged.
 */
export interface ReclassificationEntry {
  /** The corrected claim type. Never 'acusacion_publica'. */
  type: ClaimType
  /** The published type this correction moved away from (audit trail). */
  from: ClaimType
  /** Curator's grounds, ≥20 chars. */
  reason: string
  /** Curator name. */
  editor?: string
  appliedAt: string
}

export interface Reclassifications {
  version: number
  generatedAt: string
  entries: Record<string, ReclassificationEntry>
}

/**
 * Reclassify one claim object: type replaced, `accusationSubtype` dropped (the
 * schema defines it only for accusations), every other field — id included —
 * untouched. Key order is preserved so JSON output stays byte-stable.
 */
function reclassifiedClaim(claim: PlenoClaim, type: ClaimType): PlenoClaim {
  const { accusationSubtype: _dropped, ...rest } = claim
  return { ...rest, type }
}

/**
 * base items in their original order; for each, the overlay entry (matched by
 * claimId) replaces the verification when present, and the reclassification
 * entry (matched by claimId, and only while `claim.type` still equals the
 * recorded `from`) replaces the claim's type. Entries whose claimId is absent
 * from base are dropped (the claim was removed upstream). Evidence is deduped
 * on the way out (base- AND overlay-origin), so the published monolith + chunks
 * never carry a citation twice.
 */
export function mergeVerified(
  baseItems: VerifiedItem[],
  overlay: Overlay,
  reclassifications?: Reclassifications,
): VerifiedItem[] {
  const entries = overlay?.entries ?? {}
  const reclas = reclassifications?.entries ?? {}
  return baseItems.map((it) => {
    const e = entries[it.claim.id]
    const verification = withDedupedEvidence(e ? e.verification : it.verification)
    const r = reclas[it.claim.id]
    const claim =
      r != null && it.claim.type === r.from ? reclassifiedClaim(it.claim, r.type) : it.claim
    return verification === it.verification && claim === it.claim ? it : { claim, verification }
  })
}

/**
 * What a merge run did with each reclassification entry — the three outcomes,
 * counted apart (DATA_INTEGRITY rule 2: folding «not attempted» into
 * «unchanged» is how a pass once reported work it never did).
 */
export function reclassificationOutcomes(
  baseItems: VerifiedItem[],
  reclassifications: Reclassifications,
): { aplicadas: string[]; obsoletas: string[]; sinClaim: string[] } {
  const byId = new Map(baseItems.map((it) => [it.claim.id, it]))
  const aplicadas: string[] = []
  const obsoletas: string[] = []
  const sinClaim: string[] = []
  for (const [id, e] of Object.entries(reclassifications?.entries ?? {})) {
    const item = byId.get(id)
    if (item == null) sinClaim.push(id)
    else if (item.claim.type !== e.from) obsoletas.push(id)
    else aplicadas.push(id)
  }
  return { aplicadas, obsoletas, sinClaim }
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

/**
 * Throws on a malformed reclassification sidecar (called on every write AND on
 * every read by the rebuild loader — defence in depth, like `validateOverlay`).
 * The one rule with legal weight is wired here where no caller can skip it:
 * a reclassification may never point TOWARD `acusacion_publica`. Raising a
 * statement into an accusation is libel-increasing, the exact move the overlay
 * forbids for verdicts with `isDowngrade`.
 */
export function validateReclassifications(r: Reclassifications): void {
  if (!r || typeof r.version !== 'number' || !r.entries || typeof r.entries !== 'object') {
    throw new Error('[reclas] malformed: missing version/entries')
  }
  for (const [id, e] of Object.entries(r.entries)) {
    if (!e || typeof e !== 'object') throw new Error(`[reclas] ${id}: entry not an object`)
    if (!ALLOWED_CLAIM_TYPES.includes(e.type)) {
      throw new Error(`[reclas] ${id}: type ${String(e.type)} is outside ClaimType`)
    }
    if (e.type === 'acusacion_publica') {
      throw new Error(`[reclas] ${id}: reclassifying TOWARD acusacion_publica is forbidden`)
    }
    if (!ALLOWED_CLAIM_TYPES.includes(e.from)) {
      throw new Error(`[reclas] ${id}: from ${String(e.from)} is outside ClaimType`)
    }
    if (!e.reason || e.reason.trim().length < 20) {
      throw new Error(`[reclas] ${id}: needs a reason of at least 20 chars`)
    }
    if (typeof e.appliedAt !== 'string') throw new Error(`[reclas] ${id}: missing appliedAt`)
  }
}

export interface ApplyReclassification {
  claimId: string
  type: ClaimType
  reason: string
  editor?: string
}

/**
 * Add/overwrite reclassification entries (pure — returns a new sidecar, input
 * untouched). Gated against the PUBLISHED corpus the caller passes in: the
 * claim must exist, and v1 only moves AWAY from `acusacion_publica` — the one
 * observed failure class (the extractor shoehorns debate speech into the
 * accusation bucket). Widen when a real case of another wrong type shows up.
 */
export function applyReclassificationEntries(
  reclassifications: Reclassifications,
  entries: ApplyReclassification[],
  stampIso: string,
  publishedTypes: Map<string, ClaimType>,
): Reclassifications {
  const next: Reclassifications = {
    version: reclassifications?.version ?? 1,
    generatedAt: stampIso,
    entries: { ...(reclassifications?.entries ?? {}) },
  }
  for (const e of entries) {
    if (!e.reason || e.reason.trim().length < 20) {
      throw new Error(`[reclas] ${e.claimId}: needs a reason of at least 20 chars`)
    }
    if (e.type === 'acusacion_publica') {
      throw new Error(`[reclas] ${e.claimId}: reclassifying TOWARD acusacion_publica is forbidden`)
    }
    if (!ALLOWED_CLAIM_TYPES.includes(e.type)) {
      throw new Error(`[reclas] ${e.claimId}: type ${String(e.type)} is outside ClaimType`)
    }
    const from = publishedTypes.get(e.claimId)
    if (!from) throw new Error(`[reclas] ${e.claimId}: not found in the published corpus`)
    if (from !== 'acusacion_publica') {
      throw new Error(
        `[reclas] ${e.claimId}: published type is ${from} — v1 only moves away from acusacion_publica`,
      )
    }
    next.entries[e.claimId] = {
      type: e.type,
      from,
      reason: e.reason,
      ...(e.editor ? { editor: e.editor } : {}),
      appliedAt: stampIso,
    }
  }
  validateReclassifications(next)
  return next
}
