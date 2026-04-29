/**
 * Run the deterministic verifier over every claim in
 * public/data/pleno-claims-suggestions.json and write a parallel file
 * public/data/pleno-claims-verified.json carrying verdicts + evidence
 * citations alongside each claim.
 *
 *   npm run verify:pleno-claims
 *
 * Pure local pass — no LLM, no network. Rebuild from scratch every run so
 * a dataset refresh (e.g. new tenders) re-evaluates every claim.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import type { PlenoClaim } from '../src/scraper/pleno-claim'
import {
  verifyClaim,
  type ClaimVerification,
  type ClaimVerdict,
} from '../src/scraper/claim-verifier'

const CLAIMS = resolve('public/data/pleno-claims-suggestions.json')
const OUT = resolve('public/data/pleno-claims-verified.json')
const DATA = resolve('public/data')

function loadIfExists(name: string): unknown {
  const p = resolve(DATA, name)
  if (!existsSync(p)) return null
  return JSON.parse(readFileSync(p, 'utf8'))
}

async function main() {
  if (!existsSync(CLAIMS)) {
    process.stderr.write(
      '[verify] ' + CLAIMS + ' not found — run `npm run extract:pleno-claims -- <plenoId>` first\n',
    )
    process.exit(1)
  }

  const claims = JSON.parse(readFileSync(CLAIMS, 'utf8')) as { items: PlenoClaim[] }
  const [tenders, bdns, budget, promises] = await Promise.all([
    loadIfExists('tenders.json'),
    loadIfExists('bdns.json'),
    loadIfExists('budget.json'),
    loadIfExists('promises.json'),
  ])

  const verifications: ClaimVerification[] = claims.items.map((c) =>
    verifyClaim({ claim: c, tenders, bdns, budget, promises }),
  )

  const byVerdict: Record<ClaimVerdict, number> = {
    verificado: 0,
    parcial: 0,
    contradicho: 0,
    'sin-datos': 0,
    'promesa-repetida': 0,
  }
  for (const v of verifications) byVerdict[v.verdict] = (byVerdict[v.verdict] ?? 0) + 1

  // Zip claims + verifications so the UI can render them together in one
  // pass. Keep claims list ordering for stability.
  const items = claims.items.map((c, i) => ({
    claim: c,
    verification: verifications[i],
  }))

  const out = {
    generatedAt: new Date().toISOString(),
    source: {
      description:
        'Fact-check verdicts for every pleno-claims-suggestions.json entry. Cross-references against tenders / BDNS / budget / promises. Pure deterministic — no LLM judgement.',
      contract:
        'Machine-written verdicts; a curator reviews before surfacing contradicho or promesa-repetida editorially.',
    },
    stats: {
      total: verifications.length,
      byVerdict,
    },
    items,
  }
  writeFileSync(OUT, JSON.stringify(out, null, 2) + '\n')
  process.stdout.write(
    `[verify] ${verifications.length} claims · ` +
      Object.entries(byVerdict)
        .filter(([, n]) => n > 0)
        .map(([k, n]) => `${k}:${n}`)
        .join(' · ') +
      ` → ${OUT}\n`,
  )
  // Refresh the per-pleno chunks the SPA reads. The monolith above
  // remains the canonical source for CLIs (auto-curate, promote-claim,
  // …) where 7 MB doesn't matter; the chunks are what the browser
  // hits via /data/pleno-claims/. See src/scraper/pleno-claims-chunks.ts.
  try {
    const { rewriteChunksFromMonolith } = await import('./chunk-pleno-claims')
    const r = rewriteChunksFromMonolith()
    process.stdout.write(
      `[verify]   chunks: ${r.written} written · ${r.removed} stale pruned · manifest=${r.manifestBytes}B\n`,
    )
  } catch (err) {
    // Don't break verify if the chunker fails — the SPA will fall back
    // to the legacy monolith path until the curator re-runs the chunker.
    process.stderr.write(
      `[verify]   chunk refresh FAILED: ${err instanceof Error ? err.message : String(err)}\n`,
    )
  }
}

main().catch((err) => {
  process.stderr.write(`[verify] FATAL: ${err instanceof Error ? err.message : String(err)}\n`)
  process.exit(1)
})
