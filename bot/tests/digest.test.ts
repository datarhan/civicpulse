import { describe, expect, it, beforeEach } from 'vitest'
import { openDb, type Db } from '../src/db/client'
import {
  addSubscription,
  createQueja,
  findMatchingQuejas,
  listUserSubscriptions,
  removeSubscription,
  softDeleteQueja,
  type NewQuejaInput,
  autorTelegram,
} from '../src/db/queries'
import { runDigestOnce } from '../src/services/digest'
import { computeDigest } from '../src/commands/digest'
import { publicar } from './helpers/publicada'
import { creaPublicada } from './helpers/publicada'

function q(overrides: Partial<NewQuejaInput> = {}): NewQuejaInput {
  return {
    autor: autorTelegram(42),
    category: 'via_publica',
    title: 'Bache profundo',
    detail: 'Bache en Av. Primera',
    lat: 39.5439,
    lng: -0.5711,
    neighborhood: 'casco',
    concejalia_area: 'Obra Pública',
    concejal_slug: 'teresa-pozuelo-martin',
    ...overrides,
  }
}

describe('bot · subscriptions CRUD', () => {
  let db: Db
  beforeEach(() => {
    db = openDb(':memory:')
  })

  it('adds a subscription and lists it back', () => {
    expect(addSubscription(db, 42, 'barrio', 'casco').added).toBe(true)
    expect(listUserSubscriptions(db, 42).map((s) => s.filter_value)).toEqual(['casco'])
  })

  it('is idempotent — same kind+value returns added=false on re-add', () => {
    addSubscription(db, 42, 'barrio', 'casco')
    const r = addSubscription(db, 42, 'barrio', 'casco')
    expect(r.added).toBe(false)
    expect(listUserSubscriptions(db, 42)).toHaveLength(1)
  })

  it('normalises the value to lowercase + trim', () => {
    addSubscription(db, 42, 'barrio', '  La Reva ')
    expect(listUserSubscriptions(db, 42)[0].filter_value).toBe('la reva')
  })

  it('removeSubscription returns false when no matching row', () => {
    expect(removeSubscription(db, 42, 'barrio', 'casco').removed).toBe(false)
    addSubscription(db, 42, 'barrio', 'casco')
    expect(removeSubscription(db, 42, 'barrio', 'casco').removed).toBe(true)
    expect(listUserSubscriptions(db, 42)).toHaveLength(0)
  })
})

