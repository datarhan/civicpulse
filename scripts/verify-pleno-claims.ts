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
import { BASE, rebuildVerified } from './verified-rebuild'

const CLAIMS = resolve('public/data/pleno-claims-suggestions.json')
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
  const [tenders, tendersTed, bdns, budget, promises] = await Promise.all([
    loadIfExists('tenders.json'),
    loadIfExists('tenders-ted.json'),
    loadIfExists('bdns.json'),
    loadIfExists('budget.json'),
    loadIfExists('promises.json'),
  ])

  // tendersTed: EU TED notices merged into the amount cross-ref (audit R3 — the
  // production runner used to omit them, so EU-threshold/DANA/NextGen contracts
  // read as sin-datos). priorClaims feeds the promesa-repetida audit trail.
  const verifications: ClaimVerification[] = claims.items.map((c) =>
    verifyClaim({
      claim: c,
      tenders,
      tendersTed,
      bdns,
      budget,
      promises,
      priorClaims: claims.items,
    }),
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
  // Write the deterministic BASE. The published verified.json is base ⊕ overlay
  // (second-pass + curator decisions), rebuilt below — so re-running this never
  // clobbers those decisions (audit R4/B5).
  writeFileSync(BASE, JSON.stringify(out, null, 2) + '\n')
  process.stdout.write(
    `[verify] ${verifications.length} claims · ` +
      Object.entries(byVerdict)
        .filter(([, n]) => n > 0)
        .map(([k, n]) => `${k}:${n}`)
        .join(' · ') +
      ` → base\n`,
  )
  // `--base-only`: escribir el base y PARAR.
  //
  // Existe para CI, y sólo para CI. El base está gitignorado —8,6 MB
  // reproducibles— así que un runner recién clonado no lo tiene, y desde el
  // 2026-08-11 tres ficheros de prueba y `compute:finding-quote-provenance` lo
  // exigen: la nocturna llevaba tres noches roja y el despliegue bloqueado por
  // eso. CI necesita que el fichero EXISTA; no necesita republicar nada.
  //
  // Sin la bandera, esto reescribe además verified.json, los trozos que lee la
  // SPA y factcheck.json, que sí están committeados. Que la nocturna empiece a
  // republicar verdictos cada madrugada es una decisión editorial —los verdictos
  // pueden subir, no sólo bajar— y no algo que deba colarse de rebote al
  // arreglar un runner. Se decide aparte o no se decide.
  if (process.argv.includes('--base-only')) {
    process.stdout.write('[verify]   --base-only: no se tocan verified.json ni los trozos\n')
    return
  }

  // Merge base ⊕ overlay → verified.json + chunks (the SPA reads the chunks).
  try {
    const r = await rebuildVerified()
    process.stdout.write(
      `[verify]   merged base ⊕ overlay (${r.overlayApplied} overlay entries) → verified.json + chunks\n`,
    )
  } catch (err) {
    process.stderr.write(
      `[verify]   rebuild FAILED: ${err instanceof Error ? err.message : String(err)}\n`,
    )
  }
}

main().catch((err) => {
  process.stderr.write(`[verify] FATAL: ${err instanceof Error ? err.message : String(err)}\n`)
  process.exit(1)
})
