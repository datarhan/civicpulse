import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  FIT_VALUES,
  AreaFitValidationError,
  buildFitTasks,
  resolveAssessment,
  deriveCargoPublicoPrevio,
  rowFromResponse,
  noConstaShare,
  validateAreaFitSnapshot,
  type AreaFitRow,
  type FitTask,
  type FitEvidenceItem,
} from '../src/scraper/area-fit'

const FIXTURE = JSON.parse(
  readFileSync(join(__dirname, 'fixtures', 'area-fit-llm_2026-08-03.json'), 'utf8'),
) as {
  promptVersion: string
  cases: Array<{
    task: {
      officialSlug: string
      portfolio: string
      reportId: string
      educationItems: FitEvidenceItem[]
      careerItems: FitEvidenceItem[]
    }
    response: {
      formacion: { value: string; evidenceIndices: number[]; reason: string }
      experiencia: { value: string; evidenceIndices: number[]; reason: string }
    }
  }>
}

/** A task shaped like the fixture's, with the political pool the fixture omits. */
function taskFrom(c: (typeof FIXTURE.cases)[number], politicalItems: FitEvidenceItem[] = []): FitTask {
  return {
    officialSlug: c.task.officialSlug,
    portfolio: c.task.portfolio,
    departmentSlug: null,
    reportId: c.task.reportId,
    educationItems: c.task.educationItems,
    careerItems: c.task.careerItems,
    politicalItems,
  }
}

describe('area-fit — the enum', () => {
  // The enum is IMPORTED, never restated. Six tests in this repo hand-copied a
  // shape and stayed green while production matched nothing (DATA_INTEGRITY §1).
  it('separates "nothing on record" from "on record and unrelated"', () => {
    expect(FIT_VALUES).toContain('relacionada')
    expect(FIT_VALUES).toContain('sin-relacion-declarada')
    expect(FIT_VALUES).toContain('no-consta')
    // Collapsing the last two would publish a sentinel as a fact.
    expect(new Set(FIT_VALUES).size).toBe(FIT_VALUES.length)
  })
})

describe('area-fit — parsing the real model payload', () => {
  it('the fixture exercises BOTH outcomes, so a parser that returns one is not green', () => {
    // Asserting "no invalid values" would pass on an empty result. Assert the
    // check evaluated something.
    const values = FIXTURE.cases.flatMap((c) => [c.response.formacion.value, c.response.experiencia.value])
    expect(values.filter((v) => v === 'relacionada').length).toBeGreaterThan(0)
    expect(values.filter((v) => v === 'sin-relacion-declarada').length).toBeGreaterThan(0)
  })

  it('maps every cited index onto the sourceIds of the item at that index', () => {
    let checked = 0
    for (const c of FIXTURE.cases) {
      const task = taskFrom(c)
      const formacion = resolveAssessment(c.response.formacion, task.educationItems)
      for (const ev of formacion.evidence) {
        expect(ev.sourceIds.length).toBeGreaterThan(0)
        // The evidence must be a real item from the pool, not model prose.
        expect(task.educationItems.some((i) => i.label === ev.label)).toBe(true)
        checked += 1
      }
    }
    expect(checked).toBeGreaterThan(0)
  })

  it('rejects an index outside the pool rather than repairing it', () => {
    // The promise miner's id-drift failure (172fd04): the model invented ids,
    // and forcing them would mis-attach evidence to the wrong person.
    const c = FIXTURE.cases[0]
    const task = taskFrom(c)
    expect(() =>
      resolveAssessment(
        { value: 'relacionada', evidenceIndices: [task.educationItems.length + 5], reason: 'x' },
        task.educationItems,
      ),
    ).toThrow(AreaFitValidationError)
  })

  it('rejects "relacionada" carrying no evidence at all', () => {
    expect(() =>
      resolveAssessment({ value: 'relacionada', evidenceIndices: [], reason: 'x' }, [
        { label: 'Arquitecto Técnico', sourceIds: ['src-060'] },
      ]),
    ).toThrow(AreaFitValidationError)
  })

  it('rejects a value outside the enum', () => {
    expect(() =>
      resolveAssessment({ value: 'idoneo', evidenceIndices: [], reason: 'x' }, []),
    ).toThrow(AreaFitValidationError)
  })

  it('builds a full row, with cargoPublicoPrevio derived without a model', () => {
    const c = FIXTURE.cases.find((x) => x.response.formacion.value === 'relacionada')!
    const task = taskFrom(c, [{ label: 'Concejala desde 2019', sourceIds: ['src-070'] }])
    const row = rowFromResponse(task, c.response)
    expect(row.officialSlug).toBe(c.task.officialSlug)
    expect(row.portfolio).toBe(c.task.portfolio)
    expect(row.formacion.value).toBe('relacionada')
    expect(row.formacion.evidence.length).toBeGreaterThan(0)
    expect(row.cargoPublicoPrevio.value).toBe('relacionada')
    expect(row.cargoPublicoPrevio.evidence[0].sourceIds).toEqual(['src-070'])
  })
})

