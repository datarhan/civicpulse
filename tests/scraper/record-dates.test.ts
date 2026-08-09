/**
 * The date half of a cross-reference: could the council have been discussing
 * this record at all?
 *
 * Every gate here is asserted in BOTH directions. A suite that only proves
 * post-dated records are dropped cannot tell a correct rule from one that drops
 * everything, and this repo has shipped that suite twice.
 */
import { describe, expect, it } from 'vitest'
import {
  FIRST_KNOWN_FIELDS,
  buildRecordDateIndex,
  emptyRecordDateGateReport,
  firstKnownDate,
  recordKnowableAt,
  summariseRecordDateGate,
} from '../../src/scraper/record-dates'

describe('firstKnownDate', () => {
  it('takes the earliest attested date on the row, not the award date', () => {
    // Real shape from tenders.json → contracts[].
    expect(
      firstKnownDate({
        awardDate: '2022-08-19',
        formalizedDate: '2022-09-01',
        startDate: '2022-08-01',
        endDate: '2022-12-01',
      }),
    ).toBe('2022-08-01')
  })

  it('reads the licitación fields too, minimum wins on an SDA', () => {
    // ESDA1/2025: the submission window closes in 2033, the process opened in
    // 2025. The 2033 value must not become the record's first-known date.
    expect(firstKnownDate({ submissionDate: '2033-08-08', openProposalsDate: '2025-08-08' })).toBe(
      '2025-08-08',
    )
  })

  it('accepts a TED notice timestamp and truncates it to the day', () => {
    expect(firstKnownDate({ publicationDate: '2026-01-01T00:00:00.000Z' })).toBe('2026-01-01')
  })

  it('never reads endDate — a contract still running was knowable long before it ends', () => {
    expect(FIRST_KNOWN_FIELDS).not.toContain('endDate')
    // The 4889055 award shape: no start, no formalisation, only award + end.
    expect(firstKnownDate({ awardDate: '2026-05-08', endDate: '2027-07-06' })).toBe('2026-05-08')
    // endDate alone leaves the row undatable rather than dated to its end.
    expect(firstKnownDate({ endDate: '2027-07-06' })).toBeNull()
  })

  it('returns null for an undatable or non-object row', () => {
    expect(firstKnownDate({ id: '4996875', status: 'unknown' })).toBeNull()
    expect(firstKnownDate(null)).toBeNull()
    expect(firstKnownDate('nope')).toBeNull()
  })
})

describe('buildRecordDateIndex', () => {
  it('merges rows sharing a ref by MINIMUM, so the licitación beats its award', () => {
    const index = buildRecordDateIndex([
      {
        contracts: [{ permalink: 'ref:A', awardDate: '2022-08-19' }],
        tenders: [{ permalink: 'ref:A', openProposalsDate: '2022-06-23' }],
      },
    ])
    expect(index.get('ref:A')).toBe('2022-06-23')
  })

  it('keeps a dated row when an undatable row shares the ref', () => {
    const index = buildRecordDateIndex([
      {
        contracts: [
          { permalink: 'ref:B', status: 'void' },
          { permalink: 'ref:B', awardDate: '2024-02-02' },
        ],
      },
    ])
    expect(index.get('ref:B')).toBe('2024-02-02')
  })

  it('indexes an undatable record as null — present but undated, not absent', () => {
    const index = buildRecordDateIndex([{ contracts: [{ permalink: 'ref:C', status: 'unknown' }] }])
    expect(index.has('ref:C')).toBe(true)
    expect(index.get('ref:C')).toBeNull()
  })

  it('indexes TED notices under htmlUrl and reads items[]', () => {
    const index = buildRecordDateIndex([
      { items: [{ htmlUrl: 'https://ted.europa.eu/x', publicationDate: '2026-01-01' }] },
    ])
    expect(index.get('https://ted.europa.eu/x')).toBe('2026-01-01')
  })

  it('survives a missing or malformed snapshot', () => {
    expect(buildRecordDateIndex([null, undefined, 42, { contracts: 'nope' }]).size).toBe(0)
  })
})

describe('recordKnowableAt', () => {
  const index = buildRecordDateIndex([
    {
      contracts: [
        // Awarded after the session, and nothing says the process was open.
        { permalink: 'ref:after', awardDate: '2026-02-02', endDate: '2026-10-14' },
        // Awarded after the session, but its licitación was already open: the
        // positive control a naive awardDate gate would throw away.
        { permalink: 'ref:live', awardDate: '2026-03-01' },
        { permalink: 'ref:undated', status: 'unknown' },
      ],
      tenders: [{ permalink: 'ref:live', openProposalsDate: '2026-01-05' }],
    },
  ])
  const session = '2026-01-19'

  it('excludes a record whose earliest date falls after the session', () => {
    const report = emptyRecordDateGateReport()
    expect(recordKnowableAt('ref:after', session, index, report)).toBe(false)
    expect(report.postDated).toEqual([
      { ref: 'ref:after', firstKnown: '2026-02-02', plenoDate: session },
    ])
    expect(report.kept).toBe(0)
  })

  it('KEEPS a record awarded later whose process was live at the session', () => {
    const report = emptyRecordDateGateReport()
    expect(recordKnowableAt('ref:live', session, index, report)).toBe(true)
    expect(report.postDated).toEqual([])
    // Not just "not dropped": the gate dated this one and passed it.
    expect(report.kept).toBe(1)
  })

  it('keeps what it cannot date, and says which kind of cannot', () => {
    const report = emptyRecordDateGateReport()
    expect(recordKnowableAt('ref:undated', session, index, report)).toBe(true)
    expect(recordKnowableAt('budget:2026:920', session, index, report)).toBe(true)
    expect(report.undated).toEqual(['ref:undated'])
    expect(report.unindexed).toEqual(['budget:2026:920'])
    // Neither counts as evaluated — folding them into `kept` is what turns a
    // run that gated nothing into a run that reports a clean pass.
    expect(report.kept).toBe(0)
  })

  it('keeps a same-day record — the session is inside the window, not after it', () => {
    expect(recordKnowableAt('ref:after', '2026-02-02', index)).toBe(true)
  })

  it('gates nothing when no index is supplied', () => {
    const report = emptyRecordDateGateReport()
    expect(recordKnowableAt('ref:after', session, undefined, report)).toBe(true)
    expect(report.unindexed).toEqual(['ref:after'])
  })
})

describe('summariseRecordDateGate', () => {
  it('names what was never evaluated, not only what passed', () => {
    const report = emptyRecordDateGateReport()
    recordKnowableAt('nowhere', '2026-01-19', new Map(), report)
    const line = summariseRecordDateGate(report)
    expect(line).toContain('0 dated & kept')
    expect(line).toContain('1 not in any procurement snapshot')
  })
})
