import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  FIT_VALUES,
  RESPALDO_VALUES,
  AVISO_EJES,
  AVISO_DIRECCIONES,
  AreaFitValidationError,
  validateAreaFitDrafts,
  buildFitTasks,
  deriveRespaldo,
  evidencePoolsFor,
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
          evidence: [
            {
              label: 'Arquitecto Técnico — UPV',
              short: 'Arquitecto Técnico',
              sourceIds: ['src-060'],
            },
          ],
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

  it('rejects evidence carrying no short form — the card would print nothing', () => {
    // Required, not optional, on purpose: every row published before the field
    // existed has to be migrated, and this is what stops "never attempted" from
    // passing as "nothing to do" (DATA_INTEGRITY §2).
    const s = good()
    delete (s.rows[0].formacion.evidence[0] as Partial<FitEvidenceItem>).short
    expect(() => validateAreaFitSnapshot(s, ctx)).toThrow(/short form/)
  })

  it('rejects an empty short form as firmly as a missing one', () => {
    const s = good()
    s.rows[0].formacion.evidence[0].short = ''
    expect(() => validateAreaFitSnapshot(s, ctx)).toThrow(/short form/)
  })

  it('rejects a short form that is not the head of its own label', () => {
    // The drift this invariant exists to catch: a credential from ANOTHER
    // biography row lands on this item, and the card publishes a qualification
    // the person never claimed under their photograph. Cheap to check, because
    // the full label is the short form with the institution appended.
    const s = good()
    s.rows[0].formacion.evidence[0].short = 'Grado en Derecho'
    expect(() => validateAreaFitSnapshot(s, ctx)).toThrow(/is not the head of/)
    // Positive control: the same snapshot with the right head passes, so the
    // gate is discriminating and not merely throwing.
    s.rows[0].formacion.evidence[0].short = 'Arquitecto Técnico'
    expect(() => validateAreaFitSnapshot(s, ctx)).not.toThrow()
  })
})

