import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import {
  validateSnapshot,
  retractVoteRecord,
  retractVoteBreakdown,
  revokeRetraction,
  findLiveRetraction,
  isLiveRetraction,
  PlenoVoteValidationError,
  PlenoVoteRetractionError,
  RETRACTION_REASON_MIN,
  type PlenoVotesSnapshot,
} from '../src/scraper/pleno-votes'
import { tallyByBloc } from '../src/hooks/usePlenoVotes'
import { computeDepartmentStats } from '../src/lib/department-stats'
import { runRelationsChecks } from '../src/scraper/relations-check'

/**
 * A retraction has to REMOVE something a reader could see. These tests are
 * therefore written against the real published snapshot and the real consumers
 * (`computeDepartmentStats`, `tallyByBloc`) rather than a hand-built fixture:
 * a fixture that restates the shape is the exact trap docs/DATA_INTEGRITY.md
 * rule 1 is about, and it is how six suites here stayed green while measuring
 * nothing.
 *
 * Every "it disappeared" assertion is paired with an ABLATION asserting it was
 * there beforehand. Without that, all of these pass on an empty snapshot.
 */

const DATA = resolve(__dirname, '../public/data/pleno-votes.json')
const published = (): PlenoVotesSnapshot =>
  validateSnapshot(JSON.parse(readFileSync(DATA, 'utf8')))

const SIG = {
  reason: 'la fuente citada no publica este desglose por grupos',
  editor: 'Test Curator',
  at: '2026-08-05T10:00:00.000Z',
}

/** The published corpus has to be non-trivial or nothing below measures anything. */
describe('retraction fixtures — the corpus under test is real', () => {
  it('reads a published snapshot with votes in it', () => {
    const snap = published()
    expect(snap.items.length).toBeGreaterThan(0)
    expect(snap.items.some((v) => v.votes.length > 0)).toBe(true)
  })
})

describe('retractVoteRecord — the whole vote leaves the published surface', () => {
  it('removes the row from items[] and tombstones it verbatim', () => {
    const snap = published()
    const target = snap.items[0]

    expect(snap.items.map((v) => v.id)).toContain(target.id) // ablation
    const after = validateSnapshot(retractVoteRecord(snap, target.id, SIG))

    expect(after.items.map((v) => v.id)).not.toContain(target.id)
    expect(after.items.length).toBe(snap.items.length - 1)

    const tomb = after.retractions.find((r) => r.voteId === target.id)
    expect(tomb).toBeDefined()
    expect(tomb!.scope).toBe('record')
    expect(tomb!.editor).toBe(SIG.editor)
    expect(tomb!.reason).toBe(SIG.reason)
    // Nothing is deleted without a record: the tombstone IS the original.
    expect(tomb!.original).toEqual(target)
  })

  it('drops the vote from stats.byOutcome and counts it as retracted', () => {
    const snap = published()
    const target = snap.items.find((v) => v.outcome === 'rechazado') ?? snap.items[0]

    const before = snap.stats.byOutcome[target.outcome]
    expect(before).toBeGreaterThan(0) // ablation

    const after = validateSnapshot(retractVoteRecord(snap, target.id, SIG))
    expect(after.stats.byOutcome[target.outcome]).toBe(before - 1)
    expect(after.stats.total).toBe(snap.stats.total - 1)
    expect(after.stats.retracted.record).toBe(1)
  })

  it('stops the vote counting in tallyByBloc (/plenos party alignment)', () => {
    const snap = published()
    const target = snap.items.find((v) => v.votes.some((t) => t.bloc))!
    expect(target).toBeDefined()
    const bloc = target.votes.find((t) => t.bloc)!.bloc as string
    const direction = target.votes.find((t) => t.bloc === bloc)!.direction

    const before = tallyByBloc(snap.items)[bloc][direction]
    expect(before).toBeGreaterThan(0) // ablation

    const after = validateSnapshot(retractVoteRecord(snap, target.id, SIG))
    expect(tallyByBloc(after.items)[bloc][direction]).toBe(before - 1)
  })

  it('refuses a vote that is not published', () => {
    expect(() => retractVoteRecord(published(), 'nosuch-99', SIG)).toThrow(
      PlenoVoteRetractionError,
    )
  })
})

