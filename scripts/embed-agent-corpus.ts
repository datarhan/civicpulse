#!/usr/bin/env tsx
/**
 * Embed the AGENT corpus (pleno transcripts + press headlines) into a
 * local JSONL cache for the journalist agent's semantic local search.
 *
 *   npm run embed:agent-corpus              # walk transcripts + press
 *   npm run embed:agent-corpus -- --dry-run # preview, no API calls
 *   npm run embed:agent-corpus -- --rebuild # discard cache (backend switch)
 *
 * Writes `.embed-cache/agent-corpus.jsonl` — one AgentCorpusRow per line
 * (src/scraper/agent-corpus.ts). Same operational contract as
 * embed-verifier-corpus: sha-keyed incremental (only changed chunks
 * re-embed), batch 50, SIGINT flushes partial progress, stale rows
 * pruned. Backends via src/scraper/embed-client (EMBED_BACKEND=
 * openai|gemini|ollama; ollama needs no key — `ollama pull
 * nomic-embed-text` once). Switching backends REQUIRES --rebuild
 * (vector dimensions differ). NOT part of scrape:all — CI has no embed
 * backend; run it curator-side after new transcripts land (the
 * journalist agent degrades gracefully to lexical-only without it).
 */
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { embedTexts, EmbedError } from '../src/scraper/embed-client'
import {
  buildAgentCorpusTexts,
  loadAgentCorpus,
  type AgentCorpusRow,
  type PendingAgentCorpusRow,
  type PressItemForCorpus,
} from '../src/scraper/agent-corpus'

const DATA_DIR = resolve('public/data')
const TRANSCRIPTS_DIR = resolve(DATA_DIR, 'pleno-transcripts')
const CACHE_FILE = resolve('.embed-cache', 'agent-corpus.jsonl')
const BATCH_SIZE = 50

interface CliArgs {
  dryRun: boolean
  rebuild: boolean
}

function parseArgs(argv: string[]): CliArgs {
  const out: CliArgs = { dryRun: false, rebuild: false }
  for (const a of argv) {
    if (a === '--dry-run') out.dryRun = true
    else if (a === '--rebuild') out.rebuild = true
    else if (a === '--help' || a === '-h') {
      process.stdout.write(
        'Usage: embed:agent-corpus [--dry-run] [--rebuild]\n' +
          '  --dry-run   List rows that would be embedded; no API calls.\n' +
          '  --rebuild   Discard the existing cache and re-embed everything.\n',
      )
      process.exit(0)
    } else {
      process.stderr.write(`[embed-agent] unknown flag: ${a}\n`)
      process.exit(2)
    }
  }
  return out
}

function loadTranscripts(): Map<string, string> {
  const map = new Map<string, string>()
  if (!existsSync(TRANSCRIPTS_DIR)) return map
  for (const f of readdirSync(TRANSCRIPTS_DIR)) {
    // Only the published transcript of record — not .orig backups or
    // .refined proposals.
    if (!f.endsWith('.txt') || f.endsWith('.orig') || f.endsWith('.refined')) continue
    const plenoId = f.replace(/\.txt$/, '')
    map.set(plenoId, readFileSync(join(TRANSCRIPTS_DIR, f), 'utf8'))
  }
  return map
}

function loadPress(): PressItemForCorpus[] {
  const p = resolve(DATA_DIR, 'press.json')
  if (!existsSync(p)) return []
  const data = JSON.parse(readFileSync(p, 'utf8')) as { items?: PressItemForCorpus[] }
  return (data.items ?? []).filter((it) => it?.id && it?.title)
}

function readCache(): Map<string, AgentCorpusRow> {
  const map = new Map<string, AgentCorpusRow>()
  if (!existsSync(CACHE_FILE)) return map
  try {
    for (const row of loadAgentCorpus(CACHE_FILE).rows) {
      map.set(row.sourceId, row)
    }
  } catch {
    // unreadable cache → rebuild from scratch
  }
  return map
}

function writeCache(rows: AgentCorpusRow[]): void {
  mkdirSync(dirname(CACHE_FILE), { recursive: true })
  const tmp = `${CACHE_FILE}.tmp`
  const body = rows.map((r) => JSON.stringify(r)).join('\n') + (rows.length ? '\n' : '')
  writeFileSync(tmp, body, 'utf8')
  renameSync(tmp, CACHE_FILE)
}

function appendToCache(rows: AgentCorpusRow[]): void {
  if (rows.length === 0) return
  mkdirSync(dirname(CACHE_FILE), { recursive: true })
  appendFileSync(CACHE_FILE, rows.map((r) => JSON.stringify(r)).join('\n') + '\n', 'utf8')
}

