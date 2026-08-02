/**
 * Retrieval health — known-answer tests for the embedding corpora.
 *
 * `eval:verifier` measures whether the JUDGE is right. Nothing measured whether
 * the RETRIEVER retrieved, and the gap was not academic: the verifier corpus was
 * built with gemini/768 while `EMBED_BACKEND` resolved to openai/1536 whenever
 * an OpenAI key was in the environment. `cosineSimilarity` returns 0 for vectors
 * of differing width, so every row scored 0, every row fell below the floor, and
 * the pipeline reported "no candidates" — which is exactly what an empty corpus
 * reports. 653 claims went unjudged behind that, and the written diagnosis at
 * the time ("no euro figure, so lexical retrieval finds nothing") was confident
 * and wrong.
 *
 * The fix is a test with a known answer: **a document must retrieve itself.**
 * Embed a row's own text through the LIVE query path, search the STORED corpus,
 * and the row should come back at rank 1 with similarity ≈ 1. No human labels,
 * no gold set, ~8 embedding calls. It catches width mismatch, a wrong model, a
 * corrupt corpus, and broken normalisation — the whole catastrophic class —
 * because all of them break self-retrieval.
 *
 * Note the probe must embed FRESH text. Querying with a row's stored vector
 * would exercise only the arithmetic and would have passed happily throughout
 * the incident above.
 *
 * Pure module: no fs, no network. The CLI (scripts/check-retrieval.ts) supplies
 * the corpus and the embed function.
 */

export type HealthLevel = 'error' | 'warn'

/**
 * The `<corpus>.model` sidecar, e.g. `openai:text-embedding-3-small:1536`.
 *
 * Written at build time since the corpus builders landed, and — until this
 * module — read by nothing. It held the answer to the width-mismatch incident
 * the entire time it was happening.
 *
 * Treat it as authoritative for QUERY-side backend selection: a corpus knows
 * how it was built, whereas `EMBED_BACKEND` is ambient state that has to be
 * remembered correctly at every call site. The two corpora here are on
 * different backends, so there is no single env value that is right for both.
 */
export interface CorpusSidecar {
  backend?: string
  model?: string
  dim?: number
}

export function parseCorpusSidecar(raw: string): CorpusSidecar {
  const [backend, model, dim] = raw.trim().split(':')
  return {
    backend: backend || undefined,
    model: model || undefined,
    dim: Number(dim) || undefined,
  }
}

export type HealthFindingLevel = HealthLevel

export interface HealthFinding {
  level: HealthLevel
  code: string
  message: string
}

export interface ShapeRow {
  sourceId: string
  embedding: number[]
}

/** Self-retrieval similarity below this means the query path disagrees with the
 *  corpus. Identical text through an identical model returns ~1.0; the slack is
 *  for float noise and provider-side nondeterminism, nothing more. */
export const SELF_SIM_FLOOR = 0.98

/** L2 norms outside this band mean the vectors were never normalised. Cosine
 *  still divides by norms so results stay correct, but a build that stopped
 *  normalising is a regression worth seeing — truncated Gemini dimensions
 *  arrive at L2 ≈ 0.57 and needed client-side normalisation to fix. */
export const NORM_BAND: [number, number] = [0.9, 1.1]

export function l2Norm(v: number[]): number {
  let s = 0
  for (const x of v) s += x * x
  return Math.sqrt(s)
}

