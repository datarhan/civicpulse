#!/usr/bin/env tsx
/**
 * Generate an editorial title + summary for one bundle via LLM.
 *
 *   npm run draft-finding -- --pleno-id <id> --topic <topic>
 *
 * Output (stdout, last line is parseable JSON):
 *   { "title": "...", "summary": "..." }
 *
 * Used by the curator dashboard's "Generate draft" button (the Vite
 * middleware spawns this script with execFile and captures the JSON).
 *
 * Backend defaults to Gemini Pro CLI (free under the user's
 * subscription), with the existing fallback chain (gemini → openai →
 * anthropic → ollama) if Gemini's quota is out. Override with
 * LLM_BACKEND=<backend> in the env.
 *
 * Libel discipline: same prompt as the auto-curate weekly cron — no
 * naming individuals, modal verbs only, severity stays informational
 * regardless of bundle composition. The dashboard's curator can
 * override severity (and edit the prose) before the actual promote
 * call lands a finding in pleno-findings.json.
 */
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { generateTitleAndSummary } from '../src/llm/auto-curate-llm'
import { resetBudget } from '../src/llm/client'
import {
  selectBundles,
  topQuotes,
  type FindingsSnapshot,
  type VerifiedSnapshot,
} from '../src/scraper/auto-curate'

const VERIFIED = resolve('public/data/pleno-claims-verified.json')
const FINDINGS = resolve('public/data/pleno-findings.json')
const PLENOS = resolve('public/data/plenos.json')

interface ExtraEvidence {
  kind: string
  sourceUrl?: string
  title?: string
  snippet: string
}

interface CliArgs {
  plenoId: string
  topic: string
  /** Curator-supplied evidence (URL/PDF snippets) appended to the LLM input. */
  extraEvidence: ExtraEvidence[]
}

function parseArgs(argv: string[]): CliArgs {
  const out: Partial<CliArgs> = { extraEvidence: [] }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--pleno-id') out.plenoId = argv[++i]
    else if (a === '--topic') out.topic = argv[++i]
    else if (a === '--extra-evidence-json') {
      // JSON-encoded array. Wrapping the whole list in one arg avoids
      // shell quoting issues with embedded spaces / newlines / pipes
      // even though we use execFile (no shell).
      const raw = argv[++i]
      try {
        const parsed = JSON.parse(raw)
        if (!Array.isArray(parsed)) throw new Error('not an array')
        out.extraEvidence = parsed
          .filter((e) => e && typeof e === 'object' && typeof e.snippet === 'string')
          .map((e) => ({
            kind: String(e.kind ?? 'url'),
            sourceUrl: e.sourceUrl ? String(e.sourceUrl) : undefined,
            title: e.title ? String(e.title) : undefined,
            snippet: String(e.snippet).slice(0, 1500),
          }))
      } catch (err) {
        process.stderr.write(`[draft-finding] --extra-evidence-json: ${(err as Error).message}\n`)
        process.exit(2)
      }
    } else {
      process.stderr.write(`[draft-finding] unknown flag: ${a}\n`)
      process.exit(2)
    }
  }
  if (!out.plenoId || !out.topic) {
    process.stderr.write('[draft-finding] --pleno-id and --topic are required\n')
    process.exit(2)
  }
  return out as CliArgs
}

function loadJson<T>(path: string): T | null {
  if (!existsSync(path)) return null
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as T
  } catch {
    return null
  }
}

