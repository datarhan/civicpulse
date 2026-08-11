import { describe, it, expect } from 'vitest'
import {
  RETRACTION_REASON_MIN,
  findingTombstone,
  isRetracted,
  retractFinding,
  validateFindingRetraction,
  type FindingRetraction,
} from '../src/scraper/finding-retraction'
import type { PlenoFinding, PlenoFindingsSnapshot } from '../src/scraper/pleno-finding'

/**
 * The prose a retraction exists to unpublish. Every assertion about leakage
 * checks for these exact strings, so they are deliberately distinctive.
 */
const ACCUSATION = 'también tiene una responsabilidad política el equipo de gobierno'
const SUMMARY = `El PSOE sostiene que ${ACCUSATION}, sin que ningún registro lo respalde.`
const TITLE = 'Debate sobre responsabilidad política en el pleno'

const finding = (over: Partial<PlenoFinding> = {}): PlenoFinding =>
  ({
    id: 'f-1',
    plenoId: 'p-2025-12-23',
    plenoDate: '2025-12-23',
    title: TITLE,
    summary: SUMMARY,
    severity: 'informational',
    sourceClaimIds: ['c-1'],
    quotes: [{ text: ACCUSATION, speakerGroup: 'PSOE', sourceClaimId: 'c-1' }],
    crossChecked: [],
    contradiction: [],
    relatedPromiseIds: [],
    curatorName: 'auto-curation-v1',
    publishedAt: '2025-12-24T00:00:00.000Z',
    ...over,
  }) as PlenoFinding

const snapshot = (items: PlenoFinding[]): PlenoFindingsSnapshot => ({
  version: '1',
  generatedAt: '2026-08-11T00:00:00.000Z',
  legalNotice: 'x',
  contactUrl: 'https://example.org/contacto',
  methodologyUrl: 'https://example.org/metodologia',
  items,
})

const args = {
  findingId: 'f-1',
  reason: 'ninguna de sus citas es publicable tras la puerta editorial',
  editor: 'Alguien Real',
  retractedAt: '2026-08-11T10:00:00.000Z',
}

