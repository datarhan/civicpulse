import { describe, expect, it, beforeEach } from 'vitest'
import { openDb, type Db } from '../src/db/client'
import {
  createQueja,
  getQueja,
  listUserQuejas,
  listRecentQuejas,
  listByNeighborhood,
  addApoyo,
  countApoyos,
  listEvents,
  setState,
  softDeleteQueja,
  aggregateStats,
  type NewQuejaInput,
} from '../src/db/queries'

function sampleQueja(overrides: Partial<NewQuejaInput> = {}): NewQuejaInput {
  return {
    telegram_user_id: 42,
    telegram_username: 'maria',
    category: 'via_publica',
    title: 'Bache profundo',
    detail: 'Bache en Av. Primera que lleva 2 meses sin reparar',
    lat: 39.5439,
    lng: -0.5711,
    neighborhood: 'casco',
    photo_file_id: null,
    concejalia_area: 'Obra Pública',
    concejal_slug: 'teresa-pozuelo-martin',
    ...overrides,
  }
}

describe('bot db — createQueja + getQueja', () => {
  let db: Db
  beforeEach(() => {
    db = openDb(':memory:')
  })

  it('assigns a Q- prefixed ID', () => {
    const q = createQueja(db, sampleQueja())
    expect(q.id).toMatch(/^Q-[0-9A-Z]+$/)
  })

  it('persists all input fields', () => {
    const q = createQueja(db, sampleQueja())
    const found = getQueja(db, q.id)
    expect(found).not.toBeNull()
    expect(found!.title).toBe('Bache profundo')
    expect(found!.category).toBe('via_publica')
    expect(found!.neighborhood).toBe('casco')
    expect(found!.concejal_slug).toBe('teresa-pozuelo-martin')
    expect(found!.state).toBe('capturada')
  })

  it('returns null for unknown id', () => {
    expect(getQueja(db, 'Q-nope')).toBeNull()
  })

  it('auto-logs a capturada event on creation', () => {
    const q = createQueja(db, sampleQueja())
    const events = listEvents(db, q.id)
    expect(events.length).toBe(1)
    expect(events[0].kind).toBe('capturada')
  })
})

describe('bot db — listUserQuejas + listRecentQuejas + listByNeighborhood', () => {
  let db: Db
  beforeEach(() => {
    db = openDb(':memory:')
  })

  it('filters by telegram user id, newest first', () => {
    const q1 = createQueja(db, sampleQueja({ telegram_user_id: 1, title: 'A' }))
    createQueja(db, sampleQueja({ telegram_user_id: 2, title: 'B' }))
    const q3 = createQueja(db, sampleQueja({ telegram_user_id: 1, title: 'C' }))
    const mine = listUserQuejas(db, 1)
    expect(mine.map((q) => q.title)).toEqual(['C', 'A'])
    expect(mine.every((q) => q.telegram_user_id === 1)).toBe(true)
    expect(q1.id).not.toBe(q3.id)
  })

  it('listRecentQuejas respects limit', () => {
    for (let i = 0; i < 5; i++) createQueja(db, sampleQueja({ title: 'q' + i }))
    expect(listRecentQuejas(db, 3).length).toBe(3)
  })

  it('listByNeighborhood filters', () => {
    createQueja(db, sampleQueja({ neighborhood: 'casco' }))
    createQueja(db, sampleQueja({ neighborhood: 'sector14' }))
    createQueja(db, sampleQueja({ neighborhood: 'casco' }))
    expect(listByNeighborhood(db, 'casco').length).toBe(2)
    expect(listByNeighborhood(db, 'sector14').length).toBe(1)
  })
})

describe('bot db — apoyos (co-signs)', () => {
  let db: Db
  let quejaId: string
  beforeEach(() => {
    db = openDb(':memory:')
    quejaId = createQueja(db, sampleQueja()).id
  })

  it('adds a distinct apoyo and returns count', () => {
    const r1 = addApoyo(db, quejaId, 100)
    expect(r1.added).toBe(true)
    expect(r1.count).toBe(1)
    const r2 = addApoyo(db, quejaId, 101)
    expect(r2.added).toBe(true)
    expect(r2.count).toBe(2)
  })

  it('is idempotent for the same user (no double-apoyo)', () => {
    addApoyo(db, quejaId, 100)
    const r = addApoyo(db, quejaId, 100)
    expect(r.added).toBe(false)
    expect(r.count).toBe(1)
  })

  it('emits an apoyada_verificada event at 10 apoyos', () => {
    for (let i = 1; i <= 10; i++) addApoyo(db, quejaId, 100 + i)
    const events = listEvents(db, quejaId)
    const milestone = events.find((e) => e.kind === 'apoyada_verificada')
    expect(milestone).toBeDefined()
  })

  it('does not double-emit the milestone event', () => {
    for (let i = 1; i <= 12; i++) addApoyo(db, quejaId, 100 + i)
    const events = listEvents(db, quejaId)
    const milestones = events.filter((e) => e.kind === 'apoyada_verificada')
    expect(milestones.length).toBe(1)
  })

  it('countApoyos returns the current total', () => {
    expect(countApoyos(db, quejaId)).toBe(0)
    addApoyo(db, quejaId, 100)
    addApoyo(db, quejaId, 101)
    expect(countApoyos(db, quejaId)).toBe(2)
  })
})

