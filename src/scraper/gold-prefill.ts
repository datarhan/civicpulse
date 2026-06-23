/**
 * Gold-set prefill helpers (P0).
 *
 * Pure functions behind `scripts/eval-gold-prefill.ts`. The CLI draws a
 * stratified sample of real verified claims, prefills the current verdict +
 * evidence as a starting label, and merges into `tests/fixtures/verifier-gold.json`
 * without ever clobbering a row a human has already reviewed.
 */
import type { ClaimVerdict } from './claim-verifier'
import type { GoldRow } from './verifier-eval'

export interface VerifiedItemLike {
  claim: { id: string; type?: string; verbatim?: string }
  verification: { verdict: ClaimVerdict; evidence?: { ref: string }[] }
}

/** Deterministic [0,1) hash (FNV-1a) so sampling is stable without Math.random. */
function hash01(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return (h >>> 0) / 0xffffffff
}

function byClaimId(a: { claimId: string }, b: { claimId: string }): number {
  return a.claimId < b.claimId ? -1 : a.claimId > b.claimId ? 1 : 0
}

/**
 * Sample ~n items with coverage across every `verdict×type` bucket. Round-robin
 * over hash-sorted buckets, so rare verdicts (e.g. contradicho) are represented
 * rather than swamped by the sin-datos majority — better for evaluation than a
 * strictly proportional draw. Deterministic.
 */
export function stratifiedSample(items: VerifiedItemLike[], n: number): VerifiedItemLike[] {
  if (n >= items.length) return [...items]
  const buckets = new Map<string, VerifiedItemLike[]>()
  for (const it of items) {
    const key = `${it.verification.verdict}|${it.claim.type ?? 'unknown'}`
    const arr = buckets.get(key)
    if (arr) arr.push(it)
    else buckets.set(key, [it])
  }
  for (const arr of buckets.values()) arr.sort((x, y) => hash01(x.claim.id) - hash01(y.claim.id))
  const keys = [...buckets.keys()].sort()

  const selected: VerifiedItemLike[] = []
  let idx = 0
  while (selected.length < n) {
    let progressed = false
    for (const k of keys) {
      const arr = buckets.get(k)!
      if (arr.length > idx) {
        selected.push(arr[idx])
        progressed = true
        if (selected.length >= n) break
      }
    }
    if (!progressed) break
    idx++
  }
  return selected
}

/** Project a verified item into a prefilled (unreviewed) gold row. */
export function toGoldRow(it: VerifiedItemLike): GoldRow {
  const refs = (it.verification.evidence ?? []).map((e) => e.ref)
  return {
    claimId: it.claim.id,
    claimType: it.claim.type,
    verbatim: it.claim.verbatim,
    goldVerdict: it.verification.verdict,
    goldEvidenceRefs: refs.length > 0 ? refs : undefined,
    reviewed: false,
  }
}

/**
 * Idempotent merge by claimId: a `reviewed:true` row is sacred (kept verbatim),
 * an unreviewed row is refreshed from the fresh prefill, new rows are appended.
 * Output sorted by claimId for clean diffs.
 */
export function mergeGold(existing: GoldRow[], fresh: GoldRow[]): GoldRow[] {
  const byId = new Map<string, GoldRow>()
  for (const r of existing) byId.set(r.claimId, r)
  for (const f of fresh) {
    const prev = byId.get(f.claimId)
    if (prev?.reviewed) continue // never touch a human-reviewed label
    byId.set(f.claimId, f)
  }
  return [...byId.values()].sort(byClaimId)
}
