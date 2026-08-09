/**
 * A cross-checked document a reader cannot date.
 *
 * `f-2026-07-03-cit-1e90e0` documents a July 2026 debate about an emergency
 * waste contract; the first document under it WAS an emergency contract from
 * the November 2022 storms, about roads. Both facts were in the data — one of
 * them was not on screen. (That pairing has since been retracted from the
 * finding for a separate reason; the dating property it exposed is what these
 * tests keep.) Every scan below asserts it EVALUATED something: an index that
 * silently resolved nothing would satisfy "no wrong dates" perfectly.
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

  it('dates the 2022 storm contract to the storms, not to the debate citing it', () => {
    // The document this suite was written for. It used to be
    // `f-2026-07-03-cit-1e90e0`'s leading cotejo, and the finding read as if
    // a July 2026 debate about a waste contract were documented by a November
    // 2022 roads contract; the fix/hallazgos-lote-2 review retracted it from
    // that finding, because the summary had imported its wording («derrumbes y
    // muro de contención») and attributed it to a speaker.
    //
    // The property under test is `refDate`'s, not that finding's: a document
    // is dated by ITSELF, never by the session that cites it. So the ref is
    // built from the corpus row rather than read out of whichever finding
    // happens to cross-check it today — anchoring a unit property to one
    // curated row makes a legitimate retraction look like a regression, which
    // is exactly how this test failed.
    const row = [...tenders.tenders, ...tenders.contracts].find((r: { title?: string }) =>
      /contrato emergencia acondicionamiento de caminos/i.test(r.title ?? ''),
    ) as { title: string; permalink: string } | undefined
    expect(row, 'el expediente de 2022 ya no está en tenders.json').toBeTruthy()
    expect(row!.title).toMatch(/noviembre de 2022/)

    const ref: Ref = { kind: 'tender', ref: row!.permalink, snippet: row!.title }
    // Dated against a debate four years later: the date must be the
    // document's, and a reader must be able to see the gap.
    const d = refDate(ref, index, '2026-07-03')
    expect(d).toBeTruthy()
    expect(d!.iso < '2026-07-03').toBe(true)
    expect(Number(d!.iso.slice(0, 4))).toBeLessThanOrEqual(2023)
  })

  it('every finding still carries at least one document a reader can date', () => {
    // The corpus-level half, and the one a retraction pass could break for
    // real: taking a row out must not leave a finding whose «Documentos
    // cotejados» block is all blank dates.
    let checked = 0
    for (const f of items) {
      const refs = f.crossChecked ?? []
      if (refs.length === 0) continue
      checked += 1
      const dated = refs.filter((r) => refDate(r, index, f.plenoDate))
      expect(dated.length, `${f.id}: ningún cotejo fechable`).toBeGreaterThan(0)
    }
    expect(checked).toBeGreaterThan(40)
  })
})
