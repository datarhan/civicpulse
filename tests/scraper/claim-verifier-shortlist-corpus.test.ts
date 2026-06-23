import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest'

// Mock the semantic + embed modules getShortlist lazily imports, so we can
// assert loadCorpus is bypassed when a preloaded corpus is passed (audit B1).
vi.mock('../../src/scraper/semantic-shortlist', () => ({
  loadCorpus: vi.fn(() => {
    throw new Error('loadCorpus must NOT be called when opts.corpus is provided')
  }),
  semanticShortlist: vi.fn(async () => [
    { kind: 'tender', ref: 'SENTINEL', snippet: 'sentinel snippet', similarity: 0.99 },
  ]),
  mergeShortlists: vi.fn((lists: unknown[][], k: number) => lists.flat().slice(0, k)),
}))
vi.mock('../../src/scraper/embed-client', () => ({
  embedTexts: vi.fn(async () => [[0.1, 0.2, 0.3]]),
}))

import { getShortlist } from '../../src/scraper/claim-verifier'
import * as semantic from '../../src/scraper/semantic-shortlist'
import type { Corpus } from '../../src/scraper/semantic-shortlist'
import type { PlenoClaim } from '../../src/scraper/pleno-claim'

const claim = {
  id: 'c',
  type: 'cita_obra',
  topic: 'urbanismo',
  verbatim: 'la obra de la calle Mayor',
  entities: {},
} as unknown as PlenoClaim

const prevBackend = process.env.EMBED_BACKEND

describe('getShortlist preloaded-corpus passthrough (B1 fix)', () => {
  beforeEach(() => vi.clearAllMocks())
  afterAll(() => {
    if (prevBackend === undefined) delete process.env.EMBED_BACKEND
    else process.env.EMBED_BACKEND = prevBackend
  })

  it('uses opts.corpus and never reads the corpus from disk', async () => {
    process.env.EMBED_BACKEND = 'ollama' // "usable" without a key
    const fakeCorpus = [] as unknown as Corpus
    const result = await getShortlist({ claim }, 8, { mode: 'semantic', corpus: fakeCorpus })
    expect(semantic.loadCorpus).not.toHaveBeenCalled()
    expect(result.some((c) => c.ref === 'SENTINEL')).toBe(true)
  })
})
