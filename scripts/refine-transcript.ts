#!/usr/bin/env tsx
/**
 * Post-Whisper proper-noun pass — fixes the small set of mistranscribed
 * names + places that drag the extractor's quality down.
 *
 *   npx tsx scripts/refine-transcript.ts <plenoId> [--apply]
 *
 * Reads `public/data/pleno-transcripts/<plenoId>.txt`, builds a
 * vocabulary from the four canonical municipal sources we already
 * curate (officials, geo, wikidata, top-50 tender assignees), chunks
 * the transcript, asks the LLM to replace tokens that are clearly
 * Whisper-mistranscribed forms of a known noun, and writes
 * `<plenoId>.txt.refined` alongside the original.
 *
 * `--apply` atomically renames `.refined` → `.txt` (overwriting the
 * Whisper output). Without `--apply`, the curator inspects the
 * side-by-side first.
 *
 * Audit log: every replacement (original → canonical) is captured in
 * `scripts/logs/refine-transcript-<plenoId>-<ts>.log` so spot-checks
 * post-hoc are tractable.
 *
 * Defaults to Gemini Pro CLI ($0 on subscription). Override with
 * `LLM_BACKEND=<backend>`. The LLM cache layer dedupes identical
 * chunks across re-runs.
 *
 * Conservative discipline: the prompt instructs the LLM to leave
 * tokens alone when uncertain. Aggressive correction would corrupt
 * extractor input (worse than no correction).
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { z } from 'zod'
import { callLLM, resetBudget } from '../src/llm/client'

const TRANSCRIPT_DIR = resolve('public/data/pleno-transcripts')
const LOG_DIR = resolve('scripts/logs')
const OFFICIALS = resolve('public/data/officials.json')
const GEO = resolve('public/data/geo.json')
const WIKIDATA = resolve('public/data/wikidata.json')
const TENDERS = resolve('public/data/tenders.json')

const PROMPT_VERSION = 'refine-transcript-v1'
const CHUNK_LINES = 80 // ~25 min of pleno audio per chunk
const MAX_TOP_ASSIGNEES = 50

interface CliArgs {
  plenoId: string
  apply: boolean
}

function parseArgs(argv: string[]): CliArgs {
  const out: Partial<CliArgs> = { apply: false }
  const positional: string[] = []
  for (const a of argv) {
    if (a === '--apply') out.apply = true
    else if (a.startsWith('--')) {
      process.stderr.write(`[refine-transcript] unknown flag: ${a}\n`)
      process.exit(2)
    } else positional.push(a)
  }
  if (positional.length !== 1) {
    process.stderr.write('usage: refine-transcript.ts <plenoId> [--apply]\n')
    process.exit(2)
  }
  out.plenoId = positional[0]
  return out as CliArgs
}

// ─── Vocabulary builder ────────────────────────────────────────────────────

interface Vocab {
  /** Canonical strings the LLM may swap into the transcript. */
  canonical: string[]
  /** Per-source counts for diagnostics. */
  counts: Record<string, number>
}

function buildVocab(): Vocab {
  const set = new Set<string>()
  const counts: Record<string, number> = {
    officials: 0,
    neighborhoods: 0,
    municipality: 0,
    contractors: 0,
  }

  // 1. Officials (21 names + last-token aliases)
  if (existsSync(OFFICIALS)) {
    const raw = JSON.parse(readFileSync(OFFICIALS, 'utf8')) as {
      officials?: Array<{ name: string }>
      items?: Array<{ name: string }>
    }
    const list = raw.officials ?? raw.items ?? []
    for (const o of list) {
      const name = (o.name ?? '').trim()
      if (!name) continue
      set.add(name)
      counts.officials += 1
      // Last-name alias: "Robert Raga Gadea" → "Raga Gadea" + "Raga"
      const tokens = name.split(/\s+/)
      if (tokens.length >= 2) {
        set.add(tokens.slice(-2).join(' '))
        set.add(tokens[tokens.length - 1])
      }
    }
  }

  // 2. Neighborhoods
  if (existsSync(GEO)) {
    const raw = JSON.parse(readFileSync(GEO, 'utf8')) as {
      neighborhoods?: Array<{ name: string }>
      neighbourhoods?: Array<{ name: string }>
    }
    const list = raw.neighborhoods ?? raw.neighbourhoods ?? []
    for (const n of list) {
      const name = (n.name ?? '').trim()
      if (name) {
        set.add(name)
        counts.neighborhoods += 1
      }
    }
  }

  // 3. Municipality (Spanish + Valencian forms)
  if (existsSync(WIKIDATA)) {
    const raw = JSON.parse(readFileSync(WIKIDATA, 'utf8')) as {
      facts?: { label?: string; nativeLabel?: string }
    }
    const label = raw.facts?.label?.trim()
    if (label) {
      set.add(label)
      counts.municipality += 1
    }
  }
  // Always seed both canonical municipality forms — the project trades
  // between these everywhere.
  set.add('Riba-roja de Túria')
  set.add('Ribarroja del Turia')
  if (counts.municipality < 2) counts.municipality = 2

  // 4. Top-N most-cited contractor names (the ones likely to recur in
  //    pleno discussion of contracts). We rank by frequency and cap.
  if (existsSync(TENDERS)) {
    const raw = JSON.parse(readFileSync(TENDERS, 'utf8')) as {
      contracts?: Array<{ assignee?: string }>
      tenders?: Array<{ assignee?: string }>
      items?: Array<{ assignee?: string }>
    }
    const allTenders = [...(raw.contracts ?? []), ...(raw.tenders ?? []), ...(raw.items ?? [])]
    const tally = new Map<string, number>()
    for (const t of allTenders) {
      const name = (t.assignee ?? '').trim()
      if (!name || name.length < 6) continue
      // Skip the awarding body (it's the council itself in this dataset).
      if (/Ayuntamiento de Riba-roja/i.test(name)) continue
      tally.set(name, (tally.get(name) ?? 0) + 1)
    }
    const ranked = [...tally.entries()].sort((a, b) => b[1] - a[1]).slice(0, MAX_TOP_ASSIGNEES)
    for (const [name] of ranked) {
      set.add(name)
      counts.contractors += 1
    }
  }

  return { canonical: [...set].sort(), counts }
}

