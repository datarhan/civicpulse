/**
 * eval:extractor — compare models on the CLAIM EXTRACTION task.
 *
 * `eval:verifier` scores verdicts. Nothing scored extraction, which is the
 * expensive step (~200 LLM calls per pleno) and therefore the one where model
 * choice actually costs something. Picking a cheaper model by feel is how you
 * find out six months later that a third of published quotes were paraphrased.
 *
 * The metric that matters here is deterministic and needs no gold set:
 * **a `verbatim` must appear in the transcript it was extracted from.** That is
 * the whole libel contract of /declaraciones and /hallazgos — we publish what
 * was said, verbatim. A model that paraphrases is unusable at any price.
 * Scoring reuses `quoteCoverage`, the sliding-window matcher from
 * check-finding-quotes, so the eval and the published-quote audit agree by
 * construction.
 *
 * Secondary signals:
 *   · claims/window — recall proxy. Far below the field means it is missing
 *     material; far above usually means it is splitting one utterance.
 *   · sentinel rate — share of claims with no speakerGroup. A model that gives
 *     up on attribution produces claims nobody can act on.
 *   · tokens + wall time — the actual cost being traded away.
 *
 *   npm run eval:extractor -- --pleno 1237hbp --windows 8 \
 *       --model claude-code:haiku --model claude-code:sonnet
 */
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { extractClaimsWithLlm } from '../src/scraper/pleno-claim-llm'
import { callLLM, loadConfigFromEnv, resetBudget, getRunStats } from '../src/llm/client'
import { quoteCoverage } from './check-finding-quotes'

const COVERAGE_OK = 0.8

/** Riba-roja 2023–2027, as the extractor sees it in production. */
const CURRENT_SEATS = [
  { bloc: 'PSOE', seats: 11 },
  { bloc: 'PP', seats: 7 },
  { bloc: 'VOX', seats: 1 },
  { bloc: 'EU-Podem', seats: 1 },
  { bloc: 'Compromís', seats: 1 },
]

interface Args {
  plenoId: string
  windows: number
  models: string[]
}

function parseArgs(argv: string[]): Args {
  const out: Args = { plenoId: '', windows: 8, models: [] }
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--pleno') out.plenoId = argv[++i]
    else if (argv[i] === '--windows') out.windows = Number(argv[++i])
    else if (argv[i] === '--model') out.models.push(argv[++i])
    else {
      process.stderr.write(`[eval-extractor] unknown flag ${argv[i]}\n`)
      process.exit(2)
    }
  }
  return out
}

/** `backend:model` → a config override for callLLM. */
function configFor(spec: string) {
  const [backend, model] = spec.split(':')
  const base = loadConfigFromEnv()
  const cfg = { ...base, backend: backend as typeof base.backend }
  if (model) {
    if (backend === 'claude-code') cfg.claudeCodeModel = model
    else if (backend === 'agy') cfg.agyModel = model
    else if (backend === 'gemini') cfg.geminiModel = model
    else if (backend === 'openai') cfg.openaiModel = model
    else if (backend === 'ollama') cfg.ollamaModel = model
  }
  return cfg
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (!args.plenoId || args.models.length === 0) {
    process.stderr.write(
      'usage: eval-extractor.ts --pleno <id> [--windows 8] --model <backend:model> [--model ...]\n',
    )
    process.exit(2)
  }

  const path = resolve('public/data/pleno-transcripts', `${args.plenoId}.txt`)
  if (!existsSync(path)) {
    process.stderr.write(`[eval-extractor] no transcript at ${path}\n`)
    process.exit(1)
  }
  const full = readFileSync(path, 'utf8')
  // Bound the cost: N windows of 1200 chars stepping 600 ⇒ ~600*(N+1) chars.
  const slice = full.slice(0, 600 * (args.windows + 1))
  process.stdout.write(
    `[eval-extractor] ${args.plenoId} · ${slice.length} chars (~${args.windows} windows) · ` +
      `${args.models.length} model(s)\n\n`,
  )

  const rows: any[] = []
  for (const spec of args.models) {
    const cfg = configFor(spec)
    resetBudget()
    const t0 = Date.now()
    let result
    try {
      result = await extractClaimsWithLlm(
        slice,
        {
          plenoId: args.plenoId,
          plenoDate: '2026-01-01',
          minConfidence: 0.5,
          concurrency: 1,
          // Real corporación, so the prompt's bloc enum matches production.
          currentSeats: CURRENT_SEATS,
        },
        (opts) => callLLM({ ...opts, config: cfg }),
      )
    } catch (err) {
      process.stdout.write(`  ${spec}: FAILED — ${String(err).slice(0, 120)}\n`)
      continue
    }
    const ms = Date.now() - t0
    const stats = getRunStats()
    const claims = result.items ?? []
    const coverages = claims.map((c) => quoteCoverage(c.verbatim, slice))
    const faithful = coverages.filter((c) => c >= COVERAGE_OK).length
    const meanCov = coverages.length ? coverages.reduce((a, b) => a + b, 0) / coverages.length : 0
    const sentinel = claims.filter((c) => !c.speakerGroup).length

    rows.push({
      spec,
      claims: claims.length,
      fidelity: claims.length ? faithful / claims.length : 0,
      meanCov,
      sentinel: claims.length ? sentinel / claims.length : 0,
      calls: stats.calls,
      ok: stats.ok,
      failed: stats.failed,
      tokens: stats.tokens,
      ms,
      worst: coverages.length ? Math.min(...coverages) : 0,
    })
  }

  const pct = (x: number) => `${(x * 100).toFixed(1)}%`
  process.stdout.write(
    `\n${'model'.padEnd(26)} ${'claims'.padStart(6)} ${'verbatim'.padStart(9)} ${'meanCov'.padStart(8)} ` +
      `${'worst'.padStart(6)} ${'noSpkr'.padStart(7)} ${'calls'.padStart(6)} ${'tokens'.padStart(8)} ${'time'.padStart(7)}\n`,
  )
  process.stdout.write('─'.repeat(96) + '\n')
  for (const r of rows) {
    process.stdout.write(
      `${r.spec.padEnd(26)} ${String(r.claims).padStart(6)} ${pct(r.fidelity).padStart(9)} ` +
        `${r.meanCov.toFixed(3).padStart(8)} ${r.worst.toFixed(2).padStart(6)} ${pct(r.sentinel).padStart(7)} ` +
        `${String(r.calls).padStart(6)} ${String(r.tokens).padStart(8)} ${(r.ms / 1000).toFixed(0).padStart(6)}s\n`,
    )
  }
  process.stdout.write(
    `\nverbatim = share of extracted quotes actually found in the transcript (>=${COVERAGE_OK} coverage).\n` +
      `This is the libel contract: anything under ~100% means the model is paraphrasing\n` +
      `what a councillor said, and no cost saving makes that acceptable.\n`,
  )
}

main().catch((err) => {
  process.stderr.write(`[eval-extractor] FATAL: ${err instanceof Error ? err.message : err}\n`)
  process.exit(1)
})
