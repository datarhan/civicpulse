/**
 * `correct-journalist-report`'s `timeline[<i>].label` branch.
 *
 * A timeline row is a dated event, and its label is prose about a named
 * person: on 2026-10-18 the 07-07-2023 row of Teresa Pozuelo's biography still
 * said she «percibe 43.067,36 €/año», in the present tense, after the pleno of
 * 16-03-2026 had raised that figure. The CLI could correct the narrative beside
 * it but not this row, so the only way to fix one sentence was a full re-run.
 *
 * Fenced like the other indexed targets — exactly one timeline section, index
 * in range, no blank, no no-op — and it touches the LABEL only: the date and
 * the sources are what make the row an event, and changing either is a re-run.
 */
import { describe, it, expect } from 'vitest'
import { applyCorrection } from '../scripts/correct-journalist-report'
import type { JournalistReport, ReportSection } from '../src/scraper/journalist'

const reportWith = (sections: ReportSection[]) => ({ sections }) as unknown as JournalistReport

const events = () => [
  { date: '2023-06-17', label: 'Toma de posesión como concejala', sourceIds: ['src-001'] },
  {
    date: '2023-07-07',
    label: 'El Pleno fija su retribución; percibe 43.067,36 €/año.',
    sourceIds: ['src-005'],
  },
]
const timeline = (ev = events()): ReportSection =>
  ({ kind: 'timeline', payload: { events: ev } }) as ReportSection
const eventsOf = (sections: ReportSection[]) =>
  (sections.find((s) => s.kind === 'timeline') as Extract<ReportSection, { kind: 'timeline' }>)
    .payload.events

describe('applyCorrection — timeline[<index>].label', () => {
  const NUEVA = 'El Pleno fija su retribución en 43.067,36 €/año.'

  it('rewrites the label at the index and nothing else', () => {
    const { sections, original } = applyCorrection(
      reportWith([timeline()]),
      'timeline[1].label',
      NUEVA,
    )
    expect(original).toBe('El Pleno fija su retribución; percibe 43.067,36 €/año.')
    const ev = eventsOf(sections)
    expect(ev[1]).toEqual({ date: '2023-07-07', label: NUEVA, sourceIds: ['src-005'] })
    expect(ev[0]).toEqual(events()[0])
  })

  it('does not mutate the report it was given', () => {
    const report = reportWith([timeline()])
    applyCorrection(report, 'timeline[1].label', NUEVA)
    expect(eventsOf(report.sections)[1].label).toBe(events()[1].label)
  })

  it('refuses an index out of range', () => {
    expect(() => applyCorrection(reportWith([timeline()]), 'timeline[2].label', NUEVA)).toThrow(
      /out of range/,
    )
  })

  it('refuses a blank label: dropping an event is a re-run', () => {
    expect(() => applyCorrection(reportWith([timeline()]), 'timeline[1].label', '  ')).toThrow(
      /blank/,
    )
  })

  it('refuses a no-op', () => {
    expect(() =>
      applyCorrection(reportWith([timeline()]), 'timeline[1].label', events()[1].label),
    ).toThrow(/no-op/)
  })

  it('refuses zero or several timeline sections', () => {
    expect(() => applyCorrection(reportWith([]), 'timeline[0].label', NUEVA)).toThrow(
      /exactly 1 timeline/,
    )
    expect(() =>
      applyCorrection(reportWith([timeline(), timeline()]), 'timeline[0].label', NUEVA),
    ).toThrow(/exactly 1 timeline/)
  })

  it('addresses only the label: the date is not a correction target', () => {
    expect(() =>
      applyCorrection(reportWith([timeline()]), 'timeline[1].date', '2023-07-08'),
    ).toThrow(/timeline\[<index>\]\.label/)
  })
})
