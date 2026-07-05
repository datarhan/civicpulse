import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseRibalicitaContracts, parseRibalicitaTenders } from '../src/scraper/tenders'

const CONTRACTS_CSV = join(__dirname, 'fixtures', 'ribalicita_contratos_2026-04-19.csv')
const TENDERS_CSV = join(__dirname, 'fixtures', 'ribalicita_licitaciones_2026-04-19.csv')

describe('scraper/tenders — parseRibalicitaContracts', () => {
  let contracts: ReturnType<typeof parseRibalicitaContracts>

  beforeAll(() => {
    contracts = parseRibalicitaContracts(readFileSync(CONTRACTS_CSV, 'utf8'))
  })

  it('parses the full municipal contracts CSV (>= 700 rows)', () => {
    expect(contracts.length).toBeGreaterThanOrEqual(700)
  })

  it('every contract has a non-empty title and a finite amount', () => {
    for (const c of contracts) {
      expect(c.title.length).toBeGreaterThan(3)
      expect(Number.isFinite(c.initialAmount)).toBe(true)
      expect(c.initialAmount).toBeGreaterThanOrEqual(0)
    }
  })

  it('every contract has a permalink pointing to PLACSP', () => {
    const withLink = contracts.filter((c) => c.permalink)
    // At least 90% of contracts have the PLACSP deeplink
    expect(withLink.length / contracts.length).toBeGreaterThanOrEqual(0.9)
    for (const c of withLink) {
      expect(c.permalink).toMatch(/contrataciondelestado\.es/)
    }
  })

  it('status is one of the known enum values', () => {
    const allowed = new Set([
      'awarded',
      'revoked',
      'in_progress',
      'open',
      'finalized',
      'draft',
      'pending',
      'closed',
      'unknown',
    ])
    for (const c of contracts) {
      expect(allowed.has(c.status)).toBe(true)
    }
  })

  it('produces a stable slug and unique id per contract', () => {
    const ids = contracts.map((c) => c.id).filter(Boolean)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('returns at least some awarded contracts with a non-zero final amount', () => {
    const awarded = contracts.filter((c) => c.status === 'awarded' && c.finalAmount > 0)
    expect(awarded.length).toBeGreaterThan(100)
  })

  it('sum of final amounts across awarded contracts is > €1M (sanity)', () => {
    const awarded = contracts.filter((c) => c.status === 'awarded')
    const total = awarded.reduce((s, c) => s + (c.finalAmount || 0), 0)
    expect(total).toBeGreaterThan(1_000_000)
  })

  it('captures duration, estimatedValue and contractor metadata (Gobierto columns)', () => {
    for (const c of contracts) {
      expect(Number.isFinite(c.duration)).toBe(true)
      expect(c.duration).toBeGreaterThanOrEqual(0)
      expect(Number.isFinite(c.estimatedValue)).toBe(true)
      expect(c.estimatedValue).toBeGreaterThanOrEqual(0)
      // contractorType/contractorId/categoryId are nullable strings
      expect(c.contractorType === null || typeof c.contractorType === 'string').toBe(true)
      expect(c.contractorId === null || typeof c.contractorId === 'string').toBe(true)
    }
    // The fixture populates these broadly.
    expect(contracts.filter((c) => c.duration > 0).length).toBeGreaterThan(100)
    expect(contracts.filter((c) => c.estimatedValue > 0).length).toBeGreaterThan(100)
    expect(contracts.filter((c) => c.contractorType).length).toBeGreaterThan(100)
  })

  it('assignee is the awardee (a company), distinct from the buyer/contractor', () => {
    // Gobierto schema: `assignee` = winning firm; `contractor` = contracting
    // body (usually the Ayuntamiento). The card reads adjudicatario from
    // assignee, so pin the semantics here.
    const withBoth = contracts.filter((c) => c.assignee && c.contractor)
    expect(withBoth.length).toBeGreaterThan(100)
    const ayuntamientoBuyers = withBoth.filter((c) =>
      /ayuntamiento|riba-?roja/i.test(c.contractor!),
    )
    expect(ayuntamientoBuyers.length / withBoth.length).toBeGreaterThan(0.5)
  })
})

describe('scraper/tenders — parseRibalicitaTenders', () => {
  let tenders: ReturnType<typeof parseRibalicitaTenders>

  beforeAll(() => {
    tenders = parseRibalicitaTenders(readFileSync(TENDERS_CSV, 'utf8'))
  })

  it('parses the full tenders CSV (>= 400 rows)', () => {
    expect(tenders.length).toBeGreaterThanOrEqual(400)
  })

  it('every tender has a title and a contract_value', () => {
    for (const t of tenders) {
      expect(t.title.length).toBeGreaterThan(3)
      expect(Number.isFinite(t.contractValue)).toBe(true)
    }
  })

  it('status enum is respected', () => {
    const allowed = new Set([
      'awarded',
      'open',
      'evaluation',
      'revoked',
      'finalized',
      'draft',
      'closed',
      'unknown',
      'withdrawn',
    ])
    for (const t of tenders) {
      expect(allowed.has(t.status)).toBe(true)
    }
  })

  it('sorts newest-first when sortByDateDesc', () => {
    // The adapter exposes tenders sorted newest-first by submission/open date.
    const withDate = tenders.filter((t) => t.submissionDate)
    if (withDate.length < 2) return
    for (let i = 0; i < withDate.length - 1; i++) {
      const a = new Date(withDate[i].submissionDate!).getTime()
      const b = new Date(withDate[i + 1].submissionDate!).getTime()
      expect(a).toBeGreaterThanOrEqual(b)
    }
  })
})
