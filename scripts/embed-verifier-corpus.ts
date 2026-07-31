#!/usr/bin/env tsx
/**
 * Embed the verifier's corpus into a local JSONL cache.
 *
 *   npm run embed:verifier-corpus              # walk full corpus
 *   npm run embed:verifier-corpus -- --dry-run # preview, no API calls
 *
 * Walks tenders.json, bdns.json, promises.json and writes
 * `.embed-cache/verifier-corpus.jsonl` — one JSON object per line, see
 * `src/scraper/semantic-shortlist.ts:CorpusRow` for the shape. Idempotent:
 * each row is keyed by SHA-256 of its source text, so a second run only
 * re-embeds rows whose text changed.
 *
 * The cache is gitignored (no PII, but contains the same source text the
 * SPA already publishes — no need to commit a 50 MB file when re-embed is
 * a few seconds).
 *
 * Failure modes:
 *   · API key for the active backend missing → exits 2 with a clear
 *     error. Pick the backend via EMBED_BACKEND=openai|gemini|ollama, or
 *     set just one of OPENAI_API_KEY / GEMINI_API_KEY for auto-detection.
 *     Ollama needs no key (local server at OLLAMA_HOST, default
 *     localhost:11434) — install the model with
 *     `ollama pull nomic-embed-text` first.
 *     Switch backends → rebuild the cache (--rebuild), since vector
 *     dimensions differ across providers (1536 OpenAI, 768 Gemini, 768
 *     nomic-embed-text) and aren't directly comparable.
 *   · 429 insufficient_quota → bails fast, prior progress preserved.
 *   · SIGINT → flushes the partial cache before exiting (resume next run).
 *   · One bad row (>8K tokens) → exits 2; user must shorten the source.
 */
import { createHash } from 'node:crypto'
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'node:fs'
import { dirname, resolve } from 'node:path'
import { describeActiveEmbedder, embedTexts, EmbedError } from '../src/scraper/embed-client'
import type { CorpusRow } from '../src/scraper/semantic-shortlist'

const DATA_DIR = resolve('public/data')
const CACHE_DIR = resolve('.embed-cache')
const CACHE_FILE = resolve(CACHE_DIR, 'verifier-corpus.jsonl')

// OpenAI allows 2048 inputs per call, Gemini caps at 100; we batch smaller (50)
// so partial-state writes happen frequently and SIGINT is graceful.
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
        'Usage: embed:verifier-corpus [--dry-run] [--rebuild]\n' +
          '  --dry-run   List rows that would be embedded; do not call OpenAI.\n' +
          '  --rebuild   Discard the existing cache and re-embed everything.\n',
      )
      process.exit(0)
    } else {
      process.stderr.write(`[embed] unknown flag: ${a}\n`)
      process.exit(2)
    }
  }
  return out
}

function sha256(s: string): string {
  return createHash('sha256').update(s).digest('hex')
}

function loadIfExists(name: string): unknown {
  const p = resolve(DATA_DIR, name)
  if (!existsSync(p)) return null
  return JSON.parse(readFileSync(p, 'utf8'))
}

// ─── Source row → CorpusRow ─────────────────────────────────────────────────

interface PendingRow {
  kind: CorpusRow['kind']
  sourceId: string
  text: string
  textSha256: string
  snippet: string
  ref: string
  party?: string | null
}

function buildTenderRows(data: unknown): PendingRow[] {
  if (!data || typeof data !== 'object') return []
  const arr = [
    ...((data as { contracts?: unknown[] }).contracts ?? []),
    ...((data as { tenders?: unknown[] }).tenders ?? []),
    ...((data as { items?: unknown[] }).items ?? []),
  ]
  const out: PendingRow[] = []
  const seen = new Set<string>()
  for (const raw of arr) {
    if (!raw || typeof raw !== 'object') continue
    const r = raw as Record<string, unknown>
    const title = String(r.title ?? '').trim()
    if (!title) continue
    const id = String(r.id ?? r.permalink ?? title.slice(0, 60))
    if (seen.has(id)) continue
    seen.add(id)
    const contractor = String(r.contractor ?? r.assignee ?? '').trim()
    const text = [title, contractor, r.categoryTitle].filter(Boolean).join(' · ')
    const amount =
      (r.finalAmount as number | undefined) ??
      (r.award_amount_eur as number | undefined) ??
      (r.awarded_amount as number | undefined) ??
      (r.amount as number | undefined) ??
      null
    const status = String(r.status ?? '').trim()
    let snippet = title
    if (amount) snippet += ` · €${Number(amount).toLocaleString('es-ES')}`
    if (status) snippet += ` · ${status}`
    snippet = snippet.slice(0, 230)
    out.push({
      kind: 'tender',
      sourceId: id,
      text,
      textSha256: sha256(text),
      snippet,
      ref: String(r.permalink ?? `tender:${id}`),
    })
  }
  return out
}

