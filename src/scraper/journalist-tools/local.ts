/**
 * Journalist tools — local-snapshot search + per-domain fetchers (officials,
 * press, pleno-claims, promises), plus semantic recall over the embedded
 * agent corpus (transcripts + press) with graceful lexical-only fallback.
 */
import { resolve } from 'node:path'
import { existsSync, readFileSync } from 'node:fs'
import { matchesAnyToken, readJsonSnapshot, tokenize } from './internal'
import { loadAgentCorpus, rankAgentCorpus, type AgentCorpusRow } from '../agent-corpus'
import { embedTexts, type EmbedOptions } from '../embed-client'
import { parseCorpusSidecar, type CorpusSidecar } from '../retrieval-health'

// ─── Local-snapshot tools ──────────────────────────────────────────────────

export interface LocalHit<T = unknown> {
  localPath: string
  matchedField: string
  preview: string
  row: T
}

const DEFAULT_LOCAL_FILES = [
  'public/data/officials.json',
  'public/data/press.json',
  'public/data/pleno-claims-suggestions.json',
  'public/data/pleno-claims-verified.json',
  'public/data/promises.json',
  'public/data/plenos.json',
  'public/data/plenos-agendas.json',
  'public/data/bdns.json',
  'public/data/tenders.json',
  'public/data/wikidata.json',
] as const

/**
 * Grep a list of `public/data/*.json` snapshots for a query string and
 * return up to N matching rows per file. Pure local — no network. Used
 * by the agent's Stage-2 to bootstrap its knowledge before reaching
 * outside.
 */
export function searchLocalSnapshots(
  query: string,
  opts: { files?: readonly string[]; perFileLimit?: number } = {},
): LocalHit[] {
  const files = opts.files ?? DEFAULT_LOCAL_FILES
  const perFile = opts.perFileLimit ?? 6
  const needleTokens = tokenize(query)
  if (needleTokens.length === 0) return []
  const hits: LocalHit[] = []
  for (const f of files) {
    const data = readJsonSnapshot<Record<string, unknown>>(f)
    if (!data) continue
    const arrays = candidateArrays(data)
    for (const [arrName, arr] of arrays) {
      let kept = 0
      for (const row of arr) {
        if (kept >= perFile) break
        const flat = flattenForSearch(row)
        if (matchesAnyToken(flat, needleTokens)) {
          hits.push({
            localPath: f,
            matchedField: arrName,
            preview: flat.slice(0, 240),
            row,
          })
          kept += 1
        }
      }
    }
  }
  return hits
}

function candidateArrays(obj: Record<string, unknown>): Array<[string, unknown[]]> {
  const out: Array<[string, unknown[]]> = []
  for (const [k, v] of Object.entries(obj)) {
    if (Array.isArray(v)) out.push([k, v as unknown[]])
  }
  return out
}

// ─── Semantic local search (agent corpus) ──────────────────────────────────

const AGENT_CORPUS_DEFAULT_PATH = resolve('.embed-cache', 'agent-corpus.jsonl')

/** Per-path corpus cache: rows once loaded, 'unavailable' once failed. */
const corpusCache = new Map<string, AgentCorpusRow[] | 'unavailable'>()
const warnedPaths = new Set<string>()

function warnOnce(path: string, msg: string): void {
  if (warnedPaths.has(path)) return
  warnedPaths.add(path)
  process.stderr.write(`[journalist-tools] ${msg}\n`)
}

/**
 * Query embedder pinned to the backend that BUILT the corpus, read from its
 * `.model` sidecar.
 *
 * Previously this let the client resolve the backend from `EMBED_BACKEND` /
 * auto-detect. That is ambient state, and it was simply wrong here: the agent
 * corpus is gemini/768 while an `OPENAI_API_KEY` in the environment resolves to
 * openai/1536, so every query mismatched, the dim guard below fired, and
 * semantic recall was silently off for the journalist agent — the same defect
 * already fixed once on the verifier corpus, still live on this one.
 *
 * The corpus knows how it was built; ambient config has to be remembered
 * correctly at every call site. Prefer the corpus.
 */