describe('area-fit — la credencial, no la institución (el campo `short`)', () => {
  // Shaped like the real biographies: the report stores the credential and the
  // place it was earned as SEPARATE keys, which is why nothing has to parse.
  const REPORT = {
    id: 'r-9',
    sections: [
      { kind: 'portrait', payload: { officialSlug: 'x' } },
      {
        kind: 'education',
        payload: {
          items: [
            {
              degree: 'Arquitecto Técnico',
              institution: 'Universitat Politècnica de València',
              sourceIds: ['src-1'],
            },
            // A degree that CONTAINS the separator. `label.split(' — ')[0]`
            // answers «Grado en Historia» here — a qualification this person
            // does not hold — so this row fails for any regex implementation
            // and passes only when the structured field is read.
            {
              degree: 'Grado en Historia — mención en Patrimonio',
              institution: 'Universitat de València',
              sourceIds: ['src-1'],
            },
            // No `degree` at all: only the centre is on record.
            { institution: 'Escuela de Empresariales de Valencia', sourceIds: ['src-1'] },
          ],
        },
      },
      {
        kind: 'career-professional',
        payload: {
          items: [
            {
              role: 'Arquitecta técnica y jefa de obra',
              org: 'Grupo Tremon SA',
              sourceIds: ['src-2'],
            },
          ],
        },
      },
    ],
    sources: [
      { id: 'src-1', selfDeclared: true },
      { id: 'src-2', selfDeclared: true },
    ],
  }
  const pools = evidencePoolsFor(REPORT)

  it('reads the credential from the report’s own fields instead of splitting the label', () => {
    expect(pools.educationItems[0]).toMatchObject({
      label: 'Arquitecto Técnico — Universitat Politècnica de València',
      short: 'Arquitecto Técnico',
    })
    expect(pools.careerItems[0]).toMatchObject({
      label: 'Arquitecta técnica y jefa de obra @ Grupo Tremon SA',
      short: 'Arquitecta técnica y jefa de obra',
    })
    // The separator-bearing degree: whole, not truncated at the first « — ».
    expect(pools.educationItems[1].short).toBe('Grado en Historia — mención en Patrimonio')
  })

  it('carries a short form that actually DIFFERS from the label, for more than one item', () => {
    // "Every item has a short" passes on a field that copies the label, which
    // would leave the card printing the institution it was built to drop.
    const items = [...pools.educationItems, ...pools.careerItems]
    expect(items.filter((i) => i.short !== i.label).length).toBeGreaterThan(1)
    for (const i of items) expect(i.label.startsWith(i.short)).toBe(true)
  })

  it('falls back to the whole line, never to a blank, when no credential is on record', () => {
    const onlyCentre = pools.educationItems[2]
    expect(onlyCentre.label).toBe('Escuela de Empresariales de Valencia')
    expect(onlyCentre.short).toBe(onlyCentre.label)
    expect(onlyCentre.short.length).toBeGreaterThan(0)
  })

  it('travels from the pool onto the row the model’s answer builds', () => {
    // The model cites an INDEX; both label forms are read from the pool item at
    // that index, so the model cannot author either of them.
    const tasks = buildFitTasks(
      [{ slug: 'x', name: 'X', portfolios: ['Urbanismo'], party: 'PSOE', role: 'concejal' }],
      [REPORT],
    )
    const row = rowFromResponse(tasks[0], {
      formacion: { value: 'relacionada', evidenceIndices: [0], reason: 'materia de edificación' },
      experiencia: { value: 'relacionada', evidenceIndices: [0], reason: 'jefatura de obra' },
    })
    expect(row.formacion.evidence[0].short).toBe('Arquitecto Técnico')
    expect(row.experiencia.evidence[0].short).toBe('Arquitecta técnica y jefa de obra')
    // …and the full label survives alongside it: the detail page still cites
    // where the credential comes from.
    expect(row.formacion.evidence[0].label).toContain('Universitat Politècnica')
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
    expect(deriveRespaldo([{ sourceIds: ['src-cv'] }], SRC)).toBe('autodeclarada')
  })

  it('reads corroborada as soon as one independent source backs it', () => {
    expect(deriveRespaldo([{ sourceIds: ['src-cv'] }, { sourceIds: ['src-bop'] }], SRC)).toBe(
      'corroborada',
    )
  })

  it('refuses to read an unclassified source as corroboration', () => {
    // `undefined` means nobody classified it. Treating it as independent is
    // how self-declaration gets published as verified.
    expect(deriveRespaldo([{ sourceIds: ['src-unset'] }], SRC)).toBe('sin-clasificar')
  })

  it('has no evidence at all → sin-clasificar, not autodeclarada', () => {
    expect(deriveRespaldo([], SRC)).toBe('sin-clasificar')
  })

  it('treats a sourceId absent from the map as unclassified, not as independent', () => {
    // The map is the report's own sources; an id that is not in it was never
    // classified either. Falling through to "corroborada" would invent one.
    expect(deriveRespaldo([{ sourceIds: ['src-fantasma'] }], SRC)).toBe('sin-clasificar')
  })

  it('lets a single unclassified source outweigh a corroborated sibling', () => {
    // The property under test is the ORDER of the guards, not the return value.
    // Checking `some(f => f === false)` BEFORE the `undefined` guard passes every
    // other test in this file while answering `corroborada` for an assessment
    // that cites something nobody classified — "we never looked" published as
    // "independently verified", the exact failure this axis exists to prevent.
    // Every other case here is uniformly classified, so only a MIXED assessment
    // can distinguish the two orderings.
    expect(deriveRespaldo([{ sourceIds: ['src-unset', 'src-bop'] }], SRC)).toBe('sin-clasificar')
  })

  it('masks across evidence items too — the shape real rows are built in', () => {
    // A row cites one item per CV line, so in practice the unclassified source
    // arrives on a DIFFERENT item from the independent one. The ids are
    // flattened across items before the guards run for exactly this reason;
    // guarding per item would let a clean item vouch for a dirty one.
    expect(deriveRespaldo([{ sourceIds: ['src-bop'] }, { sourceIds: ['src-unset'] }], SRC)).toBe(
      'sin-clasificar',
    )
  })

  it('does not let a self-declared source mask an unclassified one either', () => {
    // The other direction of the same masking bug, and the more dangerous one
    // here: `autodeclarada` PUBLISHES, `sin-clasificar` is refused. A guard that
    // answered on the first `true` it saw would ship an unreviewed source under
    // a verdict a curator never gave it.
    expect(deriveRespaldo([{ sourceIds: ['src-cv', 'src-unset'] }], SRC)).toBe('sin-clasificar')
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
      { avisoIndex: 1, eje: 'experiencia', direccion: 'contradice' },
      WARNINGS,
    )
    expect(m.eje).toBe('experiencia')
    expect(m.verbatim).toBe(WARNINGS[1])
    expect(m.direccion).toBe('contradice')
  })

  it('rejects an index outside the report’s warnings rather than repairing it', () => {
    const at = (i: number) =>
      resolveAvisoMapping({ avisoIndex: i, eje: 'experiencia', direccion: 'matiza' }, WARNINGS)
    expect(() => at(9)).toThrow(AreaFitValidationError)
    // Off-by-one at the boundary is the realistic drift, not index 9.
    expect(() => at(WARNINGS.length)).toThrow(AreaFitValidationError)
    expect(() => at(-1)).toThrow(AreaFitValidationError)
  })

  it('rejects an axis outside the enum', () => {
    expect(() =>
      resolveAvisoMapping({ avisoIndex: 0, eje: 'sospecha', direccion: 'matiza' }, WARNINGS),
    ).toThrow(AreaFitValidationError)
  })

  it('keeps eje=area away from the chips — it flags the ROW', () => {
    // Not a decoration: it means the delegation changed mid-mandate, so the row
    // may be judging an área the person no longer holds.
    const m = resolveAvisoMapping({ avisoIndex: 2, eje: 'area', direccion: 'matiza' }, WARNINGS)
    expect(m.eje).toBe('area')
    expect(m.decoratesChip).toBe(false)
  })

  it('decorates a chip only for the two axes a chip actually shows', () => {
    // Asserting "area is false" alone passes on a function that always returns
    // false. Assert the check can distinguish.
    const eje = (e: string) =>
      resolveAvisoMapping({ avisoIndex: 0, eje: e, direccion: 'matiza' }, WARNINGS)
    expect(eje('formacion').decoratesChip).toBe(true)
    expect(eje('experiencia').decoratesChip).toBe(true)
    expect(eje('area').decoratesChip).toBe(false)
    expect(eje('ninguno').decoratesChip).toBe(false)
  })

  it('stamps the official and report the index is relative to', () => {
    // An index is meaningless without the list it indexes into: carrying the
    // reportId is what lets a reader (and check:relations) resolve it back.
    const m = resolveAvisoMapping(
      { avisoIndex: 0, eje: 'ninguno', direccion: 'matiza' },
      WARNINGS,
      { officialSlug: 'eva-lara-catala', reportId: 'r-eva-lara-bio-2026-07-31' },
    )
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
  const AVISO_TEXT = 'Su CV y su declaración estatutaria difieren en el inicio de su plaza docente.'
  // The report as it stands NOW — what the validator re-resolves the index against.
  const WARNINGS_NOW = ['Los datos proceden de un CV autodeclarado.', AVISO_TEXT]
  const ctx = {
    officials: OFFICIALS,
    reportSources: { 'r-1': new Set(['src-060']) },
    reportWarnings: { 'r-1': WARNINGS_NOW },
  }

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
          evidence: [
            {
              label: 'Arquitecto Técnico — UPV',
              short: 'Arquitecto Técnico',
              sourceIds: ['src-060'],
            },
          ],
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
        direccion: 'contradice',
        verbatim: AVISO_TEXT,
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
    // decoratesChip is flipped to false ALONGSIDE the eje, so this snapshot is
    // consistent in every other respect. The first version of this test left it
    // `true`, which made the derived-flag check four lines below reject the
    // snapshot instead — the test passed with the ninguno gate DELETED. Ablation-
    // verified 2026-08-04: removing the gate now fails exactly this test.
    const s = good() as Record<string, unknown>
    const aviso = (s.avisos as Array<Record<string, unknown>>)[0]
    aviso.eje = 'ninguno'
    aviso.decoratesChip = false
    expect(() => validateAreaFitSnapshot(s, ctx)).toThrow(/ninguno/)
  })

  it('refuses decoratesChip disagreeing with the eje', () => {
    // The flag is derived, so a snapshot where it was hand-edited is a snapshot
    // whose chips no longer match the axis they claim to be showing.
    const s = good()
    s.avisos[0].decoratesChip = false
    expect(() => validateAreaFitSnapshot(s, ctx)).toThrow(/decoratesChip/)
  })

  it('requires a reportId — an index means nothing without the list it indexes', () => {
    // Matched on the gate's OWN wording, not merely on the substring "reportId":
    // the re-resolution check below also mentions reportId, so a loose regex
    // passed with this gate ablated. Ablation-verified 2026-08-04.
    const s = good() as Record<string, unknown>
    ;(s.avisos as Array<Record<string, unknown>>)[0].reportId = ''
    expect(() => validateAreaFitSnapshot(s, ctx)).toThrow(/reportId required/)
  })

  it('still accepts a snapshot with no avisos at all — the field is optional', () => {
    const s = good() as Record<string, unknown>
    delete s.avisos
    expect(() => validateAreaFitSnapshot(s, ctx)).not.toThrow()
  })

  it('refuses an aviso whose direccion is outside the enum', () => {
    const s = good() as Record<string, unknown>
    ;(s.avisos as Array<Record<string, unknown>>)[0].direccion = 'desmiente'
    expect(() => validateAreaFitSnapshot(s, ctx)).toThrow(/direccion/)
  })

  it('refuses an aviso with no direccion at all', () => {
    const s = good()
    delete (s.avisos[0] as Partial<AvisoMapping>).direccion
    expect(() => validateAreaFitSnapshot(s, ctx)).toThrow(/direccion/)
  })

  it('refuses a published aviso still carrying the retired free-text `tipo`', () => {
    // It reached public/data once. The published shape now names it and refuses.
    const s = good() as Record<string, unknown>
    ;(s.avisos as Array<Record<string, unknown>>)[0].tipo =
      'El concejal miente sobre su titulación universitaria y lo sabe.'
    expect(() => validateAreaFitSnapshot(s, ctx)).toThrow(/tipo/)
  })

  // ── Re-resolving the index at PUBLICATION time, not just at generation ──
  //
  // Cite-by-index protected only the moment the model answered. Between
  // `suggest` and `promote` a biography can be re-run: warnings reorder, or a
  // retraction shortens the list. Nothing re-checked the mapping before it
  // published, so a stale quote could ship under a stale index with a curator's
  // name on it.

  it('refuses a verbatim that no longer matches the warning at that index', () => {
    const s = good()
    // The biography was re-run and warning 1 was rewritten.
    const moved = {
      ...ctx,
      reportWarnings: { 'r-1': [WARNINGS_NOW[0], 'Otra advertencia distinta por completo.'] },
    }
    expect(() => validateAreaFitSnapshot(s, moved)).toThrow(/verbatim no longer matches/)
  })

  it('refuses a mapping whose index now falls off the end of a shortened list', () => {
    const s = good()
    const shortened = { ...ctx, reportWarnings: { 'r-1': [WARNINGS_NOW[0]] } }
    expect(() => validateAreaFitSnapshot(s, shortened)).toThrow(/verbatim no longer matches/)
  })

  it('refuses a reportId that resolves to no report at all', () => {
    const s = good()
    s.avisos[0].reportId = 'r-inventado'
    expect(() => validateAreaFitSnapshot(s, ctx)).toThrow(/resolves to no report/)
  })

  it('REFUSES to validate avisos at all when the context carries no reportWarnings', () => {
    // The check must not vanish when a caller forgets the field — it must refuse.
    // Verbatim from the reviewer's attack: an invented sentence about a named
    // councillor, which PUBLISHED under a context of {officials, reportSources}
    // because the re-resolution was wrapped in `if (ctx.reportWarnings)`.
    // `check:contract-drift` and the pre-push `review:surfaces` both shipped this
    // exact shape — absent input reading as a pass (DATA_INTEGRITY §2).
    const s = good()
    s.avisos[0].verbatim = 'Cobró comisiones ilegales según fuentes internas.'
    const blind = { officials: OFFICIALS, reportSources: ctx.reportSources }
    expect(() => validateAreaFitSnapshot(s, blind)).toThrow(/reportWarnings/)
    // And with the reports present it is caught on its merits, not by the guard.
    expect(() => validateAreaFitSnapshot(s, ctx)).toThrow(/verbatim no longer matches/)
  })

  it('does not require reportWarnings from a snapshot that carries no avisos', () => {
    // The guard is scoped to what it protects: a rows-only snapshot must still
    // validate in a caller that holds no reports.
    const s = good() as Record<string, unknown>
    delete s.avisos
    expect(() =>
      validateAreaFitSnapshot(s, { officials: OFFICIALS, reportSources: ctx.reportSources }),
    ).not.toThrow()
    const empty = good() as Record<string, unknown>
    empty.avisos = []
    expect(() =>
      validateAreaFitSnapshot(empty, { officials: OFFICIALS, reportSources: ctx.reportSources }),
    ).not.toThrow()
  })

  it('refuses an empty reportWarnings object rather than treating it as "no reports"', () => {
    // Defaulting the field to `{}` would reproduce the same hole one layer down:
    // every reportId would resolve to nothing and the aviso would be refused for
    // the wrong reason, or — worse, in a laxer future — waved through.
    const s = good()
    expect(() => validateAreaFitSnapshot(s, { ...ctx, reportWarnings: {} })).toThrow(
      /resolves to no report/,
    )
  })

  it('accepts the same mapping once the reports are supplied and still agree', () => {
    // The positive half: without it, a validator that threw unconditionally
    // would pass every test above.
    expect(() => validateAreaFitSnapshot(good(), ctx)).not.toThrow()
    // …and the warnings really are being consulted, not ignored:
    expect(WARNINGS_NOW[good().avisos[0].avisoIndex]).toBe(good().avisos[0].verbatim)
  })
})

