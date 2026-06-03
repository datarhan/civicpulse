import { describe, expect, it, beforeEach } from 'vitest'
import { openDb, type Db } from '../src/db/client'
import {
  addSubscription,
  createQueja,
  listUserSubscriptions,
  removeSubscription,
  softDeleteQueja,
  type NewQuejaInput,
} from '../src/db/queries'
import { runDigestOnce } from '../src/services/digest'

function q(overrides: Partial<NewQuejaInput> = {}): NewQuejaInput {
  return {
    telegram_user_id: 42,
    telegram_username: 'maria',
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

    createQueja(db, q({ telegram_user_id: 1, neighborhood: 'casco', category: 'via_publica' }))
    createQueja(db, q({ telegram_user_id: 2, neighborhood: 'polígono', category: 'limpieza' }))

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

    createQueja(db, q({ neighborhood: 'casco' }))
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

    const queja = createQueja(db, q({ telegram_user_id: 1, neighborhood: 'casco' }))
    softDeleteQueja(db, queja.id, 1)
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

    createQueja(db, q({ neighborhood: 'casco', category: 'via_publica' }))
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
    const queja = createQueja(db, q({ neighborhood: 'casco' }))
    db.prepare(`UPDATE quejas SET created_at = ? WHERE id = ?`).run(
      '2020-01-01T00:00:00Z',
      queja.id,
    )

    addSubscription(db, 999, 'barrio', 'casco')
    const r = runDigestOnce(db, sendDm, new Date('2026-04-21T09:00:00Z'))
    expect(r.totalMatches).toBe(0)
  })
})
