import { describe, it, expect } from 'vitest'
import { discoverPromises } from '../src/llm/promise-discovery'
import { PROMISE_DISCOVERY_PROMPT_VERSION } from '../src/llm/prompts'

describe('discoverPromises', () => {
  it('passes the discovery prompt version + schema and returns the parsed batch', async () => {
    const seen: { promptVersion?: string } = {}
    const stub = async (opts: {
      promptVersion: string
      schema: { parse: (x: unknown) => unknown }
    }) => {
      seen.promptVersion = opts.promptVersion
      return { promises: [] }
    }
    const out = await discoverPromises(
      { existingTitles: [], sources: [{ kind: 'press', items: [] }] },
      stub as never,
    )
    expect(seen.promptVersion).toBe(PROMISE_DISCOVERY_PROMPT_VERSION)
    expect(out).toEqual({ promises: [] })
  })

  // La clave de caché de `callLLM` sale de `input`, no del prompt. Con
  // `{ existingTitles, sourceCount }` dos semanas con las mismas promesas y el
  // mismo NÚMERO de artículos —artículos distintos— compartían clave, y la
  // segunda recibía en silencio las candidatas de la primera. No mordió antes
  // sólo porque ninguna llamada de descubrimiento había respondido nunca.
  it('the cache input changes when the articles change, even at the same count', async () => {
    const inputs: unknown[] = []
    const stub = async (opts: { input: unknown }) => {
      inputs.push(opts.input)
      return { promises: [] }
    }
    const fuente = (url: string, snippet: string) => ({
      kind: 'press' as const,
      items: [{ title: 't', url, date: '2026-09-20', snippet }],
    })
    await discoverPromises(
      { existingTitles: ['a'], sources: [fuente('https://x/1', 'uno')] },
      stub as never,
    )
    await discoverPromises(
      { existingTitles: ['a'], sources: [fuente('https://x/2', 'uno')] },
      stub as never,
    )
    await discoverPromises(
      { existingTitles: ['a'], sources: [fuente('https://x/1', 'dos')] },
      stub as never,
    )
    const claves = inputs.map((i) => JSON.stringify(i))
    expect(new Set(claves).size).toBe(3)
  })

  it('propagates a null (backend failure) result', async () => {
    const out = await discoverPromises(
      { existingTitles: [], sources: [] },
      (async () => null) as never,
    )
    expect(out).toBeNull()
  })
})