describe('area-fit — direccion: which way the warning cuts', () => {
  it('exports the direction enum rather than letting callers restate it', () => {
    expect(AVISO_DIRECCIONES).toContain('contradice')
    expect(AVISO_DIRECCIONES).toContain('corrobora')
    expect(AVISO_DIRECCIONES).toContain('matiza')
    expect(new Set(AVISO_DIRECCIONES).size).toBe(AVISO_DIRECCIONES.length)
    // It is a SEPARATE axis from the eje: merging them could not say
    // "experiencia, but corroborating".
    for (const d of AVISO_DIRECCIONES) expect(AVISO_EJES).not.toContain(d)
  })

  it('carries the direction through onto the mapping', () => {
    const W = ['una advertencia']
    for (const d of AVISO_DIRECCIONES) {
      expect(
        resolveAvisoMapping({ avisoIndex: 0, eje: 'experiencia', direccion: d }, W).direccion,
      ).toBe(d)
    }
  })

  it('refuses a mapping with no direction at all', () => {
    // Two of the first three real `experiencia` mappings were CORROBORATIONS.
    // Without a direction the surface can only render them as doubts, which
    // publishes corroboration as suspicion about a named person.
    expect(() =>
      resolveAvisoMapping(
        { avisoIndex: 0, eje: 'experiencia' } as unknown as {
          avisoIndex: number
          eje: string
          direccion: string
        },
        ['una advertencia'],
      ),
    ).toThrow(AreaFitValidationError)
  })

  it('refuses a direction outside the enum', () => {
    expect(() =>
      resolveAvisoMapping({ avisoIndex: 0, eje: 'experiencia', direccion: 'desmiente' }, [
        'una advertencia',
      ]),
    ).toThrow(AreaFitValidationError)
  })

  it('never emits a free-text field the model authored', () => {
    // `tipo` used to be `z.string().optional()` and travelled all the way into
    // public/data/area-fit.json, where anything is published whether a page
    // renders it or not. A model-authored sentence about a living person could
    // ship under a curator's signature. The mapping now carries no such field.
    const m = resolveAvisoMapping(
      { avisoIndex: 0, eje: 'experiencia', direccion: 'matiza', tipo: 'texto libre' } as never,
      ['una advertencia'],
    ) as Record<string, unknown>
    expect('tipo' in m).toBe(false)
    // Every remaining string value is either resolved from the report or drawn
    // from a closed set — assert that, rather than trusting the shape.
    const enums = new Set<string>([...AVISO_EJES, ...AVISO_DIRECCIONES])
    let checked = 0
    for (const [k, v] of Object.entries(m)) {
      if (typeof v !== 'string') continue
      expect(k === 'verbatim' ? ['una advertencia'].includes(v) : enums.has(v) || v === '').toBe(
        true,
      )
      checked += 1
    }
    expect(checked).toBeGreaterThan(0)
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
        direccion: 'contradice',
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
    expect(() => validateAreaFitDrafts(d)).toThrow(/ninguno/)
  })

  it('rejects a draft with no direccion, or with free-text `tipo`', () => {
    const noDir = draft()
    delete (noDir.avisos[0] as Partial<AvisoMapping>).direccion
    expect(() => validateAreaFitDrafts(noDir)).toThrow(/direccion/)

    const withTipo = draft() as Record<string, unknown>
    ;(withTipo.avisos as Array<Record<string, unknown>>)[0].tipo = 'una frase entera del modelo'
    expect(() => validateAreaFitDrafts(withTipo)).toThrow(/tipo/)
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
      expect(AVISO_DIRECCIONES).toContain(a.direccion)
      // No free-text field survives into the queue.
      expect('tipo' in a).toBe(false)
      checked += 1
    }
    // Assert the check evaluated something: an empty queue would otherwise pass.
    expect(checked).toBeGreaterThan(0)
  })
})

