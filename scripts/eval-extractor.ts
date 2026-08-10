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
 * ## Attribution — the metric this eval used to lack
 *
 * The old secondary signal was `sentinel rate`: share of claims with no
 * `speakerGroup`, glossed as "a model that gives up on attribution produces
 * claims nobody can act on". That framing **rewarded the defect it should have
 * caught** — a model that confidently mis-attributes scored better than one
 * that abstained, and mis-attribution is the failure actually in production
 * (quotes filed under the bloc they criticise).
 *
 * So attribution is now scored against `pleno-speaker-map/<id>.json`, which
 * carries cited audio evidence for each `SPEAKER_NN`:
 *
 *   · wrong     — the map vouches for a bloc and the model named a different
 *                 one. THE number that matters. Non-zero is disqualifying.
 *   · abstained — the map vouches for a bloc and the model returned null.
 *                 Reported separately, never folded into either side.
 *   · attrPrec  — correct / (correct + wrong). Abstention does not dilute it.
 *
 * With no map on disk there is no ground truth, and the eval prints
 * `not evaluated` rather than a flattering 100%.
 *
 * Secondary signals:
 *   · claims/window — recall proxy. Far below the field means it is missing
 *     material; far above usually means it is splitting one utterance.
 *   · tokens + wall time — the actual cost being traded away.
 *
 *   npm run eval:extractor -- --pleno 1237hbp --windows 8 \
 *       --model claude-code:haiku --model claude-code:sonnet
 *
 *   # prove the gate can fire before trusting a green run
 *   npm run eval:extractor -- --pleno 10yl550 --model … --invert-attribution
 */
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { extractClaimsWithLlm } from '../src/scraper/pleno-claim-llm'
import { callLLM, loadConfigFromEnv, resetBudget, getRunStats } from '../src/llm/client'
import { quoteCoverage } from './check-finding-quotes'
import { seatsFromOfficials, type OfficialsDoc } from '../src/scraper/corporation-seats'
import { parseDiarizedTranscript } from '../src/scraper/voice-id'
import { blocForLabel, type SpeakerMap } from '../src/scraper/speaker-map'

const COVERAGE_OK = 0.8

/**
 * The corporación exactly as production sees it.
 *
 * This was a hand-copied literal of the five blocs. Production derives it from
 * `officials.json`, so the eval was free to drift from the pipeline it claims
 * to measure — `DATA_INTEGRITY.md` rule 1, the costliest defect class here.
 */
function currentSeats() {
  const path = resolve('public/data/officials.json')
  if (!existsSync(path)) throw new Error('officials.json not found — run scrape:officials first')
  return seatsFromOfficials(JSON.parse(readFileSync(path, 'utf8')) as OfficialsDoc)
}

interface Args {
  plenoId: string
  windows: number
  models: string[]
  /** Fault injection: corrupt every attribution and prove the metric fires. */
  invertAttribution: boolean
}

function parseArgs(argv: string[]): Args {
  const out: Args = { plenoId: '', windows: 8, models: [], invertAttribution: false }
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--pleno') out.plenoId = argv[++i]
    else if (argv[i] === '--windows') out.windows = Number(argv[++i])
    else if (argv[i] === '--model') out.models.push(argv[++i])
    else if (argv[i] === '--invert-attribution') out.invertAttribution = true
    else {
      process.stderr.write(`[eval-extractor] unknown flag ${argv[i]}\n`)
      process.exit(2)
    }
  }
  return out
}

// ── Attribution scoring ─────────────────────────────────────────────────────

const normalise = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

/**
 * A searchable rendering of the transcript with, for each offset, the
 * `SPEAKER_NN` speaking there.
 *
 * Built from `parseDiarizedTranscript` — the same parser voice-id uses — so
 * the eval and production cannot disagree about where a segment starts. Only
 * segment TEXT is indexed: searching the raw slice would let a quote "match"
 * inside a `[123.4 → 130.2] (SPEAKER_05)` tag.
 */
export function buildSpeakerIndex(transcript: string) {
  const segs = parseDiarizedTranscript(transcript)
  let hay = ''
  const marks: Array<{ at: number; speaker: string }> = []
  for (const s of segs) {
    marks.push({ at: hay.length, speaker: s.speaker })
    hay += normalise(s.text) + ' '
  }
  return { hay, marks }
}

type SpeakerIndex = ReturnType<typeof buildSpeakerIndex>

export function speakerForQuote(verbatim: string, idx: SpeakerIndex): string | null {
  const needle = normalise(verbatim)
  if (!needle) return null
  const at = idx.hay.indexOf(needle)
  if (at < 0) return null
  let speaker: string | null = null
  for (const m of idx.marks) {
    if (m.at <= at) speaker = m.speaker
    else break
  }
  return speaker
}

/**
 * `unscorable` is not a failure grade. A quote nobody can locate is already
 * counted by the verbatim metric; punishing it again here as `wrong` would
 * double-charge paraphrasing and hide real mis-attribution behind the noise.
 */
export type AttrOutcome = 'correct' | 'wrong' | 'abstained' | 'unscorable'