function buildBdnsRows(data: unknown): PendingRow[] {
  if (!data || typeof data !== 'object') return []
  const arr = ((data as { items?: unknown[]; convocatorias?: unknown[] }).items ??
    (data as { convocatorias?: unknown[] }).convocatorias ??
    []) as Array<Record<string, unknown>>
  const out: PendingRow[] = []
  const seen = new Set<string>()
  for (const r of arr) {
    if (!r || typeof r !== 'object') continue
    const titulo = String(r.description ?? r.titulo ?? '').trim()
    if (!titulo) continue
    const id = String(r.bdnsCode ?? r.convocatoriaId ?? r.id ?? titulo.slice(0, 60))
    if (seen.has(id)) continue
    seen.add(id)
    const organo = String(r.organ ?? r.organo ?? '').trim()
    const text = [titulo, organo].filter(Boolean).join(' · ')
    const amount = (r.importe as number | undefined) ?? (r.amount as number | undefined) ?? null
    let snippet = titulo
    if (amount) snippet += ` · €${Number(amount).toLocaleString('es-ES')}`
    if (organo) snippet += ` · ${organo}`
    snippet = snippet.slice(0, 230)
    out.push({
      kind: 'bdns',
      sourceId: id,
      text,
      textSha256: sha256(text),
      snippet,
      ref: String(r.sourceUrl ?? r.url ?? `bdns:${id}`),
    })
  }
  return out
}

function buildPromiseRows(data: unknown): PendingRow[] {
  if (!data || typeof data !== 'object') return []
  const items = ((data as { items?: unknown[] }).items ?? []) as Array<Record<string, unknown>>
  const out: PendingRow[] = []
  const seen = new Set<string>()
  for (const p of items) {
    if (!p?.quote || !p.id) continue
    const id = String(p.id)
    if (seen.has(id)) continue
    seen.add(id)
    const quote = String(p.quote)
    const title = String(p.title ?? '').trim()
    const party = (p.party as string | undefined) ?? null
    const madeAt = String(p.madeAt ?? '').trim()
    const status = String(p.status ?? '').trim()
    const text = [title, quote].filter(Boolean).join(' · ')
    const source = (p.source as { url?: string } | undefined) ?? {}
    let snippet = `${party ?? ''} «${quote.slice(0, 140)}»`
    if (madeAt) snippet += ` · ${madeAt}`
    if (status) snippet += ` · status=${status}`
    snippet = snippet.trim().slice(0, 230)
    out.push({
      kind: 'promise',
      sourceId: id,
      text,
      textSha256: sha256(text),
      snippet,
      ref: String(source.url ?? `promise:${id}`),
      party,
    })
  }
  return out
}

// ─── Cache I/O ──────────────────────────────────────────────────────────────

function readCache(): Map<string, CorpusRow> {
  const map = new Map<string, CorpusRow>()
  if (!existsSync(CACHE_FILE)) return map
  const text = readFileSync(CACHE_FILE, 'utf8')
  let lineNo = 0
  for (const line of text.split('\n')) {
    lineNo += 1
    const trimmed = line.trim()
    if (!trimmed) continue
    try {
      const row = JSON.parse(trimmed) as CorpusRow
      const key = `${row.kind}:${row.sourceId}`
      map.set(key, row)
    } catch {
      process.stderr.write(`[embed] cache: skipping corrupt line ${lineNo}\n`)
    }
  }
  return map
}

function writeCache(rows: CorpusRow[]): void {
  mkdirSync(dirname(CACHE_FILE), { recursive: true })
  const tmp = `${CACHE_FILE}.tmp`
  const body = rows.map((r) => JSON.stringify(r)).join('\n') + (rows.length ? '\n' : '')
  writeFileSync(tmp, body, 'utf8')
  renameSync(tmp, CACHE_FILE)
}

