import { describe, it, expect, beforeEach } from 'vitest'
import { openDb, type Db } from '../src/db/client'
import { createQueja, type NewQuejaInput } from '../src/db/queries'
import { buildSnapshot } from '../src/services/snapshot'

function sample(overrides: Partial<NewQuejaInput> = {}): NewQuejaInput {
  return {
    telegram_user_id: 42,
    telegram_username: 'maria',
    category: 'urbanismo',
    title: 'Estructura metálica ilegal',
    detail: 'Se ha instalado una estructura metálica ilegal en el campo deportivo.',
    lat: 39.5439,
    lng: -0.5711,
    neighborhood: 'casco',
    photo_file_id: null,
    concejalia_area: 'Urbanismo',
    concejal_slug: 'teresa-pozuelo-martin',
    ...overrides,
  }
}

describe('buildSnapshot — anonymized photo wiring', () => {
  let db: Db
  beforeEach(() => {
    db = openDb(':memory:')
  })

  it('adds a public photo URL when an anonymized image exists for the queja', () => {
    const q = createQueja(db, sample({ photo_file_id: 'AgACfoo' }))
    const snap = buildSnapshot(db, 1000, {
      photoUrlFor: (id) => (id === q.id ? `/data/quejas-photos/${id.toLowerCase()}.jpg` : null),
    })
    const row = snap.items.find((r) => r.service_request_id === q.id)
    expect(row?.photo).toBe(`/data/quejas-photos/${q.id.toLowerCase()}.jpg`)
  })

  it('omits photo when no anonymized image has been published', () => {
    const q = createQueja(db, sample({ photo_file_id: 'AgACfoo' }))
    const snap = buildSnapshot(db, 1000, { photoUrlFor: () => null })
    const row = snap.items.find((r) => r.service_request_id === q.id)
    expect(row?.photo).toBeUndefined()
  })

  it('NEVER leaks the raw Telegram file_id into the public snapshot', () => {
    // Defense-in-depth guard: even when a photo IS published, the private
    // Telegram file_id must never appear in the public JSON.
    const secret = 'AgACAgIAAxkBAASECRETfileid'
    const q = createQueja(db, sample({ photo_file_id: secret }))
    const snap = buildSnapshot(db, 1000, {
      photoUrlFor: (id) => `/data/quejas-photos/${id.toLowerCase()}.jpg`,
    })
    const json = JSON.stringify(snap)
    expect(json).not.toContain(secret)
    expect(json).not.toContain('file_id')
  })
})
