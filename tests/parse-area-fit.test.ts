import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  FIT_VALUES,
  RESPALDO_VALUES,
  AVISO_EJES,
  AreaFitValidationError,
  validateAreaFitDrafts,
  buildFitTasks,
  deriveRespaldo,
  resolveAssessment,
  resolveAvisoMapping,
  rowWithoutModel,
  rowFromResponse,
  noConstaShare,
  validateAreaFitSnapshot,
  type AreaFitRow,
  type AvisoMapping,
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

describe('area-fit — avisos mapped to an axis', () => {
  const WARNINGS = [
    'Los datos de formación proceden del CV autodeclarado de la propia concejala.',
    'Su CV y su declaración estatutaria difieren en el inicio de su plaza docente (2006 frente a 09/2008); se publica sin resolver.',
    'Las delegaciones han variado durante el mandato: el decreto de 07-2023 recogía Participación…',
  ]

  it('exports the axis enum rather than letting callers restate it', () => {
    // Imported, never hand-copied: DATA_INTEGRITY §1.
    expect(AVISO_EJES).toContain('formacion')
    expect(AVISO_EJES).toContain('experiencia')
    expect(AVISO_EJES).toContain('area')
    expect(AVISO_EJES).toContain('ninguno')
    expect(new Set(AVISO_EJES).size).toBe(AVISO_EJES.length)
  })

  it('carries the warning verbatim, resolved from its index', () => {
    // The model returns a number; the PROSE that gets published is read from
    // the report here. The model therefore cannot author a published sentence.
    const m = resolveAvisoMapping(
      { avisoIndex: 1, eje: 'experiencia', tipo: 'sin-resolver' },
      WARNINGS,
    )
    expect(m.eje).toBe('experiencia')
    expect(m.verbatim).toBe(WARNINGS[1])
    expect(m.tipo).toBe('sin-resolver')
  })

  it('rejects an index outside the report’s warnings rather than repairing it', () => {
    expect(() => resolveAvisoMapping({ avisoIndex: 9, eje: 'experiencia' }, WARNINGS)).toThrow(
      AreaFitValidationError,
    )
    // Off-by-one at the boundary is the realistic drift, not index 9.
    expect(() =>
      resolveAvisoMapping({ avisoIndex: WARNINGS.length, eje: 'ninguno' }, WARNINGS),
    ).toThrow(AreaFitValidationError)
    expect(() => resolveAvisoMapping({ avisoIndex: -1, eje: 'ninguno' }, WARNINGS)).toThrow(
      AreaFitValidationError,
    )
  })

  it('rejects an axis outside the enum', () => {
    expect(() => resolveAvisoMapping({ avisoIndex: 0, eje: 'sospecha' }, WARNINGS)).toThrow(
      AreaFitValidationError,
    )
  })

  it('keeps eje=area away from the chips — it flags the ROW', () => {
    // Not a decoration: it means the delegation changed mid-mandate, so the row
    // may be judging an área the person no longer holds.
    const m = resolveAvisoMapping(
      { avisoIndex: 2, eje: 'area', tipo: 'delegacion-cambiada' },
      WARNINGS,
    )
    expect(m.eje).toBe('area')
    expect(m.decoratesChip).toBe(false)
  })

  it('decorates a chip only for the two axes a chip actually shows', () => {
    // Asserting "area is false" alone passes on a function that always returns
    // false. Assert the check can distinguish.
    const eje = (e: string) => resolveAvisoMapping({ avisoIndex: 0, eje: e }, WARNINGS)
    expect(eje('formacion').decoratesChip).toBe(true)
    expect(eje('experiencia').decoratesChip).toBe(true)
    expect(eje('area').decoratesChip).toBe(false)
    expect(eje('ninguno').decoratesChip).toBe(false)
  })

  it('stamps the official and report the index is relative to', () => {
    // An index is meaningless without the list it indexes into: carrying the
    // reportId is what lets a reader (and check:relations) resolve it back.
    const m = resolveAvisoMapping({ avisoIndex: 0, eje: 'ninguno' }, WARNINGS, {
      officialSlug: 'eva-lara-catala',
      reportId: 'r-eva-lara-bio-2026-07-31',
    })
    expect(m.officialSlug).toBe('eva-lara-catala')
    expect(m.reportId).toBe('r-eva-lara-bio-2026-07-31')
  })
})

