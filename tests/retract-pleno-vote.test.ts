import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import {
  validateVote,
  validateSnapshot,
  retractVoteRecord,
  retractVoteBreakdown,
  revokeRetraction,
  findLiveRetraction,
  isLiveRetraction,
  PlenoVoteValidationError,
  PlenoVoteRetractionError,
  RETRACTION_REASON_MIN,
  type PlenoVote,
  type VoteRetraction,
  type PlenoVotesSnapshot,
} from '../src/scraper/pleno-votes'
import { tallyByBloc } from '../src/hooks/usePlenoVotes'
import { computeDepartmentStats } from '../src/lib/department-stats'
import { runRelationsChecks } from '../src/scraper/relations-check'

/**
 * A retraction has to REMOVE something a reader could see, so these tests drive
 * the real consumers — `validateSnapshot`, `tallyByBloc`,
 * `computeDepartmentStats`, `runRelationsChecks` — not stand-ins for them.
 *
 * What they no longer drive is the PUBLISHED snapshot. The first version of
 * this file was written while public/data/pleno-votes.json held zero
 * retractions, and it read that file for every case: «the ledger is empty»,
 * «retracted.breakdown is 1», «retractions.length is 1». The first three real
 * retractions — the feature being used for its purpose — turned five of those
 * green assertions red without a line of production code changing. An expected
 * value of "however many retractions exist today" measures the calendar.
 *
 * So the operations run against a corpus this file BUILDS. That is the shape
 * docs/DATA_INTEGRITY.md rule 1 warns about, and the warning is answered rather
 * than ignored: every fixture vote is produced by the production `validateVote`
 * and every fixture snapshot by the production `validateSnapshot`, so the
 * enums, the bloc dedupe, the retired `Otro` sentinel and the votes/
 * votesRetracted pairing are the real ones. A fixture that drifted from the
 * schema throws while being built instead of quietly measuring nothing, and the
 * `PlenoVote` type on the builder makes the drift a typecheck failure too.
 *
 * The published file is still under test — in the last block — but only for
 * invariants that hold at zero retractions and at three hundred.
 *
 * Every "it disappeared" assertion is paired with an ABLATION asserting it was
 * there beforehand. Without that, all of these pass on an empty snapshot.
 */

const SIG = {
  reason: 'la fuente citada no publica este desglose por grupos',
  editor: 'Test Curator',
  at: '2026-08-05T10:00:00.000Z',
}

/** Before `NOW`, so a vote carrying it is unambiguously overdue. */
const OVERDUE_BY = '2026-01-15'
const NOW = new Date('2026-08-05')

/**
 * Build one fixture vote THROUGH the production validator, so the fixture
 * cannot restate a shape the parser no longer accepts: an unknown bloc, a
 * duplicated group, a title under 20 chars or a `dueBy` without its verbatim
 * clause throws here, in the fixture, rather than passing silently.
 */
const FIXTURE_URL = 'https://example.org/actas/fixture.pdf'

/** One citation per claim. `acta` because the fixture's source is an acta PDF,
 *  and an acta is the one kind that carries BOTH halves — so a fixture built on
 *  it keeps exercising the outcome and the breakdown together. */
function fixtureProvenance(votes: unknown[]) {
  const ref = {
    kind: 'acta' as const,
    url: FIXTURE_URL,
    publisher: 'Fixture — Ayuntamiento de Riba-roja de Túria',
    retrievedAt: '2026-03-20',
    verification: 'sin-verificar' as const,
  }
  return { outcome: ref, breakdown: votes.length > 0 ? ref : null }
}

