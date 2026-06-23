/**
 * Rebuild the published pleno-claims-verified.json from the deterministic base
 * + the second-pass/curator overlay (P2). IO orchestrator — pure merge logic
 * lives in src/scraper/verified-merge.ts.
 *
 *   base (pleno-claims-verified-base.json, gitignored — reproducible)
 *   ⊕ overlay (pleno-claims-overlay.json, committed — precious)
 *   → pleno-claims-verified.json (published monolith) → chunks
 *
 * generatedAt is preserved from the base (when the deterministic verdicts were
 * computed); the overlay tracks its own timestamp. So a migration that seeds the
 * base verbatim from the current verified.json round-trips to a byte-identical
 * verified.json.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  mergeVerified,
  validateOverlay,
  type Overlay,
  type VerifiedItem,
} from '../src/scraper/verified-merge'
import type { ClaimVerdict } from '../src/scraper/claim-verifier'

const DATA = resolve('public/data')
export const BASE = resolve(DATA, 'pleno-claims-verified-base.json')
export const OVERLAY = resolve(DATA, 'pleno-claims-overlay.json')
export const VERIFIED = resolve(DATA, 'pleno-claims-verified.json')

interface Snapshot {
  generatedAt: string
  source?: unknown
  stats?: unknown
  items: VerifiedItem[]
}

export function loadOverlay(): Overlay {
  if (!existsSync(OVERLAY)) return { version: 1, generatedAt: '', entries: {} }
  const o = JSON.parse(readFileSync(OVERLAY, 'utf8')) as Overlay
  validateOverlay(o)
  return o
}

export async function rebuildVerified(
  opts: { refreshChunks?: boolean } = {},
): Promise<{ total: number; byVerdict: Record<ClaimVerdict, number>; overlayApplied: number }> {
  if (!existsSync(BASE)) {
    throw new Error(
      `[rebuild] ${BASE} missing — run \`npm run migrate:verified-split\` or \`npm run verify:pleno-claims\``,
    )
  }
  const base = JSON.parse(readFileSync(BASE, 'utf8')) as Snapshot
  const overlay = loadOverlay()
  const items = mergeVerified(base.items, overlay)

  const byVerdict: Record<ClaimVerdict, number> = {
    verificado: 0,
    parcial: 0,
    contradicho: 0,
    'sin-datos': 0,
    'promesa-repetida': 0,
  }
  for (const it of items)
    byVerdict[it.verification.verdict] = (byVerdict[it.verification.verdict] ?? 0) + 1

  const out = {
    generatedAt: base.generatedAt,
    source: base.source,
    stats: { total: items.length, byVerdict },
    items,
  }
  writeFileSync(VERIFIED, JSON.stringify(out, null, 2) + '\n')

  const baseIds = new Set(base.items.map((it) => it.claim.id))
  const overlayApplied = Object.keys(overlay.entries).filter((id) => baseIds.has(id)).length

  if (opts.refreshChunks !== false) {
    const { rewriteChunksFromMonolith } = await import('./chunk-pleno-claims')
    rewriteChunksFromMonolith()
  }
  return { total: items.length, byVerdict, overlayApplied }
}
