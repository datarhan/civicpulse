import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * docs/JOURNALIST_AGENT.md promised that the LOREG freeze halts promote-report.
 * It did not: only the agent checked `isJournalistFrozen`, so a draft made
 * before the freeze could be published during it. A promotion is the act that
 * makes a biography public; that is the act the freeze exists to stop.
 *
 * `main()` is not exported (it writes public/data on import otherwise), so the
 * gate is pinned the way tests/prepush-range.test.js pins a hook: by reading
 * the script and asserting the call and its refusal message are there. Weak,
 * but it fails the day someone deletes the gate.
 */
describe('promote-report honours the LOREG freeze', () => {
  const src = readFileSync(resolve(__dirname, '../scripts/promote-report.ts'), 'utf8')

  it('calls isJournalistFrozen before publishing', () => {
    expect(src).toMatch(/isJournalistFrozen\(/)
  })

  it('refuses with a message that names the freeze', () => {
    expect(src).toMatch(/REFUSE: LOREG electoral freeze/)
  })
})
