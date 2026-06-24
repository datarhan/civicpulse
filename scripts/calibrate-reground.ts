/**
 * Calibrate REGROUND_THRESHOLDS against the reviewed gold (P2.5).
 *
 *   npm run calibrate:reground
 *
 * For every gold claim whose SHIPPED verdict is verificado/parcial/contradicho
 * with evidence, computes the NLI maxEntail / maxContra of its cited evidence and
 * labels it shouldFlag = "the reviewer downgraded it" (isDowngrade(shipped, gold)).
 * Then sweeps the entail threshold to find the best flag/keep separation, so the
 * gate flags the over-claims without burying the curator in false positives.
 * Requires the NLI venv. Pure analysis — writes nothing.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { scoreNliPairs, type NliPair } from '../src/scraper/nli-client'
import { isDowngrade } from '../src/scraper/verified-merge'
import type { ClaimVerdict, ClaimVerification } from '../src/scraper/claim-verifier'
import type { GoldRow } from '../src/scraper/verifier-eval'

const TARGET = new Set<ClaimVerdict>(['verificado', 'parcial', 'contradicho'])

interface Row {
  claimId: string
  shipped: ClaimVerdict
  gold: ClaimVerdict
  shouldFlag: boolean
  maxEntail: number
  maxContra: number
}

async function main() {
  const gold = (
    JSON.parse(readFileSync(resolve('tests/fixtures/verifier-gold.json'), 'utf8')).rows as GoldRow[]
  ).filter((g) => g.reviewed)
  const ver = JSON.parse(
    readFileSync(resolve('public/data/pleno-claims-verified.json'), 'utf8'),
  ) as {
    items: { claim: { id: string; verbatim: string }; verification: ClaimVerification }[]
  }
  const byId = new Map(ver.items.map((it) => [it.claim.id, it]))

  const rows: Row[] = []
  const pairs: NliPair[] = []
  for (const g of gold) {
    const it = byId.get(g.claimId)
    if (!it) continue
    const shipped = it.verification.verdict
    if (!TARGET.has(shipped)) continue
    const ev = it.verification.evidence ?? []
    if (ev.length === 0) continue
    rows.push({
      claimId: g.claimId,
      shipped,
      gold: g.goldVerdict,
      shouldFlag: isDowngrade(shipped, g.goldVerdict),
      maxEntail: 0,
      maxContra: 0,
    })
    ev.forEach((e, i) =>
      pairs.push({ id: `${g.claimId}#${i}`, premise: e.snippet, hypothesis: it.claim.verbatim }),
    )
  }

  const scores = await scoreNliPairs(pairs)
  for (const r of rows) {
    const it = byId.get(r.claimId)!
    const ev = it.verification.evidence ?? []
    r.maxEntail = Math.max(0, ...ev.map((_, i) => scores.get(`${r.claimId}#${i}`)?.entailment ?? 0))
    r.maxContra = Math.max(
      0,
      ...ev.map((_, i) => scores.get(`${r.claimId}#${i}`)?.contradiction ?? 0),
    )
  }

  const vp = rows.filter((r) => r.shipped === 'verificado' || r.shipped === 'parcial')
  process.stdout.write(
    `\n=== verificado/parcial: ${vp.length} rows (${vp.filter((r) => r.shouldFlag).length} should-flag / ${vp.filter((r) => !r.shouldFlag).length} keep) ===\n`,
  )
  process.stdout.write('τ_entail | flag-precision | flag-recall | tp fp fn tn\n')
  for (const tau of [0.05, 0.1, 0.15, 0.2, 0.25, 0.3, 0.4, 0.5]) {
    let tp = 0
    let fp = 0
    let fn = 0
    let tn = 0
    for (const r of vp) {
      const flagged = r.maxEntail < tau
      if (flagged && r.shouldFlag) tp++
      else if (flagged && !r.shouldFlag) fp++
      else if (!flagged && r.shouldFlag) fn++
      else tn++
    }
    const prec = tp + fp ? tp / (tp + fp) : 0
    const rec = tp + fn ? tp / (tp + fn) : 0
    process.stdout.write(
      `  ${tau.toFixed(2)}   |     ${prec.toFixed(2)}      |    ${rec.toFixed(2)}    | ${tp} ${fp} ${fn} ${tn}\n`,
    )
  }

  const contra = rows.filter((r) => r.shipped === 'contradicho')
  process.stdout.write(
    `\n=== contradicho: ${contra.length} rows (${contra.filter((r) => r.shouldFlag).length} should-flag) ===\n`,
  )
  process.stdout.write(
    'maxContra per contradicho: ' +
      contra.map((r) => `${r.maxContra.toFixed(2)}(${r.shouldFlag ? 'flag' : 'keep'})`).join(' ') +
      '\n',
  )

  process.stdout.write('\n=== per-row (verificado/parcial) ===\n')
  for (const r of vp.sort((a, b) => a.maxEntail - b.maxEntail)) {
    process.stdout.write(
      `  ${r.shipped}→${r.gold} ${r.shouldFlag ? 'SHOULD-FLAG' : 'keep      '} entail=${r.maxEntail.toFixed(2)} contra=${r.maxContra.toFixed(2)}  ${r.claimId}\n`,
    )
  }
}

main().catch((err) => {
  process.stderr.write(`[calibrate] FATAL: ${err instanceof Error ? err.message : String(err)}\n`)
  process.exit(1)
})