// ─── LLM call per chunk ────────────────────────────────────────────────────

const ChunkSchema = z.object({
  correctedText: z
    .string()
    .min(1)
    .max(50_000)
    .describe('The chunk verbatim, with proper-noun mistranscriptions corrected'),
})

function buildSystemPrompt(vocab: Vocab): string {
  return `You are correcting Whisper transcript chunks from Spanish-language municipal council sessions in Riba-roja de Túria. Whisper has a known WER of ~5–10% on proper nouns; you are fixing only those.

ABSOLUTE RULES:

1. **Conservative replacement only.** Replace a token only when it is *clearly* a Whisper-mistranscribed form of a known proper noun (matches one of the canonical strings below). When uncertain, leave the original token untouched.

2. **Preserve everything else exactly.** Keep every timestamp ([12.3 → 18.7]), every line break, every Spanish/Valencian word, every number, every punctuation mark. Do NOT rephrase, summarize, translate, or "improve" the prose.

3. **No additions.** Do not add bracketed clarifications, notes, or speaker tags. Do not insert content. Output exactly the same line count as the input.

4. **Case + diacritics matter.** "Riba-roja de Túria" with accent + hyphen is the canonical form; replace "Rivaroja", "Riba roja", "Ribarroja" only when context makes the municipality unambiguous.

5. **JSON output only**: { "correctedText": "<chunk>" }. No preamble, no commentary.

KNOWN PROPER NOUNS (canonical forms — use these spellings exactly when replacing):
${vocab.canonical.map((s) => `  · ${s}`).join('\n')}`
}

function buildUserPrompt(chunk: string): string {
  return `Below is a Whisper transcript chunk. Apply the rules from the system prompt and return JSON.

\`\`\`
${chunk}
\`\`\``
}

async function refineChunk(chunk: string, systemPrompt: string): Promise<string | null> {
  const r = await callLLM({
    systemPrompt,
    userPrompt: buildUserPrompt(chunk),
    promptVersion: PROMPT_VERSION,
    schema: ChunkSchema,
    input: { chunkHash: chunk.length + ':' + chunk.slice(0, 64) },
  })
  return r?.correctedText ?? null
}

// ─── Diff for audit log ────────────────────────────────────────────────────

interface Replacement {
  lineNo: number
  before: string
  after: string
}

function diffLines(before: string, after: string, baseLineNo: number): Replacement[] {
  const out: Replacement[] = []
  const beforeLines = before.split('\n')
  const afterLines = after.split('\n')
  // If line counts diverge the LLM violated rule 3 — still log what we can
  // line-by-line up to the shorter of the two; the curator review of the
  // .refined file catches the rest.
  const min = Math.min(beforeLines.length, afterLines.length)
  for (let i = 0; i < min; i++) {
    if (beforeLines[i] !== afterLines[i]) {
      out.push({ lineNo: baseLineNo + i, before: beforeLines[i], after: afterLines[i] })
    }
  }
  return out
}

// ─── Main ──────────────────────────────────────────────────────────────────

