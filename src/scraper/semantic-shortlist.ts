/**
 * Semantic shortlist for the verifier — drop-in replacement for the
 * lexical word-overlap shortlist when `VERIFIER_SHORTLIST=semantic|hybrid`.
 *
 * Pure module: cosine similarity over a pre-computed corpus loaded from a
 * JSONL cache. The OpenAI embedding call is injected via `embedFn` so
 * tests don't need network. Returns the same `CandidateShortlist` shape
 * as the lexical version so the caller is unchanged.
 *
 * Cache format: one JSON object per line, append-only. See
 * `scripts/embed-verifier-corpus.ts` for the writer.
 */

import { existsSync, readFileSync } from 'node:fs'
import type { PlenoClaim } from './pleno-claim'
import type { CandidateShortlist } from './claim-verifier'

export type CorpusKind = 'tender' | 'bdns' | 'promise' | 'prior-claim'

export interface CorpusRow {
  kind: CorpusKind
  /** Stable id (permalink, convocatoriaId, promise id, claim id). */
  sourceId: string
  /** Source text used for the embedding (kept for snippet rendering). */
  text: string
  /** SHA-256 of `text` — re-embed key. */
  textSha256: string
  /** L2-normalised embedding vector, 1536 dims for text-embedding-3-small. */
  embedding: number[]
  /** UI-facing snippet (≤230 chars). Pre-formatted by the embed script so
   *  the runtime path does not need access to the raw dataset rows. */
  snippet: string
  /** Click-through ref (URL or synthetic) for the verdict citation. */
  ref: string
  /** For promise rows: bloc, so we can filter to same-bloc matches like
   *  the lexical path does. Null for non-promise rows. */
  party?: string | null
  /** Cosmetic — surfaces in JSONL diffs when re-embedding. */
  embeddedAt?: string
}

export interface Corpus {
  rows: CorpusRow[]
  /** Path the corpus was loaded from, for diagnostics. */
  sourcePath: string
}

export class CorpusLoadError extends Error {
  constructor(msg: string) {
    super(`semantic-shortlist: ${msg}`)
    this.name = 'CorpusLoadError'
  }
}

/**
 * Load the JSONL cache. Skips corrupt lines with a warning rather than
 * failing the whole verifier — defensive parse so a single bad row from a
 * crashed embed run doesn't kill the whole verifier pass.
 */
export function loadCorpus(path: string): Corpus {
  if (!existsSync(path)) {
    throw new CorpusLoadError(`cache file not found: ${path}`)
  }
  const text = readFileSync(path, 'utf8')
  const rows: CorpusRow[] = []
  let lineNo = 0
  for (const rawLine of text.split('\n')) {
    lineNo += 1
    const line = rawLine.trim()
    if (!line) continue
    let parsed: unknown
    try {
      parsed = JSON.parse(line)
    } catch {
      process.stderr.write(`[semantic-shortlist] skipping corrupt JSONL line ${lineNo}\n`)
      continue
    }
    if (!isCorpusRow(parsed)) {
      process.stderr.write(`[semantic-shortlist] skipping invalid row at line ${lineNo}\n`)
      continue
    }
    rows.push(parsed)
  }
  return { rows, sourcePath: path }
}

function isCorpusRow(o: unknown): o is CorpusRow {
  if (!o || typeof o !== 'object') return false
  const r = o as Partial<CorpusRow>
  return (
    typeof r.kind === 'string' &&
    ['tender', 'bdns', 'promise', 'prior-claim'].includes(r.kind) &&
    typeof r.sourceId === 'string' &&
    typeof r.text === 'string' &&
    typeof r.textSha256 === 'string' &&
    Array.isArray(r.embedding) &&
    r.embedding.length > 0 &&
    typeof r.snippet === 'string' &&
    typeof r.ref === 'string'
  )
}