describe('bot · digest runDigestOnce', () => {
  let db: Db
  beforeEach(() => {
    db = openDb(':memory:')
  })

  it('emits one DM per user with ≥1 matching queja', () => {
    const captured: Array<{ userId: number; text: string }> = []
    const sendDm = async (userId: number, text: string) => {
      captured.push({ userId, text })
    }

    creaPublicada(
      db,
      q({ autor: autorTelegram(1), neighborhood: 'casco', category: 'via_publica' }),
    )
    creaPublicada(
      db,
      q({ autor: autorTelegram(2), neighborhood: 'polígono', category: 'limpieza' }),
    )

    addSubscription(db, 999, 'barrio', 'casco')
    const r = runDigestOnce(db, sendDm, new Date('2026-04-21T09:00:00Z'))
    expect(r.skippedFrozen).toBe(false)
    expect(r.usersDigested).toBe(1)
    expect(r.totalMatches).toBe(1)
    expect(captured).toHaveLength(1)
    expect(captured[0].userId).toBe(999)
    expect(captured[0].text).toContain('casco')
  })

  it('emits zero DMs when no subscription matches any queja', () => {
    const captured: Array<{ userId: number; text: string }> = []
    const sendDm = async (userId: number, text: string) => {
      captured.push({ userId, text })
    }

    creaPublicada(db, q({ neighborhood: 'casco' }))
    addSubscription(db, 999, 'barrio', 'polígono')
    const r = runDigestOnce(db, sendDm, new Date('2026-04-21T09:00:00Z'))
    expect(r.usersDigested).toBe(0)
    expect(captured).toHaveLength(0)
  })

  it('respects LOPD soft-delete: deleted quejas never appear in digests', () => {
    const captured: Array<{ userId: number; text: string }> = []
    const sendDm = async (userId: number, text: string) => {
      captured.push({ userId, text })
    }

    const queja = creaPublicada(db, q({ autor: autorTelegram(1), neighborhood: 'casco' }))
    softDeleteQueja(db, queja.id, autorTelegram(1))
    addSubscription(db, 999, 'barrio', 'casco')

    const r = runDigestOnce(db, sendDm, new Date('2026-04-21T09:00:00Z'))
    expect(r.totalMatches).toBe(0)
    expect(captured).toHaveLength(0)
  })

  it("dedupes a queja that matches two of the same user's filters", () => {
    const captured: Array<{ userId: number; text: string }> = []
    const sendDm = async (userId: number, text: string) => {
      captured.push({ userId, text })
    }

    creaPublicada(db, q({ neighborhood: 'casco', category: 'via_publica' }))
    addSubscription(db, 999, 'barrio', 'casco')
    addSubscription(db, 999, 'categoria', 'via_publica')

    const r = runDigestOnce(db, sendDm, new Date('2026-04-21T09:00:00Z'))
    expect(r.totalMatches).toBe(1) // one queja, not two
    expect(captured).toHaveLength(1) // one DM, not two
    // Both filters are mentioned in the digest body.
    expect(captured[0].text).toContain('barrio=casco')
    expect(captured[0].text).toContain('categoria=via_publica')
  })

  it('ignores quejas older than the 7-day window', () => {
    const captured: Array<{ userId: number; text: string }> = []
    const sendDm = async (userId: number, text: string) => {
      captured.push({ userId, text })
    }

    // Simulate an old queja by backdating created_at.
    const queja = creaPublicada(db, q({ neighborhood: 'casco' }))
    db.prepare(`UPDATE quejas SET created_at = ? WHERE id = ?`).run(
      '2020-01-01T00:00:00Z',
      queja.id,
    )

    addSubscription(db, 999, 'barrio', 'casco')
    const r = runDigestOnce(db, sendDm, new Date('2026-04-21T09:00:00Z'))
    expect(r.totalMatches).toBe(0)
  })
})

/**
 * Los resúmenes cuentan una queja cuando se PUBLICA, no cuando se escribe.
 *
 * Con la revisión antes de publicar, una queja escrita el domingo y publicada
 * el martes caía fuera del resumen del lunes —aún no era pública— y fuera del
 * siguiente —ya tenía más de siete días de escrita—: no salía en ninguno
 * (revisión de #137). La ventana va sobre `publicada_at`.
 */
describe('la ventana de los resúmenes', () => {
  let db: Db
  beforeEach(() => {
    db = openDb(':memory:')
  })

  it('una queja escrita hace diez días y publicada ayer entra en los resúmenes de esta semana', () => {
    const id = createQueja(db, q()).id
    publicar(db, id)
    db.prepare(
      "UPDATE quejas SET created_at = datetime('now', '-10 days'), publicada_at = datetime('now', '-1 day') WHERE id = ?",
    ).run(id)
    expect(findMatchingQuejas(db, 'barrio', 'casco', 7).map((r) => r.id)).toEqual([id])
    expect(computeDigest(db, 7).nuevas).toBe(1)
    expect(computeDigest(db, 7).topCategorias).toEqual([{ category: 'via_publica', n: 1 }])
  })

  it('el control: publicada hace diez días, fuera', () => {
    const id = createQueja(db, q()).id
    publicar(db, id)
    db.prepare(
      "UPDATE quejas SET created_at = datetime('now', '-10 days'), publicada_at = datetime('now', '-10 days') WHERE id = ?",
    ).run(id)
    expect(findMatchingQuejas(db, 'barrio', 'casco', 7)).toEqual([])
    expect(computeDigest(db, 7).nuevas).toBe(0)
  })
})
