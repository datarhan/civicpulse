import { describe, it, expect } from 'vitest'
import { mergeAgendaPlenos, type EnrichedPleno } from '../src/scraper/pleno-agenda'

/**
 * The agendas snapshot used to be rebuilt from scratch over the 30 most-recent
 * sessions. Two consequences, both visible on the live site on 2026-08-01:
 * 29 of 61 pleno pages had no orden del día at all, and every refresh silently
 * dropped the oldest covered sessions as the window slid forward.
 *
 * Merging fixes both, but it has to keep the f4fa424 protection: a dead
 * upstream returns a page that parses to zero items, and letting that
 * overwrite a good agenda is exactly how the department dashboards got zeroed.
 */

function pleno(id: string, itemCount: number, over: Partial<EnrichedPleno> = {}): EnrichedPleno {
  const agenda = Array.from({ length: itemCount }, (_, n) => ({
    number: n + 1,
    title: `punto ${n + 1} de ${id}`,
    section: 'resolutiva' as const,
    department: null,
    expediente: null,
  }))
  return {
    id,
    date: '2026-01-01',
    title: `Sesión ${id}`,
    kind: 'ordinario',
    link: `https://regmeet.com/x/${id}`,
    agenda,
    agendaCount: agenda.length,
    departments: [],
    hasRuegos: false,
    ...over,
  }
}

describe('scraper/pleno-agenda — mergeAgendaPlenos', () => {
  it('keeps sessions that were not re-fetched this run', () => {
    const existing = [pleno('old-a', 4), pleno('old-b', 7)]
    const fetched = [pleno('new-c', 5)]

    const { plenos, carriedForward } = mergeAgendaPlenos(existing, fetched)

    expect(plenos.map((p) => p.id).sort()).toEqual(['new-c', 'old-a', 'old-b'])
    expect(carriedForward).toBe(2)
  })

  it('a fresh fetch replaces the stored agenda for the same session', () => {
    const existing = [pleno('a', 3)]
    const fetched = [pleno('a', 9)]

    const { plenos } = mergeAgendaPlenos(existing, fetched)

    expect(plenos).toHaveLength(1)
    expect(plenos[0].agendaCount).toBe(9)
  })

  it('an empty fetch NEVER overwrites a stored non-empty agenda', () => {
    // The f4fa424 incident: upstream serves a shell page, it parses to zero
    // items, and every department dashboard goes blank.
    const existing = [pleno('a', 6)]
    const fetched = [pleno('a', 0)]

    const { plenos, carriedForward } = mergeAgendaPlenos(existing, fetched)

    expect(plenos[0].agendaCount).toBe(6)
    expect(carriedForward).toBe(1)
  })

  it('an empty fetch for an unknown session is not published at all', () => {
    // Better to have no record than a record asserting "this session had
    // zero agenda points" — the page copy reads that as fact.
    const { plenos } = mergeAgendaPlenos([], [pleno('never-seen', 0)])

    expect(plenos).toEqual([])
  })

  it('orders output newest-first by date', () => {
    const existing = [pleno('mid', 1, { date: '2025-06-01' })]
    const fetched = [
      pleno('oldest', 1, { date: '2024-01-01' }),
      pleno('newest', 1, { date: '2026-07-27' }),
    ]

    const { plenos } = mergeAgendaPlenos(existing, fetched)

    expect(plenos.map((p) => p.id)).toEqual(['newest', 'mid', 'oldest'])
  })

  it('reports how many sessions carry a stored agenda rather than a fresh one', () => {
    const existing = [pleno('a', 2), pleno('b', 2), pleno('c', 2)]
    const fetched = [pleno('a', 3)]

    const { carriedForward, refreshed } = mergeAgendaPlenos(existing, fetched)

    expect(refreshed).toBe(1)
    expect(carriedForward).toBe(2)
  })

  it('backfills the real gap: 30 stored sessions plus 7 recovered from archive', () => {
    const existing = Array.from({ length: 30 }, (_, n) => pleno(`stored-${n}`, 10))
    const fetched = Array.from({ length: 7 }, (_, n) => pleno(`archived-${n}`, 17))

    const { plenos, carriedForward } = mergeAgendaPlenos(existing, fetched)

    expect(plenos).toHaveLength(37)
    expect(carriedForward).toBe(30)
    expect(plenos.reduce((s, p) => s + p.agendaCount, 0)).toBe(30 * 10 + 7 * 17)
  })
})