function makeVote(id: string, over: Partial<PlenoVote> = {}): PlenoVote {
  const [plenoId, num] = id.split('-')
  const votes = over.votes ?? [
    { bloc: 'PSOE' as const, direction: 'a_favor' as const, seats: 11 },
    { bloc: 'PP' as const, direction: 'en_contra' as const, seats: 7 },
  ]
  return validateVote({
    id,
    plenoId,
    itemNumber: Number(num),
    plenoDate: '2026-03-12',
    title: 'Aprobación del expediente de contratación del banco de pruebas',
    outcome: 'aprobado',
    sourceUrl: FIXTURE_URL,
    sourcePublisher: 'Fixture — Ayuntamiento de Riba-roja de Túria',
    retrievedAt: '2026-03-20',
    provenance: fixtureProvenance(votes),
    ...over,
    votes,
  })
}

/** Same trick one level up: the snapshot invariants are the production ones. */
function makeSnapshot(items: PlenoVote[], retractions: VoteRetraction[] = []): PlenoVotesSnapshot {
  return validateSnapshot({
    generatedAt: '2026-08-05T00:00:00.000Z',
    source: { description: 'fixture', contract: 'fixture' },
    items,
    retractions,
  })
}

/**
 * A corpus with the four properties the cases below need: a departmented vote
 * carrying an overdue plazo, a `rechazado`, a vote with a null-bloc tuple, and
 * a vote outside any department. Rebuilt per call so no case can leak into the
 * next.
 */
function corpus(): PlenoVotesSnapshot {
  return makeSnapshot([
    makeVote('fixa-01', {
      department: 'urbanismo',
      dueBy: OVERDUE_BY,
      dueBySource: 'con un plazo de ejecución de seis meses desde la firma del acta',
    }),
    makeVote('fixa-02', {
      outcome: 'rechazado',
      title: 'Moción para la revisión del contrato de limpieza viaria del municipio',
      votes: [
        { bloc: 'PSOE', direction: 'en_contra', seats: 11 },
        { bloc: 'PP', direction: 'a_favor', seats: 7 },
        { bloc: null, direction: 'abstencion' },
      ],
    }),
    makeVote('fixb-03', {
      department: 'urbanismo',
      votes: [{ bloc: 'PP', direction: 'abstencion', seats: 7 }],
    }),
    makeVote('fixb-04', {
      votes: [{ bloc: 'VOX', direction: 'a_favor', seats: 1 }],
    }),
  ])
}

/** Agenda snapshot joining every fixture vote on plenoId + itemNumber. */
function agendasFixture() {
  return {
    plenos: [
      {
        id: 'fixa',
        date: '2026-03-12',
        agenda: [
          { number: 1, departmentSlug: 'urbanismo' },
          { number: 2, departmentSlug: 'urbanismo' },
        ],
      },
      {
        id: 'fixb',
        date: '2026-03-12',
        agenda: [
          { number: 3, departmentSlug: 'urbanismo' },
          { number: 4, departmentSlug: 'urbanismo' },
        ],
      },
    ],
  }
}

/** The corpus has to be non-trivial or nothing below measures anything. */
describe('retraction fixtures — the corpus under test is real', () => {
  it('builds a snapshot the production validator accepts', () => {
    const snap = corpus()
    expect(snap.items.length).toBeGreaterThan(0)
    expect(snap.items.some((v) => v.votes.length > 0)).toBe(true)
    // Every property a case below relies on, asserted once here: if the corpus
    // loses one, the case that needs it fails loudly instead of going vacuous.
    expect(snap.items.some((v) => v.department)).toBe(true)
    expect(snap.items.some((v) => v.dueBy && v.outcome === 'aprobado')).toBe(true)
    expect(snap.items.some((v) => v.outcome === 'rechazado')).toBe(true)
    expect(snap.items.some((v) => v.votes.some((t) => t.bloc === null))).toBe(true)
    // The starting point of every case: nothing has been withdrawn yet.
    expect(snap.retractions).toEqual([])
    expect(snap.stats.retracted).toEqual({ record: 0, breakdown: 0 })
  })

  it('refuses to build a fixture the parser would reject', () => {
    // The guard on the guard: if makeVote stopped validating, the corpus could
    // drift from the schema and every case above it would measure a shape
    // production has not accepted for months.
    expect(() => makeVote('fixa-09', { title: 'corto' })).toThrow(PlenoVoteValidationError)
    expect(() =>
      makeVote('fixa-09', { votes: [{ bloc: 'Otro' as never, direction: 'a_favor' }] }),
    ).toThrow(PlenoVoteValidationError)
  })
})

