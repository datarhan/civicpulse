import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { writeFileSync, chmodSync, mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { z } from 'zod'
import { callLLM } from '../src/llm/client'

/**
 * A CLI backend that never returns must not hang the caller.
 *
 * On 2026-08-01 `claude-code` returned exit 1 once, the chain fell back to
 * `gemini`, the gemini CLI wedged, and a 1,017-claim batch sat at 10/1017 for
 * six and a half hours — no output, no error, no timeout. The HTTP backends
 * were already guarded by AbortSignal; the spawned CLIs had nothing at all.
 */
let dir: string
let hangBin: string

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'cp-watchdog-'))
  hangBin = join(dir, 'hang')
  // Ignores whatever flags the client passes and never writes or exits — a
  // faithful stand-in for the wedged CLI. Using a bare `sleep` would NOT work:
  // it rejects the client's flags and exits immediately, so the test would
  // pass without ever exercising the timeout.
  writeFileSync(hangBin, '#!/bin/sh\nsleep 600\n')
  chmodSync(hangBin, 0o755)
})

afterAll(() => rmSync(dir, { recursive: true, force: true }))

describe('LLM client — CLI watchdog', () => {
  it('kills a CLI that never returns, instead of hanging forever', async () => {
    process.env.LLM_CLI_TIMEOUT_MS = '2000'
    const started = Date.now()
    const r = await callLLM({
      systemPrompt: 'x',
      userPrompt: 'y',
      schema: z.object({ ok: z.boolean() }),
      promptVersion: 'watchdog-test-v1',
      input: { k: `watchdog-${Date.now()}` },
      config: {
        backend: 'gemini',
        geminiBin: hangBin,
        cacheDir: join(dir, 'cache'),
        maxRetries: 0,
      } as never,
    }).catch(() => null)
    const elapsed = Date.now() - started
    expect(r).toBeNull()
    // The child sleeps 600 s. Anything under that proves the watchdog fired;
    // 60 s leaves room for retries without tolerating a regression to "never".
    expect(elapsed).toBeLessThan(60_000)
    delete process.env.LLM_CLI_TIMEOUT_MS
  }, 90_000)
})
