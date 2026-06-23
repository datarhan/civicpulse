import { describe, it, expect } from 'vitest'
import { scoreNliPairs, NliUnavailableError, type NliPair } from './nli-client'

describe('scoreNliPairs', () => {
  it('serializes pairs to JSONL stdin and parses JSONL stdout into a Map', async () => {
    let seenStdin = ''
    const runner = async (stdin: string) => {
      seenStdin = stdin
      return (
        stdin
          .trim()
          .split('\n')
          .map((l) => {
            const o = JSON.parse(l)
            return JSON.stringify({
              id: o.id,
              entailment: 0.9,
              neutral: 0.08,
              contradiction: 0.02,
              label: 'entailment',
            })
          })
          .join('\n') + '\n'
      )
    }
    const pairs: NliPair[] = [
      { id: 'a', premise: 'p', hypothesis: 'h' },
      { id: 'b', premise: 'p2', hypothesis: 'h2' },
    ]
    const m = await scoreNliPairs(pairs, { runner })
    expect(seenStdin.trim().split('\n')).toHaveLength(2)
    expect(m.size).toBe(2)
    expect(m.get('a')!.entailment).toBeCloseTo(0.9)
    expect(m.get('b')!.label).toBe('entailment')
  })

  it('skips malformed output lines', async () => {
    const runner = async () =>
      'not json\n{"id":"a","entailment":0.5,"neutral":0.3,"contradiction":0.2,"label":"neutral"}\n'
    const m = await scoreNliPairs([{ id: 'a', premise: 'p', hypothesis: 'h' }], { runner })
    expect(m.size).toBe(1)
    expect(m.get('a')!.label).toBe('neutral')
  })

  it('returns an empty map for no pairs without invoking the runner', async () => {
    let called = false
    const runner = async () => {
      called = true
      return ''
    }
    const m = await scoreNliPairs([], { runner })
    expect(m.size).toBe(0)
    expect(called).toBe(false)
  })

  it('throws NliUnavailableError when the venv is missing (default runner)', async () => {
    await expect(
      scoreNliPairs([{ id: 'a', premise: 'p', hypothesis: 'h' }], { venv: '/nonexistent/venv' }),
    ).rejects.toBeInstanceOf(NliUnavailableError)
  })
})
