import { describe, it, expect, beforeEach } from 'vitest'
import { openDb, type Db } from '../src/db/client'
import {
  createQueja,
  softDeleteQueja,
  listQuejasWithPhoto,
  type NewQuejaInput,
} from '../src/db/queries'
import { selectQuejasToProcess } from '../src/services/process-photos'

function sample(overrides: Partial<NewQuejaInput> = {}): NewQuejaInput {
  return {
    telegram_user_id: 7,
    telegram_username: 'ana',
    category: 'urbanismo',
    title: 'Foto adjunta',
    detail: 'Una queja con foto adjunta que hay que anonimizar.',
    lat: null,
    lng: null,
    neighborhood: 'casco',
    photo_file_id: null,
    concejalia_area: 'Urbanismo',
    concejal_slug: 'teresa-pozuelo-martin',
    ...overrides,
  }
}

describe('listQuejasWithPhoto', () => {
  let db: Db
  beforeEach(() => {
    db = openDb(':memory:')
  })

  it('returns only non-deleted quejas that carry a photo_file_id', () => {
    const withPhoto = createQueja(db, sample({ photo_file_id: 'AgAC-1' }))
    createQueja(db, sample({ photo_file_id: null })) // no photo → excluded
    const deleted = createQueja(db, sample({ photo_file_id: 'AgAC-2' }))
    softDeleteQueja(db, deleted.id, 7) // right-to-be-forgotten → excluded

    const rows = listQuejasWithPhoto(db)
    expect(rows.map((r) => r.id)).toEqual([withPhoto.id])
  })
})

describe('selectQuejasToProcess', () => {
  it('keeps only quejas whose anonymized image is not yet published', () => {
    const rows = [
      { id: 'Q-AAA', photo_file_id: 'f1' },
      { id: 'Q-BBB', photo_file_id: 'f2' },
    ] as any[]
    const alreadyPublished = (id: string) => id === 'Q-AAA'
    expect(selectQuejasToProcess(rows, alreadyPublished).map((r) => r.id)).toEqual(['Q-BBB'])
  })

  it('skips rows without a photo_file_id defensively', () => {
    const rows = [{ id: 'Q-AAA', photo_file_id: null }] as any[]
    expect(selectQuejasToProcess(rows, () => false)).toEqual([])
  })
})