export function median(xs: number[]): number {
  if (xs.length === 0) return 0
  const s = [...xs].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

/**
 * Structural checks that need no embedding calls at all.
 */
export function assessCorpusShape(rows: ShapeRow[]): HealthFinding[] {
  const out: HealthFinding[] = []
  if (rows.length === 0) {
    return [
      {
        level: 'error',
        code: 'empty-corpus',
        message: 'corpus has no rows — rebuild with `npm run embed:verifier-corpus -- --rebuild`',
      },
    ]
  }

  const dims = new Map<number, number>()
  for (const r of rows) dims.set(r.embedding.length, (dims.get(r.embedding.length) ?? 0) + 1)
  if (dims.size > 1) {
    const summary = [...dims.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([d, n]) => `${d}-dim×${n}`)
      .join(', ')
    out.push({
      level: 'error',
      code: 'mixed-dimensions',
      message:
        `corpus mixes embedding widths (${summary}). Vectors of different widths score 0 ` +
        `against each other, so part of the corpus is silently unreachable. Full rebuild required.`,
    })
  }

  const zero = rows.filter((r) => l2Norm(r.embedding) === 0)
  if (zero.length > 0) {
    out.push({
      level: 'error',
      code: 'zero-vectors',
      message:
        `${zero.length} row(s) have an all-zero embedding (e.g. ${zero[0].sourceId}). ` +
        `They can never be retrieved.`,
    })
  }

  const norms = rows.map((r) => l2Norm(r.embedding)).filter((n) => n > 0)
  const med = median(norms)
  if (norms.length > 0 && (med < NORM_BAND[0] || med > NORM_BAND[1])) {
    out.push({
      level: 'warn',
      code: 'unnormalised',
      message:
        `median L2 norm is ${med.toFixed(3)}, outside [${NORM_BAND[0]}, ${NORM_BAND[1]}]. ` +
        `Cosine still normalises, but the builder appears to have stopped L2-normalising ` +
        `(truncated Gemini output lands near 0.57).`,
    })
  }

  return out
}

export interface ProbeOutcome {
  sourceId: string
  /** 1-based rank of the row among its own search results; 0 = absent. */
  rank: number
  /** Similarity the row scored against a fresh embedding of its own text. */
  selfSimilarity: number
}

/**
 * The known-answer assertion: every probe should rank itself first.
 */
export function assessSelfRetrieval(probes: ProbeOutcome[]): HealthFinding[] {
  if (probes.length === 0) {
    return [{ level: 'warn', code: 'no-probes', message: 'no probes ran' }]
  }
  const out: HealthFinding[] = []
  const missed = probes.filter((p) => p.rank !== 1)
  const weak = probes.filter((p) => p.rank === 1 && p.selfSimilarity < SELF_SIM_FLOOR)

  // Total failure has one overwhelmingly likely cause, so name it.
  if (missed.length === probes.length) {
    out.push({
      level: 'error',
      code: 'retrieval-dead',
      message:
        `not one of ${probes.length} probes retrieved its own text. The query path and the ` +
        `corpus disagree — almost always EMBED_BACKEND pointing at a different model than ` +
        `the one that built the corpus (check the <corpus>.model sidecar). Every search is ` +
        `returning nothing and reporting it as "no candidates".`,
    })
    return out
  }

  if (missed.length > 0) {
    out.push({
      level: 'error',
      code: 'self-retrieval-miss',
      message:
        `${missed.length}/${probes.length} probe(s) did not rank their own text first ` +
        `(e.g. ${missed[0].sourceId} at rank ${missed[0].rank || 'absent'}).`,
    })
  }

  if (weak.length > 0) {
    out.push({
      level: 'error',
      code: 'self-similarity-low',
      message:
        `${weak.length} probe(s) ranked first but scored below ${SELF_SIM_FLOOR} against their ` +
        `own text (lowest ${Math.min(...weak.map((w) => w.selfSimilarity)).toFixed(3)}, ` +
        `${weak[0].sourceId}). Identical text should score ~1.0; the query model likely ` +
        `differs from the corpus model.`,
    })
  }

  return out
}

/**
 * Rank each probe's own row among its search results.
 *
 * Lives here rather than in the CLI because the interesting judgement is the
 * `s <= 0` clause: a similarity of exactly 0 is what a width mismatch produces
 * for EVERY row, and `Array.sort` will still hand back a first element. Without
 * this clause a totally dead corpus reports whichever row happened to sort
 * first as a rank-1 hit, and the check passes while retrieval is broken.
 */
export function computeProbeOutcomes(
  probes: { sourceId: string; query: number[] }[],
  rows: ShapeRow[],
  cosine: (a: number[], b: number[]) => number,
): ProbeOutcome[] {
  return probes.map((p) => {
    const scored = rows
      .map((r) => ({ id: r.sourceId, s: cosine(p.query, r.embedding) }))
      .sort((a, b) => b.s - a.s)
    const at = scored.findIndex((x) => x.id === p.sourceId)
    const found = at >= 0 && scored[at].s > 0
    return {
      sourceId: p.sourceId,
      rank: found ? at + 1 : 0,
      selfSimilarity: at >= 0 ? scored[at].s : 0,
    }
  })
}

/**
 * Deterministic spread of probe indices — same rows every run, so a failure is
 * reproducible and a fix is verifiable. Avoids sampling randomly, which would
 * make an intermittent failure impossible to chase.
 */
export function pickProbeIndices(total: number, count: number): number[] {
  if (total <= 0 || count <= 0) return []
  const n = Math.min(count, total)
  const step = total / n
  const out: number[] = []
  for (let i = 0; i < n; i++) out.push(Math.min(total - 1, Math.floor(i * step)))
  return [...new Set(out)]
}