describe('retractFinding', () => {
  it('removes the finding from items so it stops being published and counted', () => {
    const next = retractFinding(snapshot([finding(), finding({ id: 'f-2' })]), args)
    expect(next.items.map((f) => f.id)).toEqual(['f-2'])
  })

  it('records the withdrawal in the ledger', () => {
    const next = retractFinding(snapshot([finding()]), args)
    expect(next.retractions).toHaveLength(1)
    expect(next.retractions?.[0]).toMatchObject({
      findingId: 'f-1',
      editor: 'Alguien Real',
      severity: 'informational',
      plenoId: 'p-2025-12-23',
      quoteCount: 1,
    })
  })

  /**
   * THE property this module exists for, and the one place it diverges from
   * `retract-pleno-vote`. That CLI tombstones `original` verbatim, which is
   * right for a vote tally: republishing a withdrawn tally is auditable and
   * harms nobody. These findings are retracted precisely BECAUSE the editorial
   * gate withholds every quote in them — an unverifiable accusation about a
   * named political group. A tombstone carrying the prose would republish the
   * accusation at a stable URL under `public/`, which is the exact publication
   * the retraction removes.
   *
   * So the ledger stores a digest and counts. Not "hard to read" — absent.
   */
  it('leaks NO prose from the withdrawn finding into the ledger', () => {
    const next = retractFinding(snapshot([finding()]), args)
    const serialised = JSON.stringify(next)
    expect(serialised).not.toContain(ACCUSATION)
    expect(serialised).not.toContain(SUMMARY)
    expect(serialised).not.toContain(TITLE)
  })

  it('digests title and summary distinctly, so a tombstone is verifiable', () => {
    const a = findingTombstone(finding())
    const b = findingTombstone(finding({ summary: `El PSOE sostiene otra cosa distinta.` }))
    expect(a).not.toBe(b)
    expect(a).toMatch(/^hallazgo · sha256:[0-9a-f]{12}$/)
  })

  it('refuses an id that is not published', () => {
    expect(() => retractFinding(snapshot([finding()]), { ...args, findingId: 'f-nope' })).toThrow(
      /no published finding/i,
    )
  })

  it.each([
    ['too short', 'motivo corto'],
    ['whitespace padded to length', '                              '],
  ])('refuses a reason %s', (_label, reason) => {
    expect(() => retractFinding(snapshot([finding()]), { ...args, reason })).toThrow(
      new RegExp(`${RETRACTION_REASON_MIN}`),
    )
  })

  /**
   * The reason publishes beside the tombstone. A reason that quotes what was
   * withdrawn re-publishes it — the same trap `curatorNotes` fell into on
   * 31-07-2026, where notes explaining an exclusion named the excluded thing.
   */
  it('refuses a reason that quotes the withdrawn prose', () => {
    expect(() =>
      retractFinding(snapshot([finding()]), {
        ...args,
        reason: `retirado porque decía «${ACCUSATION}» sin prueba`,
      }),
    ).toThrow(/echoes|reproduce/i)
  })

  it('refuses to retract the same finding twice', () => {
    const once = retractFinding(snapshot([finding()]), args)
    expect(() => retractFinding(once, args)).toThrow(/no published finding/i)
  })

  it('keeps retractions from earlier withdrawals', () => {
    const once = retractFinding(snapshot([finding(), finding({ id: 'f-2' })]), args)
    const twice = retractFinding(once, { ...args, findingId: 'f-2' })
    expect(twice.retractions?.map((r) => r.findingId)).toEqual(['f-1', 'f-2'])
    expect(twice.items).toEqual([])
  })

  it('does not mutate the snapshot it was given', () => {
    const before = snapshot([finding()])
    retractFinding(before, args)
    expect(before.items).toHaveLength(1)
    expect(before.retractions).toBeUndefined()
  })
})

describe('isRetracted', () => {
  it('is true for an id in the ledger', () => {
    const next = retractFinding(snapshot([finding()]), args)
    expect(isRetracted(next, 'f-1')).toBe(true)
  })

  it.each([
    ['an id never retracted', snapshot([finding()]), 'f-1'],
    ['a snapshot with no ledger', snapshot([]), 'f-1'],
  ])('is false for %s', (_l, snap, id) => {
    expect(isRetracted(snap, id)).toBe(false)
  })
})

describe('validateFindingRetraction', () => {
  const valid = (): FindingRetraction => retractFinding(snapshot([finding()]), args).retractions![0]

  it('accepts what retractFinding produces', () => {
    expect(() => validateFindingRetraction(valid(), 0)).not.toThrow()
  })

  /**
   * The validator is the gate a hand-edited file passes through. Its job here
   * is to catch a tombstone that carries prose — someone "helpfully" restoring
   * readability defeats the whole design, and would do it in a file Vercel
   * serves.
   */
  it('rejects a digest that is not a digest', () => {
    expect(() => validateFindingRetraction({ ...valid(), digest: SUMMARY }, 0)).toThrow(/digest/i)
  })

  it.each([
    ['findingId', { findingId: '' }],
    ['editor', { editor: '' }],
    ['retractedAt', { retractedAt: 'ayer' }],
    ['severity', { severity: 'catastrophic' }],
    ['quoteCount', { quoteCount: -1 }],
  ])('rejects a bad %s', (field, over) => {
    expect(() => validateFindingRetraction({ ...valid(), ...over }, 0)).toThrow(
      new RegExp(field, 'i'),
    )
  })

  it.each([
    ['null', null],
    ['a string', 'f-1'],
  ])('rejects %s outright', (_l, r) => {
    expect(() => validateFindingRetraction(r, 0)).toThrow()
  })
})