describe('area-fit — the published snapshot validates its avisos', () => {
  const OFFICIALS = [
    {
      slug: 'teresa-pozuelo-martin',
      name: 'T',
      party: 'PSOE',
      role: 'concejal',
      portfolios: ['Urbanismo'],
    },
  ]
  const ctx = { officials: OFFICIALS, reportSources: { 'r-1': new Set(['src-060']) } }

  const good = () => ({
    generatedAt: '2026-08-04T00:00:00.000Z',
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
        curatedAt: '2026-08-04',
      },
    ],
    avisos: [
      {
        officialSlug: 'teresa-pozuelo-martin',
        reportId: 'r-1',
        avisoIndex: 1,
        eje: 'experiencia',
        verbatim: 'Su CV y su declaración estatutaria difieren en el inicio de su plaza docente.',
        decoratesChip: true,
        curatedBy: 'Sergei Lutchenko',
        curatedAt: '2026-08-04',
      },
    ],
  })

  it('accepts a signed aviso mapping', () => {
    expect(() => validateAreaFitSnapshot(good(), ctx)).not.toThrow()
  })

  it('rejects an aviso whose eje is outside the enum', () => {
    const s = good()
    ;(s.avisos[0] as Record<string, unknown>).eje = 'sospecha'
    expect(() => validateAreaFitSnapshot(s, ctx)).toThrow(AreaFitValidationError)
  })

  it('rejects an aviso with no verbatim text — an empty warning says nothing', () => {
    const s = good()
    s.avisos[0].verbatim = ''
    expect(() => validateAreaFitSnapshot(s, ctx)).toThrow(AreaFitValidationError)
  })

  it('rejects an aviso with no curator signature', () => {
    const s = good()
    delete (s.avisos[0] as Partial<AvisoMapping>).curatedBy
    expect(() => validateAreaFitSnapshot(s, ctx)).toThrow(AreaFitValidationError)
  })

  it('rejects requiresHumanApproval on a PUBLISHED aviso', () => {
    // Same two-layer rule as the rows: drafts must carry it, published must not.
    const s = good() as Record<string, unknown>
    ;(s.avisos as Array<Record<string, unknown>>)[0].requiresHumanApproval = true
    expect(() => validateAreaFitSnapshot(s, ctx)).toThrow(AreaFitValidationError)
  })

  it('rejects an aviso attached to an official who is not in officials.json', () => {
    const s = good()
    s.avisos[0].officialSlug = 'quien-sea'
    expect(() => validateAreaFitSnapshot(s, ctx)).toThrow(AreaFitValidationError)
  })

  it('refuses a published eje=ninguno — it says nothing and names a person to say it', () => {
    const s = good()
    ;(s.avisos[0] as Record<string, unknown>).eje = 'ninguno'
    expect(() => validateAreaFitSnapshot(s, ctx)).toThrow(AreaFitValidationError)
  })

  it('refuses decoratesChip disagreeing with the eje', () => {
    // The flag is derived, so a snapshot where it was hand-edited is a snapshot
    // whose chips no longer match the axis they claim to be showing.
    const s = good()
    s.avisos[0].decoratesChip = false
    expect(() => validateAreaFitSnapshot(s, ctx)).toThrow(AreaFitValidationError)
  })

  it('still accepts a snapshot with no avisos at all — the field is optional', () => {
    const s = good() as Record<string, unknown>
    delete s.avisos
    expect(() => validateAreaFitSnapshot(s, ctx)).not.toThrow()
  })
})

describe('area-fit — the review queue is the mirror of the published shape', () => {
  const draft = () => ({
    rows: [],
    avisos: [
      {
        officialSlug: 'eva-lara-catala',
        reportId: 'r-eva-lara-bio-2026-07-31',
        avisoIndex: 1,
        eje: 'experiencia',
        verbatim: 'Su CV y su declaración estatutaria difieren en el inicio de su plaza docente.',
        decoratesChip: true,
        requiresHumanApproval: true,
      },
    ],
  })

  it('accepts an aviso draft carrying the approval flag', () => {
    expect(() => validateAreaFitDrafts(draft())).not.toThrow()
  })

  it('rejects an aviso draft that lost the approval flag', () => {
    const d = draft()
    delete (d.avisos[0] as Partial<AvisoMapping>).requiresHumanApproval
    expect(() => validateAreaFitDrafts(d)).toThrow(AreaFitValidationError)
  })

  it('rejects an aviso draft that arrived pre-signed', () => {
    // A signature the curator never gave is the whole failure this gate exists
    // to catch: promote would wave it straight through.
    const d = draft() as Record<string, unknown>
    ;(d.avisos as Array<Record<string, unknown>>)[0].curatedBy = 'un modelo'
    expect(() => validateAreaFitDrafts(d)).toThrow(AreaFitValidationError)
  })

  it('rejects "ninguno" reaching the queue — it is dropped, not reviewed', () => {
    const d = draft() as Record<string, unknown>
    ;(d.avisos as Array<Record<string, unknown>>)[0].eje = 'ninguno'
    expect(() => validateAreaFitDrafts(d)).toThrow(AreaFitValidationError)
  })
})

describe('area-fit — the real review queue, as the model actually filled it', () => {
  // Reads editorial/area-fit-queue.json when it exists. Gitignored, so this is
  // a local-only check and SKIPS in CI rather than pretending to have run.
  const QUEUE = join(__dirname, '..', 'editorial', 'area-fit-queue.json')
  const queue = existsSync(QUEUE)
    ? (JSON.parse(readFileSync(QUEUE, 'utf8')) as {
        avisos?: Array<AvisoMapping & { requiresHumanApproval?: true }>
      })
    : null

  it.skipIf(!queue)('every queued aviso quotes its report verbatim at its own index', () => {
    // The one property the whole cite-by-index design exists to guarantee: the
    // published text is the report's, at the index the mapping names. A silent
    // drift here would quote one councillor's warning under another's name.
    const reports = JSON.parse(
      readFileSync(join(__dirname, '..', 'public', 'data', 'journalist-reports.json'), 'utf8'),
    )
    const byId = new Map<string, { warnings?: string[] }>(
      (reports.items || reports.reports || []).map((r: { id: string }) => [r.id, r]),
    )
    let checked = 0
    for (const a of queue!.avisos ?? []) {
      expect(byId.get(a.reportId)?.warnings?.[a.avisoIndex]).toBe(a.verbatim)
      expect(a.requiresHumanApproval).toBe(true)
      expect(a.eje).not.toBe('ninguno')
      checked += 1
    }
    // Assert the check evaluated something: an empty queue would otherwise pass.
    expect(checked).toBeGreaterThan(0)
  })
})