describe('retractVoteRecord — the whole vote leaves the published surface', () => {
  it('removes the row from items[] and tombstones it verbatim', () => {
    const snap = corpus()
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
    const snap = corpus()
    const target = snap.items.find((v) => v.outcome === 'rechazado')!

    const before = snap.stats.byOutcome[target.outcome]
    expect(before).toBeGreaterThan(0) // ablation

    const after = validateSnapshot(retractVoteRecord(snap, target.id, SIG))
    expect(after.stats.byOutcome[target.outcome]).toBe(before - 1)
    expect(after.stats.total).toBe(snap.stats.total - 1)
    // A DELTA, not a census: «one more than there were» stays true whatever the
    // ledger already held.
    expect(after.stats.retracted.record).toBe(snap.stats.retracted.record + 1)
  })

  it('stops the vote counting in tallyByBloc (/plenos party alignment)', () => {
    const snap = corpus()
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
    expect(() => retractVoteRecord(corpus(), 'nosuch-99', SIG)).toThrow(PlenoVoteRetractionError)
  })

  it('refuses to publish a record retraction over a live breakdown retraction', () => {
    // Not a hypothetical: the published qz6weg-14 is breakdown-retracted, and
    // withdrawing its whole record would orphan that ledger entry. The pure
    // step is deliberately permissive — it is a weakening — and the validator
    // the CLI runs before EVERY write is what refuses, so the invalid
    // combination cannot reach public/data/. Fail-closed, pinned.
    const snap = corpus()
    const id = 'fixa-02'
    const withBreakdown = validateSnapshot(retractVoteBreakdown(snap, id, SIG))
    expect(withBreakdown.items.map((v) => v.id)).toContain(id) // ablation
    expect(() => validateSnapshot(retractVoteRecord(withBreakdown, id, SIG))).toThrow(
      PlenoVoteValidationError,
    )
  })
})

describe('retraction stops driving /departamentos', () => {
  /** The vote in the corpus carrying a dueBy — the «plazos vencidos» driver. */
  const overdueVote = (snap: PlenoVotesSnapshot) =>
    snap.items.find((v) => v.dueBy && v.outcome === 'aprobado')

  it('a retracted vote stops counting in the department vote tallies', () => {
    const snap = corpus()
    const target = snap.items.find((v) => v.department)
    // Not a skip: if no vote carries a department, this check would silently
    // measure nothing, and that must be loud.
    expect(target, 'no fixture vote has a department — this test measures nothing').toBeDefined()

    const beforeStats = computeDepartmentStats({ votes: snap, now: NOW })
    const beforeTotal = beforeStats.list.reduce((n: number, d: any) => n + d.plenoVotes.total, 0)
    expect(beforeTotal).toBeGreaterThan(0) // ablation

    const after = validateSnapshot(retractVoteRecord(snap, target!.id, SIG))
    const afterStats = computeDepartmentStats({ votes: after, now: NOW })
    const afterTotal = afterStats.list.reduce((n: number, d: any) => n + d.plenoVotes.total, 0)
    expect(afterTotal).toBe(beforeTotal - 1)
  })

  it('a retracted vote stops driving the «plazos vencidos» flag', () => {
    const snap = corpus()
    const target = overdueVote(snap)
    expect(target, 'no fixture vote has a dueBy — this test measures nothing').toBeDefined()

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
    const snap = corpus()
    const agendas = agendasFixture()
    // The vote must join a DEPARTMENTED agenda item, else sinVoto cannot move
    // and the assertion would be vacuous.
    const target = snap.items.find((v) =>
      agendas.plenos.some(
        (p) => p.id === v.plenoId && p.agenda.some((it) => it.number === v.itemNumber),
      ),
    )
    expect(target, 'no fixture vote joins a departmented agenda item').toBeDefined()

    const sum = (s: any) => s.list.reduce((n: number, d: any) => n + d.plenoAgendas.sinVoto, 0)
    const before = sum(computeDepartmentStats({ votes: snap, agendas, now: NOW }))
    const after = sum(
      computeDepartmentStats({
        votes: validateSnapshot(retractVoteRecord(snap, target!.id, SIG)),
        agendas,
        now: NOW,
      }),
    )
    expect(after).toBe(before + 1)
  })
})

