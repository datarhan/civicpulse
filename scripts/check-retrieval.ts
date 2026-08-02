/**
 * check:retrieval — known-answer health check for the embedding corpora.
 *
 * Two questions, because they fail independently:
 *
 *   1. Is each corpus internally sound? Probe it with FRESH embeddings of its
 *      own rows, produced by the backend recorded in its `.model` sidecar. A
 *      document must retrieve itself at rank 1 with similarity ≈ 1.
 *   2. Will PRODUCTION queries actually match it? The runtime resolves
 *      `EMBED_BACKEND` independently of how the corpus was built, and a
 *      mismatch makes every score 0 while the pipeline reports "no candidates".
 *
 * The second is not hypothetical. Corpora here are rebuilt independently and
 * have sat on different backends at the same time (openai/1536 and
 * gemini/768), a state in which no single EMBED_BACKEND value is right for
 * both. Consumers now pin the query backend from each corpus's sidecar, so the
 * ambient value is a latent risk rather than an active break — but only for
 * call sites that remember to pin.
 *
 *   npm run check:retrieval
 *   npm run check:retrieval -- --corpus .embed-cache/agent-corpus.jsonl
 *   npm run check:retrieval -- --probes 12 --soft
 *   npm run check:retrieval -- --offline   # structural checks only, no API calls
 */
import { existsSync, readFileSync } from 'node:fs'
import { embedTexts, type EmbedOptions } from '../src/scraper/embed-client'
import { cosineSimilarity } from '../src/scraper/semantic-shortlist'
import {
  assessCorpusShape,
  assessSelfRetrieval,
  computeProbeOutcomes,
  pickProbeIndices,
  parseCorpusSidecar,
  median,
  type CorpusSidecar,
  type HealthFinding,
  type ProbeOutcome,
} from '../src/scraper/retrieval-health'

const DEFAULT_CORPORA = ['.embed-cache/verifier-corpus.jsonl', '.embed-cache/agent-corpus.jsonl']

interface Row {
  sourceId: string
  text: string
  embedding: number[]
}

interface Args {
  corpora: string[]
  probes: number
  soft: boolean
  offline: boolean
}

function parseArgs(argv: string[]): Args {
  const out: Args = { corpora: [], probes: 8, soft: false, offline: false }
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--corpus') out.corpora.push(argv[++i])
    else if (argv[i] === '--probes') out.probes = Number(argv[++i])
    else if (argv[i] === '--soft') out.soft = true
    else if (argv[i] === '--offline') out.offline = true
    else {
      process.stderr.write(`[check-retrieval] unknown flag ${argv[i]}\n`)
      process.exit(2)
    }
  }
  if (out.corpora.length === 0) out.corpora = DEFAULT_CORPORA.filter((p) => existsSync(p))
  return out
}

/**
 * Minimal loader. Deliberately NOT `semantic-shortlist.loadCorpus`, whose row
 * validator only accepts the verifier's four `kind` values and would silently
 * discard every row of the agent corpus (kind `transcript`) — a health check
 * that reads nothing would report a clean bill.
 */
function loadRows(path: string): Row[] {
  const rows: Row[] = []
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const t = line.trim()
    if (!t) continue
    try {
      const o = JSON.parse(t) as Partial<Row>
      if (
        typeof o.sourceId === 'string' &&
        typeof o.text === 'string' &&
        Array.isArray(o.embedding)
      )
        rows.push({ sourceId: o.sourceId, text: o.text, embedding: o.embedding })
    } catch {
      /* a corrupt line is reported by the shape check as a count shortfall */
    }
  }
  return rows
}

function readSidecar(path: string): CorpusSidecar {
  const p = `${path}.model`
  return existsSync(p) ? parseCorpusSidecar(readFileSync(p, 'utf8')) : {}
}

function resolveAmbientBackend(): string {
  const env = process.env.EMBED_BACKEND
  if (env === 'openai' || env === 'gemini' || env === 'ollama') return env
  if (process.env.OPENAI_API_KEY) return 'openai'
  if (process.env.GEMINI_API_KEY) return 'gemini'
  return 'ollama'
}

