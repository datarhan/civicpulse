/**
 * Tests for the semantic shortlist (`src/scraper/semantic-shortlist.ts`)
 * and the dispatcher (`getShortlist` in claim-verifier.ts) that swaps
 * lexical / semantic / hybrid backends behind one entry point.
 *
 * Stub `embedFn` returns deterministic vectors so we don't touch the
 * network — these are correctness tests for the pure cosine layer +
 * the merge logic + the kind-specific filters that mirror the lexical
 * path's discipline.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  type Corpus,
  assertQueryDimMatchesCorpus,
  cosineSimilarity,
  loadCorpus,
  mergeShortlists,
  semanticShortlist,
} from '../../src/scraper/semantic-shortlist'
import { getShortlist, type VerifierInputs } from '../../src/scraper/claim-verifier'
import type { PlenoClaim } from '../../src/scraper/pleno-claim'

// Tiny helpers — embeddings are 4-dim for legibility.
function vec(...xs: number[]): number[] {
  return xs
}

function unit(...xs: number[]): number[] {
  const n = Math.sqrt(xs.reduce((a, x) => a + x * x, 0)) || 1
  return xs.map((x) => x / n)
}

const claim: PlenoClaim = {
  id: 'c-1',
  plenoId: 'p1',
  plenoDate: '2026-01-01',
  segmentIndex: 0,
  type: 'afirmacion_numerica',
  topic: 'urbanismo',
  speakerGroup: 'PP',
  verbatim: 'el contrato de alumbrado público costó doscientos mil euros',
  context: 'eficiencia energética',
  entities: { amountEuros: 200_000 },
  confidence: 0.85,
  reasoning: '',
  requiresHumanApproval: true,
}

function corpusFixture(): Corpus {
  return {
    sourcePath: '<fixture>',
    rows: [
      {
        kind: 'tender',
        sourceId: 't-1',
        text: 'Suministro alumbrado público',
        textSha256: 'h1',
        embedding: unit(1, 0, 0, 0),
        snippet: 'Suministro alumbrado público · €195k',
        ref: 'https://example.com/t/1',
      },
      {
        kind: 'tender',
        sourceId: 't-2',
        text: 'Limpieza jardines',
        textSha256: 'h2',
        embedding: unit(0, 1, 0, 0),
        snippet: 'Limpieza jardines · €50k',
        ref: 'https://example.com/t/2',
      },
      {
        kind: 'bdns',
        sourceId: 'b-1',
        text: 'Convocatoria iluminación',
        textSha256: 'h3',
        embedding: unit(0.9, 0.1, 0, 0),
        snippet: 'Convocatoria iluminación · €30k',
        ref: 'bdns:1',
      },
      {
        kind: 'promise',
        sourceId: 'p-1',
        text: 'PSOE prometió alumbrado eficiente',
        textSha256: 'h4',
        embedding: unit(0.95, 0.05, 0, 0),
        snippet: 'PSOE «alumbrado eficiente»',
        ref: 'promise:p-1',
        party: 'PSOE',
      },
      {
        kind: 'prior-claim',
        sourceId: 'pc-1',
        text: 'previous mention of alumbrado',
        textSha256: 'h5',
        embedding: unit(1, 0, 0, 0),
        snippet: 'pleno previo · alumbrado',
        ref: 'claim:pc-1',
      },
    ],
  }
}

describe('cosineSimilarity', () => {
  it('returns 1 for identical unit vectors', () => {
    const v = unit(1, 2, 3)
    expect(cosineSimilarity(v, v)).toBeCloseTo(1, 5)
  })
  it('returns 0 for orthogonal vectors', () => {
    expect(cosineSimilarity(unit(1, 0, 0), unit(0, 1, 0))).toBeCloseTo(0, 5)
  })
  it('returns 0 for empty vectors', () => {
    expect(cosineSimilarity([], [])).toBe(0)
  })
  it('returns 0 for length mismatch', () => {
    expect(cosineSimilarity([1, 2], [1, 2, 3])).toBe(0)
  })
})

describe('semanticShortlist', () => {
  it('ranks rows by cosine to the claim embedding', async () => {
    const corpus = corpusFixture()
    // Claim embedding aligned with t-1 (1,0,0,0).
    const embedFn = async () => unit(1, 0, 0, 0)
    const list = await semanticShortlist(claim, corpus, embedFn)
    expect(list.length).toBeGreaterThan(0)
    expect(list[0].ref).toBe('https://example.com/t/1')
    // Similarity is rounded to 2 decimals and clipped to [0,1].
    expect(list[0].similarity).toBe(1)
  })

  it('respects topK', async () => {
    const corpus = corpusFixture()
    const embedFn = async () => unit(1, 0, 0, 0)
    const list = await semanticShortlist(claim, corpus, embedFn, { topK: 2 })
    expect(list).toHaveLength(2)
  })

  it('drops rows below minSimilarity', async () => {
    const corpus = corpusFixture()
    // Claim points at the 4th axis — only orthogonal rows remain (sim=0)
    const embedFn = async () => unit(0, 0, 0, 1)
    const list = await semanticShortlist(claim, corpus, embedFn, { minSimilarity: 0.1 })
    expect(list).toHaveLength(0)
  })

  it('filters out promise rows when claim type is not promesa', async () => {
    const corpus = corpusFixture()
    const embedFn = async () => unit(1, 0, 0, 0)
    const list = await semanticShortlist(claim, corpus, embedFn)
    expect(list.find((r) => r.ref.startsWith('promise:'))).toBeUndefined()
  })

  it('keeps promise rows when claim type IS promesa, same bloc', async () => {
    const corpus = corpusFixture()
    const promiseClaim: PlenoClaim = {
      ...claim,
      type: 'promesa',
      speakerGroup: 'PSOE',
    }
    const embedFn = async () => unit(1, 0, 0, 0)
    const list = await semanticShortlist(promiseClaim, corpus, embedFn)
    expect(list.find((r) => r.ref === 'promise:p-1')).toBeDefined()
  })

  it('drops promise rows from a different bloc', async () => {
    const corpus = corpusFixture()
    const promiseClaim: PlenoClaim = { ...claim, type: 'promesa', speakerGroup: 'PP' }
    const embedFn = async () => unit(1, 0, 0, 0)
    const list = await semanticShortlist(promiseClaim, corpus, embedFn)
    expect(list.find((r) => r.ref === 'promise:p-1')).toBeUndefined()
  })

  it('never surfaces prior-claim rows (they pollute the audit trail)', async () => {
    const corpus = corpusFixture()
    const embedFn = async () => unit(1, 0, 0, 0)
    const list = await semanticShortlist(claim, corpus, embedFn)
    expect(list.find((r) => r.ref.startsWith('claim:'))).toBeUndefined()
  })

  it('returns the same CandidateShortlist shape as the lexical path', async () => {
    const corpus = corpusFixture()
    const embedFn = async () => unit(1, 0, 0, 0)
    const list = await semanticShortlist(claim, corpus, embedFn)
    for (const item of list) {
      expect(item).toHaveProperty('kind')
      expect(item).toHaveProperty('ref')
      expect(item).toHaveProperty('snippet')
      expect(item).toHaveProperty('similarity')
      expect(['tender', 'bdns', 'promise']).toContain(item.kind)
    }
  })

  it('clips negative cosine to 0 (drops below default threshold)', async () => {
    const corpus: Corpus = {
      sourcePath: '<fixture>',
      rows: [
        {
          kind: 'tender',
          sourceId: 't-neg',
          text: 'antipodal',
          textSha256: 'h-neg',
          // Antipodal to the claim — cosine = -1, clipped to 0.
          embedding: unit(-1, 0, 0, 0),
          snippet: 'antipodal',
          ref: 'tender:neg',
        },
      ],
    }
    const embedFn = async () => unit(1, 0, 0, 0)
    // Default minSimilarity (0.25) drops the antipodal row.
    const list = await semanticShortlist(claim, corpus, embedFn)
    expect(list).toHaveLength(0)
  })
})

describe('mergeShortlists', () => {
  it('dedupes by ref and keeps the higher similarity', () => {
    const merged = mergeShortlists(
      [
        [
          { kind: 'tender', ref: 'a', snippet: 'A', similarity: 0.6 },
          { kind: 'tender', ref: 'b', snippet: 'B', similarity: 0.4 },
        ],
        [
          { kind: 'tender', ref: 'a', snippet: 'A', similarity: 0.8 },
          { kind: 'bdns', ref: 'c', snippet: 'C', similarity: 0.5 },
        ],
      ],
      10,
    )
    expect(merged).toHaveLength(3)
    expect(merged[0].ref).toBe('a')
    expect(merged[0].similarity).toBe(0.8)
  })

  it('caps at topK', () => {
    const merged = mergeShortlists(
      [
        [
          { kind: 'tender', ref: 'a', snippet: '', similarity: 0.9 },
          { kind: 'tender', ref: 'b', snippet: '', similarity: 0.8 },
          { kind: 'tender', ref: 'c', snippet: '', similarity: 0.7 },
        ],
      ],
      2,
    )
    expect(merged).toHaveLength(2)
    expect(merged.map((m) => m.ref)).toEqual(['a', 'b'])
  })
})

describe('loadCorpus', () => {
  let dir: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'cp-corpus-'))
  })
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('loads valid JSONL', () => {
    const path = join(dir, 'corpus.jsonl')
    writeFileSync(
      path,
      JSON.stringify({
        kind: 'tender',
        sourceId: 't-1',
        text: 'x',
        textSha256: 'h',
        embedding: [1, 0, 0, 0],
        snippet: 's',
        ref: 'r',
      }) + '\n',
    )
    const corpus = loadCorpus(path)
    expect(corpus.rows).toHaveLength(1)
  })

  it('skips corrupt JSONL lines without throwing', () => {
    const path = join(dir, 'corrupt.jsonl')
    const good = JSON.stringify({
      kind: 'tender',
      sourceId: 't-1',
      text: 'x',
      textSha256: 'h',
      embedding: [1, 0, 0, 0],
      snippet: 's',
      ref: 'r',
    })
    writeFileSync(path, good + '\n{not json\n' + good + '\n')
    const corpus = loadCorpus(path)
    expect(corpus.rows).toHaveLength(2)
  })

  it('skips rows missing required fields', () => {
    const path = join(dir, 'invalid.jsonl')
    writeFileSync(path, JSON.stringify({ kind: 'tender' /* missing rest */ }) + '\n')
    const corpus = loadCorpus(path)
    expect(corpus.rows).toHaveLength(0)
  })

  it('throws CorpusLoadError when the file is missing', () => {
    expect(() => loadCorpus(join(dir, 'nope.jsonl'))).toThrow(/cache file not found/)
  })
})

