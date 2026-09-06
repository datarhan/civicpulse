/**
 * `correct-journalist-report`'s `portrait.portfolios[<i>]` branch.
 *
 * The portrait is the row of chips beside a councillor's photograph, so an
 * off-by-one here renames a competence under the wrong área — the exact
 * misattribution the curated-write rules exist to prevent. These tests pin the
 * three fences (one portrait, index in range, no collision) rather than only
 * the happy path.
 *
 * The `career-political[<i>].endYear` branch closes a mandate the biography
 * still shows as open. The row it edits is what HeroBand reads to say «En el
 * cargo · desde 2023», so the same fences apply (one section, index in range)
 * plus the ones a year needs: a real YYYY, not before the mandate began, not
 * the value already there, and never `null` — re-opening is a re-run.
 */
import { describe, it, expect } from 'vitest'
import { applyCorrection } from '../scripts/correct-journalist-report'
import type { JournalistReport, ReportSection } from '../src/scraper/journalist'

const AREAS = [
  'Administración y Servicios Generales',
  'Compra Pública',
  'Recursos Humanos',
  'Finanzas públicas y recaudación',
  'Fomento económico',
  'Empleo y Emprendimiento',
  'y Comercio',
]

const portrait = (portfolios: string[]): ReportSection =>
  ({
    kind: 'portrait',
    payload: {
      officialSlug: 'jose-angel-hernandez-carrizosa',
      photoPath: '/data/photos/jose-angel-hernandez-carrizosa.jpg',
      partyTone: 'civic',
      portfolios,
    },
  }) as ReportSection

const reportWith = (sections: ReportSection[]) => ({ sections }) as unknown as JournalistReport

const portfoliosOf = (sections: ReportSection[]) =>
  (sections.find((s) => s.kind === 'portrait') as Extract<ReportSection, { kind: 'portrait' }>)
    .payload.portfolios

type CareerSection = Extract<ReportSection, { kind: 'career-political' }>
type CareerItem = CareerSection['payload']['items'][number]

// Mirrors the published row it exists to close: the open mandate carries NO
// `endYear` key at all (not `null`), which is what the live snapshot holds.
// A factory rather than a constant so no test can leak a mutation into the next.
const mandates = (): CareerItem[] => [
  {
    role: 'Concejal, n.º 2 de la lista y portavoz suplente del Grupo Municipal Popular',
    org: 'Ayuntamiento de Riba-roja de Túria',
    startYear: 2023,
    sourceIds: [],
  },
  {
    role: 'Concejal',
    org: 'Ayuntamiento de Riba-roja de Túria',
    startYear: 2015,
    endYear: 2019,
    sourceIds: [],
  },
]

const careerPolitical = (items: CareerItem[]): ReportSection =>
  ({ kind: 'career-political', payload: { items } }) as ReportSection

const careerOf = (sections: ReportSection[]) =>
  (sections.find((s) => s.kind === 'career-political') as CareerSection).payload.items

describe('applyCorrection — portrait.portfolios[<index>]', () => {
  it('renames the element at the index and leaves its siblings alone', () => {
    const report = reportWith([portrait([...AREAS])])
    const { sections, original } = applyCorrection(report, 'portrait.portfolios[6]', 'Comercio')
    expect(original).toBe('y Comercio')
    expect(portfoliosOf(sections)).toEqual([...AREAS.slice(0, 6), 'Comercio'])
    // Six áreas untouched, and the count unchanged: a rename is not a removal.
    expect(portfoliosOf(sections)).toHaveLength(AREAS.length)
  })

  it('does not mutate the report it was handed', () => {
    // The CLI validates the rebuilt snapshot before writing; a correction that
    // edited the live object would have already escaped that gate.
    const report = reportWith([portrait([...AREAS])])
    applyCorrection(report, 'portrait.portfolios[6]', 'Comercio')
    expect(portfoliosOf(report.sections)).toContain('y Comercio')
  })

  it('touches only the portrait, never the sources beside it', () => {
    // src-001 is a dated verbatim serialisation of officials.json. It is not
    // reachable from `sections` at all, and this pins that.
    const report = reportWith([portrait([...AREAS])])
    const { sections } = applyCorrection(report, 'portrait.portfolios[6]', 'Comercio')
    expect(sections.filter((s) => s.kind !== 'portrait')).toEqual([])
    expect(JSON.stringify(sections)).not.toContain('Empleo y Emprendimiento, y Comercio')
  })

  it('refuses an index past the end of the list', () => {
    expect(() =>
      applyCorrection(reportWith([portrait([...AREAS])]), 'portrait.portfolios[7]', 'Comercio'),
    ).toThrow(/out of range \(7 áreas\)/)
  })

  it('refuses a blank replacement — dropping an área is not a rename', () => {
    expect(() =>
      applyCorrection(reportWith([portrait([...AREAS])]), 'portrait.portfolios[6]', '   '),
    ).toThrow(/blank/)
  })

  it('refuses to rename one área onto another already in the list', () => {
    // Two identical chips would also collide on HeroBand's `key={p}`.
    expect(() =>
      applyCorrection(
        reportWith([portrait([...AREAS])]),
        'portrait.portfolios[6]',
        'Compra Pública',
      ),
    ).toThrow(/already portfolios\[1\]/)
  })

  it('refuses when the report has no portrait, or more than one', () => {
    expect(() => applyCorrection(reportWith([]), 'portrait.portfolios[0]', 'X')).toThrow(/found 0/)
    expect(() =>
      applyCorrection(
        reportWith([portrait([...AREAS]), portrait([...AREAS])]),
        'portrait.portfolios[0]',
        'X',
      ),
    ).toThrow(/found 2/)
  })

  it('refuses a portrait path it does not implement', () => {
    for (const path of ['portrait.photoPath', 'portrait.portfolios', 'portrait.portfolios[x]']) {
      expect(() => applyCorrection(reportWith([portrait([...AREAS])]), path, 'X')).toThrow(
        /portfolios\[<index>\]/,
      )
    }
  })
})

