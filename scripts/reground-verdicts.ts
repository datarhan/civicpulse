/**
 * Re-grounding gate (P2, flag-only). NLI-checks whether each EXISTING
 * verificado/parcial/contradicho verdict's cited evidence actually
 * entails (or, for contradicho, contradicts) the claim, and writes a curator
 * review queue. It changes NO verdict — `downgrade-verdict` (curator) is the
 * only thing that mutates anything.
 *
 *   npm run reground:verdicts [-- --plenoId ID] [--max N] [--model minicheck]
 *
 * Requires the local NLI venv (`bash scripts/bootstrap-nli.sh`); fails loud
 * without it. Output: public/data/pleno-claims-regrounding-flags.json.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import type { PlenoClaim } from '../src/scraper/pleno-claim'
import type { ClaimVerification } from '../src/scraper/claim-verifier'
import {
  regroundDecision,
  REGROUND_THRESHOLDS,
  type RegroundFlag,
  type RegroundItem,
} from '../src/scraper/reground'
import { scoreNliPairs, NliUnavailableError, type NliPair } from '../src/scraper/nli-client'

const VERIFIED = resolve('public/data/pleno-claims-verified.json')
const FLAGS = resolve('public/data/pleno-claims-regrounding-flags.json')
const CHUNK = 400
const TARGET = new Set(['verificado', 'parcial', 'contradicho'])

interface Args {
  plenoId: string | null
  max: number
  model: string | undefined
}

function parseArgs(argv: string[]): Args {
  const out: Args = { plenoId: null, max: Infinity, model: undefined }
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--plenoId') out.plenoId = argv[++i]
    else if (argv[i] === '--max') out.max = Number(argv[++i])
    else if (argv[i] === '--model') out.model = argv[++i]
    else {
      process.stderr.write(`[reground] unknown flag ${argv[i]}\n`)
      process.exit(2)
    }
  }
  return out
}

interface Item {
  claim: PlenoClaim
  verification: ClaimVerification
}

async function main() {
  const opts = parseArgs(process.argv.slice(2))
  if (!existsSync(VERIFIED)) {
    process.stderr.write(`[reground] ${VERIFIED} missing — run verify:pleno-claims first\n`)
    process.exit(1)
  }
  const snap = JSON.parse(readFileSync(VERIFIED, 'utf8')) as { items: Item[] }
  const candidates = snap.items.filter((it) => {
    if (!TARGET.has(it.verification.verdict)) return false
    if ((it.verification.evidence ?? []).length === 0) return false
    if (opts.plenoId && it.claim.plenoId !== opts.plenoId) return false
    return true
  })
  const queue = candidates.slice(0, Math.min(candidates.length, opts.max))
  process.stdout.write(
    `[reground] ${queue.length} evidence-bearing verdicts to re-ground (model=${opts.model ?? 'mDeBERTa-xnli'})\n`,
  )

  const flags: RegroundFlag[] = []
  try {
    for (let start = 0; start < queue.length; start += CHUNK) {
      const chunk = queue.slice(start, start + CHUNK)
      const pairs: NliPair[] = []
      for (const it of chunk) {
        ;(it.verification.evidence ?? []).forEach((e, i) =>
          pairs.push({
            id: `${it.claim.id}#${i}`,
            premise: e.snippet,
            hypothesis: it.claim.verbatim,
          }),
        )
      }
      const scores = await scoreNliPairs(pairs, opts.model ? { model: opts.model } : {})
      for (const it of chunk) {
        const ev = it.verification.evidence ?? []
        const evScores = ev.map((_, i) => {
          const s = scores.get(`${it.claim.id}#${i}`)
          return { entailment: s?.entailment ?? 0, contradiction: s?.contradiction ?? 0 }
        })
        const regItem: RegroundItem = {
          claim: { id: it.claim.id, verbatim: it.claim.verbatim },
          verification: {
            verdict: it.verification.verdict,
            evidence: ev.map((e) => ({ ref: e.ref, snippet: e.snippet })),
          },
        }
        const flag = regroundDecision(regItem, evScores)
        if (flag) flags.push(flag)
      }
      process.stdout.write(
        `[reground]   ${Math.min(start + CHUNK, queue.length)}/${queue.length} · flagged=${flags.length}\n`,
      )
    }
  } catch (err) {
    if (err instanceof NliUnavailableError) {
      process.stderr.write(`[reground] ${err.message}\n`)
      process.exit(1)
    }
    throw err
  }

  const ungrounded = flags.filter((f) => f.reason === 'ungrounded').length
  const contradichoReview = flags.filter((f) => f.reason === 'contradicho-review').length
  writeFileSync(
    FLAGS,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        model: opts.model ?? 'mDeBERTa-xnli',
        thresholds: REGROUND_THRESHOLDS,
        counts: { total: flags.length, ungrounded, contradichoReview, examined: queue.length },
        flags,
      },
      null,
      2,
    ) + '\n',
  )
  process.stdout.write(
    `[reground] done. ${flags.length} flagged of ${queue.length} (ungrounded=${ungrounded} · contradicho-review=${contradichoReview}) → ${FLAGS}\n` +
      `[reground] review with \`npm run regrounding:review\`; apply with \`npm run downgrade-verdict\`. No verdict was changed.\n`,
  )
}

main().catch((err) => {
  process.stderr.write(`[reground] FATAL: ${err instanceof Error ? err.message : String(err)}\n`)
  process.exit(1)
})
