#!/usr/bin/env tsx
/**
 * One-shot A/B: re-run the LLM second-pass verifier (now prompt v2 +
 * cite-grounding) against rows that were upgraded by an EARLIER run
 * (prompt v1, no grounding), and report what changes.
 *
 * Read-only — does NOT mutate pleno-claims-verified.json.
 *
 *   npx tsx scripts/ab-verifier-prompt.ts --plenoId 1tgd1h4 --max 20
 */
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import type { PlenoClaim } from '../src/scraper/pleno-claim'
import {
  getShortlist,
  type ClaimVerification,
  type VerifierInputs,
} from '../src/scraper/claim-verifier'
import { verifyClaimWithLlm } from '../src/scraper/claim-verifier-llm'
import { resetBudget, loadConfigFromEnv } from '../src/llm/client'

const VERIFIED = resolve('public/data/pleno-claims-verified.json')
const DATA = resolve('public/data')

interface VerifiedRow {
  claim: PlenoClaim
  verification: ClaimVerification
}

function loadIfExists(name: string): unknown {
  const p = resolve(DATA, name)
  if (!existsSync(p)) return null
  return JSON.parse(readFileSync(p, 'utf8'))
}

function parseArgs(argv: string[]) {
  const out = { plenoId: null as string | null, max: 20 }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--plenoId') out.plenoId = argv[++i]
    else if (a === '--max') out.max = Number(argv[++i])
  }
  return out
}

async function main() {
  const opts = parseArgs(process.argv.slice(2))
  // agy, not the retired gemini CLI — see loadConfigFromEnv's cascade comment.
  if (!process.env.LLM_BACKEND) process.env.LLM_BACKEND = 'agy'
  resetBudget()
  const cfg = loadConfigFromEnv()
  process.stdout.write(
    `[ab] backend=${cfg.backend} · plenoId=${opts.plenoId ?? '*'} · max=${opts.max}\n`,
  )

  const snap = JSON.parse(readFileSync(VERIFIED, 'utf8')) as { items: VerifiedRow[] }
  const tenders = loadIfExists('tenders.json')
  const bdns = loadIfExists('bdns.json')
  const budget = loadIfExists('budget.json')
  const promises = loadIfExists('promises.json')

  // Pick rows that were upgraded by the LLM second pass before prompt v2.
  const targets = snap.items.filter(
    (it) =>
      it.verification.verdict !== 'sin-datos' &&
      it.verification.checkedAgainst?.includes('llm-second-pass') &&
      (!opts.plenoId || it.claim.plenoId === opts.plenoId),
  )
  const sample = targets.slice(0, opts.max)
  process.stdout.write(`[ab] sampling ${sample.length} previously-LLM-upgraded rows\n\n`)

  const tally = {
    same: 0,
    changed: 0,
    upgradedV1Now_sinDatos: 0, // v1 said verificado/parcial, v2 rejected → sin-datos
    rejectedMissingCite: 0,
    rejectedCiteNotInSnippet: 0,
    rejectedOutOfRange: 0,
    acceptedEvidence: 0,
  }

  for (const row of sample) {
    const inputs: VerifierInputs = { claim: row.claim, tenders, bdns, budget, promises }
    const shortlist = await getShortlist(inputs, 8)
    if (shortlist.length === 0) continue
    const r = await verifyClaimWithLlm({ claim: row.claim, candidates: shortlist })
    if (!r) continue
    tally.rejectedMissingCite += r.rejectedReasons.missingCite
    tally.rejectedCiteNotInSnippet += r.rejectedReasons.citeNotInSnippet
    tally.rejectedOutOfRange += r.rejectedReasons.outOfRange
    tally.acceptedEvidence += r.acceptedIndexes.length

    const oldVerdict = row.verification.verdict
    const newVerdict = r.verification.verdict
    const same = oldVerdict === newVerdict
    if (same) tally.same += 1
    else tally.changed += 1
    if (oldVerdict !== 'sin-datos' && newVerdict === 'sin-datos') tally.upgradedV1Now_sinDatos += 1

    process.stdout.write(
      `[${same ? 'KEEP' : 'CHANGE'}] ${oldVerdict} → ${newVerdict}  ` +
        `(rej missing=${r.rejectedReasons.missingCite} cite!⊂snippet=${r.rejectedReasons.citeNotInSnippet}) ` +
        `claim=${row.claim.id}\n` +
        `   verbatim: «${row.claim.verbatim.slice(0, 110)}»\n`,
    )
    if (!same && r.verification.evidence.length > 0) {
      for (const e of r.verification.evidence)
        process.stdout.write(`   v2 evidence: ${e.snippet.slice(0, 140)}\n`)
    }
  }

  process.stdout.write(
    `\n[ab] summary on ${sample.length} rows:\n` +
      `  unchanged verdict:           ${tally.same}\n` +
      `  changed verdict:             ${tally.changed}\n` +
      `    of which v1→sin-datos now: ${tally.upgradedV1Now_sinDatos}\n` +
      `  evidence rows accepted:      ${tally.acceptedEvidence}\n` +
      `  evidence rows rejected:\n` +
      `    out-of-range:              ${tally.rejectedOutOfRange}\n` +
      `    missing structured cite:   ${tally.rejectedMissingCite}\n` +
      `    cite not in snippet:       ${tally.rejectedCiteNotInSnippet}\n`,
  )
}

main().catch((err) => {
  process.stderr.write(`[ab] FATAL: ${err instanceof Error ? err.message : String(err)}\n`)
  process.exit(1)
})