describe('applyCorrection — career-political[<index>].endYear', () => {
  const PATH = 'career-political[0].endYear'

  it("closes an open mandate and records the original as the literal 'null'", () => {
    // Both spellings of "open" — key absent (the live row) and an explicit
    // null — must land in the ledger as 'null', never as 'undefined'.
    for (const open of [{}, { endYear: null }]) {
      const items = mandates()
      items[0] = { ...items[0], ...open }
      const report = reportWith([careerPolitical(items)])
      const { sections, original } = applyCorrection(report, PATH, '2025')
      expect(original).toBe('null')
      const after = careerOf(sections)
      expect(after[0].endYear).toBe(2025)
      expect(after[0]).toStrictEqual({ ...mandates()[0], endYear: 2025 })
      // The closed sibling untouched, and the count unchanged: closing a
      // mandate is not removing one.
      expect(after[1]).toStrictEqual(mandates()[1])
      expect(after).toHaveLength(2)
    }
  })

  it('records the previous year as original when correcting a closed row', () => {
    const { sections, original } = applyCorrection(
      reportWith([careerPolitical(mandates())]),
      'career-political[1].endYear',
      '2018',
    )
    expect(original).toBe('2019')
    expect(careerOf(sections)[1].endYear).toBe(2018)
  })

  it('does not mutate the report it was handed', () => {
    const report = reportWith([careerPolitical(mandates())])
    const before = JSON.parse(JSON.stringify(report))
    applyCorrection(report, PATH, '2025')
    expect(report).toStrictEqual(before)
    expect('endYear' in careerOf(report.sections)[0]).toBe(false)
  })

  it('refuses a year before the mandate began', () => {
    expect(() => applyCorrection(reportWith([careerPolitical(mandates())]), PATH, '2022')).toThrow(
      /before startYear/,
    )
    expect(() =>
      applyCorrection(
        reportWith([careerPolitical(mandates())]),
        'career-political[1].endYear',
        '2014',
      ),
    ).toThrow(/before startYear/)
  })

  it('refuses a value that is not a four-digit year, naming the form it wants', () => {
    for (const bad of ['2025-06-02', 'junio de 2025', '25', '20250', '2025.0', 'MMXXV']) {
      expect(() => applyCorrection(reportWith([careerPolitical(mandates())]), PATH, bad)).toThrow(
        /four-digit year \(YYYY\)/,
      )
    }
  })

  it('refuses an index past the end of the list', () => {
    expect(() =>
      applyCorrection(
        reportWith([careerPolitical(mandates())]),
        'career-political[2].endYear',
        '2025',
      ),
    ).toThrow(/out of range \(2 items\)/)
  })

  it('refuses when the report has no career-political section, or more than one', () => {
    expect(() => applyCorrection(reportWith([]), PATH, '2025')).toThrow(
      /no career-political section/,
    )
    expect(() =>
      applyCorrection(
        reportWith([careerPolitical(mandates()), careerPolitical(mandates())]),
        PATH,
        '2025',
      ),
    ).toThrow(/found 2/)
  })

  it('refuses a correction that changes nothing', () => {
    // A no-op row in the Bitácora would tell the reader something was wrong
    // when nothing was.
    expect(() =>
      applyCorrection(
        reportWith([careerPolitical(mandates())]),
        'career-political[1].endYear',
        '2019',
      ),
    ).toThrow(/already 2019/)
  })

  it('refuses null or a blank — re-opening a mandate is a re-run, not a correction', () => {
    for (const reopen of ['null', 'NULL', '', '   ']) {
      expect(() =>
        applyCorrection(
          reportWith([careerPolitical(mandates())]),
          'career-political[1].endYear',
          reopen,
        ),
      ).toThrow(/re-run/)
    }
  })

  it('refuses a career-political path it does not implement', () => {
    for (const path of [
      'career-political[0].startYear',
      'career-political[0]',
      'career-political.endYear',
      'career-political[x].endYear',
    ]) {
      expect(() =>
        applyCorrection(reportWith([careerPolitical(mandates())]), path, '2025'),
      ).toThrow(/career-political\[<index>\]\.endYear/)
    }
  })
})