const embedFnCache = new Map<string, (text: string) => Promise<number[]>>()

function getCorpusEmbedFn(cachePath: string): (text: string) => Promise<number[]> {
  const hit = embedFnCache.get(cachePath)
  if (hit) return hit

  let side: CorpusSidecar = {}
  try {
    const p = `${cachePath}.model`
    if (existsSync(p)) side = parseCorpusSidecar(readFileSync(p, 'utf8'))
  } catch {
    /* no sidecar → fall back to ambient resolution below */
  }

  const fn = async (text: string) => {
    const opts: EmbedOptions = {}
    if (side.backend === 'openai' || side.backend === 'gemini' || side.backend === 'ollama')
      opts.backend = side.backend
    if (side.model) opts.model = side.model
    if (side.dim) opts.dim = side.dim
    // No sidecar: preserve the previous behaviour — let the client resolve
    // (so the insufficient_quota → gemini latch still applies), except that an
    // explicitly env-pinned ollama stays pinned.
    if (!opts.backend) {
      const backend = process.env.EMBED_BACKEND as 'openai' | 'gemini' | 'ollama' | undefined
      if (backend === 'ollama') opts.backend = backend
    }
    const [vec] = await embedTexts([text], opts)
    return vec
  }
  embedFnCache.set(cachePath, fn)
  return fn
}

/**
 * Semantic recall over the agent corpus (transcript chunks + press
 * headlines) embedded by `npm run embed:agent-corpus`. Returns hits in
 * the same LocalHit shape the lexical search uses, with
 * `matchedField: 'semantic'` and the corpus snippet as preview — so the
 * agent's citation building works unchanged.
 *
 * GRACEFUL DEGRADE IS THE CONTRACT: a missing cache file, an unusable
 * embed backend, or any embed error resolves to `[]` (with one stderr
 * warning per process) — the agent then behaves exactly as before this
 * feature existed. Never throws.
 */
export async function semanticLocalHits(
  query: string,
  opts: {
    topK?: number
    cachePath?: string
    embedFn?: (text: string) => Promise<number[]>
  } = {},
): Promise<LocalHit[]> {
  const q = (query ?? '').trim()
  if (!q) return []
  const cachePath = opts.cachePath ?? AGENT_CORPUS_DEFAULT_PATH
  const topK = opts.topK ?? 4

  let rows = corpusCache.get(cachePath)
  if (rows === undefined) {
    try {
      rows = loadAgentCorpus(cachePath).rows
    } catch {
      rows = 'unavailable'
      warnOnce(
        cachePath,
        `agent corpus not available at ${cachePath} — semantic local search off ` +
          '(run `npm run embed:agent-corpus` to enable); falling back to lexical only',
      )
    }
    corpusCache.set(cachePath, rows)
  }
  if (rows === 'unavailable' || rows.length === 0) return []

  let queryVec: number[]
  try {
    queryVec = await (opts.embedFn ?? getCorpusEmbedFn(cachePath))(q)
  } catch (err) {
    warnOnce(
      `${cachePath}#embed`,
      `query embedding failed (${(err as Error).message}) — semantic local search off for this run`,
    )
    return []
  }
  const corpusDim = rows[0]?.embedding.length ?? 0
  if (queryVec.length !== corpusDim) {
    // Backend switched without re-embedding the corpus (768-dim nomic vs
    // 1536-dim OpenAI aren't comparable) — degrade instead of garbage.
    warnOnce(
      `${cachePath}#dim`,
      `query dim ${queryVec.length} ≠ corpus dim ${corpusDim} — run ` +
        '`npm run embed:agent-corpus -- --rebuild` with the active backend',
    )
    return []
  }

  return rankAgentCorpus(queryVec, rows, topK).map(({ row, score }) => ({
    localPath: row.localPath,
    matchedField: 'semantic',
    preview: row.snippet,
    row: { sourceId: row.sourceId, ref: row.ref, score, meta: row.meta },
  }))
}

