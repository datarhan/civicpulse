/**
 * `correct-journalist-report`'s `portrait.portfolios[<i>]` branch.
 *
 * The portrait is the row of chips beside a councillor's photograph, so an
 * off-by-one here renames a competence under the wrong área — the exact
 * misattribution the curated-write rules exist to prevent. These tests pin the
 * three fences (one portrait, index in range, no collision) rather than only
 * the happy path.
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
