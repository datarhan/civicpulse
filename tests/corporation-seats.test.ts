import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  oneSeatBlocsOf,
  seatsFromOfficials,
  singleSeatAttributions,
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

describe('oneSeatBlocsOf', () => {
  /**
   * «No sé qué grupos tienen un solo escaño» y «ninguno lo tiene» no pueden
   * leerse igual. Con un officials.json ausente, `seatsFromOfficials` da una
   * lista vacía, `singleSeatBlocs` otra, y quien la consulte concluye que no
   * hay nadie a quien nombrar por eliminación: la puerta abierta del defecto
   * `r?.findings ?? []` (DATA_INTEGRITY, regla 2). Lo desconocido es `null`.
   */
  it('returns null when there is nothing to derive the seats from', () => {
    expect(oneSeatBlocsOf({})).toBeNull()
    expect(oneSeatBlocsOf(null)).toBeNull()
  })

  it('returns an empty list when the seats are known and none is single', () => {
    expect(oneSeatBlocsOf({ composition: { PSOE: 11, PP: 10 } })).toEqual([])
  })

  it('returns the one-seat blocs of a known composition', () => {
    expect(oneSeatBlocsOf({ composition: { PSOE: 11, PP: 7, VOX: 1, Compromís: 1 } })).toEqual([
      'VOX',
      'Compromís',
    ])
  })
})

describe('singleSeatAttributions', () => {
  const ONE = ['VOX', 'EU-Podem', 'Compromís']

  it('finds a one-seat group in a quote label', () => {
    expect(
      singleSeatAttributions(
        {
          quotes: [{ speakerGroup: 'PSOE' }, { speakerGroup: 'Compromís' }, { speakerGroup: null }],
        },
        ONE,
      ),
    ).toEqual(['Compromís'])
  })

  /**
   * La prosa también nombra. El sumario que el sintetizador escribe desde una
   * cita cuyo literal dice «El compromiso de Vox…» nombra al grupo aunque
   * ninguna cita lleve la etiqueta — y en el pleno se le llama por sus alias.
   */
  it('finds a one-seat group named in the summary or the title, by any of its names', () => {
    expect(
      singleSeatAttributions(
        { summary: 'Esquerra Unida reclama una auditoría del contrato.' },
        ONE,
      ),
    ).toEqual(['EU-Podem'])
    expect(
      singleSeatAttributions({ title: 'Vox pide un plan de reconstrucción en el pleno' }, ONE),
    ).toEqual(['VOX'])
  })

  it('reports each group once, in order of appearance', () => {
    expect(
      singleSeatAttributions(
        {
          quotes: [{ speakerGroup: 'VOX' }, { speakerGroup: 'VOX' }],
          summary: 'VOX y Compromís coinciden en el diagnóstico.',
        },
        ONE,
      ),
    ).toEqual(['VOX', 'Compromís'])
  })

  it('names nothing when only the large groups speak and are named', () => {
    expect(
      singleSeatAttributions(
        {
          quotes: [{ speakerGroup: 'PSOE' }, { speakerGroup: 'PP' }],
          title: 'Debate sobre residuos en el pleno',
          summary: 'El PSOE defiende el contrato y el Partido Popular lo critica.',
        },
        ONE,
      ),
    ).toEqual([])
  })
})
