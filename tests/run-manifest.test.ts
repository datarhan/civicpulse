import { describe, it, expect } from 'vitest'
import {
  assessManifest,
  startRun,
  formatManifest,
  ZERO_TOKEN_ALARM,
  NEVER_ATTEMPTED_WARN,
  FAILURE_RATE_WARN,
  type RunManifest,
} from '../src/scraper/run-manifest'
import type { RunStats } from '../src/llm/client'

/**
 * Thresholds are IMPORTED, never restated. A test that hardcodes `5` keeps
 * passing after someone raises the constant to 50, which is precisely how six
 * tests in this repo stayed green while guarding nothing.
 */

const NO_TRAFFIC: RunStats = {
  calls: 0,
  cacheHits: 0,
  ok: 0,
  failed: 0,
  zeroTokenFailures: 0,
  shortCircuited: 0,
  tokens: 0,
  costUSD: 0,
}

function manifest(over: Partial<RunManifest> = {}): RunManifest {
  return {
    script: 'test-script',
    runId: 'r1',
    startedAt: '2026-08-02T10:00:00.000Z',
    endedAt: '2026-08-02T10:05:00.000Z',
    backend: 'claude-code',
    model: 'claude-code:sonnet',
    attempted: 0,
    judged: 0,
    neverAttempted: 0,
    skipped: {},
    outcome: {},
    llm: { ...NO_TRAFFIC },
    exitCode: 0,
    ...over,
  }
}

const codes = (m: RunManifest) =>
  assessManifest(m)
    .map((f) => f.code)
    .sort()

describe('assessManifest — healthy runs', () => {
  it('passes a run that judged everything it attempted', () => {
    const m = manifest({
      attempted: 100,
      judged: 100,
      llm: { ...NO_TRAFFIC, calls: 100, ok: 100, tokens: 50_000, costUSD: 1.2 },
    })
    expect(assessManifest(m)).toEqual([])
  })

  it('passes a fully cached re-run (no fresh calls, but cache hits)', () => {
    const m = manifest({
      attempted: 40,
      judged: 40,
      llm: { ...NO_TRAFFIC, cacheHits: 40 },
    })
    expect(assessManifest(m)).toEqual([])
  })

  it('passes an empty run — nothing attempted is not a failure', () => {
    expect(assessManifest(manifest())).toEqual([])
  })
})

describe('assessManifest — the incidents this exists to catch', () => {
  it('flags a run that processed items and judged none (the "kept 1017" shape)', () => {
    // Reported `re-judged 1017 · kept 1017` while making zero successful calls.
    const m = manifest({
      attempted: 1017,
      neverAttempted: 1017,
      llm: { ...NO_TRAFFIC },
    })
    expect(codes(m)).toContain('no-work')
  })

  it('flags failures that consumed no tokens (the 190-dead-calls shape)', () => {
    const m = manifest({
      attempted: 190,
      judged: 1,
      skipped: { 'engine error': 189 },
      llm: {
        ...NO_TRAFFIC,
        calls: 190,
        ok: 1,
        failed: 189,
        zeroTokenFailures: 189,
        tokens: 1109,
        costUSD: 0.04,
      },
    })
    expect(codes(m)).toContain('backend-refusing')
  })

  it('does not cry wolf on a couple of genuine transient failures', () => {
    const m = manifest({
      attempted: 100,
      judged: 98,
      skipped: { 'engine error': 2 },
      llm: {
        ...NO_TRAFFIC,
        calls: 100,
        ok: 98,
        failed: 2,
        zeroTokenFailures: ZERO_TOKEN_ALARM - 1,
        tokens: 40_000,
        costUSD: 0.9,
      },
    })
    expect(codes(m)).not.toContain('backend-refusing')
  })

  it('flags judgements claimed with no traffic to back them', () => {
    const m = manifest({ attempted: 10, judged: 10, llm: { ...NO_TRAFFIC } })
    expect(codes(m)).toContain('judged-without-calls')
  })
})

describe('assessManifest — coverage and accounting', () => {
  it('flags items that fall through every bucket', () => {
    const m = manifest({
      attempted: 100,
      judged: 40,
      neverAttempted: 10,
      skipped: { err: 5 },
      llm: { ...NO_TRAFFIC, calls: 40, ok: 40, tokens: 100 },
    })
    const f = assessManifest(m).find((x) => x.code === 'unaccounted-items')
    expect(f).toBeDefined()
    expect(f!.message).toContain('45')
  })

  it('flags when most items never reached the model (the retrieval shape)', () => {
    const attempted = 100
    const never = Math.ceil(attempted * NEVER_ATTEMPTED_WARN) + 1
    const m = manifest({
      attempted,
      judged: attempted - never,
      neverAttempted: never,
      llm: { ...NO_TRAFFIC, calls: attempted - never, ok: attempted - never, tokens: 10 },
    })
    expect(codes(m)).toContain('low-coverage')
  })

  it('stays quiet when coverage sits just under the threshold', () => {
    const attempted = 100
    const never = Math.floor(attempted * NEVER_ATTEMPTED_WARN)
    const m = manifest({
      attempted,
      judged: attempted - never,
      neverAttempted: never,
      llm: { ...NO_TRAFFIC, calls: attempted - never, ok: attempted - never, tokens: 10 },
    })
    expect(codes(m)).not.toContain('low-coverage')
  })

  it('flags a degraded backend by failure rate', () => {
    const calls = 100
    const failed = Math.ceil(calls * FAILURE_RATE_WARN) + 1
    const m = manifest({
      attempted: calls,
      judged: calls - failed,
      skipped: { err: failed },
      llm: { ...NO_TRAFFIC, calls, ok: calls - failed, failed, tokens: 5000 },
    })
    expect(codes(m)).toContain('high-failure-rate')
  })

  it('reports partial results when the breaker opened', () => {
    const m = manifest({
      attempted: 50,
      judged: 20,
      neverAttempted: 30,
      llm: { ...NO_TRAFFIC, calls: 20, ok: 20, shortCircuited: 30, tokens: 900 },
    })
    expect(codes(m)).toContain('circuit-tripped')
  })
})

describe('startRun', () => {
  const stats = (): RunStats => ({ ...NO_TRAFFIC, calls: 3, ok: 3, tokens: 42, costUSD: 0.01 })

  it('accumulates counts and pulls traffic from the injected client', () => {
    const run = startRun('demo', { getStats: stats, backend: 'claude-code' })
    run.attempt(5)
    run.judge()
    run.judge()
    run.neverAttempt(2)
    run.skip('missing claim')
    run.record('retracted', 2)

    const { manifest: m } = run.finish({ write: false })
    expect(m.attempted).toBe(5)
    expect(m.judged).toBe(2)
    expect(m.neverAttempted).toBe(2)
    expect(m.skipped).toEqual({ 'missing claim': 1 })
    expect(m.outcome).toEqual({ retracted: 2 })
    expect(m.llm.tokens).toBe(42)
  })

  it('a fully-accounted run produces no findings', () => {
    const run = startRun('demo', { getStats: stats })
    run.attempt(3)
    run.judge(3)
    const { findings } = run.finish({ write: false })
    expect(findings).toEqual([])
  })

  it('formats a human-readable summary', () => {
    const run = startRun('demo', { getStats: stats })
    run.attempt(3)
    run.judge(3)
    run.record('retracted', 1)
    const { manifest: m } = run.finish({ write: false })
    const s = formatManifest(m)
    expect(s).toContain('attempted 3')
    expect(s).toContain('retracted=1')
  })
})