describe('getShortlist dispatcher', () => {
  it('falls back to lexical when mode is "lexical"', async () => {
    const inputs: VerifierInputs = {
      claim,
      tenders: {
        items: [
          {
            permalink: 'https://t/1',
            title: 'Mantenimiento alumbrado',
            award_amount_eur: 100_000,
          },
        ],
      },
    }
    const list = await getShortlist(inputs, 5, { mode: 'lexical' })
    expect(list.length).toBeGreaterThan(0)
  })

  it('falls back to lexical when semantic is selected but cache is missing', async () => {
    const inputs: VerifierInputs = {
      claim,
      tenders: {
        items: [
          {
            permalink: 'https://t/1',
            title: 'Mantenimiento alumbrado',
            award_amount_eur: 100_000,
          },
        ],
      },
    }
    // Use a path that definitely doesn't exist; dispatcher should warn
    // and use lexical instead of throwing.
    const list = await getShortlist(inputs, 5, {
      mode: 'semantic',
      corpusPath: '/nonexistent/path/to/corpus.jsonl',
    })
    expect(list.length).toBeGreaterThan(0)
  })
})

describe('embed-cache hash-keyed dedup', () => {
  // The embed script's cache logic is straightforward enough that an
  // in-memory smoke test of the pieces is more valuable than spinning
  // the whole CLI. The contract: rows whose textSha256 matches an
  // existing cache entry are reused, not re-embedded.
  it('reuses rows whose hash matches', () => {
    const cached = new Map<string, { textSha256: string }>([['tender:t-1', { textSha256: 'abc' }]])
    const pending = [
      { kind: 'tender' as const, sourceId: 't-1', textSha256: 'abc' },
      { kind: 'tender' as const, sourceId: 't-2', textSha256: 'def' },
    ]
    const toEmbed = pending.filter((p) => {
      const k = `${p.kind}:${p.sourceId}`
      return cached.get(k)?.textSha256 !== p.textSha256
    })
    expect(toEmbed.map((p) => p.sourceId)).toEqual(['t-2'])
  })
})