async function main() {
  const opts = parseArgs(process.argv.slice(2))

  // Default backend: Gemini Pro (subscription, $0). Same env as the
  // weekly auto-curate cron. Caller can still override with LLM_BACKEND.
  process.env.GOOGLE_GENAI_USE_GCA = process.env.GOOGLE_GENAI_USE_GCA ?? 'true'
  process.env.LLM_BACKEND = process.env.LLM_BACKEND ?? 'gemini'
  // gemini-2.5-pro is the highest tier the user's gemini CLI Pro
  // subscription accepts (3.x is 404 on this account, 2.0/lite are
  // downgrades). Curators are reviewing the draft anyway, so we
  // optimise for prose quality over cold-start latency.
  process.env.GEMINI_MODEL = process.env.GEMINI_MODEL ?? 'gemini-2.5-pro'

  resetBudget()

  const verified = loadJson<VerifiedSnapshot>(VERIFIED)
  if (!verified) {
    process.stderr.write(`[draft-finding] ${VERIFIED} missing\n`)
    process.exit(1)
  }
  const findings = loadJson<FindingsSnapshot>(FINDINGS)
  const plenos = loadJson<{ items?: Array<{ id: string; title: string }> }>(PLENOS)

  // Find the bundle. The dashboard already filtered by gates+score, so
  // we run selectBundles with permissive thresholds and pick the matching
  // (plenoId, topic) tuple from either eligible OR quarantine.
  const { eligible, quarantine } = selectBundles(verified, new Set<string>(), {
    minScore: 0,
    max: Infinity,
  })
  const all = [...eligible, ...quarantine]
  const bundle = all.find((b) => b.plenoId === opts.plenoId && b.topic === opts.topic)
  if (!bundle) {
    process.stderr.write(
      `[draft-finding] no bundle found for plenoId=${opts.plenoId} topic=${opts.topic}\n`,
    )
    process.exit(1)
  }

  // The findings file may already cite some claims — exclude those from
  // the LLM input so we don't draft around already-published material.
  const cited = new Set<string>()
  for (const f of findings?.items ?? []) for (const id of f.sourceClaimIds ?? []) cited.add(id)
  const fresh = bundle.items.filter((it) => !cited.has(it.claim.id))
  if (fresh.length === 0) {
    process.stderr.write('[draft-finding] all claims in this bundle are already cited\n')
    process.exit(1)
  }

  const quotes = topQuotes(fresh, 4)
  const evidenceSnippets: string[] = []
  const seen = new Set<string>()
  for (const q of quotes) {
    for (const ev of q.verification.evidence ?? []) {
      const k = `${ev.kind}:${ev.snippet}`
      if (seen.has(k)) continue
      seen.add(k)
      evidenceSnippets.push(`[${ev.kind}] ${ev.snippet.slice(0, 180)}`)
    }
  }
  // Curator-supplied evidence is tagged so the LLM (and a future
  // auditor reading the prompt log) can tell it apart from the
  // verifier's automated evidence. We don't trim as aggressively
  // here — the curator added it deliberately.
  for (const ee of opts.extraEvidence) {
    const label = ee.title || ee.sourceUrl || ee.kind
    evidenceSnippets.push(`[curator-${ee.kind}] ${label}: ${ee.snippet.slice(0, 600)}`)
  }

  const plenoTitle = plenos?.items?.find((p) => p.id === bundle.plenoId)?.title ?? bundle.plenoId

  process.stderr.write(
    `[draft-finding] backend=${process.env.LLM_BACKEND} pleno=${bundle.plenoId} topic=${bundle.topic} blocs=${bundle.blocs.join('+')} quotes=${quotes.length} extra-evidence=${opts.extraEvidence.length}\n`,
  )

  const r = await generateTitleAndSummary({
    plenoId: bundle.plenoId,
    plenoDate: bundle.plenoDate,
    plenoTitle,
    topic: bundle.topic,
    blocs: bundle.blocs,
    quotes: quotes.map((q) => ({
      speakerGroup: q.claim.speakerGroup ?? '',
      verdict: q.verification.verdict,
      confidence: q.claim.confidence,
      verbatim: q.claim.verbatim,
    })),
    evidenceSnippets,
  })

  if (!r) {
    process.stderr.write('[draft-finding] LLM returned null (retries exhausted)\n')
    process.exit(1)
  }

  // Stdout: ONE final line with the JSON payload so the middleware can
  // grep it out reliably even if the LLM client logged warnings above.
  process.stdout.write(JSON.stringify({ title: r.title.trim(), summary: r.summary.trim() }) + '\n')
}

main().catch((err) => {
  process.stderr.write(
    `[draft-finding] fatal: ${err instanceof Error ? err.message : String(err)}\n`,
  )
  process.exit(1)
})
