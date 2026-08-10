import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  acceptedBaseline,
  baselineAcceptedAt,
  baselineIncomparable,
  baselineRows,
  BASELINE_VERSION,
  compareCorpus,
  corpusDeltaBlocks,
  driftDefinitionId,
  driftKey,
  healedBaseline,
  runMeasuredNothing,
  type DriftedQuote,
} from '../src/scraper/corpus-baseline'

const q = (findingId: string, quote: string): DriftedQuote => ({ findingId, quote })

describe('corpus-baseline — the delta is the point', () => {
  // "30 untraceable" reads the same whether it is yesterday's 30 or a fresh 30
  // the run just created. Only the second needs a human.
  it('separates what this run broke from what was already accepted', () => {
    const before = [q('f-1', 'el presupuesto asciende a'), q('f-2', 'la obra está adjudicada')]
    const now = [q('f-2', 'la obra está adjudicada'), q('f-3', 'no consta en el expediente')]
    const d = compareCorpus(now, before)
    expect(d.appeared).toEqual([driftKey(q('f-3', 'no consta en el expediente'))])
    expect(d.carried).toEqual([driftKey(q('f-2', 'la obra está adjudicada'))])
    expect(d.healed).toEqual([driftKey(q('f-1', 'el presupuesto asciende a'))])
  })

  it('blocks on appeared only', () => {
    expect(corpusDeltaBlocks({ carried: ['a'], appeared: [], healed: ['b'] })).toBe(false)
    expect(corpusDeltaBlocks({ carried: [], appeared: ['c'], healed: [] })).toBe(true)
  })

  it('does not block when a hundred quotes carried over unchanged', () => {
    // The failure mode of a totals-based check: permanently red, therefore
    // permanently ignored.
    const many = Array.from({ length: 100 }, (_, i) => q(`f-${i}`, `cita ${i}`))
    expect(corpusDeltaBlocks(compareCorpus(many, many))).toBe(false)
  })

  it('an empty run against an empty baseline is quiet, not an error', () => {
    const d = compareCorpus([], [])
    expect(d).toEqual({ carried: [], appeared: [], healed: [] })
    expect(corpusDeltaBlocks(d)).toBe(false)
  })

  it('survives a missing drifted array on either side', () => {
    expect(() =>
      compareCorpus(undefined as unknown as DriftedQuote[], null as unknown as DriftedQuote[]),
    ).not.toThrow()
  })
})

describe('corpus-baseline — the key must not churn', () => {
  // A key that changes on cosmetic edits turns every re-transcription into a
  // wall of false "appeared", and a check nobody believes is a check nobody runs.
  it('two quotes in the same finding are distinct', () => {
    expect(driftKey(q('f-1', 'primera cita'))).not.toBe(driftKey(q('f-1', 'segunda cita')))
  })

  it('the same quote in two findings is distinct', () => {
    expect(driftKey(q('f-1', 'misma cita'))).not.toBe(driftKey(q('f-2', 'misma cita')))
  })

  it('a change past the 60th character does NOT count as a new drift', () => {
    const head = 'a'.repeat(60)
    expect(driftKey(q('f-1', `${head} cola vieja`))).toBe(driftKey(q('f-1', `${head} cola nueva`)))
  })

  it('a change inside the first 60 characters DOES', () => {
    expect(driftKey(q('f-1', 'el presupuesto sube'))).not.toBe(
      driftKey(q('f-1', 'el presupuesto baja')),
    )
  })

  it('tolerates a quote that is missing entirely', () => {
    expect(() => driftKey({ findingId: 'f-1' } as DriftedQuote)).not.toThrow()
  })
})