describe('area-fit — the no-consta path is reachable without a model', () => {
  const emptyTask: FitTask = {
    officialSlug: 'sin-datos',
    portfolio: 'Cultura',
    departmentSlug: 'cultura',
    reportId: 'r-x',
    educationItems: [],
    careerItems: [],
    politicalItems: [],
  }

  it('marks an absent section no-consta, never sin-relacion-declarada', () => {
    // "We have no CV" and "the CV does not relate" are different facts about a
    // named person. DATA_INTEGRITY failure mode 3.
    expect(deriveCargoPublicoPrevio(emptyTask).value).toBe('no-consta')
  })

  it('never asks the model about a pool it cannot judge', () => {
    const tasks = buildFitTasks(
      [{ slug: 'sin-datos', name: 'X', portfolios: ['Cultura'], party: 'PP', role: 'concejal' }],
      [],
    )
    expect(tasks).toHaveLength(1)
    expect(tasks[0].educationItems).toEqual([])
  })

  it('computes the no-consta share so the ceiling can be enforced', () => {
    const rows = [
      { formacion: { value: 'no-consta' }, experiencia: { value: 'relacionada' } },
      { formacion: { value: 'relacionada' }, experiencia: { value: 'relacionada' } },
    ] as unknown as AreaFitRow[]
    expect(noConstaShare(rows)).toBeCloseTo(0.25, 5)
  })
})

describe('area-fit — validateAreaFitSnapshot', () => {
  const OFFICIALS = [
    { slug: 'teresa-pozuelo-martin', name: 'T', party: 'PSOE', role: 'concejal', portfolios: ['Urbanismo'] },
  ]
  const REPORT_SOURCES = { 'r-1': new Set(['src-060']) }

  const good = () => ({
    generatedAt: '2026-08-03T00:00:00.000Z',
    mandate: '2023-2027',
    rows: [
      {
        officialSlug: 'teresa-pozuelo-martin',
        portfolio: 'Urbanismo',
        departmentSlug: 'urbanismo',
        reportId: 'r-1',
        formacion: {
          value: 'relacionada',
          evidence: [{ label: 'Arquitecto Técnico — UPV', sourceIds: ['src-060'] }],
        },
        experiencia: { value: 'sin-relacion-declarada', evidence: [] },
        cargoPublicoPrevio: { value: 'no-consta', evidence: [] },
        curatedBy: 'Sergei Lutchenko',
        curatedAt: '2026-08-03',
      },
    ],
  })

  const ctx = { officials: OFFICIALS, reportSources: REPORT_SOURCES }

  it('accepts a well-formed curated snapshot', () => {
    expect(() => validateAreaFitSnapshot(good(), ctx)).not.toThrow()
  })

  it('rejects a portfolio the official does not actually hold', () => {
    const s = good()
    s.rows[0].portfolio = 'Hacienda'
    expect(() => validateAreaFitSnapshot(s, ctx)).toThrow(AreaFitValidationError)
  })

  it('rejects an officialSlug that does not resolve', () => {
    const s = good()
    s.rows[0].officialSlug = 'quien-sea'
    expect(() => validateAreaFitSnapshot(s, ctx)).toThrow(AreaFitValidationError)
  })

  it('rejects a sourceId absent from the cited report', () => {
    const s = good()
    s.rows[0].formacion.evidence[0].sourceIds = ['src-999']
    expect(() => validateAreaFitSnapshot(s, ctx)).toThrow(AreaFitValidationError)
  })

  it('rejects requiresHumanApproval on a PUBLISHED row', () => {
    // Two independent layers: drafts must carry it, published rows must not.
    const s = good() as Record<string, unknown>
    ;(s.rows as Array<Record<string, unknown>>)[0].requiresHumanApproval = true
    expect(() => validateAreaFitSnapshot(s, ctx)).toThrow(AreaFitValidationError)
  })

  it('rejects a row with no curator signature', () => {
    const s = good()
    delete (s.rows[0] as Partial<AreaFitRow>).curatedBy
    expect(() => validateAreaFitSnapshot(s, ctx)).toThrow(AreaFitValidationError)
  })

  it('rejects a snapshot whose no-consta share breaches the ceiling', () => {
    // A pipeline reading the wrong field looks exactly like mass ignorance.
    const s = good()
    s.rows[0].formacion = { value: 'no-consta', evidence: [] }
    s.rows[0].experiencia = { value: 'no-consta', evidence: [] }
    s.rows[0].cargoPublicoPrevio = { value: 'no-consta', evidence: [] }
    expect(() => validateAreaFitSnapshot(s, ctx)).toThrow(/no-consta/)
  })
})
