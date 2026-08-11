import { describe, it, expect } from 'vitest'
import { buildBackendChain, type ClientConfig } from '../src/llm/client'

/**
 * A config with both metered keys present and every $0 binary resolvable, so
 * each test turns exactly one thing off. `/bin/sh` and `/usr/bin/env` stand in
 * for the CLIs: they contain a slash, so the resolver `existsSync`s them
 * directly and the test does not depend on what is installed on this machine.
 */
function cfg(over: Partial<ClientConfig> = {}): ClientConfig {
  return {
    backend: 'gemini',
    openaiApiKey: 'sk-test',
    anthropicApiKey: 'sk-ant-test',
    claudeCodeBin: '/bin/sh',
    geminiBin: '/usr/bin/env',
    zeroCostOnly: false,
    ...over,
  } as ClientConfig
}

describe('buildBackendChain', () => {
  it('always tries the configured primary first', () => {
    expect(buildBackendChain(cfg({ backend: 'openai' }))[0]).toBe('openai')
    expect(buildBackendChain(cfg({ backend: 'agy' }))[0]).toBe('agy')
  })

  /**
   * The leak this function was extracted to close. gemini's free tier answers
   * 429 `limit: 0` on Pro and 503 under load on Flash — both mean "come back
   * later", and the chain used to answer them by spending money.
   */
  it('falls back from gemini to claude-code BEFORE any metered backend', () => {
    const chain = buildBackendChain(cfg({ backend: 'gemini' }))
    expect(chain).toEqual(['gemini', 'claude-code', 'openai', 'anthropic'])
    expect(chain.indexOf('claude-code')).toBeLessThan(chain.indexOf('openai'))
  })

  it('keeps the same rule for agy, which fails the same way', () => {
    const chain = buildBackendChain(cfg({ backend: 'agy' }))
    expect(chain.indexOf('claude-code')).toBeLessThan(chain.indexOf('openai'))
  })

  /**
   * Deliberate asymmetry, not an oversight: a heavy run on a metered primary
   * must not silently drain the Max quota shared with interactive sessions.
   */
  it('does NOT chain claude-code off a metered primary', () => {
    expect(buildBackendChain(cfg({ backend: 'openai' }))).not.toContain('claude-code')
    expect(buildBackendChain(cfg({ backend: 'anthropic' }))).not.toContain('claude-code')
  })

  it('never auto-chains ollama from any primary', () => {
    for (const backend of ['gemini', 'agy', 'openai', 'anthropic', 'claude-code'] as const) {
      expect(buildBackendChain(cfg({ backend }))).not.toContain('ollama')
    }
  })

  describe('zeroCostOnly', () => {
    it('removes every metered backend from the chain', () => {
      const chain = buildBackendChain(cfg({ backend: 'gemini', zeroCostOnly: true }))
      expect(chain).not.toContain('openai')
      expect(chain).not.toContain('anthropic')
      expect(chain).toContain('claude-code')
    })

    it('holds even with both API keys set — the flag is the authority', () => {
      const chain = buildBackendChain(
        cfg({ backend: 'agy', zeroCostOnly: true, openaiApiKey: 'sk-live', anthropicApiKey: 'k' }),
      )
      expect(chain.every((b) => b === 'agy' || b === 'claude-code' || b === 'gemini')).toBe(true)
    })

    it('leaves a metered PRIMARY alone — an explicit choice is not a leak', () => {
      // The flag guards the silent fallback path. Someone who sets
      // LLM_BACKEND=openai has decided to spend; refusing that would be a
      // different feature, and a surprising one.
      expect(buildBackendChain(cfg({ backend: 'openai', zeroCostOnly: true }))[0]).toBe('openai')
    })
  })

  describe('reachability', () => {
    it('skips a backend whose binary does not exist', () => {
      const chain = buildBackendChain(
        cfg({ backend: 'gemini', claudeCodeBin: '/nonexistent/claude' }),
      )
      expect(chain).not.toContain('claude-code')
    })

    it('skips a metered backend with no API key', () => {
      const chain = buildBackendChain(
        cfg({ backend: 'gemini', openaiApiKey: undefined, anthropicApiKey: undefined }),
      )
      expect(chain).toEqual(['gemini', 'claude-code'])
    })

    it('never lists the primary twice', () => {
      const chain = buildBackendChain(cfg({ backend: 'gemini' }))
      expect(chain.filter((b) => b === 'gemini')).toHaveLength(1)
    })
  })

  /**
   * The gemini CLI is opt-in, like ollama and agy — never auto-chained.
   *
   * `existsSync(geminiBin)` was the only gate, and it proves the file is on
   * disk, not that it can answer. Measured 2026-08-11 against both the PATH
   * copy and the sandboxed one this repo points at: `gemini -p … -o json`
   * prints «Opening authentication page in your browser» and then waits on an
   * OAuth callback that, with `stdio: ['ignore', …]` and no browser, never
   * arrives. The call hangs until the 180 s watchdog kills it. Setting
   * GEMINI_API_KEY does not change this — the CLI still wants the browser.
   *
   * So an installed-but-unauthenticated gemini is not a backend that might
   * work; it is three guaranteed dead minutes per call, in the last chain slot
   * where it delays every real failure. The cron wrappers already pass
   * GEMINI_BIN=/nonexistent-disabled, which is the habit this file's own
   * comment says cannot be asserted in a test. This asserts it instead.
   */
  describe('gemini is opt-in, never auto-chained', () => {
    it('is not appended as a fallback to a $0 primary', () => {
      expect(buildBackendChain(cfg({ backend: 'agy' }))).not.toContain('gemini')
    })

    it('is not appended as a fallback to a metered primary', () => {
      expect(buildBackendChain(cfg({ backend: 'openai' }))).not.toContain('gemini')
      expect(buildBackendChain(cfg({ backend: 'anthropic' }))).not.toContain('gemini')
    })

    it('still runs as an explicit primary — an opt-in is not a leak', () => {
      // Same rule the metered backends get: the flag guards silent fallback,
      // not a deliberate choice. Someone who sets LLM_BACKEND=gemini gets
      // gemini, and the watchdog reports what happened.
      expect(buildBackendChain(cfg({ backend: 'gemini' }))[0]).toBe('gemini')
    })
  })
})