function flattenForSearch(row: unknown, depth = 0): string {
  if (row === null || row === undefined) return ''
  if (typeof row === 'string') return row
  if (typeof row === 'number' || typeof row === 'boolean') return String(row)
  if (depth > 3) return ''
  if (Array.isArray(row)) return row.map((r) => flattenForSearch(r, depth + 1)).join(' · ')
  if (typeof row === 'object') {
    return Object.values(row as Record<string, unknown>)
      .map((v) => flattenForSearch(v, depth + 1))
      .join(' · ')
  }
  return ''
}

export interface OfficialRow {
  slug: string
  name: string
  honorific?: string
  role: string
  party: string
  portfolios: string[]
  email?: string
  photoUrl?: string
  cvUrl?: string
}

export function fetchOfficialBySlug(slug: string): OfficialRow | null {
  const data = readJsonSnapshot<{ officials?: OfficialRow[] }>('public/data/officials.json')
  if (!data?.officials) return null
  return data.officials.find((o) => o.slug === slug) ?? null
}

export interface PressHit {
  title: string
  source: string
  publishedAt: string
  url: string
  summary?: string
}

export function fetchPressForSubject(name: string, limit = 20): PressHit[] {
  const data = readJsonSnapshot<{ items?: Array<Record<string, unknown>> }>(
    'public/data/press.json',
  )
  if (!data?.items) return []
  const tokens = tokenize(name)
  const hits: PressHit[] = []
  for (const it of data.items) {
    if (hits.length >= limit) break
    const title = (it.title as string) ?? ''
    if (!matchesAnyToken(title, tokens)) continue
    // press.json canonical schema (from src/scraper/press.ts) uses
    // `link` + `date` (ISO datetime). Older test fixtures used
    // `url` + `publishedAt`; we read both defensively so the tool
    // keeps working across schema bumps.
    const url = ((it.url as string) || (it.link as string) || '').trim()
    const rawDate = (it.publishedAt as string) || (it.date as string) || ''
    hits.push({
      title,
      source: (it.source as string) ?? '',
      publishedAt: rawDate.slice(0, 10),
      url,
      summary: (it.summary as string) ?? undefined,
    })
  }
  return hits
}

export interface PlenoClaimHit {
  id: string
  plenoId?: string
  plenoDate?: string
  verbatim: string
  type: string
  topic: string
  speakerGroup: string | null
}

export function fetchPlenoClaimsForSubject(name: string, limit = 15): PlenoClaimHit[] {
  const suggestions = readJsonSnapshot<{
    items?: Array<Record<string, unknown>>
  }>('public/data/pleno-claims-suggestions.json')
  if (!suggestions?.items) return []
  const tokens = tokenize(name)
  const hits: PlenoClaimHit[] = []
  for (const it of suggestions.items) {
    if (hits.length >= limit) break
    const verbatim = (it.verbatim as string) ?? ''
    const context = (it.context as string) ?? ''
    if (!matchesAnyToken(verbatim + ' ' + context, tokens)) continue
    hits.push({
      id: (it.id as string) ?? '',
      plenoId: (it.plenoId as string) ?? undefined,
      plenoDate: (it.plenoDate as string) ?? undefined,
      verbatim,
      type: (it.type as string) ?? 'unknown',
      topic: (it.topic as string) ?? 'other',
      speakerGroup: (it.speakerGroup as string) ?? null,
    })
  }
  return hits
}

export interface PromiseHit {
  id: string
  title: string
  party: string
  topic: string
  status: string
  quote: string
  madeAt: string
}

export function fetchPromisesForParty(party: string, limit = 25): PromiseHit[] {
  const data = readJsonSnapshot<{ items?: Array<Record<string, unknown>> }>(
    'public/data/promises.json',
  )
  if (!data?.items) return []
  const hits: PromiseHit[] = []
  for (const it of data.items) {
    if (hits.length >= limit) break
    if ((it.party as string)?.toLowerCase() !== party.toLowerCase()) continue
    hits.push({
      id: (it.id as string) ?? '',
      title: (it.title as string) ?? '',
      party: (it.party as string) ?? '',
      topic: (it.topic as string) ?? 'other',
      status: (it.status as string) ?? 'documentada',
      quote: (it.quote as string) ?? '',
      madeAt: (it.madeAt as string) ?? '',
    })
  }
  return hits
}
