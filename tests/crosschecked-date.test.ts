/**
 * A cross-checked document a reader cannot date.
 *
 * `f-2026-07-03-cit-1e90e0` documents a July 2026 debate about an emergency
 * waste contract; the first document under it is an emergency contract from
 * the November 2022 storms, about roads. Both facts were in the data — one of
 * them was not on screen. These tests pin the resolution, and every scan below
 * asserts it EVALUATED something: an index that silently resolved nothing
 * would satisfy "no wrong dates" perfectly.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { buildRefDateIndex, refDate } from '../src/lib/crosschecked-date.js'

const DATA = resolve(__dirname, '..', 'public', 'data')
const tenders = JSON.parse(readFileSync(join(DATA, 'tenders.json'), 'utf8'))
const findings = JSON.parse(readFileSync(join(DATA, 'pleno-findings.json'), 'utf8'))

type Ref = { kind: string; ref: string; snippet: string }
type Finding = { id: string; plenoDate: string; crossChecked?: Ref[] }
const items: Finding[] = findings.items

describe('buildRefDateIndex', () => {
  const index = buildRefDateIndex(tenders)

  it('indexes the real snapshot, and mostly with dates', () => {
    // Positive control. Without it every assertion below is vacuous.
    expect(index.size).toBeGreaterThan(400)
    const dated = [...index.values()].filter(Boolean)
    expect(dated.length).toBeGreaterThan(index.size * 0.8)
  })

  it('prefers the contract row when a permalink is in both arrays', () => {
    const contractLinks = new Set(
      (tenders.contracts as { permalink?: string }[]).map((c) => c.permalink),
    )
    const shared = (tenders.tenders as { permalink?: string }[]).filter(
      (t) => t.permalink && contractLinks.has(t.permalink),
    )
    // The overlap is the whole reason precedence matters — assert it exists.
    expect(shared.length).toBeGreaterThan(100)

    const withAward = (tenders.contracts as { permalink?: string; awardDate?: string }[]).find(
      (c) => c.permalink && c.awardDate && shared.some((t) => t.permalink === c.permalink),
    )
    expect(withAward).toBeTruthy()
    expect(index.get(withAward!.permalink!)).toEqual({
      iso: withAward!.awardDate,
      field: 'award',
    })
  })

  it('never reports a field it did not read the date from', () => {
    const byLink = new Map<string, Record<string, unknown>[]>()
    for (const r of [...tenders.tenders, ...tenders.contracts]) {
      if (!r.permalink) continue
      const b = byLink.get(r.permalink)
      if (b) b.push(r)
      else byLink.set(r.permalink, [r])
    }
    const FIELD_KEY: Record<string, string> = {
      award: 'awardDate',
      formalized: 'formalizedDate',
      start: 'startDate',
      opened: 'openProposalsDate',
      submission: 'submissionDate',
    }
    let checked = 0
    for (const [link, d] of index) {
      if (!d) continue
      checked += 1
      // The reported date is a real value of the reported field, on some row
      // of this expediente — not a value borrowed from a neighbouring field.
      const values = (byLink.get(link) ?? []).map((r) => r[FIELD_KEY[d.field]])
      expect(values).toContain(d.iso)
    }
    expect(checked).toBeGreaterThan(300)
  })

  it('never offers endDate as the document’s date', () => {
    // endDate says when a contract FINISHES and is routinely in the future;
    // printed as "when this document is from" it would be worse than nothing.
    const byLink = new Map<string, Record<string, string | undefined>[]>()
    for (const c of tenders.contracts as Record<string, string | undefined>[]) {
      if (!c.permalink) continue
      const b = byLink.get(c.permalink)
      if (b) b.push(c)
      else byLink.set(c.permalink, [c])
    }
    const endOnly = [...byLink.entries()].filter(
      ([link, rows]) =>
        !tenders.tenders.some((t: { permalink?: string }) => t.permalink === link) &&
        rows.some((c) => c.endDate) &&
        rows.every((c) => !c.awardDate && !c.formalizedDate && !c.startDate),
    )
    expect(endOnly.length).toBeGreaterThan(0) // the case exists in real data
    for (const [link] of endOnly) expect(index.get(link)).toBeNull()
  })

  it('takes the strongest field any lot carries, at its earliest value', () => {
    // 66 permalinks are several rows (one per lot). Without this the answer
    // depends on array order: the last lot written wins, and a lot with no
    // award date would erase an award date the expediente does publish.
    const multi = new Map<string, Record<string, string | undefined>[]>()
    for (const c of tenders.contracts as Record<string, string | undefined>[]) {
      if (!c.permalink) continue
      const b = multi.get(c.permalink)
      if (b) b.push(c)
      else multi.set(c.permalink, [c])
    }
    const mixed = [...multi.entries()].filter(
      ([, rows]) =>
        rows.length > 1 && rows.some((r) => r.awardDate) && rows.some((r) => !r.awardDate),
    )
    expect(mixed.length).toBeGreaterThan(0)
    for (const [link, rows] of mixed) {
      const earliest = rows
        .map((r) => r.awardDate)
        .filter((v): v is string => Boolean(v))
        .sort()[0]
      expect(index.get(link)).toEqual({ iso: earliest, field: 'award' })
    }
  })

  it('tolerates a missing or malformed snapshot', () => {
    expect(buildRefDateIndex(null).size).toBe(0)
    expect(buildRefDateIndex({}).size).toBe(0)
    expect(buildRefDateIndex({ contracts: [{}], tenders: [{}] }).size).toBe(0)
  })
})

describe('refDate — the three outcomes stay distinct', () => {
  const index = buildRefDateIndex(tenders)

  it('returns undefined while nothing has resolved the ref', () => {
    // "not looked up yet" must not render as "publishes no date".
    expect(refDate({ kind: 'tender', ref: 'https://x/1' }, new Map(), '2026-07-03')).toBeUndefined()
    expect(
      refDate({ kind: 'tender', ref: 'https://not-in-snapshot/1' }, index, null),
    ).toBeUndefined()
  })

  it('returns null for a document that publishes no usable date', () => {
    const undated = [...index.entries()].find(([, d]) => d === null)
    expect(undated).toBeTruthy()
    expect(refDate({ kind: 'tender', ref: undated![0] }, index, null)).toBeNull()
  })

  it('dates a pleno-video from the session, without the snapshot', () => {
    expect(
      refDate({ kind: 'pleno-video', ref: 'https://youtu.be/x' }, new Map(), '2026-07-03'),
    ).toEqual({ iso: '2026-07-03', field: 'session' })
    expect(
      refDate({ kind: 'pleno-video', ref: 'https://youtu.be/x' }, new Map(), 'julio'),
    ).toBeUndefined()
  })
})

describe('the published findings resolve', () => {
  const index = buildRefDateIndex(tenders)

  it('dates almost every cross-checked ref actually published', () => {
    let total = 0
    let dated = 0
    let unresolved = 0
    for (const f of items) {
      for (const r of f.crossChecked ?? []) {
        total += 1
        const d = refDate(r, index, f.plenoDate)
        if (d) dated += 1
        else if (d === undefined) unresolved += 1
      }
    }
    // Positive control: there are refs, of both kinds.
    expect(total).toBeGreaterThan(100)
    // Every ref must at least be FOUND — an unresolved one renders blank, and
    // a blank date on a four-year-old document is the defect this fixes.
    expect(unresolved).toBe(0)
    expect(dated / total).toBeGreaterThan(0.9)
  })

  it('dates the FCC finding’s leading document to the 2022 storms, not the debate', () => {
    const f = items.find((x) => x.id === 'f-2026-07-03-cit-1e90e0')
    expect(f).toBeTruthy()
    expect(f!.plenoDate).toBe('2026-07-03')
    const lead = f!.crossChecked![0]
    expect(lead.snippet).toMatch(/contrato emergencia acondicionamiento de caminos/)

    const d = refDate(lead, index, f!.plenoDate)
    expect(d).toBeTruthy()
    // The whole point: the document predates the debate it sits under, and by
    // enough that a reader must be able to see it.
    expect(d!.iso < f!.plenoDate).toBe(true)
    expect(Number(d!.iso.slice(0, 4))).toBeLessThanOrEqual(2023)
  })
})