describe('bot db — setState transitions', () => {
  let db: Db
  let quejaId: string
  beforeEach(() => {
    db = openDb(':memory:')
    quejaId = createQueja(db, sampleQueja()).id
  })

  it('updates the state column', () => {
    setState(db, quejaId, 'en_tramite')
    const q = getQueja(db, quejaId)
    expect(q?.state).toBe('en_tramite')
  })

  it('persists registro_entry_number + CSV when transitioning to registrada', () => {
    setState(db, quejaId, 'registrada', {
      entry_number: '2026-RE-0847',
      csv: 'ABC123XYZ',
    })
    const q = getQueja(db, quejaId)
    expect(q?.state).toBe('registrada')
    expect(q?.registro_entry_number).toBe('2026-RE-0847')
    expect(q?.registro_csv).toBe('ABC123XYZ')
    expect(q?.registered_at).toBeTruthy()
  })

  it('logs an event for every transition', () => {
    setState(db, quejaId, 'en_tramite')
    setState(db, quejaId, 'resuelta')
    const events = listEvents(db, quejaId)
    const kinds = events.map((e) => e.kind)
    expect(kinds).toEqual(['capturada', 'en_tramite', 'resuelta'])
  })
})

describe('bot db — softDeleteQueja (RGPD art. 17 right-to-be-forgotten)', () => {
  let db: Db
  let quejaId: string

  beforeEach(() => {
    db = openDb(':memory:')
    quejaId = createQueja(db, sampleQueja()).id
  })

  it('soft-deletes the queja (row survives, deleted_at set)', () => {
    const ok = softDeleteQueja(db, quejaId, 42)
    expect(ok).toBe(true)
    const row = getQueja(db, quejaId)
    expect(row).not.toBeNull()
    expect(row!.deleted_at).toBeTruthy()
  })

  it('emits an anonymised audit event', () => {
    softDeleteQueja(db, quejaId, 42)
    const kinds = listEvents(db, quejaId).map((e) => e.kind)
    expect(kinds).toContain('anonymised')
  })

  it('is idempotent — second call on an already-deleted row succeeds', () => {
    expect(softDeleteQueja(db, quejaId, 42)).toBe(true)
    expect(softDeleteQueja(db, quejaId, 42)).toBe(true)
    // And only emits one anonymised event
    const events = listEvents(db, quejaId).filter((e) => e.kind === 'anonymised')
    expect(events.length).toBe(1)
  })

  it('refuses deletion from the wrong user (no enumeration leak)', () => {
    const ok = softDeleteQueja(db, quejaId, 999) // wrong user id
    expect(ok).toBe(false)
    const row = getQueja(db, quejaId)
    expect(row!.deleted_at).toBeNull()
  })

  it('returns false for a non-existent queja id', () => {
    expect(softDeleteQueja(db, 'Q-NOPE0000', 42)).toBe(false)
  })

  it('hides deleted rows from listRecentQuejas (public feed)', () => {
    const kept = createQueja(db, sampleQueja({ title: 'Kept' })).id
    softDeleteQueja(db, quejaId, 42)
    const ids = listRecentQuejas(db, 10).map((r) => r.id)
    expect(ids).toContain(kept)
    expect(ids).not.toContain(quejaId)
  })

  it('hides deleted rows from listByNeighborhood', () => {
    softDeleteQueja(db, quejaId, 42)
    expect(listByNeighborhood(db, 'casco').map((r) => r.id)).not.toContain(quejaId)
  })

  it('still exposes deleted rows to the owner via listUserQuejas (so they can confirm)', () => {
    softDeleteQueja(db, quejaId, 42)
    const own = listUserQuejas(db, 42).find((r) => r.id === quejaId)
    expect(own).toBeTruthy()
    expect(own!.deleted_at).toBeTruthy()
  })

  it('excludes deleted rows from aggregateStats.total', () => {
    createQueja(db, sampleQueja({ title: 'Also kept' }))
    softDeleteQueja(db, quejaId, 42)
    expect(aggregateStats(db).total).toBe(1)
  })
})

describe('bot db — aggregateStats', () => {
  let db: Db
  beforeEach(() => {
    db = openDb(':memory:')
  })

  it('returns zeros on empty db', () => {
    const s = aggregateStats(db)
    expect(s.total).toBe(0)
    expect(s.byState).toEqual({})
    expect(s.byConcejal).toEqual({})
  })

  it('groups by state + neighborhood + category + concejal', () => {
    const a = createQueja(db, sampleQueja({ neighborhood: 'casco', category: 'via_publica' }))
    const b = createQueja(db, sampleQueja({ neighborhood: 'casco', category: 'limpieza', concejal_slug: 'rafael-gomez-sanchez' }))
    const c = createQueja(db, sampleQueja({ neighborhood: 'sector14', category: 'via_publica' }))
    setState(db, b.id, 'resuelta')
    const s = aggregateStats(db)
    expect(s.total).toBe(3)
    expect(s.byState.capturada).toBe(2)
    expect(s.byState.resuelta).toBe(1)
    expect(s.byNeighborhood.casco).toBe(2)
    expect(s.byCategory.via_publica).toBe(2)
    expect(s.byConcejal['teresa-pozuelo-martin'].total).toBe(2)
    expect(s.byConcejal['teresa-pozuelo-martin'].pendientes).toBe(2)
    expect(s.byConcejal['rafael-gomez-sanchez'].total).toBe(1)
    expect(s.byConcejal['rafael-gomez-sanchez'].resueltas).toBe(1)
    expect(a.id).toBeTruthy()
    expect(c.id).toBeTruthy()
  })
})
