/**
 * The editorial gate for the PUBLIC pleno claim ledger — single source
 * of truth for what the machine-extracted verifier output may surface
 * to the public. Applied at build time (chunker) so `hidden` verbatim
 * never enters a deployed file, and again client-side as defense-in-depth.
 *
 * Policy (see
 * docs/superpowers/specs/2026-06-21-plenos-claim-ledger-editorial-gate-design.md):
 *   hidden  — any acusacion_publica that is opinativa OR not data-grounded;
 *             any machine-assigned `contradicho` (see below)
 *   toggle  — non-accusation claims that are not data-grounded (sin-datos)
 *   shown   — data-grounded claims of any type (incl. data-backed accusations)
 *
 * Fail-safe: anything not explicitly data-grounded is hidden (accusations)
 * or toggled (everything else) — a new type/verdict can never default to shown.
 */
import type { VerifiedClaimItem } from './pleno-claims-chunks'

export type ClaimVisibility = 'shown' | 'toggle' | 'hidden'

/** Verdicts that mean the verifier found corroborating/contradicting data. */
export const DATA_GROUNDED_VERDICTS: ReadonlySet<string> = new Set([
  'verificado',
  'parcial',
  'contradicho',
  'promesa-repetida',
])

/**
 * `contradicho` says "this councillor stated something the municipal record
 * contradicts". It is the most accusatory verdict the machine can assign and
 * the one the deterministic matcher is worst at, because it fires on a strong
 * NAME match with a mismatched amount — which is also what an unrelated
 * contract looks like.
 *
 * Real example from the run that prompted this gate: a councillor said the
 * Generalitat would approve «2.364 millones para la dana». The matcher scored
 * the entity hint "dana" against a municipal contract for clearing rubble and
 * published `contradicho` — a €2.36bn regional budget line "refuted" by a
 * town rubble-removal job. The claim is not even about municipal spending.
 *
 * So a machine `contradicho` is a lead for a curator, not a publishable
 * verdict. It stays in the snapshot (the CLIs and /curator read it) and is
 * withheld from the public ledger. A curator publishes it by promoting the
 * claim into a finding, which is where the human judgement already lives.
 *
 * That last sentence is the whole design, and it has a corollary the
 * auto-curator broke for months: promotion into a finding is the sanctioned way
 * PAST this gate precisely because a person is standing in it. A machine that
 * promotes a gated claim has not satisfied the exception, it has walked around
 * the gate — and lands the withheld verbatim on `/hallazgos`, a page with no
 * toggle and no gate of its own. `selectBundles` in auto-curate.ts therefore
 * bundles `shown` claims only.
 */
function isCuratorPromoted(item: ClaimVisibilityInput): boolean {
  const src = item?.verification?.source
  return src === 'curator' || src === 'curator-downgrade'
}

/**
 * The four fields the gate reads, and nothing else.
 *
 * Structural and `unknown`-leaved so every caller — the chunker, the SPA, the
 * verifiers and the auto-curator — passes its own item shape directly. The
 * alternative was what two call sites already did, `classifyClaimVisibility(it
 * as never)`: a cast that satisfies the compiler by switching it off, on the
 * one function in this repo whose whole job is to fail safe. Widening the
 * parameter is what makes the cast unnecessary rather than merely unwritten.
 *
 * Never narrow this to a concrete snapshot type and never let a caller build an
 * adapter object out of the fields it thinks the gate reads — restating a shape
 * is how six suites here stayed green while matching nothing, and here it would
 * fail OPEN: a field added below that the adapter does not forward arrives as
 * `undefined` and the claim is published.
 */
export interface ClaimVisibilityInput {
  claim?: { type?: unknown; accusationSubtype?: unknown } | null
  verification?: { verdict?: unknown; source?: unknown } | null
}

export function classifyClaimVisibility(item: ClaimVisibilityInput): ClaimVisibility {
  const verdict = item?.verification?.verdict
  if (verdict === 'contradicho' && !isCuratorPromoted(item)) return 'hidden'
  const grounded = typeof verdict === 'string' && DATA_GROUNDED_VERDICTS.has(verdict)
  if (item?.claim?.type === 'acusacion_publica') {
    const subtype = item.claim.accusationSubtype ?? 'opinativa' // safe default
    if (subtype === 'opinativa') return 'hidden'
    return grounded ? 'shown' : 'hidden'
  }
  return grounded ? 'shown' : 'toggle'
}

export interface GatedItem extends VerifiedClaimItem {
  visibility: ClaimVisibility
}

/**
 * Drop `hidden` items and stamp each survivor with its visibility.
 * The chunker calls this before writing public chunks.
 */
export function gateItemsForPublic(items: VerifiedClaimItem[]): GatedItem[] {
  const out: GatedItem[] = []
  for (const it of items ?? []) {
    const visibility = classifyClaimVisibility(it)
    if (visibility === 'hidden') continue
    out.push({ ...it, visibility })
  }
  return out
}
