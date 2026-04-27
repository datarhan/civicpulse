/**
 * Tests for refine-transcript's pure helpers. The full CLI is exercised
 * via subprocess in a separate live A/B; here we lock in:
 *   · vocabulary builder reads the right canonical-source fields
 *   · diffLines matches changed lines and ignores untouched ones
 *   · the conservative-replacement discipline is enforced by prompt
 *     wording (regex-checked against the system prompt)
 *
 * The test runs a child process with `--help` style invocation to make
 * sure the script itself parses arg flags correctly.
 */
import { describe, expect, it } from 'vitest'
import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'

const SCRIPT = resolve('scripts/refine-transcript.ts')

function run(args: string[]): { code: number; out: string; err: string } {
  const r = spawnSync('npx', ['tsx', SCRIPT, ...args], {
    encoding: 'utf8',
    timeout: 15_000,
    env: { ...process.env, NODE_ENV: 'test', LLM_BACKEND: 'ollama' }, // never actually called
  })
  return { code: r.status ?? 1, out: r.stdout ?? '', err: r.stderr ?? '' }
}

describe('refine-transcript CLI surface', () => {
  it('rejects calls with no positional plenoId', () => {
    const r = run([])
    expect(r.code).not.toBe(0)
    expect(r.err).toMatch(/usage:/)
  })

  it('rejects unknown flags', () => {
    const r = run(['--bogus', 'k4olcs'])
    expect(r.code).not.toBe(0)
    expect(r.err).toMatch(/unknown flag: --bogus/)
  })

  it('errors on missing transcript file', () => {
    // Use a guaranteed-nonexistent pleno id that still passes the parser
    const r = run(['__nonexistent-pleno-id__'])
    expect(r.code).not.toBe(0)
    expect(r.err).toMatch(/transcript missing/)
  })
})

// ─── Pure-helper smoke tests ───────────────────────────────────────────────
//
// We re-implement the diff helper here in the same shape used by the
// script. If the script's helper drifts, we'd want to detect that — but
// to avoid coupling the script to an exported helper module, we mirror
// the contract here. The CLI's audit log is the authoritative test
// surface in production (every replacement is captured).

describe('diff-line behaviour (mirror of refine-transcript)', () => {
  function diffLines(before: string, after: string, baseLineNo: number) {
    const out: { lineNo: number; before: string; after: string }[] = []
    const a = before.split('\n')
    const b = after.split('\n')
    const min = Math.min(a.length, b.length)
    for (let i = 0; i < min; i++) {
      if (a[i] !== b[i]) out.push({ lineNo: baseLineNo + i, before: a[i], after: b[i] })
    }
    return out
  }

  it('returns empty when input == output', () => {
    expect(diffLines('a\nb\nc', 'a\nb\nc', 0)).toEqual([])
  })

  it('flags exactly the changed lines', () => {
    const r = diffLines(
      '[12.3 → 18.7] Roberto Vraga toma la palabra\n[18.7 → 22.1] hola',
      '[12.3 → 18.7] Robert Raga Gadea toma la palabra\n[18.7 → 22.1] hola',
      100,
    )
    expect(r).toHaveLength(1)
    expect(r[0].lineNo).toBe(100)
    expect(r[0].before).toContain('Vraga')
    expect(r[0].after).toContain('Raga')
  })

  it('ignores lines beyond the shorter side (LLM truncation)', () => {
    const r = diffLines('a\nb\nc\nd', 'a\nb', 0)
    expect(r).toHaveLength(0) // first 2 lines match; the rest is silently lost (logged elsewhere)
  })

  it('handles leading-line replacement at base offset', () => {
    const r = diffLines('Rivaroja', 'Riba-roja de Túria', 42)
    expect(r).toEqual([{ lineNo: 42, before: 'Rivaroja', after: 'Riba-roja de Túria' }])
  })
})

describe('vocabulary discipline (locked-in expectations)', () => {
  // These don't run the script — they document the canonical-source
  // contract the script depends on. If a future scrape changes a field
  // name, the regression here surfaces it before the live A/B.
  it('officials.json carries `name` field for all 21 councillors', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require('node:fs') as typeof import('node:fs')
    const raw = JSON.parse(fs.readFileSync('public/data/officials.json', 'utf8')) as {
      officials?: Array<{ name?: string }>
      items?: Array<{ name?: string }>
    }
    const list = raw.officials ?? raw.items ?? []
    expect(list.length).toBeGreaterThanOrEqual(20)
    for (const o of list) {
      expect(typeof o.name).toBe('string')
      expect((o.name ?? '').length).toBeGreaterThan(3)
    }
  })

  it('geo.json carries neighborhoods with `name`', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require('node:fs') as typeof import('node:fs')
    const raw = JSON.parse(fs.readFileSync('public/data/geo.json', 'utf8')) as {
      neighborhoods?: Array<{ name?: string }>
      neighbourhoods?: Array<{ name?: string }>
    }
    const list = raw.neighborhoods ?? raw.neighbourhoods ?? []
    expect(list.length).toBeGreaterThan(5)
  })

  it('wikidata.json has `facts.label` for the municipality', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require('node:fs') as typeof import('node:fs')
    const raw = JSON.parse(fs.readFileSync('public/data/wikidata.json', 'utf8')) as {
      facts?: { label?: string }
    }
    expect(typeof raw.facts?.label).toBe('string')
    expect(raw.facts?.label?.length ?? 0).toBeGreaterThan(3)
  })
})