describe('embedding width mismatch', () => {
  const corpus: Corpus = {
    rows: [
      {
        kind: 'tender',
        sourceId: 't1',
        text: 'x',
        textSha256: 'a',
        embedding: [0.1, 0.2, 0.3],
        snippet: 's',
        ref: 'tenders[0]',
      },
    ],
    sourcePath: '.embed-cache/verifier-corpus.jsonl',
    model: 'gemini:gemini-embedding-001:768',
  }

  it('throws rather than letting every row score 0', () => {
    // cosineSimilarity returns 0 on a width mismatch, so every row falls under
    // minSimilarity and the run reports "no candidates" — indistinguishable
    // from a corpus that genuinely holds nothing relevant. Hundreds of
    // published verdicts went unreviewed exactly that way: on one 25-claim
    // batch, 18 were "never asked" against a gemini/768 corpus queried by an
    // openai/1536 embedder, and 0 once the backends matched.
    expect(() => assertQueryDimMatchesCorpus(1536, corpus)).toThrow(/width mismatch/i)
  })

  it('names the backend that built the corpus and the remedy', () => {
    expect(() => assertQueryDimMatchesCorpus(1536, corpus)).toThrow(/gemini-embedding-001/)
    expect(() => assertQueryDimMatchesCorpus(1536, corpus)).toThrow(/EMBED_BACKEND/)
  })

  it('passes when the widths agree', () => {
    expect(() => assertQueryDimMatchesCorpus(3, corpus)).not.toThrow()
  })

  it('stays quiet on an empty corpus — nothing to compare against', () => {
    expect(() => assertQueryDimMatchesCorpus(1536, { rows: [], sourcePath: 'x' })).not.toThrow()
  })
})
