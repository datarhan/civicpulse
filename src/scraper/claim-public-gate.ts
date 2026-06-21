/**
 * The editorial gate for the PUBLIC pleno claim ledger — single source
 * of truth for what the machine-extracted verifier output may surface
 * to the public. Applied at build time (chunker) so `hidden` verbatim
 * never enters a deployed file, and again client-side as defense-in-depth.
 *
 * Policy (see
 * docs/superpowers/specs/2026-06-21-plenos-claim-ledger-editorial-gate-design.md):
 *   hidden  — any acusacion_publica that is opinativa OR not data-grounded
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

export function classifyClaimVisibility(
  item: Pick<VerifiedClaimItem, 'claim' | 'verification'>,
): ClaimVisibility {
  const verdict = item?.verification?.verdict
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
