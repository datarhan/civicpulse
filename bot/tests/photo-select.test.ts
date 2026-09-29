import { describe, it, expect, beforeEach } from 'vitest'
import { openDb, type Db } from '../src/db/client'
import {
  createQueja,
  softDeleteQueja,
  listQuejasWithPhoto,
  type NewQuejaInput,
  autorTelegram,
} from '../src/db/queries'
import { selectQuejasToProcess } from '../src/services/process-photos'
import { creaPublicada } from './helpers/publicada'

function sample(overrides: Partial<NewQuejaInput> = {}): NewQuejaInput {
  return {
    autor: autorTelegram(7),
    category: 'urbanismo',
    title: 'Foto adjunta',
    detail: 'Una queja con foto adjunta que hay que anonimizar.',
    lat: null,
    lng: null,
    neighborhood: 'casco',
    foto_ref: null,
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

  it('returns only published, non-deleted quejas that carry a foto_ref', () => {
    const withPhoto = creaPublicada(db, sample({ foto_ref: 'tg:AgAC-1' }))
    creaPublicada(db, sample({ foto_ref: null })) // no photo → excluded
    createQueja(db, sample({ foto_ref: 'tg:AgAC-3' })) // still in review → excluded
    const deleted = creaPublicada(db, sample({ foto_ref: 'tg:AgAC-2' }))
    softDeleteQueja(db, deleted.id, autorTelegram(7)) // right-to-be-forgotten → excluded

    const rows = listQuejasWithPhoto(db)
    expect(rows.map((r) => r.id)).toEqual([withPhoto.id])
  })
})

describe('selectQuejasToProcess', () => {
  it('keeps only quejas whose anonymized image is not yet published', () => {
    const rows = [
      { id: 'Q-AAA', foto_ref: 'tg:f1' },
      { id: 'Q-BBB', foto_ref: 'tg:f2' },
    ] as any[]
    const alreadyPublished = (id: string) => id === 'Q-AAA'
    expect(selectQuejasToProcess(rows, alreadyPublished).map((r) => r.id)).toEqual(['Q-BBB'])
  })

  it('skips rows without a foto_ref defensively', () => {
    const rows = [{ id: 'Q-AAA', foto_ref: null }] as any[]
    expect(selectQuejasToProcess(rows, () => false)).toEqual([])
  })
})