async function main() {
  const opts = parseArgs(process.argv.slice(2))
  const transcriptPath = resolve(TRANSCRIPT_DIR, `${opts.plenoId}.txt`)
  const refinedPath = `${transcriptPath}.refined`

  if (!existsSync(transcriptPath)) {
    process.stderr.write(`[refine-transcript] transcript missing: ${transcriptPath}\n`)
    process.exit(1)
  }

  // Default backend: gemini Pro CLI ($0 under subscription). Caller can
  // override via env. Same fallback chain as the auto-curate cron.
  process.env.GOOGLE_GENAI_USE_GCA = process.env.GOOGLE_GENAI_USE_GCA ?? 'true'
  process.env.LLM_BACKEND = process.env.LLM_BACKEND ?? 'gemini'

  const vocab = buildVocab()
  process.stderr.write(
    `[refine-transcript] vocab: officials=${vocab.counts.officials} neighborhoods=${vocab.counts.neighborhoods} municipality=${vocab.counts.municipality} contractors=${vocab.counts.contractors} (${vocab.canonical.length} canonical strings)\n`,
  )

  const text = readFileSync(transcriptPath, 'utf8')
  const lines = text.split('\n')
  const totalLines = lines.length
  process.stderr.write(`[refine-transcript] transcript: ${totalLines} lines\n`)

  resetBudget()
  const systemPrompt = buildSystemPrompt(vocab)
  const allReplacements: Replacement[] = []
  const refinedChunks: string[] = []

  for (let start = 0; start < totalLines; start += CHUNK_LINES) {
    const end = Math.min(start + CHUNK_LINES, totalLines)
    const chunk = lines.slice(start, end).join('\n')
    if (!chunk.trim()) {
      refinedChunks.push(chunk)
      continue
    }
    process.stderr.write(
      `[refine-transcript]   chunk lines ${start}-${end - 1} (${end - start} lines, ${chunk.length} chars)…\n`,
    )
    const corrected = await refineChunk(chunk, systemPrompt)
    if (corrected == null) {
      process.stderr.write(
        `[refine-transcript]   chunk ${start}-${end - 1}: LLM returned null — keeping original\n`,
      )
      refinedChunks.push(chunk)
      continue
    }
    const reps = diffLines(chunk, corrected, start)
    allReplacements.push(...reps)
    process.stderr.write(`[refine-transcript]     ${reps.length} replacement(s) in this chunk\n`)
    refinedChunks.push(corrected)
  }

  const refined = refinedChunks.join('\n')
  writeFileSync(refinedPath, refined, 'utf8')
  process.stderr.write(`[refine-transcript] wrote ${refinedPath} (${refined.length} chars)\n`)

  // Audit log
  mkdirSync(LOG_DIR, { recursive: true })
  const ts = new Date().toISOString().replace(/[:.]/g, '-')
  const logPath = resolve(LOG_DIR, `refine-transcript-${opts.plenoId}-${ts}.log`)
  const logBody = [
    `# refine-transcript audit log`,
    `# pleno: ${opts.plenoId}`,
    `# generated: ${new Date().toISOString()}`,
    `# total replacements: ${allReplacements.length}`,
    `# vocab: ${JSON.stringify(vocab.counts)}`,
    '',
    ...allReplacements.map((r) => `line ${r.lineNo}:\n  - ${r.before}\n  + ${r.after}`),
    '',
  ].join('\n')
  writeFileSync(logPath, logBody, 'utf8')
  process.stderr.write(`[refine-transcript] audit log: ${logPath}\n`)
  process.stderr.write(`[refine-transcript] total replacements: ${allReplacements.length}\n`)

  if (opts.apply) {
    // Atomic rename. Fails noisily if anything's wrong with the refined file.
    if (!existsSync(refinedPath)) {
      process.stderr.write(`[refine-transcript] refined file missing — refusing to apply\n`)
      process.exit(1)
    }
    renameSync(refinedPath, transcriptPath)
    process.stderr.write(
      `[refine-transcript] APPLIED — original transcript replaced. Audit log preserved.\n`,
    )
  } else {
    process.stderr.write(
      `[refine-transcript] NOT applied — diff manually:\n` +
        `[refine-transcript]   diff ${transcriptPath} ${refinedPath}\n` +
        `[refine-transcript] Run with --apply to overwrite the original.\n`,
    )
  }

  // Stdout final line: parseable JSON for callers (matches refresh-finding-issues
  // and friends).
  process.stdout.write(
    JSON.stringify({
      plenoId: opts.plenoId,
      replacements: allReplacements.length,
      refinedPath: opts.apply ? transcriptPath : refinedPath,
      logPath,
      applied: opts.apply,
    }) + '\n',
  )

  void dirname // silence unused-import lint
}

main().catch((err) => {
  process.stderr.write(
    `[refine-transcript] fatal: ${err instanceof Error ? err.message : String(err)}\n`,
  )
  process.exit(1)
})
