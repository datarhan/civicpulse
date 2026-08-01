import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseRibalicitaContracts } from '../src/scraper/tenders'

/**
 * Gobierto emits `formalized` — a signed contract. The allow-list said
 * `finalized`, one letter apart, so `normStatus` coerced all 298 of them to
 * `unknown`. Every awarded total in the app is computed as
 * `status === 'awarded'`, so €53.5M across 314 signed contracts vanished:
 * the landing KPI showed €14.7M, the biggest contract in the town (GARBIALDI's
 * €15.8M waste concession — larger on its own than the entire headline) was
 * rendered with a grey "Sin clasificar" pill, and the contractor leaderboard
 * put GARBIALDI at €169k instead of €17.4M.
 *
 * The real committed fixture is the contract here: it carries the exact
 * vocabulary the upstream actually uses.
 */
const FIXTURE = join(__dirname, 'fixtures', 'ribalicita_contratos_2026-04-19.csv')

describe('scraper/tenders — formalized is a real status, not "unknown"', () => {
  const rows = parseRibalicitaContracts(readFileSync(FIXTURE, 'utf8'))

  it('keeps formalized contracts as formalized', () => {
    const formalized = rows.filter((r) => r.status === 'formalized')
    expect(formalized.length).toBeGreaterThan(250)
  })

  it('does not dump signed contracts into unknown', () => {
    // Before the fix: 298 of 730 rows landed in `unknown` with a named winner.
    const signedButUnknown = rows.filter((r) => r.status === 'unknown' && r.assignee)
    expect(signedButUnknown.length).toBe(0)
  })

  it('represents every status Gobierto actually emits', () => {
    // The real vocabulary, counted from this fixture: awarded 362,
    // formalized 298, void 41, abandoned 9, revoked 7 (plus 13 blanks).
    // Each must survive normStatus rather than collapse into `unknown`.
    const seen = new Set(rows.map((r) => r.status))
    for (const s of ['awarded', 'formalized', 'void', 'abandoned', 'revoked']) {
      expect(seen.has(s as never), `status "${s}" was swallowed`).toBe(true)
    }
  })

  it('keeps a cancelled contract distinguishable from a signed one', () => {
    // void/abandoned used to share the `unknown` bucket with formalized, so a
    // cancelled contract and a signed one looked identical downstream.
    const voided = rows.filter((r) => r.status === 'void' || r.status === 'abandoned')
    expect(voided.length).toBeGreaterThan(40)
    expect(voided.every((r) => r.status !== 'formalized')).toBe(true)
  })
})
