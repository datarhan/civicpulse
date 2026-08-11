import { describe, it, expect } from 'vitest'
import {
  QUEUE_SOURCES,
  assessQueue,
  isClean,
  rowsOf,
  type CorpusView,
  type QueueSource,
} from '../src/scraper/queue-staleness'

const source: QueueSource = {
  path: 'editorial/una-cola.json',
  idField: 'findingId',
  regenerate: 'npm run triage:algo',
}

const corpus = (published: string[], retracted: string[] = []): CorpusView => ({
  published: new Set(published),
  retracted: new Set(retracted),
})

const queue = (...ids: Array<string | null>) => ({
  rows: ids.map((id) => (id === null ? {} : { findingId: id })),
})

describe('rowsOf', () => {
  it.each([
    ['rows', { rows: [1, 2] }],
    ['items', { items: [1, 2] }],
    ['a bare array', [1, 2]],
  ])('reads %s', (_label, parsed) => {
    expect(rowsOf(parsed)).toHaveLength(2)
  })

  it.each([
    ['an object with neither key', { stats: {} }],
    ['null', null],
    ['a string', 'nope'],
  ])('is empty and safe for %s', (_label, parsed) => {
    expect(rowsOf(parsed)).toEqual([])
  })
})

describe('assessQueue', () => {
  /**
   * The defect this exists for. Nothing invalidates a queue when its subjects
   * disappear, so after eleven findings were withdrawn on 2026-08-11 roughly a
   * third of a 175-row backlog was rows about findings that no longer existed
   * — and one queue had been fully curated a week before and never cleared.
   */
  it('separates rows about retracted findings from live ones', () => {
    const r = assessQueue(
      source,
      queue('f-viva', 'f-ida', 'f-otra-viva'),
      corpus(['f-viva', 'f-otra-viva'], ['f-ida']),
    )
    expect(r.total).toBe(3)
    expect(r.live).toBe(2)
    expect(r.retracted).toEqual(['f-ida'])
    expect(r.orphaned).toEqual([])
    expect(isClean(r)).toBe(false)
  })

  /**
   * Retracted and orphaned are counted apart on purpose. A retracted id is
   * expected drift with a known fix; an id that is neither published nor
   * retracted means the queue describes something that vanished with no
   * record, which is a worse and differently-actionable fact. Folding them
   * together is the "a sentinel is never a value" trap.
   */
  it('does not fold an orphan into the retracted count', () => {
    const r = assessQueue(source, queue('f-fantasma'), corpus([], ['f-otra']))
    expect(r.retracted).toEqual([])
    expect(r.orphaned).toEqual(['f-fantasma'])
  })

  it('counts a row with no id at all, rather than dropping it silently', () => {
    const r = assessQueue(source, queue('f-viva', null), corpus(['f-viva']))
    expect(r.unkeyed).toBe(1)
    expect(r.live).toBe(1)
    expect(isClean(r)).toBe(false)
  })

  it('is clean when every row names a published finding', () => {
    const r = assessQueue(source, queue('a', 'b'), corpus(['a', 'b']))
    expect(isClean(r)).toBe(true)
    expect(r.live).toBe(2)
  })

  /**
   * An EMPTY queue passes `isClean` trivially, and that is correct for what
   * this function measures — but it is not "reviewed". `check:queues` renders
   * it differently for that reason: `attribution-queue` is empty because no
   * session has a speaker map, not because the work is done.
   */
  it('is trivially clean when empty — the caller must not read that as reviewed', () => {
    const r = assessQueue(source, { rows: [] }, corpus(['a']))
    expect(isClean(r)).toBe(true)
    expect(r.total).toBe(0)
  })

  it('reports a missing file as absent rather than as clean-and-empty', () => {
    const r = assessQueue(source, null, corpus(['a']))
    expect(r.present).toBe(false)
    expect(r.total).toBe(0)
  })

  it('keeps the regeneration command on the report — it is the fix', () => {
    expect(assessQueue(source, queue('x'), corpus([])).regenerate).toBe('npm run triage:algo')
  })
})

describe('QUEUE_SOURCES, as shipped', () => {
  it('names a regeneration command for every queue', () => {
    expect(QUEUE_SOURCES.length).toBeGreaterThan(0)
    for (const s of QUEUE_SOURCES) {
      expect(s.path.startsWith('editorial/'), `${s.path} no está bajo editorial/`).toBe(true)
      expect(s.regenerate.startsWith('npm run'), `${s.path} sin comando`).toBe(true)
      expect(s.idField.length).toBeGreaterThan(1)
    }
  })

  /**
   * `editorial/` is gitignored precisely because these files pair unreviewed
   * machine prose with named political groups. A queue path under `public/`
   * would publish exactly that.
   */
  it('never points at anything under public/', () => {
    for (const s of QUEUE_SOURCES) expect(s.path).not.toContain('public/')
  })
})