describe('retraction stops driving /departamentos', () => {
  /** The one vote in the corpus carrying a dueBy — the «plazos vencidos» driver. */
  const overdueVote = (snap: PlenoVotesSnapshot) =>
    snap.items.find((v) => v.dueBy && v.outcome === 'aprobado')

  it('a retracted vote stops counting in the department vote tallies', () => {
    const snap = published()
    const target = snap.items.find((v) => v.department)
    // Not a skip: if no published vote carries a department, this check would
    // silently measure nothing, and that must be loud.
    expect(target, 'no published vote has a department — this test measures nothing').toBeDefined()

    const beforeStats = computeDepartmentStats({ votes: snap, now: new Date('2026-08-05') })
    const beforeTotal = beforeStats.list.reduce((n: number, d: any) => n + d.plenoVotes.total, 0)
    expect(beforeTotal).toBeGreaterThan(0) // ablation

    const after = validateSnapshot(retractVoteRecord(snap, target!.id, SIG))
    const afterStats = computeDepartmentStats({ votes: after, now: new Date('2026-08-05') })
    const afterTotal = afterStats.list.reduce((n: number, d: any) => n + d.plenoVotes.total, 0)
    expect(afterTotal).toBe(beforeTotal - 1)
  })

  it('a retracted vote stops driving the «plazos vencidos» flag', () => {
    const snap = published()
    const target = overdueVote(snap)
    expect(target, 'no published vote has a dueBy — this test measures nothing').toBeDefined()

    // Pick a `now` strictly after the plazo so the flag is definitely lit.
    const now = new Date(new Date(target!.dueBy!).getTime() + 86_400_000 * 30)
    const before = computeDepartmentStats({ votes: snap, now })
    expect(before.plazosVencidosCount).toBeGreaterThan(0) // ablation

    const after = computeDepartmentStats({
      votes: validateSnapshot(retractVoteRecord(snap, target!.id, SIG)),
      now,
    })
    expect(after.plazosVencidosCount).toBe(before.plazosVencidosCount - 1)
  })

  it('a retracted vote returns its agenda item to «debatido, sin voto transcrito»', () => {
    const snap = published()
    const agendas = JSON.parse(
      readFileSync(resolve(__dirname, '../public/data/plenos-agendas.json'), 'utf8'),
    )
    // Find a vote whose agenda item is actually bucketed to a department, else
    // sinVoto cannot move and the assertion would be vacuous.
    const target = snap.items.find((v) =>
      (agendas.plenos ?? []).some(
        (p: any) =>
          p.id === v.plenoId &&
          (p.agenda ?? []).some((it: any) => it.number === v.itemNumber && it.departmentSlug),
      ),
    )
    expect(target, 'no published vote joins a departmented agenda item').toBeDefined()

    const sum = (s: any) => s.list.reduce((n: number, d: any) => n + d.plenoAgendas.sinVoto, 0)
    const before = sum(computeDepartmentStats({ votes: snap, agendas, now: new Date('2026-08-05') }))
    const after = sum(
      computeDepartmentStats({
        votes: validateSnapshot(retractVoteRecord(snap, target!.id, SIG)),
        agendas,
        now: new Date('2026-08-05'),
      }),
    )
    expect(after).toBe(before + 1)
  })
})