/**
 * Cosine similarity. OpenAI text-embedding-3-* vectors are L2-normalised,
 * so this reduces to a dot product — but we still divide by norms to be
 * defensive against malformed cache rows.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0
  let dot = 0
  let na = 0
  let nb = 0
  for (let i = 0; i < a.length; i++) {
    const av = a[i]
    const bv = b[i]
    dot += av * bv
    na += av * av
    nb += bv * bv
  }
  if (na === 0 || nb === 0) return 0
  return dot / Math.sqrt(na * nb)
}

export type EmbedFn = (text: string) => Promise<number[]>

export interface SemanticShortlistOptions {
  topK?: number
  /** Floor — rows below this similarity are dropped. Matches the lexical
   *  0.20 floor in spirit, though the absolute number isn't directly
   *  comparable across the two scoring schemes. */
  minSimilarity?: number
}

/**
 * Build the top-K candidate list for an LLM verifier pass using semantic
 * similarity. Same return shape as `shortlistCandidates()` in
 * `claim-verifier.ts` so the caller is invariant to the backend choice.
 *
 * Filtering behaviour:
 *   · `promise` kind only matched against `claim.type === 'promesa'`
 *     (matches the lexical impl's discipline).
 *   · same-bloc filter applied when both the promise row's party and the
 *     claim's speakerGroup are set.
 *   · prior-claim rows are surfaced for any claim type — used by the
 *     promesa-repetida detection path too.
 */
export async function semanticShortlist(
  claim: PlenoClaim,
  corpus: Corpus,
  embedFn: EmbedFn,
  opts: SemanticShortlistOptions = {},
): Promise<CandidateShortlist[]> {
  const topK = opts.topK ?? 8
  const minSimilarity = opts.minSimilarity ?? 0.25

  const queryText = `${claim.verbatim} ${claim.context ?? ''}`.trim()
  if (!queryText) return []

  const claimEmbedding = await embedFn(queryText)
  if (!Array.isArray(claimEmbedding) || claimEmbedding.length === 0) return []

  const scored: Array<{ row: CorpusRow; similarity: number }> = []
  for (const row of corpus.rows) {
    // CandidateShortlist downstream only carries tender|bdns|promise.
    // prior-claim rows live in the corpus for future use (e.g.
    // promesa-repetida) but never surface in the LLM shortlist — would
    // pollute the evidence audit trail.
    if (row.kind === 'prior-claim') continue
    // Kind-specific filters mirror the lexical path's gates.
    if (row.kind === 'promise' && claim.type !== 'promesa') continue
    if (
      row.kind === 'promise' &&
      row.party &&
      claim.speakerGroup &&
      row.party !== claim.speakerGroup
    ) {
      continue
    }
    const cos = cosineSimilarity(claimEmbedding, row.embedding)
    const sim = Math.max(0, Math.min(1, cos))
    if (sim < minSimilarity) continue
    scored.push({ row, similarity: sim })
  }

  scored.sort((a, b) => b.similarity - a.similarity)
  const top = scored.slice(0, topK)
  return top.map(({ row, similarity }) => ({
    kind: row.kind as 'tender' | 'bdns' | 'promise',
    ref: row.ref,
    snippet: row.snippet,
    similarity: Math.round(similarity * 100) / 100,
  }))
}

/**
 * Hybrid mode: union of two shortlists, deduped by `ref`, sorted by
 * `similarity` desc, capped at `topK`. Used when
 * `VERIFIER_SHORTLIST=hybrid` so we get the union of lexical + semantic
 * recall without doubling the LLM's input window.
 */
export function mergeShortlists(lists: CandidateShortlist[][], topK: number): CandidateShortlist[] {
  const byRef = new Map<string, CandidateShortlist>()
  for (const list of lists) {
    for (const item of list) {
      const existing = byRef.get(item.ref)
      if (!existing || item.similarity > existing.similarity) {
        byRef.set(item.ref, item)
      }
    }
  }
  const merged = [...byRef.values()].sort((a, b) => b.similarity - a.similarity)
  return merged.slice(0, topK)
}
