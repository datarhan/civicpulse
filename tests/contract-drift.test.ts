import { describe, it, expect, vi } from 'vitest'
import { findContractDrift, groundFlags, type ContractDriftInput } from '../src/scraper/contract-drift-llm'

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
      [{ sentence: 'El motor nunca marca contradicho de forma automática', sha: '9999999', why: 'x' }],
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