describe('retractVoteBreakdown — the narrower operation', () => {
  it('withdraws the tally while item, outcome and source stay published', () => {
    const snap = published()
    const target = snap.items.find((v) => v.votes.length > 0)!
    expect(target.votes.length).toBeGreaterThan(0) // ablation

    const after = validateSnapshot(retractVoteBreakdown(snap, target.id, SIG))
    const kept = after.items.find((v) => v.id === target.id)

    expect(kept).toBeDefined()
    expect(kept!.votes).toEqual([])
    expect(kept!.votesRetracted?.editor).toBe(SIG.editor)
    // The two facts the cited source actually publishes survive intact.
    expect(kept!.outcome).toBe(target.outcome)
    expect(kept!.title).toBe(target.title)
    expect(kept!.sourceUrl).toBe(target.sourceUrl)
    expect(kept!.itemNumber).toBe(target.itemNumber)
    // …and the outcome tallies do NOT move, which is the whole point of the
    // narrower scope: withdrawing an unsourced breakdown must not delete a
    // sourced outcome.
    expect(after.stats.byOutcome).toEqual(snap.stats.byOutcome)
    expect(after.stats.total).toBe(snap.stats.total)
    expect(after.stats.retracted.breakdown).toBe(1)
  })

  it('removes the withdrawn tuples from tallyByBloc', () => {
    const snap = published()
    const target = snap.items.find((v) => v.votes.some((t) => t.bloc))!
    const bloc = target.votes.find((t) => t.bloc)!.bloc as string
    const direction = target.votes.find((t) => t.bloc === bloc)!.direction

    const before = tallyByBloc(snap.items)[bloc][direction]
    expect(before).toBeGreaterThan(0) // ablation

    const after = validateSnapshot(retractVoteBreakdown(snap, target.id, SIG))
    expect(tallyByBloc(after.items)[bloc][direction]).toBe(before - 1)
  })

  it('tombstones the withdrawn tuples verbatim', () => {
    const snap = published()
    const target = snap.items.find((v) => v.votes.length > 0)!
    const after = validateSnapshot(retractVoteBreakdown(snap, target.id, SIG))
    const tomb = after.retractions.find((r) => r.voteId === target.id)!
    expect(tomb.scope).toBe('breakdown')
    expect(tomb.originalVotes).toEqual(target.votes)
    expect(tomb.original).toBeNull()
  })

  it('refuses a vote whose breakdown is already withdrawn', () => {
    const snap = published()
    const target = snap.items.find((v) => v.votes.length > 0)!
    const once = validateSnapshot(retractVoteBreakdown(snap, target.id, SIG))
    expect(() => retractVoteBreakdown(once, target.id, SIG)).toThrow(PlenoVoteRetractionError)
  })
})

describe('the signature is non-negotiable', () => {
  const target = () => published().items[0].id

  it('refuses a reason shorter than the minimum', () => {
    expect(() =>
      retractVoteRecord(published(), target(), { ...SIG, reason: 'mal' }),
    ).toThrow(PlenoVoteRetractionError)
    expect('mal'.length).toBeLessThan(RETRACTION_REASON_MIN) // ablation
  })

  it('refuses an empty editor', () => {
    expect(() => retractVoteRecord(published(), target(), { ...SIG, editor: '  ' })).toThrow(
      PlenoVoteRetractionError,
    )
  })

  it('refuses the same on a breakdown retraction', () => {
    const snap = published()
    const id = snap.items.find((v) => v.votes.length > 0)!.id
    expect(() => retractVoteBreakdown(snap, id, { ...SIG, reason: 'corto' })).toThrow(
      PlenoVoteRetractionError,
    )
  })
})

describe('a retracted vote cannot silently reappear', () => {
  it('validateSnapshot refuses a retracted id republished in items[]', () => {
    const snap = published()
    const target = snap.items[0]
    const after = validateSnapshot(retractVoteRecord(snap, target.id, SIG))

    // ABLATION: the same items[] with NO retraction ledger validates fine, so
    // the throw below is caused by the retraction and not by the row itself.
    expect(() =>
      validateSnapshot({ ...after, retractions: [], items: [...after.items, target] }),
    ).not.toThrow()

    expect(() => validateSnapshot({ ...after, items: [...after.items, target] })).toThrow(
      PlenoVoteValidationError,
    )
  })

  it('names the CLI that would legitimately put it back', () => {
    const snap = published()
    const target = snap.items[0]
    const after = validateSnapshot(retractVoteRecord(snap, target.id, SIG))
    expect(() => validateSnapshot({ ...after, items: [...after.items, target] })).toThrow(
      /retract-vote .*--unretract/,
    )
  })

  it('refuses a withdrawn breakdown republished as a tally', () => {
    const snap = published()
    const target = snap.items.find((v) => v.votes.length > 0)!
    const after = validateSnapshot(retractVoteBreakdown(snap, target.id, SIG))
    expect(() =>
      validateSnapshot({
        ...after,
        items: after.items.map((v) => (v.id === target.id ? target : v)),
      }),
    ).toThrow(PlenoVoteValidationError)
  })

  it('refuses a votesRetracted stamp whose ledger entry was removed', () => {
    const snap = published()
    const target = snap.items.find((v) => v.votes.length > 0)!
    const after = validateSnapshot(retractVoteBreakdown(snap, target.id, SIG))
    expect(() => validateSnapshot({ ...after, retractions: [] })).toThrow(
      PlenoVoteValidationError,
    )
  })

  it('refuses an empty breakdown with no stamp at all', () => {
    const snap = published()
    const target = snap.items.find((v) => v.votes.length > 0)!
    expect(() =>
      validateSnapshot({
        ...snap,
        items: snap.items.map((v) => (v.id === target.id ? { ...v, votes: [] } : v)),
      }),
    ).toThrow(PlenoVoteValidationError)
  })
})

