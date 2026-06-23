/**
 * Score a verifier against the gold set (P0).
 *
 *   npm run eval:verifier -- --verifier stored|deterministic|current|nli|nli-minicheck
 *                            [--gold tests/fixtures/verifier-gold.json] [--json]
 *
 * Runs the chosen VerifierFn over every `reviewed:true` gold claim and prints a
 * scorecard (label accuracy, per-verdict P/R/F1, libel-critical false-contradicho
 * rate, false-sin-datos rate, citation P/R, FEVER score). Writes the raw JSON to
 * eval/scorecards/ (gitignored). `nli*` requires the local NLI venv (P1).
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import type { PlenoClaim } from '../src/scraper/pleno-claim'
import type { ClaimVerification } from '../src/scraper/claim-verifier'
import { scoreVerifier, type GoldRow, type Scorecard } from '../src/scraper/verifier-eval'
import {
  loadVerifierContext,
  deterministicVerifier,
  currentVerifier,
  makeStoredVerifier,
  type VerifierFn,
} from '../src/scraper/verifier-runner'

const VERIFIED = resolve('public/data/pleno-claims-verified.json')

interface Args {
  verifier: string
  gold: string
  json: boolean
}

function parseArgs(argv: string[]): Args {
  const out: Args = { verifier: '', gold: 'tests/fixtures/verifier-gold.json', json: false }
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--verifier') out.verifier = argv[++i]
    else if (argv[i] === '--gold') out.gold = argv[++i]
    else if (argv[i] === '--json') out.json = true
    else {
      process.stderr.write(`[eval] unknown flag ${argv[i]}\n`)
      process.exit(2)
    }
  }
  if (!out.verifier) {
    process.stderr.write('[eval] --verifier is required (stored|deterministic|current|nli)\n')
    process.exit(2)
  }
  return out
}

interface VerifiedSnapshot {
  items: { claim: PlenoClaim; verification: ClaimVerification }[]
}

async function pickVerifier(name: string, snapshot: VerifiedSnapshot): Promise<VerifierFn> {
  if (name === 'stored') return makeStoredVerifier(snapshot)
  if (name === 'deterministic') return deterministicVerifier
  if (name === 'current') return currentVerifier
  if (name === 'nli' || name === 'nli-minicheck') {
    process.stderr.write('[eval] the nli verifier lands in P1 Task 7 — not wired yet\n')
    process.exit(2)
  }
  process.stderr.write(`[eval] unknown --verifier ${name}\n`)
  process.exit(2)
}

function pct(x: number): string {
  return (x * 100).toFixed(1) + '%'
}

function formatScorecard(s: Scorecard, label: string): string {
  const lines: string[] = []
  lines.push(`## Scorecard: ${label}  (n=${s.n})`)
  lines.push('')
  lines.push(
    `label-accuracy **${pct(s.labelAccuracy)}** · fever **${pct(s.feverScore)}** · ` +
      `false-contradicho **${pct(s.falseContradichoRate)}** · false-sin-datos **${pct(s.falseSinDatosRate)}**`,
  )
  lines.push(
    `citation (rows=${s.citation.rowsWithGoldRefs}): P ${pct(s.citation.precision)} · ` +
      `R ${pct(s.citation.recall)} · F1 ${pct(s.citation.f1)}`,
  )
  lines.push('')
  lines.push('| verdict | precision | recall | f1 | support |')
  lines.push('|---|---|---|---|---|')
  for (const [v, m] of Object.entries(s.perVerdict)) {
    if (m.support === 0 && m.precision === 0) continue
    lines.push(`| ${v} | ${pct(m.precision)} | ${pct(m.recall)} | ${pct(m.f1)} | ${m.support} |`)
  }
  return lines.join('\n')
}

async function main() {
  const args = parseArgs(process.argv.slice(2))

  const goldPath = resolve(args.gold)
  if (!existsSync(goldPath)) {
    process.stderr.write(`[eval] ${args.gold} missing — run \`npm run eval:gold-prefill\` first\n`)
    process.exit(1)
  }
  const gold = (JSON.parse(readFileSync(goldPath, 'utf8')).rows ?? []) as GoldRow[]
  const reviewed = gold.filter((g) => g.reviewed)
  if (reviewed.length === 0) {
    process.stderr.write(
      '[eval] no reviewed gold rows — open the gold file, correct labels, set reviewed:true\n',
    )
    process.exit(1)
  }

  if (!existsSync(VERIFIED)) {
    process.stderr.write(`[eval] ${VERIFIED} missing — run verify:pleno-claims first\n`)
    process.exit(1)
  }
  const snapshot = JSON.parse(readFileSync(VERIFIED, 'utf8')) as VerifiedSnapshot
  const claimsById = new Map(snapshot.items.map((it) => [it.claim.id, it.claim]))

  const ctx = await loadVerifierContext({ withCorpus: args.verifier.startsWith('nli') })
  const verifier = await pickVerifier(args.verifier, snapshot)

  const predictions = new Map<string, ClaimVerification>()
  let missing = 0
  for (const row of reviewed) {
    const claim = claimsById.get(row.claimId)
    if (!claim) {
      missing += 1
      continue // scored as sin-datos (no prediction)
    }
    predictions.set(row.claimId, await verifier(claim, ctx))
  }
  if (missing > 0) {
    process.stderr.write(
      `[eval] ${missing} gold claimIds not found in the snapshot (scored sin-datos)\n`,
    )
  }

  const score = scoreVerifier(predictions, gold)

  if (args.json) {
    process.stdout.write(JSON.stringify(score, null, 2) + '\n')
  } else {
    process.stdout.write(formatScorecard(score, args.verifier) + '\n')
  }

  const dir = resolve('eval/scorecards')
  mkdirSync(dir, { recursive: true })
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const outFile = resolve(dir, `${args.verifier}-${stamp}.json`)
  writeFileSync(outFile, JSON.stringify({ verifier: args.verifier, score }, null, 2) + '\n')
  process.stderr.write(`[eval] wrote ${outFile}\n`)
}

main().catch((err) => {
  process.stderr.write(`[eval] FATAL: ${err instanceof Error ? err.message : String(err)}\n`)
  process.exit(1)
})
