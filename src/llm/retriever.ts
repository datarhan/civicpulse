/**
 * Map-reduce retrieval layer for the promise evidence miner.
 *
 * The LLM is the RERANKER, not the retriever. We use the existing Spanish
 * stemmer from src/scraper/promise-inference.ts to pre-filter each corpus
 * down to the top-N candidates per promise before sending anything to the
 * model. This keeps a single pleno/press/tender run under ~20k tokens total,
 * which fits in Ollama's context and costs <1¢ on gpt-4o-mini.
 */

import { extractKeywords } from '../scraper/promise-inference'

export interface RetrievalCandidate {
  /** URL or permalink — used by the LLM to cite + the post-validator to verify. */
  url: string
  title: string
  date: string
  publisher?: string
  /** Free-form text the retriever scored against. */
  text: string
  /** 0..1 match score from the stemmer-based scorer. */
  score: number
}

export interface RetrievalInput {
  promise: {
    id: string
    title: string
    quote: string
    topic: string
  }
  /** Per-corpus raw documents. Each doc must have url+title+date+some text. */
  corpora: Array<{
    corpus: 'press' | 'pleno_agenda' | 'pleno_vote' | 'tender' | 'bdns' | 'budget'
    documents: Array<{
      url: string
      title: string
      date: string
      publisher?: string
      /** All searchable text concatenated — title + snippet + description etc. */
      text: string
    }>
    /** How many top candidates to pass to the LLM for this corpus. */
    topN?: number
  }>
}

export interface RetrievalOutput {
  byCorpus: Array<{
    corpus: string
    candidates: RetrievalCandidate[]
  }>
  stats: {
    totalDocumentsScanned: number
    totalCandidatesKept: number
  }
}

const DEFAULT_TOP_N_PER_CORPUS = 8

/**
 * Score every document in every corpus against the promise's keywords, keep
 * the top-N per corpus. The scorer is a light BM25 variant — we reuse the
 * existing stemmer for consistency with the regex inference engine (so a
 * change in stemming logic affects both engines identically).
 */
export function retrieveCandidates(input: RetrievalInput): RetrievalOutput {
  const promiseKw = extractKeywords(
    `${input.promise.title} ${input.promise.quote} ${input.promise.topic}`,
  )
  if (promiseKw.length === 0) {
    return { byCorpus: [], stats: { totalDocumentsScanned: 0, totalCandidatesKept: 0 } }
  }

  let totalDocumentsScanned = 0
  const byCorpus: RetrievalOutput['byCorpus'] = []

  for (const block of input.corpora) {
    const topN = block.topN ?? DEFAULT_TOP_N_PER_CORPUS
    const scored: RetrievalCandidate[] = block.documents.map((doc) => {
      totalDocumentsScanned += 1
      const docKw = extractKeywords(`${doc.title} ${doc.text}`)
      const matched = docKw.filter((kw) => promiseKw.includes(kw))
      if (matched.length === 0) {
        return { url: doc.url, title: doc.title, date: doc.date, publisher: doc.publisher, text: doc.text, score: 0 }
      }
      // Simple proportion-of-promise-keywords-hit, capped. Not full BM25 but
      // good enough: corpora are ≤2000 items so the LLM reranker does the
      // heavy lifting anyway.
      const ratio = matched.length / Math.min(promiseKw.length, 8)
      const score = Math.min(1, ratio + 0.08 * (matched.length - 1))
      return { url: doc.url, title: doc.title, date: doc.date, publisher: doc.publisher, text: doc.text, score }
    })

    const ranked = scored
      .filter((c) => c.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, topN)

    byCorpus.push({ corpus: block.corpus, candidates: ranked })
  }

  return {
    byCorpus,
    stats: {
      totalDocumentsScanned,
      totalCandidatesKept: byCorpus.reduce((a, b) => a + b.candidates.length, 0),
    },
  }
}

/**
 * Assert every URL in a set of LLM outputs actually exists among the
 * retrieved candidates. Rejects hallucinated citations.
 */
export function buildUrlAllowlist(retrieval: RetrievalOutput): Set<string> {
  const urls = new Set<string>()
  for (const block of retrieval.byCorpus) {
    for (const c of block.candidates) urls.add(c.url)
  }
  return urls
}