describe('retractVoteBreakdown — the narrower operation', () => {
  it('withdraws the tally while item, outcome and source stay published', () => {
    const snap = corpus()
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
    expect(after.stats.retracted.breakdown).toBe(snap.stats.retracted.breakdown + 1)
  })

  it('removes the withdrawn tuples from tallyByBloc', () => {
    const snap = corpus()
    const target = snap.items.find((v) => v.votes.some((t) => t.bloc))!
    const bloc = target.votes.find((t) => t.bloc)!.bloc as string
    const direction = target.votes.find((t) => t.bloc === bloc)!.direction

    const before = tallyByBloc(snap.items)[bloc][direction]
    expect(before).toBeGreaterThan(0) // ablation

    const after = validateSnapshot(retractVoteBreakdown(snap, target.id, SIG))
    expect(tallyByBloc(after.items)[bloc][direction]).toBe(before - 1)
  })

  it('tombstones the withdrawn tuples verbatim', () => {
    const snap = corpus()
    const target = snap.items.find((v) => v.votes.length > 0)!
    const after = validateSnapshot(retractVoteBreakdown(snap, target.id, SIG))
    const tomb = after.retractions.find((r) => r.voteId === target.id)!
    expect(tomb.scope).toBe('breakdown')
    expect(tomb.originalVotes).toEqual(target.votes)
    expect(tomb.original).toBeNull()
  })

  it('refuses a vote whose breakdown is already withdrawn', () => {
    const snap = corpus()
    const target = snap.items.find((v) => v.votes.length > 0)!
    const once = validateSnapshot(retractVoteBreakdown(snap, target.id, SIG))
    expect(() => retractVoteBreakdown(once, target.id, SIG)).toThrow(PlenoVoteRetractionError)
  })
})

describe('the signature is non-negotiable', () => {
  const target = () => corpus().items[0].id

  it('refuses a reason shorter than the minimum', () => {
    expect(() => retractVoteRecord(corpus(), target(), { ...SIG, reason: 'mal' })).toThrow(
      PlenoVoteRetractionError,
    )
    expect('mal'.length).toBeLessThan(RETRACTION_REASON_MIN) // ablation
  })

  it('refuses an empty editor', () => {
    expect(() => retractVoteRecord(corpus(), target(), { ...SIG, editor: '  ' })).toThrow(
      PlenoVoteRetractionError,
    )
  })

  it('refuses the same on a breakdown retraction', () => {
    const snap = corpus()
    const id = snap.items.find((v) => v.votes.length > 0)!.id
    expect(() => retractVoteBreakdown(snap, id, { ...SIG, reason: 'corto' })).toThrow(
      PlenoVoteRetractionError,
    )
  })
})