async function checkCorpus(path: string, args: Args): Promise<HealthFinding[]> {
  const findings: HealthFinding[] = []
  const rows = loadRows(path)
  const side = readSidecar(path)
  const ambient = resolveAmbientBackend()

  process.stdout.write(
    `\n── ${path}\n   ${rows.length} rows · sidecar ${side.backend ?? '?'}/${side.model ?? '?'}/${side.dim ?? '?'}\n`,
  )

  findings.push(...assessCorpusShape(rows))

  if (!side.backend) {
    findings.push({
      level: 'warn',
      code: 'no-sidecar',
      message:
        `${path}.model is missing, so nothing records which backend built this corpus. ` +
        `A width mismatch becomes undiagnosable — rebuild to write one.`,
    })
  } else if (side.backend !== ambient) {
    findings.push({
      level: 'warn',
      code: 'ambient-backend-mismatch',
      message:
        `corpus was built with ${side.backend}; ambient resolution would pick ${ambient} ` +
        `(EMBED_BACKEND=${process.env.EMBED_BACKEND ?? 'unset'}). The two in-repo consumers ` +
        `(claim-verifier, journalist semantic search) pin the query backend from this sidecar, ` +
        `so retrieval still works — but any NEW consumer that calls embedTexts() without opts ` +
        `will score 0 against every row and report "no candidates".`,
    })
  }

  // Curator preference (2026-08-02): build corpora with openai. Gemini's
  // embeddings are weaker, its free tier rate-limits hard enough that a bulk
  // rebuild takes hours, and it is what left the agent corpus stranded at 14%
  // of its rows with nothing reporting the shortfall.
  if (side.backend === 'gemini') {
    findings.push({
      level: 'warn',
      code: 'weak-embed-backend',
      message:
        `built with gemini, the weaker embedder. Rebuild with ` +
        `EMBED_BACKEND=openai for better recall and a rebuild that finishes in minutes ` +
        `rather than hours.`,
    })
  }

  const dims = new Set(rows.map((r) => r.embedding.length))
  if (side.dim && dims.size === 1 && !dims.has(side.dim)) {
    findings.push({
      level: 'error',
      code: 'sidecar-dim-mismatch',
      message: `sidecar claims ${side.dim} dims but rows are ${[...dims][0]}. The sidecar is stale.`,
    })
  }

  if (args.offline || rows.length === 0) return findings

  // The probe must embed FRESH text through a real backend. Querying with a
  // stored vector would test only the arithmetic and would pass throughout the
  // exact failure this check exists for.
  const idx = pickProbeIndices(rows.length, args.probes)
  const probeRows = idx.map((i) => rows[i])
  const opts: EmbedOptions = {}
  if (side.backend === 'openai' || side.backend === 'gemini' || side.backend === 'ollama')
    opts.backend = side.backend
  if (side.model) opts.model = side.model
  if (side.dim) opts.dim = side.dim

  let fresh: number[][]
  try {
    fresh = await embedTexts(
      probeRows.map((r) => r.text),
      opts,
    )
  } catch (err) {
    findings.push({
      level: 'warn',
      code: 'probe-unavailable',
      message:
        `could not embed probes via ${side.backend ?? 'auto'}: ${String(err).slice(0, 160)}. ` +
        `Structural checks ran; self-retrieval did not.`,
    })
    return findings
  }

  const outcomes: ProbeOutcome[] = computeProbeOutcomes(
    probeRows.map((r, k) => ({ sourceId: r.sourceId, query: fresh[k] })),
    rows,
    cosineSimilarity,
  )

  const ranked = outcomes.filter((o) => o.rank === 1).length
  const medianSelfSim = median(outcomes.map((o) => o.selfSimilarity))
  process.stdout.write(
    `   self-retrieval: ${ranked}/${outcomes.length} at rank 1 · ` +
      `median self-similarity ${outcomes.length ? medianSelfSim.toFixed(4) : 'n/a'}\n`,
  )
  findings.push(...assessSelfRetrieval(outcomes))
  return findings
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.corpora.length === 0) {
    process.stdout.write('[check-retrieval] no corpora on disk — nothing to check\n')
    return
  }

  let errors = 0
  let warns = 0
  for (const path of args.corpora) {
    if (!existsSync(path)) {
      process.stdout.write(`\n── ${path}\n   MISSING\n`)
      continue
    }
    const findings = await checkCorpus(path, args)
    for (const f of findings) {
      if (f.level === 'error') errors++
      else warns++
      process.stdout.write(`   ${f.level.toUpperCase()} [${f.code}] ${f.message}\n`)
    }
    if (findings.length === 0) process.stdout.write('   ✓ healthy\n')
  }

  process.stdout.write(`\n[check-retrieval] ${errors} error(s) · ${warns} warning(s)\n`)
  if (errors > 0 && !args.soft) process.exit(1)
}

main().catch((err) => {
  process.stderr.write(`[check-retrieval] FATAL: ${err instanceof Error ? err.message : err}\n`)
  process.exit(1)
})
