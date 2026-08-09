import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { render } from '@testing-library/react'

import { VoteProvenance } from '../src/components/plenos/VoteProvenance'
import { unverifiedBreakdownNote } from '../src/pages/Datos'
import { isIndependentlyVerified, VOTE_SOURCE_KINDS } from '../src/scraper/pleno-votes'

/**
 * One number, one named set — across two pages.
 *
 * /datos appended «· 16 desgloses sin cotejar» to a row headed «17 votaciones»,
 * while the vote cards on /plenos/:id and /departamentos/:slug marked all 17
 * rows uncotejado (the caveat was printed under the outcome row too). Two
 * surfaces, two sets, and a reader who subtracted them would conclude one vote
 * had been checked. None has.
 *
 * These run against the PUBLISHED snapshot rather than a fixture, because what
 * has to agree is what the site actually serves — and because a fixture would
 * have let both numbers be wrong together.
 */
const snapshot = JSON.parse(
  readFileSync(resolve(process.cwd(), 'public/data/pleno-votes.json'), 'utf8'),
)

/** Every «sin cotejar …» clause the card renders for one vote. */
function caveatsOn(vote) {
  const { container } = render(<VoteProvenance provenance={vote.provenance} />)
  return [...container.querySelectorAll('span')]
    .map((s) => s.textContent)
    .filter((t) => /sin cotejar/.test(t))
}

describe('the /datos count and the vote cards describe the same set', () => {
  const withBreakdown = snapshot.items.filter((v) => (v.votes?.length ?? 0) > 0)
  const unverified = withBreakdown.filter((v) => !isIndependentlyVerified(v.provenance?.breakdown))

  it('counts something at all — the set is not empty', () => {
    // Two suites in this repo have been green while measuring nothing. Every
    // assertion below is satisfied by an empty snapshot, so pin the size first.
    expect(snapshot.items.length).toBeGreaterThan(0)
    expect(withBreakdown.length).toBeGreaterThan(0)
    expect(unverified.length).toBeGreaterThan(0)
  })

  it('states the denominator, so the number cannot be read against the wrong set', () => {
    // «16 desgloses sin cotejar» beside «17 votaciones» invited exactly that
    // subtraction. The 17th row has no desglose at all — its tally was withdrawn.
    const note = unverifiedBreakdownNote(snapshot.items)
    expect(note).toBe(` · ${unverified.length} de ${withBreakdown.length} desgloses sin cotejar`)
    expect(note).toContain(` de ${withBreakdown.length} `)
    expect(withBreakdown.length).toBeLessThan(snapshot.items.length)
  })

  it('marks exactly the rows /datos counts, and no others', () => {
    const marked = snapshot.items.filter((v) => caveatsOn(v).length > 0).map((v) => v.id)
    expect(marked.sort()).toEqual(unverified.map((v) => v.id).sort())
  })

  it('marks each counted row once — not once per provenance row', () => {
    // The old component applied one caveat to both halves, so a card marked
    // twice what /datos counted once.
    for (const v of unverified) expect(caveatsOn(v)).toHaveLength(1)
  })

  it('never puts the acta caveat under an outcome regmeet publishes itself', () => {
    // All 17 outcomes are `sin-verificar` and all 17 cite regmeet, so this is a
    // whole-snapshot assertion and not a spot check.
    expect(snapshot.items.every((v) => v.provenance?.outcome?.kind === 'regmeet')).toBe(true)
    expect(
      snapshot.items.every((v) => v.provenance?.outcome?.verification === 'sin-verificar'),
    ).toBe(true)
    for (const v of snapshot.items) {
      const { container } = render(<VoteProvenance provenance={v.provenance} />)
      expect(container.textContent).not.toMatch(/sin cotejar con el acta/)
    }
    expect(VOTE_SOURCE_KINDS.regmeet.unverifiedNote).toBeNull()
  })

  it('drops a row from BOTH surfaces the moment it is independently cotejado', () => {
    // ABLATION for the three cases above: they would also pass if nothing could
    // ever leave the set. One verified row, and both the count and the marker
    // move together.
    const target = unverified[0]
    const verified = {
      ...target,
      provenance: {
        ...target.provenance,
        breakdown: {
          ...target.provenance.breakdown,
          verification: 'verificado',
          quote: 'tretze vots en contra i huit a favor',
          verifiedBy: 'Curator',
          verifiedAgainst: {
            kind: 'acta',
            url: 'https://ribarroja.es/files/migrate/9001/filesGroup/acta.pdf',
          },
        },
      },
    }
    const items = snapshot.items.map((v) => (v.id === target.id ? verified : v))
    expect(unverifiedBreakdownNote(items)).toBe(
      ` · ${unverified.length - 1} de ${withBreakdown.length} desgloses sin cotejar`,
    )
    expect(caveatsOn(verified)).toHaveLength(0)
  })
})
