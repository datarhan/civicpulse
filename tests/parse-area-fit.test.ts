import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  FIT_VALUES,
  RESPALDO_VALUES,
  AreaFitValidationError,
  buildFitTasks,
  deriveRespaldo,
  resolveAssessment,
  rowWithoutModel,
  rowFromResponse,
  noConstaShare,
  validateAreaFitSnapshot,
  type AreaFitRow,
  type FitTask,
  type FitEvidenceItem,
  type SourceLike,
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
function taskFrom(
  c: (typeof FIXTURE.cases)[number],
  politicalItems: FitEvidenceItem[] = [],
  sourcesById: Record<string, SourceLike> = {},
): FitTask {
  return {
    officialSlug: c.task.officialSlug,
    portfolio: c.task.portfolio,
    departmentSlug: null,
    reportId: c.task.reportId,
    educationItems: c.task.educationItems,
    careerItems: c.task.careerItems,
    politicalItems,
    sourcesById,
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
    const values = FIXTURE.cases.flatMap((c) => [
      c.response.formacion.value,
      c.response.experiencia.value,
    ])
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

  it('builds a full row from the model answer', () => {
    const c = FIXTURE.cases.find((x) => x.response.formacion.value === 'relacionada')!
    const task = taskFrom(c)
    const row = rowFromResponse(task, c.response)
    expect(row.officialSlug).toBe(c.task.officialSlug)
    expect(row.portfolio).toBe(c.task.portfolio)
    expect(row.formacion.value).toBe('relacionada')
    expect(row.formacion.evidence.length).toBeGreaterThan(0)
  })

  it('carries no cargoPublicoPrevio field — it was tautological and was removed', () => {
    // career-political includes the CURRENT mandate, so every sitting
    // councillor scored "has held public office" and the chip could not vary.
    // For Eva Lara, whose only political row is the seat she holds now, it
    // asserted a prior office she has never held.
    const c = FIXTURE.cases[0]
    const row = rowFromResponse(taskFrom(c), c.response) as Record<string, unknown>
    expect('cargoPublicoPrevio' in row).toBe(false)
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
    sourcesById: {},
  }

  it('marks an absent section no-consta, never sin-relacion-declarada', () => {
    // "We have no CV" and "the CV does not relate" are different facts about a
    // named person. DATA_INTEGRITY failure mode 3.
    const row = rowWithoutModel(emptyTask)
    expect(row.formacion.value).toBe('no-consta')
    expect(row.experiencia.value).toBe('no-consta')
    expect(row.formacion.evidence).toEqual([])
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
    {
      slug: 'teresa-pozuelo-martin',
      name: 'T',
      party: 'PSOE',
      role: 'concejal',
      portfolios: ['Urbanismo'],
    },
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
    expect(() => validateAreaFitSnapshot(s, ctx)).toThrow(/no-consta/)
  })

  it('accepts a published row that states what its cited evidence rests on', () => {
    const s = good()
    ;(s.rows[0].formacion as Record<string, unknown>).respaldo = 'autodeclarada'
    expect(() => validateAreaFitSnapshot(s, ctx)).not.toThrow()
  })

  it('refuses to publish an assessment whose backing was never classified', () => {
    // `sin-clasificar` is not a quieter `autodeclarada`: it means nobody said
    // what backs this. Publishing it lets a reader supply the missing word.
    const s = good()
    ;(s.rows[0].formacion as Record<string, unknown>).respaldo = 'sin-clasificar'
    expect(() => validateAreaFitSnapshot(s, ctx)).toThrow(AreaFitValidationError)
  })

  it('rejects a respaldo outside the enum', () => {
    const s = good()
    ;(s.rows[0].formacion as Record<string, unknown>).respaldo = 'verificada'
    expect(() => validateAreaFitSnapshot(s, ctx)).toThrow(AreaFitValidationError)
  })
})

describe('area-fit — respaldo (de qué se sostiene la evidencia)', () => {
  const SRC: Record<string, SourceLike> = {
    'src-cv': { id: 'src-cv', selfDeclared: true },
    'src-bop': { id: 'src-bop', selfDeclared: false },
    'src-unset': { id: 'src-unset' },
  }

  it('is a separate axis from FIT_VALUES, never merged into it', () => {
    for (const v of RESPALDO_VALUES) expect(FIT_VALUES).not.toContain(v)
  })

  it('reads autodeclarada when every cited source is the subject’s own account', () => {
    expect(deriveRespaldo([{ label: 'x', sourceIds: ['src-cv'] }], SRC)).toBe('autodeclarada')
  })

  it('reads corroborada as soon as one independent source backs it', () => {
    expect(
      deriveRespaldo(
        [
          { label: 'x', sourceIds: ['src-cv'] },
          { label: 'y', sourceIds: ['src-bop'] },
        ],
        SRC,
      ),
    ).toBe('corroborada')
  })

  it('refuses to read an unclassified source as corroboration', () => {
    // `undefined` means nobody classified it. Treating it as independent is
    // how self-declaration gets published as verified.
    expect(deriveRespaldo([{ label: 'x', sourceIds: ['src-unset'] }], SRC)).toBe('sin-clasificar')
  })

  it('has no evidence at all → sin-clasificar, not autodeclarada', () => {
    expect(deriveRespaldo([], SRC)).toBe('sin-clasificar')
  })

  it('treats a sourceId absent from the map as unclassified, not as independent', () => {
    // The map is the report's own sources; an id that is not in it was never
    // classified either. Falling through to "corroborada" would invent one.
    expect(deriveRespaldo([{ label: 'x', sourceIds: ['src-fantasma'] }], SRC)).toBe(
      'sin-clasificar',
    )
  })

  it('lets a single unclassified source outweigh a corroborated sibling', () => {
    // The property under test is the ORDER of the guards, not the return value.
    // Checking `some(f => f === false)` BEFORE the `undefined` guard passes every
    // other test in this file while answering `corroborada` for an assessment
    // that cites something nobody classified — "we never looked" published as
    // "independently verified", the exact failure this axis exists to prevent.
    // Every other case here is uniformly classified, so only a MIXED assessment
    // can distinguish the two orderings.
    expect(deriveRespaldo([{ label: 'x', sourceIds: ['src-unset', 'src-bop'] }], SRC)).toBe(
      'sin-clasificar',
    )
  })

  it('masks across evidence items too — the shape real rows are built in', () => {
    // A row cites one item per CV line, so in practice the unclassified source
    // arrives on a DIFFERENT item from the independent one. The ids are
    // flattened across items before the guards run for exactly this reason;
    // guarding per item would let a clean item vouch for a dirty one.
    expect(
      deriveRespaldo(
        [
          { label: 'x', sourceIds: ['src-bop'] },
          { label: 'y', sourceIds: ['src-unset'] },
        ],
        SRC,
      ),
    ).toBe('sin-clasificar')
  })

  it('does not let a self-declared source mask an unclassified one either', () => {
    // The other direction of the same masking bug, and the more dangerous one
    // here: `autodeclarada` PUBLISHES, `sin-clasificar` is refused. A guard that
    // answered on the first `true` it saw would ship an unreviewed source under
    // a verdict a curator never gave it.
    expect(deriveRespaldo([{ label: 'x', sourceIds: ['src-cv', 'src-unset'] }], SRC)).toBe(
      'sin-clasificar',
    )
  })
})

describe('area-fit — respaldo travels on the row', () => {
  const related = FIXTURE.cases.find(
    (x) =>
      x.response.formacion.value === 'relacionada' &&
      x.response.experiencia.value === 'relacionada',
  )!
  const unrelated = FIXTURE.cases.find(
    (x) =>
      x.response.formacion.value === 'sin-relacion-declarada' &&
      x.response.experiencia.value === 'sin-relacion-declarada',
  )!

  /** Every id the fixture case cites, classified as told. */
  const classify = (
    c: (typeof FIXTURE.cases)[number],
    flag: (id: string) => boolean | undefined,
  ): Record<string, SourceLike> =>
    Object.fromEntries(
      [...c.task.educationItems, ...c.task.careerItems]
        .flatMap((i) => i.sourceIds)
        .map((id) => [id, { id, ...(flag(id) === undefined ? {} : { selfDeclared: flag(id) }) }]),
    )

  it('stamps both axes on the same assessment without merging them', () => {
    // src-060 is the CV, src-061 an independent publication: one row, one fit
    // value, two different respaldos. A single merged field could not say this.
    const row = rowFromResponse(
      taskFrom(
        related,
        [],
        classify(related, (id) => id === 'src-060'),
      ),
      related.response,
    )
    expect(row.formacion.value).toBe('relacionada')
    expect(row.formacion.respaldo).toBe('autodeclarada')
    expect(row.experiencia.value).toBe('relacionada')
    expect(row.experiencia.respaldo).toBe('corroborada')
  })

  it('stamps sin-clasificar when the cited sources were never classified', () => {
    // Which is exactly what the published validator then refuses.
    const row = rowFromResponse(taskFrom(related, [], {}), related.response)
    expect(row.formacion.respaldo).toBe('sin-clasificar')
  })

  it('leaves respaldo unset where there is no cited evidence to describe', () => {
    // `sin-relacion-declarada` and `no-consta` carry no citations — the
    // validator forbids it — so there is nothing whose backing to state. That
    // is 52 of the 80 published assessments; stamping them `sin-clasificar`
    // would assert nothing and block the whole surface from publishing.
    const row = rowFromResponse(
      taskFrom(
        unrelated,
        [],
        classify(unrelated, () => true),
      ),
      unrelated.response,
    )
    expect(row.formacion.evidence).toEqual([])
    expect(row.formacion.respaldo).toBeUndefined()
    expect(row.experiencia.respaldo).toBeUndefined()

    const never = rowWithoutModel({
      officialSlug: 'sin-datos',
      portfolio: 'Cultura',
      departmentSlug: 'cultura',
      reportId: 'r-x',
      educationItems: [],
      careerItems: [],
      politicalItems: [],
      sourcesById: {},
    })
    expect(never.formacion.respaldo).toBeUndefined()
  })

  it('carries the report’s own sources onto the task, so nothing has to re-load them', () => {
    const tasks = buildFitTasks(
      [{ slug: 'x', name: 'X', portfolios: ['Cultura'], party: 'PP', role: 'concejal' }],
      [
        {
          id: 'r-9',
          sections: [
            { kind: 'portrait', payload: { officialSlug: 'x' } },
            {
              kind: 'education',
              payload: { items: [{ degree: 'Grado', institution: 'UPV', sourceIds: ['src-1'] }] },
            },
          ],
          sources: [
            { id: 'src-1', selfDeclared: true },
            { id: 'src-2', selfDeclared: false },
          ],
        },
      ],
    )
    expect(tasks).toHaveLength(1)
    expect(tasks[0].sourcesById['src-1']).toMatchObject({ selfDeclared: true })
    expect(tasks[0].sourcesById['src-2']).toMatchObject({ selfDeclared: false })
  })
})
