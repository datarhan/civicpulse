import { describe, it, expect } from 'vitest'
import {
  renderCard,
  nextForReview,
  summarise,
  recordDecision,
  decidedRefs,
  pendingApplications,
  type CurationQueue,
  type QueueItem,
} from '../src/services/curation.ts'
import Database from 'better-sqlite3'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

function item(ref: string, level: 'blocker' | 'warn' | 'ok'): QueueItem {
  return {
    ref,
    finding: {
      id: `f-${ref}`,
      plenoId: 'p1',
      plenoDate: '2026-05-11',
      title: `Título ${ref}`,
      summary: `Resumen de ${ref}`,
      quotes: [{ text: 'algo que se dijo', speakerGroup: 'PSOE' }],
    },
    checks: [{ code: 'c', level, message: `mensaje ${level}` }],
  }
}

const QUEUE: CurationQueue = {
  reason: 'sin medición',
  items: [item('a-ok', 'ok'), item('b-block', 'blocker'), item('c-warn', 'warn')],
}

function freshDb() {
  const db = new Database(':memory:')
  db.exec(readFileSync(resolve(import.meta.dirname, '../src/db/schema.sql'), 'utf8'))
  return db
}

describe('nextForReview', () => {
  it('shows blockers FIRST, not last', () => {
    // Surfacing easy approvals first builds momentum, which is exactly how the
    // risky ones get rubber-stamped at the end of a session.
    expect(nextForReview(QUEUE, new Set())?.item.ref).toBe('b-block')
  })

  it('moves on once the blocked one is decided', () => {
    expect(nextForReview(QUEUE, new Set(['b-block']))?.item.ref).toBe('a-ok')
  })

  it('returns null when everything is decided', () => {
    expect(nextForReview(QUEUE, new Set(['a-ok', 'b-block', 'c-warn']))).toBe(null)
  })

  it('handles an empty queue', () => {
    expect(nextForReview({ items: [] }, new Set())).toBe(null)
  })
})

describe('renderCard', () => {
  it('leads with the checks, before the prose can sound convincing', () => {
    const card = renderCard(item('x', 'blocker'))
    expect(card.indexOf('Comprobaciones')).toBeLessThan(card.indexOf('Título x'))
  })

  it('marks a blocker and tells the reviewer to check the source', () => {
    const card = renderCard(item('x', 'blocker'))
    expect(card).toContain('⛔')
    expect(card).toContain('Compruébalos contra la fuente')
  })

  it('escapes HTML so a hostile title cannot break the message', () => {
    const it0 = item('x', 'ok')
    it0.finding.title = '<script>alert(1)</script>'
    const card = renderCard(it0)
    expect(card).not.toContain('<script>')
    expect(card).toContain('&lt;script&gt;')
  })

  it('stays inside the Telegram message limit', () => {
    const big = item('x', 'ok')
    big.finding.summary = 'x'.repeat(9000)
    expect(renderCard(big).length).toBeLessThanOrEqual(3502)
  })

  it('shows position when given', () => {
    expect(renderCard(item('x', 'ok'), { index: 2, total: 7 })).toContain('(2/7)')
  })
})

describe('summarise', () => {
  it('counts pending and flags blockers', () => {
    const s = summarise(QUEUE, new Set(['a-ok']))
    expect(s).toContain('2 de 3')
    expect(s).toContain('1 con avisos bloqueantes')
  })

  it('is honest about an empty queue', () => {
    expect(summarise({ items: [] }, new Set())).toContain('No hay borradores')
  })
})

describe('decision persistence', () => {
  it('records and reads back a decision', () => {
    const db = freshDb()
    recordDecision(db as never, { ref: 'r1', userId: 7, decision: 'approve', note: 'ok' })
    expect(decidedRefs(db as never, 7).has('r1')).toBe(true)
  })

  it('scopes decisions per admin — one curator does not silence another', () => {
    const db = freshDb()
    recordDecision(db as never, { ref: 'r1', userId: 7, decision: 'approve', note: null })
    expect(decidedRefs(db as never, 8).size).toBe(0)
  })

  it('a second decision by the same admin replaces the first', () => {
    const db = freshDb()
    recordDecision(db as never, { ref: 'r1', userId: 7, decision: 'approve', note: 'a' })
    recordDecision(db as never, { ref: 'r1', userId: 7, decision: 'reject', note: 'b' })
    const rows = pendingApplications(db as never)
    expect(rows).toHaveLength(1)
    expect(rows[0].decision).toBe('reject')
    expect(rows[0].note).toBe('b')
  })

  it('rejects a decision value outside the enum', () => {
    const db = freshDb()
    expect(() =>
      recordDecision(db as never, {
        ref: 'r1',
        userId: 7,
        decision: 'publish' as 'approve',
        note: null,
      }),
    ).toThrow()
  })

  it('pendingApplications only returns rows not yet applied', () => {
    const db = freshDb()
    recordDecision(db as never, { ref: 'r1', userId: 7, decision: 'approve', note: null })
    recordDecision(db as never, { ref: 'r2', userId: 7, decision: 'approve', note: null })
    db.prepare("UPDATE curation_decisions SET applied_at = datetime('now') WHERE ref = 'r1'").run()
    expect(pendingApplications(db as never).map((r) => r.ref)).toEqual(['r2'])
  })
})
