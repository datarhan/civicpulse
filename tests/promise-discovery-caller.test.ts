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

  it('propagates a null (backend failure) result', async () => {
    const out = await discoverPromises(
      { existingTitles: [], sources: [] },
      (async () => null) as never,
    )
    expect(out).toBeNull()
  })
})