describe('revoking a retraction is explicit, signed and recorded', () => {
  const REVOKE = {
    reason: 'se publica el registro corregido tras cotejar el acta oficial',
    editor: 'Test Curator',
    at: '2026-09-01T10:00:00.000Z',
  }

  it('lifts the block without deleting the ledger entry', () => {
    const snap = published()
    const target = snap.items[0]
    const retracted = validateSnapshot(retractVoteRecord(snap, target.id, SIG))
    const revoked = validateSnapshot(revokeRetraction(retracted, target.id, 'record', REVOKE))

    expect(revoked.retractions.length).toBe(1) // the record survives
    expect(revoked.retractions[0].revokedBy).toBe(REVOKE.editor)
    expect(revoked.retractions[0].revokedReason).toBe(REVOKE.reason)
    expect(isLiveRetraction(revoked.retractions[0])).toBe(false)
    expect(revoked.stats.retracted.record).toBe(0)
    // Only now can the id be published again.
    expect(() => validateSnapshot({ ...revoked, items: [...revoked.items, target] })).not.toThrow()
  })

  it('restores the withdrawn tuples when a breakdown retraction is revoked', () => {
    const snap = published()
    const target = snap.items.find((v) => v.votes.length > 0)!
    const retracted = validateSnapshot(retractVoteBreakdown(snap, target.id, SIG))
    expect(retracted.items.find((v) => v.id === target.id)!.votes).toEqual([]) // ablation

    const revoked = validateSnapshot(revokeRetraction(retracted, target.id, 'breakdown', REVOKE))
    const back = revoked.items.find((v) => v.id === target.id)!
    expect(back.votes).toEqual(target.votes)
    expect(back.votesRetracted).toBeUndefined()
    expect(findLiveRetraction(revoked, target.id, 'breakdown')).toBeUndefined()
  })

  it('refuses to revoke something that was never retracted', () => {
    expect(() => revokeRetraction(published(), 'nosuch-99', 'record', REVOKE)).toThrow(
      PlenoVoteRetractionError,
    )
  })
})

describe('check:relations catches a hand-edited reappearance', () => {
  const run = (votes: unknown) =>
    runRelationsChecks({ votes: votes as any }).find((r) => r.name === 'votes-retractions')!

  it('is [empty] — not [ok] — when there is nothing to check', () => {
    const r = run(published())
    expect(r.status).toBe('empty')
    expect(r.checked).toBe(0)
  })

  it('reports the check evaluated something once a retraction exists', () => {
    const snap = published()
    const after = validateSnapshot(retractVoteRecord(snap, snap.items[0].id, SIG))
    const r = run(after)
    expect(r.checked).toBeGreaterThan(0)
    expect(r.status).toBe('ok')
  })

  it('breaks when a retracted vote is put back by hand', () => {
    const snap = published()
    const target = snap.items[0]
    const after = validateSnapshot(retractVoteRecord(snap, target.id, SIG))
    const tampered = { ...after, items: [...after.items, target] }
    const r = run(tampered)
    expect(r.status).toBe('broken')
    expect(r.level).toBe('error')
    expect(r.broken.join(' ')).toContain(target.id)
  })

  it('breaks when a votesRetracted stamp has no ledger entry', () => {
    const snap = published()
    const target = snap.items.find((v) => v.votes.length > 0)!
    const after = validateSnapshot(retractVoteBreakdown(snap, target.id, SIG))
    const r = run({ ...after, retractions: [] })
    expect(r.status).toBe('broken')
    expect(r.broken.join(' ')).toContain(target.id)
  })
})