function appendToCache(rows: CorpusRow[]): void {
  if (rows.length === 0) return
  mkdirSync(dirname(CACHE_FILE), { recursive: true })
  const body = rows.map((r) => JSON.stringify(r)).join('\n') + '\n'
  appendFileSync(CACHE_FILE, body, 'utf8')
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  const opts = parseArgs(process.argv.slice(2))
  const backend =
    (process.env.EMBED_BACKEND as 'openai' | 'gemini' | 'ollama' | undefined) ??
    (process.env.OPENAI_API_KEY ? 'openai' : process.env.GEMINI_API_KEY ? 'gemini' : 'ollama')
  // Ollama runs locally; no key required.
  const apiKey =
    backend === 'ollama'
      ? null
      : backend === 'gemini'
        ? process.env.GEMINI_API_KEY
        : process.env.OPENAI_API_KEY
  if (backend !== 'ollama' && !apiKey && !opts.dryRun) {
    const expected = backend === 'gemini' ? 'GEMINI_API_KEY' : 'OPENAI_API_KEY'
    process.stderr.write(
      `[embed] ${expected} not set (backend=${backend}; use --dry-run for preview, ` +
        `or set EMBED_BACKEND=ollama for the local zero-cost path)\n`,
    )
    process.exit(2)
  }
  const ollamaModel = process.env.OLLAMA_EMBED_MODEL ?? 'nomic-embed-text'
  process.stdout.write(
    `[embed] backend=${backend}` + (backend === 'ollama' ? ` · model=${ollamaModel}` : '') + '\n',
  )

  const tenders = loadIfExists('tenders.json')
  const bdns = loadIfExists('bdns.json')
  const promises = loadIfExists('promises.json')

  const pending: PendingRow[] = [
    ...buildTenderRows(tenders),
    ...buildBdnsRows(bdns),
    ...buildPromiseRows(promises),
  ]
  process.stdout.write(`[embed] corpus: ${pending.length} rows total\n`)

  // Load existing cache (unless --rebuild).
  const existing = opts.rebuild ? new Map<string, CorpusRow>() : readCache()
  if (existing.size > 0) {
    process.stdout.write(`[embed] cache: ${existing.size} rows on disk\n`)
  }

  // Decide what needs (re-)embedding.
  const toEmbed: PendingRow[] = []
  const keptRows: CorpusRow[] = []
  const seenKeys = new Set<string>()
  for (const p of pending) {
    const key = `${p.kind}:${p.sourceId}`
    seenKeys.add(key)
    const cached = existing.get(key)
    if (cached && cached.textSha256 === p.textSha256) {
      keptRows.push(cached)
    } else {
      toEmbed.push(p)
    }
  }
  // Stale rows in the cache that no longer correspond to a source row are
  // dropped — this is how deletes propagate. We don't re-embed those.

  process.stdout.write(
    `[embed] keep=${keptRows.length}  embed=${toEmbed.length}  prune=${existing.size - keptRows.length}\n`,
  )

  if (opts.dryRun) {
    process.stdout.write(`[embed] --dry-run: not calling ${backend}; not writing cache\n`)
    if (toEmbed.length > 0) {
      const sample = toEmbed.slice(0, 5).map((r) => `  · ${r.kind}/${r.sourceId.slice(0, 40)}`)
      process.stdout.write(sample.join('\n') + '\n')
    }
    return
  }

  // Dimension safety: probe ONE embedding first so any quota fallback in
  // the client (openai→gemini) latches before batching, then force a full
  // rebuild when the cache was built at another dimensionality.
  let runDim: number
  try {
    const probe = await embedTexts(['dimensional probe'], backend === 'ollama' ? { backend } : {})
    runDim = probe[0].length
  } catch (err) {
    process.stderr.write(`[embed] probe failed: ${(err as Error).message}\n`)
    process.exit(2)
  }
  // Model-identity marker: equal dims do NOT imply comparable vectors
  // (nomic-768 vs gemini-768 are different spaces) — key the cache by
  // backend:model:dim; any mismatch or a legacy no-marker cache forces a
  // full rebuild.
  const active = describeActiveEmbedder(backend === 'ollama' ? { backend } : {})
  const marker = `${active.backend}:${active.model}:${runDim}`
  const markerFile = `${CACHE_FILE}.model`
  const prevMarker = existsSync(markerFile) ? readFileSync(markerFile, 'utf8').trim() : null
  const cachedDim = keptRows[0]?.embedding.length
  const dimMismatch = cachedDim !== undefined && cachedDim !== runDim
  const modelMismatch = keptRows.length > 0 && prevMarker !== marker
  if (dimMismatch || modelMismatch) {
    process.stdout.write(
      `[embed] cache marker «${prevMarker ?? 'none'}» ≠ active «${marker}» → full rebuild\n`,
    )
    keptRows.length = 0
    toEmbed.length = 0
    for (const p of pending) toEmbed.push(p)
  }
  mkdirSync(CACHE_DIR, { recursive: true })
  writeFileSync(markerFile, `${marker}\n`, 'utf8')

  // Re-write cache with kept rows, then append new embeddings as we go.
  writeCache(keptRows)
  let flushed = 0

  // SIGINT handler — preserves whatever we've appended.
  let sigintReceived = false
  process.on('SIGINT', () => {
    if (sigintReceived) process.exit(130)
    sigintReceived = true
    process.stderr.write(
      `\n[embed] SIGINT: stopping after current batch (${flushed} new rows already persisted)\n`,
    )
  })

  const startedAt = Date.now()
  for (let i = 0; i < toEmbed.length; i += BATCH_SIZE) {
    if (sigintReceived) break
    const batch = toEmbed.slice(i, i + BATCH_SIZE)
    let embeddings: number[][] | null = null
    // Free-tier RESOURCE_EXHAUSTED is usually a per-minute ceiling, not a
    // dead key: pace instead of dying (progress persists per batch).
    for (let quotaWait = 0; quotaWait <= 12; quotaWait++) {
      try {
        // Let the client resolve openai/gemini itself so the
        // insufficient_quota → gemini latch applies; only ollama stays an
        // explicit pin.
        embeddings = await embedTexts(
          batch.map((b) => b.text),
          backend === 'ollama' ? { backend } : {},
        )
        break
      } catch (err) {
        const rateQuota =
          err instanceof EmbedError && err.permanent && /RESOURCE_EXHAUSTED/i.test(err.message)
        if (rateQuota && quotaWait < 12) {
          process.stderr.write(
            `[embed] gemini quota ceiling on batch ${i / BATCH_SIZE + 1} — pausing 70 s (wait ${quotaWait + 1}/12)\n`,
          )
          await new Promise((r) => setTimeout(r, 70_000))
          continue
        }
        if (err instanceof EmbedError && err.permanent) {
          process.stderr.write(
            `[embed] permanent error (progress kept, re-run to resume): ${err.message}\n`,
          )
          process.exit(2)
        }
        process.stderr.write(
          `[embed] batch ${i / BATCH_SIZE + 1} failed: ${(err as Error).message}\n`,
        )
        process.exit(1)
      }
    }
    if (!embeddings) {
      process.stderr.write('[embed] unreachable: batch loop ended without result\n')
      process.exit(1)
    }
    const now = new Date().toISOString()
    const batchRows: CorpusRow[] = batch.map((b, j) => ({
      kind: b.kind,
      sourceId: b.sourceId,
      text: b.text,
      textSha256: b.textSha256,
      embedding: embeddings[j],
      snippet: b.snippet,
      ref: b.ref,
      party: b.party ?? null,
      embeddedAt: now,
    }))
    appendToCache(batchRows)
    flushed += batchRows.length
    const pct = Math.round(((i + batch.length) / toEmbed.length) * 100)
    process.stdout.write(
      `[embed] +${batchRows.length}  total ${flushed}/${toEmbed.length} (${pct}%)\n`,
    )
  }

  const elapsedSec = ((Date.now() - startedAt) / 1000).toFixed(1)
  process.stdout.write(
    `[embed] done · ${flushed} new rows · ${keptRows.length} reused · ${elapsedSec}s\n`,
  )
  process.stdout.write(`[embed] cache: ${CACHE_FILE}\n`)
}

main().catch((err) => {
  process.stderr.write(`[embed] fatal: ${err instanceof Error ? err.message : String(err)}\n`)
  process.exit(1)
})
