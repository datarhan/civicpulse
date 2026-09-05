/**
 * `correct-journalist-report`'s `warnings[<i>]` branch.
 *
 * A biography's warnings are the caveats the curator signed about it, and
 * `area-fit.json` mirrors one of them by index onto /cargos. Two of them
 * attributed a change of delegations to «el registro municipal vigente» when
 * the change was published in the BOP; correcting the sentence has to go
 * through the correction ledger like any other field, not through a hand edit
 * of the JSON. Same three fences as the portrait branch: index in range, no
 * blank, no duplicate of a sibling warning — and the judicial-token gate must
 * stay unaware of «Resolución» and «BOP», or the correction would silently
 * flip the report to high sensitivity.
 */
import { describe, it, expect } from 'vitest'
import { applyCorrection } from '../scripts/correct-journalist-report'
import type { JournalistReport } from '../src/scraper/journalist'
import { JUDICIAL_TOKENS } from '../src/scraper/journalist/types'

const WARNINGS = [
  'Los datos de identidad proceden del CV autodeclarado.',
  'Las áreas delegadas han variado durante el mandato: el decreto de julio de 2023 incluía Comercio; el registro municipal vigente recoge en su lugar Actividades y Edificios públicos.',
]

const NUEVO =
  'Las áreas delegadas han variado durante el mandato: la Resolución 2513/2023, de 17-06-2023 (BOP València núm. 127, anuncio 2023/08603, 03-07-2023) incluía Comercio; la Resolución 2639/2023, de 28-06-2023, que la modifica (BOP núm. 132, anuncio 2023/08985, 10-07-2023), recoge en su lugar Actividades y Edificios públicos. Se publican ambas con su fuente.'

const reportWith = (warnings: string[]) =>
  ({ sections: [], warnings }) as unknown as JournalistReport

describe('applyCorrection — warnings[<index>]', () => {
  it('replaces the warning at the index and returns the original', () => {
    const report = reportWith([...WARNINGS])
    const out = applyCorrection(report, 'warnings[1]', NUEVO)
    expect(out.original).toBe(WARNINGS[1])
    expect(out.warnings).toEqual([WARNINGS[0], NUEVO])
    // A warning is not a section: the sections come back untouched.
    expect(out.sections).toEqual([])
  })

  it('does not mutate the report it was handed', () => {
    const report = reportWith([...WARNINGS])
    applyCorrection(report, 'warnings[1]', NUEVO)
    expect(report.warnings).toEqual(WARNINGS)
  })

  it('refuses an index past the end of the list', () => {
    expect(() => applyCorrection(reportWith([...WARNINGS]), 'warnings[2]', NUEVO)).toThrow(
      /out of range \(2 warnings\)/,
    )
  })

  it('refuses a blank replacement — dropping a caveat is not a correction', () => {
    expect(() => applyCorrection(reportWith([...WARNINGS]), 'warnings[1]', '  ')).toThrow(/blank/)
  })

  it('refuses to turn one warning into a copy of another', () => {
    expect(() => applyCorrection(reportWith([...WARNINGS]), 'warnings[1]', WARNINGS[0])).toThrow(
      /already warnings\[0\]/,
    )
  })

  it('the corrected sentence trips no judicial token', () => {
    // Otherwise the CLI's re-validation would demand legalSensitivity 'high'
    // for a sentence that cites a gazette, not a court.
    expect(JUDICIAL_TOKENS.some((rx) => rx.test(NUEVO))).toBe(false)
  })
})