describe('corpus-baseline — a recovery is retired, not re-announced', () => {
  // The defect: `healed` was printed and thrown away, so the same 30 rows were
  // reported as newly recovered on every single run, for ever.
  it('drops the healed rows so the next run has nothing to announce', () => {
    const before = [q('f-1', 'ya rastreable'), q('f-2', 'sigue sin rastro')]
    const now = [q('f-2', 'sigue sin rastro')]
    const next = healedBaseline(now, before, '2026-08-10T00:00:00.000Z')

    expect(next.drifted.map(driftKey)).toEqual([driftKey(q('f-2', 'sigue sin rastro'))])
    // The whole point: run it again against the written-back file and the
    // recovery is old news, not news.
    expect(compareCorpus(now, next.drifted).healed).toEqual([])
  })

  it('never grows on its own — a new drift is not accepted by healing', () => {
    // Shrinking tightens the gate; growing would silently swallow a drift
    // nobody looked at, and that stays behind `--baseline`.
    const before = [q('f-1', 'ya rastreable')]
    const now = [q('f-9', 'rota en esta pasada')]
    const next = healedBaseline(now, before, '2026-08-10T00:00:00.000Z')

    expect(next.drifted).toEqual([])
    const after = compareCorpus(now, next.drifted)
    expect(after.appeared).toEqual([driftKey(q('f-9', 'rota en esta pasada'))])
    expect(corpusDeltaBlocks(after)).toBe(true)
  })

  it('a retired row that breaks again comes back as appeared, not carried', () => {
    const healedFile = healedBaseline([], [q('f-1', 'ida y vuelta')], '2026-08-10T00:00:00.000Z')
    const relapse = compareCorpus([q('f-1', 'ida y vuelta')], healedFile.drifted)
    expect(relapse.appeared).toHaveLength(1)
    expect(relapse.carried).toEqual([])
    expect(corpusDeltaBlocks(relapse)).toBe(true)
  })

  it('stamps every write with the file version, the definition and the instant', () => {
    for (const f of [
      healedBaseline([], [], '2026-08-10T00:00:00.000Z'),
      acceptedBaseline([q('f-1', 'x')], '2026-08-10T00:00:00.000Z'),
    ]) {
      expect(f.version).toBe(BASELINE_VERSION)
      expect(f.definition).toBe(driftDefinitionId())
      expect(f.acceptedAt).toBe('2026-08-10T00:00:00.000Z')
      // Written back by the same functions the check reads with.
      expect(baselineIncomparable(f)).toBeNull()
    }
  })
})

describe('corpus-baseline — a definition that moved is not a delta', () => {
  // The 22 phantom recoveries: `drifted` used to mean «absent from the current
  // transcript» and now means «absent from both». Rows written under the first
  // meaning subtract from rows built under the second to a number that
  // describes neither, and the file said nothing about which one wrote it.
  it('refuses a baseline written before the definition was stamped', () => {
    const why = baselineIncomparable({ drifted: [q('f-1', 'a')] })
    expect(why).toMatch(/sin sello de definición/)
  })

  it('refuses a baseline stamped with another definition', () => {
    const why = baselineIncomparable({
      version: BASELINE_VERSION,
      definition: 'finding-quote-provenance-v1:en-vigente',
      acceptedAt: '2026-08-02T00:00:00.000Z',
      drifted: [],
    })
    expect(why).toMatch(/finding-quote-provenance-v1/)
    expect(why).toContain(driftDefinitionId())
  })

  it('accepts one stamped with the current definition', () => {
    expect(baselineIncomparable(acceptedBaseline([], '2026-08-10T00:00:00.000Z'))).toBeNull()
  })

  it('the stamp moves when the classifier gains a state', () => {
    // Derived, not a constant someone has to remember to bump — the bump that
    // was missed is why this exists. A fourth provenance state must change it.
    expect(driftDefinitionId()).toContain('finding-quote-provenance-v2')
    expect(driftDefinitionId()).toContain('solo-en-sustituida')
    expect(driftDefinitionId()).toContain('sin-determinar')
  })

  it('refuses garbage without throwing', () => {
    expect(baselineIncomparable(null)).toBeTruthy()
    expect(baselineIncomparable('{}')).toBeTruthy()
    expect(baselineIncomparable({ version: BASELINE_VERSION })).toMatch(/`drifted`/)
    expect(baselineRows(null)).toEqual([])
    expect(baselineAcceptedAt(null)).toBe('')
  })
})