async function main() {
  const opts = parseArgs(process.argv.slice(2))
  const backend =
    (process.env.EMBED_BACKEND as 'openai' | 'gemini' | 'ollama' | undefined) ??
    (process.env.OPENAI_API_KEY ? 'openai' : process.env.GEMINI_API_KEY ? 'gemini' : 'ollama')
  const apiKey =
    backend === 'ollama'
      ? null
      : backend === 'gemini'
        ? process.env.GEMINI_API_KEY
        : process.env.OPENAI_API_KEY
  if (backend !== 'ollama' && !apiKey && !opts.dryRun) {
    const expected = backend === 'gemini' ? 'GEMINI_API_KEY' : 'OPENAI_API_KEY'
    process.stderr.write(
      `[embed-agent] ${expected} not set (backend=${backend}; use --dry-run for preview, ` +
        `or EMBED_BACKEND=ollama for the local zero-cost path)\n`,
    )
    process.exit(2)
  }
  const ollamaModel = process.env.OLLAMA_EMBED_MODEL ?? 'nomic-embed-text'
  process.stdout.write(
    `[embed-agent] backend=${backend}` +
      (backend === 'ollama' ? ` · model=${ollamaModel}` : '') +
      '\n',
  )

  const transcripts = loadTranscripts()
  const press = loadPress()
  const pending = buildAgentCorpusTexts({ transcripts, press })
  process.stdout.write(
    `[embed-agent] corpus: ${pending.length} rows ` +
      `(${transcripts.size} transcripts, ${press.length} press items)\n`,
  )

  const existing = opts.rebuild ? new Map<string, AgentCorpusRow>() : readCache()
  if (existing.size > 0) {
    process.stdout.write(`[embed-agent] cache: ${existing.size} rows on disk\n`)
  }

  const toEmbed: PendingAgentCorpusRow[] = []
  const keptRows: AgentCorpusRow[] = []
  for (const p of pending) {
    const cached = existing.get(p.sourceId)
    if (cached && cached.textSha256 === p.textSha256) keptRows.push(cached)
    else toEmbed.push(p)
  }
  process.stdout.write(
    `[embed-agent] keep=${keptRows.length}  embed=${toEmbed.length}  ` +
      `prune=${existing.size - keptRows.length}\n`,
  )

  if (opts.dryRun) {
    process.stdout.write(`[embed-agent] --dry-run: not calling ${backend}; not writing cache\n`)
    for (const r of toEmbed.slice(0, 5)) {
      process.stdout.write(`  · ${r.kind}/${r.sourceId.slice(0, 50)}\n`)
    }
    return
  }

  writeCache(keptRows)
  let flushed = 0
  let sigintReceived = false
  process.on('SIGINT', () => {
    if (sigintReceived) process.exit(130)
    sigintReceived = true
    process.stderr.write(
      `\n[embed-agent] SIGINT: stopping after current batch (${flushed} new rows persisted)\n`,
    )
  })

  const startedAt = Date.now()
  for (let i = 0; i < toEmbed.length; i += BATCH_SIZE) {
    if (sigintReceived) break
    const batch = toEmbed.slice(i, i + BATCH_SIZE)
    let embeddings: number[][]
    try {
      embeddings = await embedTexts(
        batch.map((b) => b.text),
        backend === 'ollama' ? { backend } : { backend, apiKey: apiKey as string },
      )
    } catch (err) {
      if (err instanceof EmbedError && err.permanent) {
        process.stderr.write(`[embed-agent] permanent error: ${err.message}\n`)
        process.exit(2)
      }
      process.stderr.write(
        `[embed-agent] batch ${i / BATCH_SIZE + 1} failed: ${(err as Error).message}\n`,
      )
      process.exit(1)
    }
    const now = new Date().toISOString()
    const batchRows: AgentCorpusRow[] = batch.map((b, j) => ({
      ...b,
      embedding: embeddings[j],
      embeddedAt: now,
    }))
    appendToCache(batchRows)
    flushed += batchRows.length
    const pct = Math.round(((i + batch.length) / toEmbed.length) * 100)
    process.stdout.write(
      `[embed-agent] +${batchRows.length}  total ${flushed}/${toEmbed.length} (${pct}%)\n`,
    )
  }

  const elapsedSec = ((Date.now() - startedAt) / 1000).toFixed(1)
  process.stdout.write(
    `[embed-agent] done · ${flushed} new · ${keptRows.length} reused · ${elapsedSec}s\n` +
      `[embed-agent] cache: ${CACHE_FILE}\n`,
  )
}

main()