export function scoreAttribution(
  got: string | null | undefined,
  verbatim: string,
  idx: SpeakerIndex,
  map: SpeakerMap | null,
): AttrOutcome {
  const label = speakerForQuote(verbatim, idx)
  if (!label) return 'unscorable'
  const truth = blocForLabel(map, label)
  if (!truth) return 'unscorable'
  if (!got) return 'abstained'
  return got === truth ? 'correct' : 'wrong'
}

function loadSpeakerMap(plenoId: string): SpeakerMap | null {
  const path = resolve('pleno-speaker-map', `${plenoId}.json`)
  if (!existsSync(path)) return null
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as SpeakerMap
  } catch {
    return null
  }
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
  const seats = currentSeats()
  const map = loadSpeakerMap(args.plenoId)
  const idx = buildSpeakerIndex(slice)
  process.stdout.write(
    `[eval-extractor] ${args.plenoId} · ${slice.length} chars (~${args.windows} windows) · ` +
      `${args.models.length} model(s)\n`,
  )
  process.stdout.write(
    map
      ? `[eval-extractor] speaker map: ${map.rows.length} row(s), ` +
          `${map.rows.filter((r) => !r.weak && r.bloc).length} usable for scoring\n\n`
      : `[eval-extractor] speaker map: NONE at pleno-speaker-map/${args.plenoId}.json — ` +
          `attribution will report "not evaluated"\n\n`,
  )
  if (args.invertAttribution) {
    process.stdout.write(
      '[eval-extractor] --invert-attribution: every attribution will be corrupted ' +
        'on purpose. attrPrec must collapse; if it does not, the metric is broken.\n\n',
    )
  }

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
          currentSeats: seats,
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

    const tally: Record<AttrOutcome, number> = {
      correct: 0,
      wrong: 0,
      abstained: 0,
      unscorable: 0,
    }
    for (const c of claims) {
      // Fault injection swaps a correct bloc for any OTHER bloc on the roster,
      // which is exactly the production failure: a confident wrong answer.
      const got = args.invertAttribution
        ? (seats.find((s) => s.bloc !== c.speakerGroup)?.bloc ?? null)
        : c.speakerGroup
      tally[scoreAttribution(got, c.verbatim, idx, map)] += 1
    }
    const judged = tally.correct + tally.wrong

    rows.push({
      spec,
      claims: claims.length,
      fidelity: claims.length ? faithful / claims.length : 0,
      meanCov,
      // null, not 0 — "no ground truth" and "scored zero" are different facts
      // and a 0 in this column would read as a model that got everything wrong.
      attrPrec: judged > 0 ? tally.correct / judged : null,
      wrong: tally.wrong,
      abstained: tally.abstained,
      unscorable: tally.unscorable,
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
    `\n${'model'.padEnd(24)} ${'claims'.padStart(6)} ${'verbatim'.padStart(9)} ${'meanCov'.padStart(8)} ` +
      `${'attrPrec'.padStart(9)} ${'wrong'.padStart(6)} ${'abst'.padStart(5)} ${'unsc'.padStart(5)} ` +
      `${'tokens'.padStart(8)} ${'time'.padStart(6)}\n`,
  )
  process.stdout.write('─'.repeat(100) + '\n')
  for (const r of rows) {
    process.stdout.write(
      `${r.spec.padEnd(24)} ${String(r.claims).padStart(6)} ${pct(r.fidelity).padStart(9)} ` +
        `${r.meanCov.toFixed(3).padStart(8)} ` +
        `${(r.attrPrec === null ? 'n/e' : pct(r.attrPrec)).padStart(9)} ` +
        `${String(r.wrong).padStart(6)} ${String(r.abstained).padStart(5)} ` +
        `${String(r.unscorable).padStart(5)} ` +
        `${String(r.tokens).padStart(8)} ${(r.ms / 1000).toFixed(0).padStart(5)}s\n`,
    )
  }

  const anyJudged = rows.some((r) => r.attrPrec !== null)
  process.stdout.write(
    `\nverbatim = share of extracted quotes actually found in the transcript (>=${COVERAGE_OK} coverage).\n` +
      `This is the libel contract: anything under ~100% means the model is paraphrasing\n` +
      `what a councillor said, and no cost saving makes that acceptable.\n`,
  )
  if (anyJudged) {
    process.stdout.write(
      `\nwrong = attributions the speaker map contradicts. This is the number that matters:\n` +
        `a quote filed under the bloc it criticises is the defect this pipeline shipped.\n` +
        `abst = the model declined to attribute. That is the CORRECT answer without\n` +
        `evidence, so it never counts against attrPrec — abstaining must beat guessing.\n` +
        `unsc = no ground truth for that quote (unlocatable, or the map does not vouch).\n`,
    )
  } else {
    // A metric that silently reports nothing is how a suite stays green while
    // measuring nothing — the failure mode DATA_INTEGRITY.md was written about.
    process.stdout.write(
      `\nattribution: NOT EVALUATED — no speaker map covered any extracted quote.\n` +
        `attrPrec reads "n/e", not 100%. Build the map first:\n` +
        `  npm run extract:speaker-map -- <plenoId>\n`,
    )
  }
}

// Guard the entry point so the scoring helpers above can be unit-tested. The
// attribution metric has to be provably able to fire, and proving that through
// a live LLM run only would make the proof cost money and flake.
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    process.stderr.write(`[eval-extractor] FATAL: ${err instanceof Error ? err.message : err}\n`)
    process.exit(1)
  })
}