describe('a retracted vote cannot silently reappear', () => {
  it('validateSnapshot refuses a retracted id republished in items[]', () => {
    const snap = corpus()
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
    const snap = corpus()
    const target = snap.items[0]
    const after = validateSnapshot(retractVoteRecord(snap, target.id, SIG))
    expect(() => validateSnapshot({ ...after, items: [...after.items, target] })).toThrow(
      /retract-vote .*--unretract/,
    )
  })

  it('refuses a withdrawn breakdown republished as a tally', () => {
    const snap = corpus()
    const target = snap.items.find((v) => v.votes.length > 0)!
    const after = validateSnapshot(retractVoteBreakdown(snap, target.id, SIG))
    // ABLATION: the untouched row validates, so the throw is the live ledger
    // entry refusing the tally, not the row being malformed.
    expect(() => validateSnapshot(snap)).not.toThrow()
    expect(() =>
      validateSnapshot({
        ...after,
        items: after.items.map((v) => (v.id === target.id ? target : v)),
      }),
    ).toThrow(PlenoVoteValidationError)
  })

  it('refuses a votesRetracted stamp whose ledger entry was removed', () => {
    const snap = corpus()
    const target = snap.items.find((v) => v.votes.length > 0)!
    const after = validateSnapshot(retractVoteBreakdown(snap, target.id, SIG))
    // ABLATION: the same items[] WITH its ledger validates, so emptying
    // retractions[] is what the throw is about.
    expect(() => validateSnapshot(after)).not.toThrow()
    expect(() => validateSnapshot({ ...after, retractions: [] })).toThrow(PlenoVoteValidationError)
  })

  it('refuses an empty breakdown with no stamp at all', () => {
    const snap = corpus()
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
    const snap = corpus()
    const target = snap.items[0]
    const retracted = validateSnapshot(retractVoteRecord(snap, target.id, SIG))
    const revoked = validateSnapshot(revokeRetraction(retracted, target.id, 'record', REVOKE))

    // The ledger is append-only: revoking STAMPS, it never prunes, so the
    // entry count cannot fall.
    expect(revoked.retractions.length).toBe(retracted.retractions.length)
    const entry = revoked.retractions.find((r) => r.voteId === target.id)!
    expect(entry.revokedBy).toBe(REVOKE.editor)
    expect(entry.revokedReason).toBe(REVOKE.reason)
    expect(isLiveRetraction(entry)).toBe(false)
    expect(revoked.stats.retracted.record).toBe(snap.stats.retracted.record)
    // Only now can the id be published again.
    expect(() => validateSnapshot({ ...revoked, items: [...revoked.items, target] })).not.toThrow()
  })

  it('restores the withdrawn tuples when a breakdown retraction is revoked', () => {
    const snap = corpus()
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
    expect(() => revokeRetraction(corpus(), 'nosuch-99', 'record', REVOKE)).toThrow(
      PlenoVoteRetractionError,
    )
  })
})

describe('check:relations catches a hand-edited reappearance', () => {
  const run = (votes: unknown) =>
    runRelationsChecks({ votes: votes as any }).find((r) => r.name === 'votes-retractions')!

  it('is [empty] — not [ok] — when there is nothing to check', () => {
    // Built with no ledger on purpose. Asking the PUBLISHED file this question
    // stopped working the day the feature was first used, which is exactly
    // backwards: the distinction being tested is «a check that verified zero
    // refs must not report success», and it is testable only on a corpus this
    // file controls.
    const snap = corpus()
    expect(snap.retractions).toEqual([]) // ablation
    const r = run(snap)
    expect(r.status).toBe('empty')
    expect(r.checked).toBe(0)
  })

  it('reports the check evaluated something once a retraction exists', () => {
    const snap = corpus()
    const after = validateSnapshot(retractVoteRecord(snap, snap.items[0].id, SIG))
    const r = run(after)
    expect(r.checked).toBeGreaterThan(0)
    expect(r.status).toBe('ok')
  })

  it('breaks when a retracted vote is put back by hand', () => {
    const snap = corpus()
    const target = snap.items[0]
    const after = validateSnapshot(retractVoteRecord(snap, target.id, SIG))
    const tampered = { ...after, items: [...after.items, target] }
    const r = run(tampered)
    expect(r.status).toBe('broken')
    expect(r.level).toBe('error')
    expect(r.broken.join(' ')).toContain(target.id)
  })

  it('breaks when a votesRetracted stamp has no ledger entry', () => {
    const snap = corpus()
    const target = snap.items.find((v) => v.votes.length > 0)!
    const after = validateSnapshot(retractVoteBreakdown(snap, target.id, SIG))
    const r = run({ ...after, retractions: [] })
    expect(r.status).toBe('broken')
    expect(r.broken.join(' ')).toContain(target.id)
  })
})

