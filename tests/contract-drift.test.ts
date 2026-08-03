import { describe, it, expect, vi } from 'vitest'
import {
  driftCacheInput,
  findContractDrift,
  findContractDriftDetailed,
  groundFlags,
  partitionFlags,
  type ContractDriftInput,
} from '../src/scraper/contract-drift-llm'

const input: ContractDriftInput = {
  page: '/metodologia',
  prose:
    'Los hallazgos editoriales están curados por una persona que toma una o más ' +
    'afirmaciones literales de un pleno. El motor nunca marca contradicho de forma automática.',
  changes: [
    { sha: 'abc1234', subject: 'fix: 44 de 52 hallazgos los firma auto-curation-v1' },
    { sha: 'def5678', subject: 'fix: contradicho pasa a curator-only' },
  ],
}

describe('contract-drift — grounding', () => {
  it('keeps a flag that quotes the page verbatim and cites a real commit', () => {
    const kept = groundFlags(
      [
        {
          sentence: 'Los hallazgos editoriales están curados por una persona',
          sha: 'abc1234',
          why: '44 de 52 los escribe una máquina',
        },
      ],
      input,
    )
    expect(kept).toHaveLength(1)
  })

  it('drops a PARAPHRASE — the failure mode that matters', () => {
    // A model asked to find problems will happily object to its own restatement
    // of the page. If the sentence is not on the page, there is nothing to fix.
    const kept = groundFlags(
      [{ sentence: 'La página afirma que humanos curan los hallazgos', sha: 'abc1234', why: 'x' }],
      input,
    )
    expect(kept).toEqual([])
  })

  it('drops a flag citing a commit we never supplied', () => {
    const kept = groundFlags(
      [
        {
          sentence: 'El motor nunca marca contradicho de forma automática',
          sha: '9999999',
          why: 'x',
        },
      ],
      input,
    )
    expect(kept).toEqual([])
  })

  it('drops a sentence too short to be a claim', () => {
    expect(groundFlags([{ sentence: 'una persona', sha: 'abc1234', why: 'x' }], input)).toEqual([])
  })

  it('never calls the model when there is nothing to compare', async () => {
    const call = vi.fn()
    expect(await findContractDrift({ ...input, changes: [] }, call)).toEqual([])
    expect(call).not.toHaveBeenCalled()
  })

  it('returns an empty list when the model finds nothing — the expected answer', async () => {
    expect(await findContractDrift(input, async () => [])).toEqual([])
  })
})

describe('contract-drift — a discarded flag must not look like a current contract', () => {
  // Same silence reader-review had until 2026-08-03: printing only survivors
  // makes "the contract is up to date" and "I threw three away" the same line.
  it('says WHICH gate rejected each flag, not just how many', () => {
    const { kept, dropped } = partitionFlags(
      [
        {
          sentence: 'Los hallazgos editoriales están curados por una persona',
          sha: 'abc1234',
          why: 'ok',
        },
        { sentence: 'La página afirma que humanos curan los hallazgos', sha: 'abc1234', why: 'x' },
        {
          sentence: 'El motor nunca marca contradicho de forma automática',
          sha: '9999999',
          why: 'x',
        },
        { sentence: 'muy corta', sha: 'abc1234', why: 'x' },
      ],
      input,
    )
    expect(kept).toHaveLength(1)
    expect(dropped.map((d) => d.reason)).toEqual(['not-on-page', 'unknown-sha', 'too-short'])
  })

  it('an incomplete flag is dropped with a reason rather than throwing', () => {
    const { dropped } = partitionFlags(
      [{ sha: 'abc1234', why: 'x' } as unknown as { sentence: string; sha: string; why: string }],
      input,
    )
    expect(dropped[0].reason).toBe('no-sentence')
  })

  it('every flag comes back as either kept or dropped — none are lost', () => {
    const flags = [
      {
        sentence: 'Los hallazgos editoriales están curados por una persona',
        sha: 'abc1234',
        why: 'a',
      },
      { sentence: 'no está en la página en absoluto, ni de lejos', sha: 'def5678', why: 'b' },
      { sentence: 'corta', sha: 'abc1234', why: 'c' },
    ]
    const { kept, dropped } = partitionFlags(flags, input)
    expect(kept.length + dropped.length).toBe(flags.length)
  })

  it('findContractDriftDetailed hands back the dropped flags, not just a count', async () => {
    const r = await findContractDriftDetailed(input, async () => [
      { sentence: 'La página afirma que humanos curan los hallazgos', sha: 'abc1234', why: 'x' },
    ])
    expect(r.flags).toEqual([])
    expect(r.dropped).toHaveLength(1) // NOT the same as "el contrato sigue al día"
    expect(r.dropped[0].reason).toBe('not-on-page')
  })

  it('the strictness stays — a sliding window here would let a paraphrase through', () => {
    // Deliberately the same policy as reader-review, and for the same reason.
    // See the do-not-loosen block in tests/reader-review.test.ts.
    const almost = 'Los hallazgos editoriales están curados por una persona incompetente'
    expect(partitionFlags([{ sentence: almost, sha: 'abc1234', why: 'x' }], input).kept).toEqual([])
  })
})

describe('contract-drift — the cache must not answer for the model', () => {
  // Found 2026-08-03 before the second real run. `callLLM` keys its cache on
  // (backend, model, promptVersion, schema, input), and the CLI passed
  // `input: { page }`. So the key was the ROUTE NAME. Both entries on disk held
  // `flags: []` from the first run; re-running after eleven pipeline commits and
  // an edit to /aviso-legal would have replayed those two empty verdicts in
  // milliseconds and printed «2 revisada(s) · 0 aviso(s)».
  //
  // Worse than a plain stale read: `consulted` would be TRUE, because the cache
  // returns a non-null array. The three-state honesty layer in DriftResult
  // cannot see this — a cache hit is indistinguishable from an answer.
  const other = (o: Partial<ContractDriftInput>) => driftCacheInput({ ...input, ...o })

  it('is stable when nothing changed — the cache is still worth having', () => {
    expect(driftCacheInput(input)).toEqual(driftCacheInput({ ...input }))
  })

  it('changes when the page prose changes', () => {
    expect(other({ prose: input.prose + ' Una frase nueva.' })).not.toEqual(driftCacheInput(input))
  })

  it('changes when a new commit lands — the whole point of the check', () => {
    const changes = [...input.changes, { sha: '9999999', subject: 'feat: algo nuevo' }]
    expect(other({ changes })).not.toEqual(driftCacheInput(input))
  })

  it('changes when a commit message changes, not just its sha', () => {
    const changes = [{ ...input.changes[0], subject: 'otro asunto' }, input.changes[1]]
    expect(other({ changes })).not.toEqual(driftCacheInput(input))
  })

  it('differs between pages', () => {
    expect(other({ page: '/aviso-legal' })).not.toEqual(driftCacheInput(input))
  })

  it('keeps the route legible, so a cache entry can be traced to a page', () => {
    expect(driftCacheInput(input).page).toBe('/metodologia')
  })
})
