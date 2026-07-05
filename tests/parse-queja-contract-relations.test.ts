import { describe, it, expect } from 'vitest'
import { placeSignal } from '../src/scraper/queja-contract-relations'
import type { RelQueja, RelContract } from '../src/scraper/queja-contract-relations'

const q = (o: Partial<RelQueja> = {}): RelQueja => ({
  id: 'Q-1',
  serviceCode: 'via_publica',
  department: 'movilidad',
  placeSlug: 'valencia-la-vella',
  description: '',
  createdAt: '2025-01-01',
  ...o,
})
const c = (o: Partial<RelContract> = {}): RelContract => ({
  id: 'c1',
  permalink: 'p',
  title: 't',
  department: 'movilidad',
  cpvs: [],
  places: [],
  zones: [],
  awardDate: '2025-03-01',
  amount: 1,
  assignee: null,
  expediente: null,
  ...o,
})

describe('placeSignal', () => {
  it('matches an exact situated place (diacritics/ca-es folded)', () => {
    expect(
      placeSignal(q({ placeSlug: 'valencia-la-vella' }), c({ places: ['valència-la-vella'] })),
    ).toEqual({ granularity: 'exact', slug: 'valencia-la-vella' })
  })
  it('matches a barrio (zone) when the exact place does not', () => {
    expect(
      placeSignal(q({ placeSlug: 'barri-masia' }), c({ places: ['x'], zones: ['barri-masia'] })),
    ).toEqual({ granularity: 'barrio', slug: 'barri-masia' })
  })
  it('returns null when the queja has no place', () => {
    expect(placeSignal(q({ placeSlug: null }), c({ places: ['valencia-la-vella'] }))).toBeNull()
  })
  it('returns null when nothing co-locates', () => {
    expect(placeSignal(q({ placeSlug: 'a' }), c({ places: ['b'], zones: ['c'] }))).toBeNull()
  })
})
