import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { EXPECTED_PASSES, overduePasses, unrealExpectations } from '../scripts/check-runs'
import type { RunManifest } from '../src/scraper/run-manifest'

const HOUR = 3600_000
const NOW = Date.parse('2026-08-11T12:00:00.000Z')

const manifest = (script: string, hoursAgo: number): RunManifest =>
  ({
    script,
    runId: `${script}-${hoursAgo}`,
    startedAt: new Date(NOW - hoursAgo * HOUR).toISOString(),
    endedAt: new Date(NOW - hoursAgo * HOUR + 1000).toISOString(),
    backend: null,
    model: null,
    attempted: 1,
    judged: 1,
    neverAttempted: 0,
    skipped: {},
    outcome: {},
    llm: { calls: 0, promptTokens: 0, completionTokens: 0, errors: 0 },
    exitCode: 0,
  }) as unknown as RunManifest

const daily = [{ script: 'nightly', everyHours: 48, scheduler: 'un cron' }]

describe('overduePasses', () => {
  /**
   * The defect this exists for. On 2026-08-11 `extract-pleno-claims` had last
   * run on 08-03 — the morning the cron began deferring because it could not
   * reach the keychain — and `check:runs` reported the absence and exited 0.
   * Nine days with no transcription, no extraction and no findings, while
   * `monitor:health` printed «✓ sin avisos» because it measures source
   * freshness and the deterministic scrapers kept running.
   */
  it('reports a scheduled pass that has not run in nine days', () => {
    const out = overduePasses([manifest('nightly', 193)], daily, NOW)
    expect(out).toHaveLength(1)
    expect(out[0].script).toBe('nightly')
    expect(Math.floor(out[0].hoursAgo!)).toBe(193)
  })

  it('is quiet for a pass that ran inside its budget', () => {
    expect(overduePasses([manifest('nightly', 20)], daily, NOW)).toEqual([])
  })

  /** One missed night is quiet, two are loud — that is what the slack is for. */
  it.each([
    ['one missed night', 30, 0],
    ['two missed nights', 50, 1],
  ])('%s → %i overdue', (_label, hoursAgo, expected) => {
    expect(overduePasses([manifest('nightly', hoursAgo)], daily, NOW)).toHaveLength(expected)
  })

  it('reads the NEWEST run, not the first one it finds', () => {
    const out = overduePasses([manifest('nightly', 200), manifest('nightly', 3)], daily, NOW)
    expect(out).toEqual([])
  })

  /** Never having run at all is the loudest case, not an exemption. */
  it('reports a pass with no manifest ever', () => {
    const out = overduePasses([manifest('otra-cosa', 1)], daily, NOW)
    expect(out).toHaveLength(1)
    expect(out[0].lastRun).toBeNull()
    expect(out[0].hoursAgo).toBeNull()
  })

  it('ignores runs of other scripts entirely', () => {
    expect(overduePasses([manifest('otra-cosa', 500)], [], NOW)).toEqual([])
  })
})

describe('unrealExpectations', () => {
  /**
   * A typo in the table would be indistinguishable from a pass that never
   * runs, and would red the build forever for a reason nobody could act on —
   * which is how a check gets switched off.
   */
  it('catches an expectation naming a script that never wrote a manifest', () => {
    expect(
      unrealExpectations(
        [manifest('nightly', 1)],
        [{ script: 'nihgtly', everyHours: 48, scheduler: 'un cron' }],
      ),
    ).toEqual(['nihgtly'])
  })

  it('accepts one that has run at some point, however long ago', () => {
    expect(unrealExpectations([manifest('nightly', 5000)], daily)).toEqual([])
  })
})

describe('EXPECTED_PASSES, as shipped', () => {
  /**
   * Only instrumented passes may be listed. `verify:pleno-claims` and the
   * whole press-lab chain are deliberately absent: they do not call
   * `startRun`, so listing them would be permanently overdue.
   *
   * Checked against the SOURCE, not against the manifests on this disk.
   * `.run-manifests/` is gitignored, so a manifest-based assertion passes on
   * the laptop and fails in CI — measured: with the directory moved aside,
   * this test went red and `check:runs` exited 2. Reading the script is both
   * checkout-independent and the stronger claim.
   */
  it('names only scripts that exist and call startRun', () => {
    expect(EXPECTED_PASSES.length).toBeGreaterThan(0)
    for (const e of EXPECTED_PASSES) {
      const path = resolve(`scripts/${e.script}.ts`)
      expect(existsSync(path), `${e.script}: no existe scripts/${e.script}.ts`).toBe(true)
      expect(
        readFileSync(path, 'utf8').includes('startRun('),
        `${e.script}: no está instrumentado (no llama a startRun)`,
      ).toBe(true)
    }
  })

  /** The positive control for the line above: a real script that is NOT instrumented. */
  it('and that check can tell the difference', () => {
    expect(readFileSync(resolve('scripts/verify-pleno-claims.ts'), 'utf8')).not.toContain(
      'startRun(',
    )
  })

  it('gives every pass real slack over its nominal period', () => {
    for (const e of EXPECTED_PASSES) {
      expect(e.everyHours, `${e.script}`).toBeGreaterThanOrEqual(24)
      expect(e.scheduler.trim().length, `${e.script} no dice quién lo lanza`).toBeGreaterThan(5)
    }
  })
})