describe('area-fit — the published snapshot’s backing is MEASURED, not assumed', () => {
  const snap = JSON.parse(
    readFileSync(join(__dirname, '..', 'public', 'data', 'area-fit.json'), 'utf8'),
  ) as { rows: AreaFitRow[] }
  const assessments = snap.rows.flatMap((r) => [r.formacion, r.experiencia])

  it('every assessment that cites something carries a classified respaldo', () => {
    const citing = assessments.filter((a) => a.evidence.length > 0)
    // ASSERT THE CLASSIFIER RAN. "0 corroboradas" and "nobody ever populated the
    // field" are indistinguishable from outside — this line is the difference,
    // and it is the whole reason the test exists (DATA_INTEGRITY §2).
    expect(citing.length).toBeGreaterThan(0)
    expect(citing.filter((a) => a.respaldo === undefined)).toEqual([])
    expect(citing.filter((a) => a.respaldo === 'sin-clasificar')).toEqual([])
  })

  it('an assessment that cites nothing carries no respaldo at all', () => {
    // The complement, and not a formality: `sin-clasificar` on these would be
    // false (there is no citation whose backing could be unknown) AND would make
    // the whole surface unpublishable, since the published validator refuses it.
    // Absent here means "there is nothing to describe", never "we did not look".
    const uncited = assessments.filter((a) => a.evidence.length === 0)
    expect(uncited.length).toBeGreaterThan(0)
    expect(uncited.filter((a) => 'respaldo' in a)).toEqual([])
  })

  it('publishes no respaldo the enum does not contain', () => {
    for (const a of assessments) {
      if (a.respaldo !== undefined) expect(RESPALDO_VALUES).toContain(a.respaldo)
    }
  })

  // ── The short form, on the rows that are actually live ──
  //
  // This is the gate that the migration RAN. `short` is required by the type and
  // by the validator, but neither is evaluated on a file already sitting in
  // public/data — Vercel serves it whatever its shape.

  const published = assessments.flatMap((a) => a.evidence ?? [])

  it('every published evidence item carries a non-empty short form', () => {
    // Assert the check evaluated something first: an empty list satisfies every
    // "none of them is broken" assertion below.
    expect(published.length).toBeGreaterThan(0)
    expect(published.filter((ev) => typeof ev.short !== 'string' || !ev.short.length)).toEqual([])
  })

  it('the published short form is not merely a copy of the label', () => {
    // A field that copied the label would satisfy the test above while leaving
    // «Formación» and «Experiencia» printing the institution and the company —
    // the defect this field exists to fix.
    //
    // The `typeof` is load-bearing, not defensive: `undefined !== label` is
    // true, so the naive form of this assertion PASSED against the unmigrated
    // snapshot, where no item had a short form at all. Ablation-verified
    // 2026-08-09 by re-running it against the pre-migration file.
    const real = published.filter(
      (ev) => typeof ev.short === 'string' && ev.short.length > 0 && ev.short !== ev.label,
    )
    expect(real.length).toBeGreaterThan(0)
  })

  it('every published short form is the head of its own label', () => {
    expect(published.filter((ev) => !ev.label.startsWith(ev.short))).toEqual([])
  })

  it('every published item still resolves to the biography row its short came from', () => {
    // The mapping is by WHOLE LABEL, exactly as the migration made it. A
    // biography re-run that rewords a CV line breaks this before anyone notices
    // that the published credential is quoting text the report no longer has.
    const reports = JSON.parse(
      readFileSync(join(__dirname, '..', 'public', 'data', 'journalist-reports.json'), 'utf8'),
    )
    const poolsById = new Map(
      (reports.items || reports.reports || []).map((r: { id: string }) => [
        r.id,
        evidencePoolsFor(r),
      ]),
    )
    let checked = 0
    for (const row of snap.rows) {
      const pools = poolsById.get(row.reportId) as ReturnType<typeof evidencePoolsFor> | undefined
      for (const [field, pool] of [
        ['formacion', pools?.educationItems ?? []],
        ['experiencia', pools?.careerItems ?? []],
      ] as const) {
        for (const ev of row[field]?.evidence ?? []) {
          const hit = pool.find((p) => p.label === ev.label)
          expect(hit, `${row.officialSlug}/${row.portfolio}.${field}: «${ev.label}»`).toBeTruthy()
          expect(ev.short).toBe(hit!.short)
          checked += 1
        }
      }
    }
    expect(checked).toBeGreaterThan(0)
  })
})