/**
 * The published file, tested for what must be TRUE OF IT rather than for what
 * it happened to contain the day this was written. Every assertion below holds
 * at zero retractions and at three hundred.
 *
 * Where a loop could go vacuous, it counts what it inspected and asserts the
 * count covers the whole ledger — «this loop saw every entry», which is
 * checkable, rather than «there was at least one entry», which is the calendar
 * again.
 */
describe('the published snapshot upholds the retraction invariants', () => {
  const DATA = resolve(__dirname, '../public/data/pleno-votes.json')
  const raw = (): Record<string, any> => JSON.parse(readFileSync(DATA, 'utf8'))
  const published = (): PlenoVotesSnapshot => validateSnapshot(raw())
  const live = (snap: PlenoVotesSnapshot) => snap.retractions.filter(isLiveRetraction)

  it('validates, and carries votes a reader can see', () => {
    const snap = published()
    expect(snap.items.length).toBeGreaterThan(0)
    expect(snap.items.some((v) => v.votes.length > 0)).toBe(true)
  })

  it('keeps every live record-scoped id out of items[]', () => {
    const snap = published()
    const ids = new Set(snap.items.map((v) => v.id))
    const records = live(snap).filter((r) => r.scope === 'record')
    let inspected = 0
    for (const r of records) {
      inspected += 1
      expect(ids.has(r.voteId), `${r.voteId} was retracted but is published again`).toBe(false)
      // Nothing is deleted without a record.
      expect(r.original, `${r.voteId} has no tombstone`).not.toBeNull()
      expect(r.original!.id).toBe(r.voteId)
    }
    expect(inspected).toBe(records.length)
  })

  it('keeps every live breakdown-scoped item published with zero tuples', () => {
    const snap = published()
    const byId = new Map(snap.items.map((v) => [v.id, v]))
    const breakdowns = live(snap).filter((r) => r.scope === 'breakdown')
    let inspected = 0
    for (const r of breakdowns) {
      inspected += 1
      const item = byId.get(r.voteId)
      expect(item, `${r.voteId} has a breakdown retraction but no item`).toBeDefined()
      expect(item!.votes).toEqual([])
      expect(item!.votesRetracted).toBeDefined()
      // The item keeps what the source does publish.
      expect(item!.outcome).toBeTruthy()
      expect(item!.sourceUrl).toMatch(/^https?:\/\//)
      // …and the withdrawn tuples stay recoverable.
      expect(r.originalVotes ?? []).not.toEqual([])
    }
    expect(inspected).toBe(breakdowns.length)
  })

  it('signs, dates and explains every retraction', () => {
    const snap = published()
    let inspected = 0
    for (const r of snap.retractions) {
      inspected += 1
      expect(r.editor.trim().length, `${r.voteId} has no editor`).toBeGreaterThan(0)
      expect(r.reason.trim().length, `${r.voteId} reason too short`).toBeGreaterThanOrEqual(
        RETRACTION_REASON_MIN,
      )
      expect(r.retractedAt, `${r.voteId} has no timestamp`).toMatch(/^\d{4}-\d{2}-\d{2}T/)
      expect(Number.isNaN(Date.parse(r.retractedAt))).toBe(false)
    }
    expect(inspected).toBe(snap.retractions.length)
  })

  it('never stamps a row whose ledger entry is gone', () => {
    const snap = published()
    const liveBreakdowns = new Set(
      live(snap)
        .filter((r) => r.scope === 'breakdown')
        .map((r) => r.voteId),
    )
    let inspected = 0
    for (const v of snap.items.filter((it) => it.votesRetracted != null)) {
      inspected += 1
      expect(liveBreakdowns.has(v.id), `${v.id} is stamped with no live ledger entry`).toBe(true)
    }
    expect(inspected).toBe(snap.items.filter((it) => it.votesRetracted != null).length)
  })

  it('ships a stats block that matches its own contents', () => {
    // The committed `stats` is written by validateSnapshot, which recomputes
    // it. Comparing the file's stored block against the recomputation catches
    // a hand-edit — including one that under-reports how much was withdrawn.
    const onDisk = raw()
    expect(onDisk.stats).toEqual(published().stats)
  })

  it('passes check:relations — never [broken]', () => {
    const r = runRelationsChecks({ votes: raw() as any }).find((c) => c.name === 'votes-retractions')!
    expect(r.broken).toEqual([])
    expect(r.status).not.toBe('broken')
    // `empty` is a legitimate state here (no retractions yet) and so is `ok`;
    // what is asserted is that the check RAN over the whole ledger.
    expect(r.checked).toBe(
      published().retractions.length + published().items.filter((v) => v.votesRetracted).length,
    )
  })
})

/**
 * A withdrawn tally takes its citation with it.
 *
 * The two halves of a vote have different sources, so withdrawing the tally
 * must not leave `provenance.breakdown` pointing at a document for something
 * the page no longer shows — and must not lose it either, or a later revocation
 * would republish an uncited breakdown.
 */
describe('retracting a breakdown moves its citation to the ledger', () => {
  it('drops provenance.breakdown from the row and tombstones it', () => {
    const snap = corpus()
    const target = snap.items[0]
    // ABLATION: the row cites a breakdown before the retraction. Without this
    // the assertion below would also pass on a row that never had one.
    expect(target.provenance?.breakdown).not.toBeNull()

    const after = validateSnapshot(retractVoteBreakdown(snap, target.id, SIG))
    const row = after.items.find((v) => v.id === target.id)
    expect(row!.votes).toHaveLength(0)
    expect(row!.provenance?.breakdown).toBeNull()
    // The outcome keeps its own source: it was never in question.
    expect(row!.provenance?.outcome.url).toBe(target.provenance!.outcome.url)

    const entry = after.retractions.find((r) => r.voteId === target.id && r.scope === 'breakdown')
    expect(entry!.originalBreakdownSource?.url).toBe(target.provenance!.breakdown!.url)
  })

  it('restores the tally AND its citation on revoke', () => {
    const snap = corpus()
    const target = snap.items[0]
    const retracted = validateSnapshot(retractVoteBreakdown(snap, target.id, SIG))
    const revoked = validateSnapshot(
      revokeRetraction(retracted, target.id, 'breakdown', {
        reason: 'cotejado con el acta publicada; el desglose original era correcto',
        editor: 'Curator',
        at: '2026-08-06T00:00:00.000Z',
      }),
    )
    const row = revoked.items.find((v) => v.id === target.id)
    expect(row!.votes).toEqual(target.votes)
    expect(row!.provenance?.breakdown?.url).toBe(target.provenance!.breakdown!.url)
    expect(row!.votesRetracted).toBeUndefined()
  })

  it('REFUSES to revoke a tally the ledger cannot cite', () => {
    // The three entries written before 2026-08-05 carry no breakdown source —
    // they were withdrawn precisely because the tally had none. Putting one
    // back must not quietly republish an uncited breakdown.
    const snap = corpus()
    const target = snap.items[0]
    const retracted = validateSnapshot(retractVoteBreakdown(snap, target.id, SIG))
    const legacy = {
      ...retracted,
      retractions: retracted.retractions.map((r) => {
        if (r.voteId !== target.id || r.scope !== 'breakdown') return r
        const { originalBreakdownSource: _predatesProvenance, ...rest } = r
        return rest
      }),
    }
    expect(() =>
      revokeRetraction(legacy, target.id, 'breakdown', {
        reason: 'intento de republicar un desglose sin fuente que lo sostenga',
        editor: 'Curator',
        at: '2026-08-06T00:00:00.000Z',
      }),
    ).toThrow(/without a breakdown source/)
  })
})