describe('corpus-baseline — the run has to have measured something', () => {
  // `r?.findings ?? []` again: an empty `drifted` because the pass fell over is
  // indistinguishable from an empty one because nothing is broken, and
  // subtracted from a populated baseline the first prints a wall of recoveries
  // that never happened.
  it('refuses a run that cotejó no quotes at all', () => {
    expect(runMeasuredNothing({ checked: 0 })).toMatch(/ni una cita/)
    expect(runMeasuredNothing({})).toMatch(/ni una cita/)
    expect(runMeasuredNothing({ checked: Number.NaN })).toMatch(/ni una cita/)
  })

  it('refuses a run that declared itself unreliable', () => {
    // `sanity` is check:finding-quotes' own verdict on its own pass. Re-used,
    // not re-derived: one thing decides whether a pass is believable.
    const why = runMeasuredNothing({ checked: 177, sanity: 'no se leyó un solo byte' })
    expect(why).toMatch(/no fiable/)
    expect(why).toContain('no se leyó un solo byte')
  })

  it('lets a real run through', () => {
    expect(runMeasuredNothing({ checked: 177, sanity: null })).toBeNull()
  })

  it('an empty run against a populated baseline would have claimed 30 recoveries', () => {
    // The exact failure this gate stands in front of, spelled out.
    const baseline = Array.from({ length: 30 }, (_, i) => q(`f-${i}`, `cita ${i}`))
    expect(compareCorpus([], baseline).healed).toHaveLength(30)
    expect(runMeasuredNothing({ checked: 0 })).toBeTruthy()
  })
})

describe('.transcript-check-baseline.json — the file actually on disk', () => {
  // Asserting on the REAL committed baseline, not a fixture of one: the defect
  // was a property of that file, and a fixture restating its shape is how six
  // tests in this repo stayed green while production matched nothing
  // (docs/DATA_INTEGRITY.md rule 1).
  const raw = JSON.parse(
    readFileSync(resolve(__dirname, '../.transcript-check-baseline.json'), 'utf8'),
  ) as Record<string, unknown>

  it('is comparable against the classifier that ships today', () => {
    expect(baselineIncomparable(raw)).toBeNull()
  })

  it('says when it was accepted', () => {
    expect(baselineAcceptedAt(raw)).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it('reports no change and no recovery against itself', () => {
    // The regression: this file held 30 rows and the run found 0, so every run
    // announced 30 recoveries. Against its own contents the honest answer is
    // silence.
    const delta = compareCorpus(baselineRows(raw), baselineRows(raw))
    expect(delta.healed).toEqual([])
    expect(delta.appeared).toEqual([])
    expect(corpusDeltaBlocks(delta)).toBe(false)
  })

  it('holds no row that today’s classifier already files as a published state', () => {
    // 22 of the original 30 are `solo-en-sustituida` today — a published state
    // with its own marker and its own queue, not a loss of trace. A row that
    // sits in both registers is the mis-filing that produced the phantom
    // recoveries, so `misfiled` must be empty.
    const provenance = JSON.parse(
      readFileSync(resolve(__dirname, '../public/data/finding-quote-provenance.json'), 'utf8'),
    ) as { quotes?: Record<string, Array<{ status: string }>> }
    const published = provenance.quotes ?? {}
    const misfiled = (rows: DriftedQuote[]) =>
      rows.filter((r) => (published[r.findingId] ?? []).length > 0)

    // The gate MEASURED something: a real snapshot with real classified rows,
    // not `{}` — against which every row would trivially look well filed.
    const classifiedRows = Object.values(published).flat()
    expect(classifiedRows.length).toBeGreaterThan(100)
    expect(classifiedRows.some((r) => r.status === 'solo-en-sustituida')).toBe(true)

    // Positive control: a row of the kind the old baseline carried IS caught.
    const [someFindingId] = Object.keys(published)
    expect(misfiled([{ findingId: someFindingId, quote: 'lo que fuera' }])).toHaveLength(1)

    expect(misfiled(baselineRows(raw))).toEqual([])
  })
})
