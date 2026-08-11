import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  seatsFromOfficials,
  singleSeatBlocs,
  type OfficialsDoc,
} from '../src/scraper/corporation-seats'

describe('seatsFromOfficials', () => {
  it('prefers the published composition block when present', () => {
    const doc: OfficialsDoc = {
      composition: { PSOE: 11, PP: 7 },
      // Deliberately inconsistent: composition wins, so this is ignored.
      officials: [{ slug: 'x', name: 'X', party: 'VOX' }],
    }
    expect(seatsFromOfficials(doc)).toEqual([
      { bloc: 'PSOE', seats: 11 },
      { bloc: 'PP', seats: 7 },
    ])
  })

  it('counts the roster when there is no composition block', () => {
    const doc: OfficialsDoc = {
      officials: [
        { slug: 'a', name: 'A', party: 'PSOE' },
        { slug: 'b', name: 'B', party: 'PSOE' },
        { slug: 'c', name: 'C', party: 'PP' },
      ],
    }
    expect(seatsFromOfficials(doc)).toEqual([
      { bloc: 'PSOE', seats: 2 },
      { bloc: 'PP', seats: 1 },
    ])
  })

  it('returns an empty list rather than throwing on an empty document', () => {
    expect(seatsFromOfficials({})).toEqual([])
  })

  /**
   * The reason this module exists. eval-extractor.ts carried a hand-copied
   * literal of the composition; production derives it from officials.json.
   * DATA_INTEGRITY rule 1 — a restated shape stays green while production
   * drifts — so assert against the real published file, not a fixture.
   */
  it('matches the composition actually published in officials.json', () => {
    const doc = JSON.parse(
      readFileSync(resolve('public/data/officials.json'), 'utf8'),
    ) as OfficialsDoc
    const seats = seatsFromOfficials(doc)
    expect(seats.length).toBeGreaterThan(0)
    const total = seats.reduce((n, s) => n + s.seats, 0)
    // Riba-roja is a 21-seat council (Ley Orgánica 5/1985 scale for its
    // population band). A total that is not 21 means the roster is mid-edit.
    expect(total).toBe(21)
  })
})

describe('singleSeatBlocs', () => {
  /**
   * A one-seat bloc tag names that councillor by elimination, so it is
   * individual attribution and must reach Tier C. Getting this wrong in
   * either direction is legally material.
   */
  it('names only the blocs holding exactly one seat', () => {
    expect(
      singleSeatBlocs([
        { bloc: 'PSOE', seats: 11 },
        { bloc: 'VOX', seats: 1 },
        { bloc: 'Compromís', seats: 1 },
      ]),
    ).toEqual(['VOX', 'Compromís'])
  })

  it('excludes a bloc holding zero seats — nobody is named by elimination', () => {
    expect(singleSeatBlocs([{ bloc: 'Ciudadanos', seats: 0 }])).toEqual([])
  })

  it('finds the three one-seat blocs in the real corporación', () => {
    const doc = JSON.parse(
      readFileSync(resolve('public/data/officials.json'), 'utf8'),
    ) as OfficialsDoc
    expect(singleSeatBlocs(seatsFromOfficials(doc)).sort()).toEqual(
      ['Compromís', 'EU-Podem', 'VOX'].sort(),
    )
  })
})
