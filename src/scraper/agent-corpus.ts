/**
 * Agent semantic corpus — transcripts + press embedded for the
 * journalist agent's local retrieval (see docs/superpowers/specs/
 * 2026-07-29-agent-rag-and-entities-design.md §1).
 *
 * Mirrors the verifier's embed pattern (semantic-shortlist.ts) with its
 * own row type and JSONL cache: different chunking (transcript line
 * windows vs dataset row snippets), different consumer (the journalist
 * agent's `local-snapshot` tool vs the verifier's shortlist), and the
 * verifier's loader hard-validates its own kind enum. Two files, one
 * pattern; both live in the gitignored `.embed-cache/`.
 *
 * Pure module — no network. The CLI (scripts/embed-agent-corpus.ts)
 * does the embedding; the runtime consumer (journalist-tools/local.ts)
 * does the query-time ranking.
 */

import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { cosineSimilarity } from './semantic-shortlist'

export type AgentCorpusKind = 'transcript' | 'press'

export interface AgentCorpusMeta {
  plenoId?: string
  startLine?: number
  endLine?: number
  pressId?: string
  date?: string
}

export interface AgentCorpusRow {
  kind: AgentCorpusKind
  /** `transcript:<plenoId>#L<start>-L<end>` or `press:<id>`. */
  sourceId: string
  /** Source text used for the embedding. */
  text: string
  /** SHA-256 of `text` — the incremental re-embed key. */
  textSha256: string
  embedding: number[]
  /** ≤220-char single-spaced excerpt for citations. */
  snippet: string
  /** Click-through ref: `/plenos/<id>` for transcripts, article URL for press. */
  ref: string
  /** On-disk source, so agent citations keep the localPath contract. */
  localPath: string
  meta: AgentCorpusMeta
  embeddedAt?: string
}

/** Row minus the embedding — what buildAgentCorpusTexts emits; the CLI zips vectors in. */
export type PendingAgentCorpusRow = Omit<AgentCorpusRow, 'embedding' | 'embeddedAt'>

export interface TranscriptChunk {
  /** 1-based, inclusive. */
  startLine: number
  endLine: number
  text: string
}

const TARGET_CHARS = 1100
const OVERLAP_LINES = 4

/**
 * Split a transcript into line-accumulating windows of ~TARGET_CHARS,
 * with OVERLAP_LINES trailing lines repeated at the start of the next
 * window so a statement straddling a boundary is still retrievable.
 * Deterministic; short transcripts yield a single chunk.
 */
export function chunkTranscript(
  text: string,
  opts: { targetChars?: number; overlapLines?: number } = {},
): TranscriptChunk[] {
  const targetChars = opts.targetChars ?? TARGET_CHARS
  const overlapLines = opts.overlapLines ?? OVERLAP_LINES
  const lines = text.split('\n')
  const chunks: TranscriptChunk[] = []
  let start = 0
  while (start < lines.length) {
    let end = start
    let size = 0
    while (end < lines.length && size < targetChars) {
      size += lines[end].length + 1
      end += 1
    }
    chunks.push({
      startLine: start + 1,
      endLine: end,
      text: lines.slice(start, end).join('\n'),
    })
    if (end >= lines.length) break
    start = Math.max(end - overlapLines, start + 1)
  }
  return chunks
}

function sha256(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex')
}

function snippetOf(text: string): string {
  return text.replace(/\s+/g, ' ').trim().slice(0, 220)
}

export interface PressItemForCorpus {
  id: string
  title: string
  source?: string
  link?: string
  date?: string
}

/**
 * Build embedding-ready rows for every transcript chunk + press item.
 * Pure and deterministic (sha-stable) — the CLI diffs shas against the
 * existing cache to embed only changed rows.
 */
export function buildAgentCorpusTexts(input: {
  transcripts: Map<string, string>
  press: PressItemForCorpus[]
}): PendingAgentCorpusRow[] {
  const rows: PendingAgentCorpusRow[] = []
  for (const [plenoId, text] of input.transcripts) {
    for (const c of chunkTranscript(text)) {
      rows.push({
        kind: 'transcript',
        sourceId: `transcript:${plenoId}#L${c.startLine}-L${c.endLine}`,
        text: c.text,
        textSha256: sha256(c.text),
        snippet: snippetOf(c.text),
        ref: `/plenos/${plenoId}`,
        localPath: `public/data/pleno-transcripts/${plenoId}.txt`,
        meta: { plenoId, startLine: c.startLine, endLine: c.endLine },
      })
    }
  }
  for (const item of input.press) {
    if (!item?.id || !item?.title) continue
    const text = [item.title, item.source].filter(Boolean).join(' · ')
    rows.push({
      kind: 'press',
      sourceId: `press:${item.id}`,
      text,
      textSha256: sha256(text),
      snippet: snippetOf(text),
      ref: item.link ?? 'public/data/press.json',
      localPath: 'public/data/press.json',
      meta: { pressId: item.id, date: item.date },
    })
  }
  return rows
}

export class AgentCorpusLoadError extends Error {
  constructor(msg: string) {
    super(`agent-corpus: ${msg}`)
    this.name = 'AgentCorpusLoadError'
  }
}

function isAgentCorpusRow(o: unknown): o is AgentCorpusRow {
  if (!o || typeof o !== 'object') return false
  const r = o as Partial<AgentCorpusRow>
  return (
    (r.kind === 'transcript' || r.kind === 'press') &&
    typeof r.sourceId === 'string' &&
    typeof r.text === 'string' &&
    typeof r.textSha256 === 'string' &&
    Array.isArray(r.embedding) &&
    r.embedding.length > 0 &&
    typeof r.snippet === 'string' &&
    typeof r.ref === 'string' &&
    typeof r.localPath === 'string'
  )
}

/**
 * Load the JSONL cache defensively: corrupt or foreign-kind lines are
 * skipped with a warning, never fatal (same contract as the verifier's
 * loadCorpus — a crashed embed run must not brick the agent).
 */
export function loadAgentCorpus(path: string): { rows: AgentCorpusRow[]; sourcePath: string } {
  if (!existsSync(path)) {
    throw new AgentCorpusLoadError(`cache file not found: ${path}`)
  }
  const rows: AgentCorpusRow[] = []
  let lineNo = 0
  for (const rawLine of readFileSync(path, 'utf8').split('\n')) {
    lineNo += 1
    const line = rawLine.trim()
    if (!line) continue
    let parsed: unknown
    try {
      parsed = JSON.parse(line)
    } catch {
      process.stderr.write(`[agent-corpus] skipping corrupt JSONL line ${lineNo}\n`)
      continue
    }
    if (!isAgentCorpusRow(parsed)) {
      process.stderr.write(`[agent-corpus] skipping invalid row at line ${lineNo}\n`)
      continue
    }
    rows.push(parsed)
  }
  return { rows, sourcePath: path }
}

/** Brute-force cosine ranking — ~1.5k rows × 768 dims is sub-millisecond. */
export function rankAgentCorpus(
  queryVec: number[],
  rows: AgentCorpusRow[],
  topK: number,
): Array<{ row: AgentCorpusRow; score: number }> {
  return rows
    .map((row) => ({ row, score: cosineSimilarity(queryVec, row.embedding) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.max(0, topK))
}
