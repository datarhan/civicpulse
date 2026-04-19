import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  validatePromisesSnapshot,
  ALLOWED_PARTIES,
  ALLOWED_STATUSES,
  type PromisesSnapshot,
} from '../src/scraper/promises'

const SNAPSHOT = join(__dirname, '..', 'public', 'data', 'promises.json')

describe('scraper/promises — validatePromisesSnapshot', () => {
  let snap: PromisesSnapshot

  beforeAll(() => {
    snap = validatePromisesSnapshot(readFileSync(SNAPSHOT, 'utf8'))
  })

  it('snapshot has required metadata (version, legalNotice, frozenUntil)', () => {
    expect(snap.version).toMatch(/^\d+\./)
    expect(snap.legalNotice.length).toBeGreaterThan(80)
    // frozenUntil is either null (normal) or an ISO date (electoral freeze)
    expect(snap.frozenUntil === null || /^\d{4}-\d{2}-\d{2}/.test(snap.frozenUntil)).toBe(true)
  })

  it('every promise has the mandatory invariants (party + title + verbatim quote + source URL + made-at date)', () => {
    expect(snap.items.length).toBeGreaterThanOrEqual(10)
    for (const p of snap.items) {
      expect(ALLOWED_PARTIES).toContain(p.party)
      expect(p.title.length).toBeGreaterThan(3)
      expect(p.title.length).toBeLessThan(200)
      expect(p.quote.length).toBeGreaterThanOrEqual(20)
      expect(p.source.url).toMatch(/^https?:\/\//)
      expect(p.source.publisher.length).toBeGreaterThan(1)
      expect(p.madeAt).toMatch(/^\d{4}-\d{2}-\d{2}/)
      expect(p.id.length).toBeGreaterThan(2)
    }
  })

  it('statuses are constrained to the conservative V1 set only (documentada | en-verificacion)', () => {
    const v1 = new Set(['documentada', 'en-verificacion'])
    for (const p of snap.items) {
      expect(v1.has(p.status)).toBe(true)
    }
    // Also guard the enum itself from accidental widening.
    expect(ALLOWED_STATUSES).toEqual(
      expect.arrayContaining([
        'documentada',
        'en-verificacion',
        'en-progreso',
        'cumplida',
        'parcial',
        'no-ejecutada',
        'inviable',
      ])
    )
  })

  it('every status beyond the V1 safe set carries evidence (legal invariant)', () => {
    // V1 legal safe set: documentada + en-verificacion may publish without
    // evidence; everything else must have ≥1 dated, URL-backed evidence row.
    const safe = new Set(['documentada', 'en-verificacion'])
    for (const p of snap.items) {
      if (!safe.has(p.status)) {
        expect(p.evidence.length).toBeGreaterThanOrEqual(1)
      }
      for (const e of p.evidence) {
        expect(e.url).toMatch(/^https?:\/\//)
        expect(e.date).toMatch(/^\d{4}-\d{2}-\d{2}/)
        expect(e.quote.length).toBeGreaterThan(10)
      }
    }
  })

  it('every promise id is unique', () => {
    const ids = snap.items.map((p) => p.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('includes at least one promise for the governing party (PSOE)', () => {
    const psoe = snap.items.filter((p) => p.party === 'PSOE')
    expect(psoe.length).toBeGreaterThanOrEqual(5)
  })

  it('rejects a snapshot whose record lacks a verbatim quote (legal invariant)', () => {
    const base = {
      version: '1.0',
      generatedAt: '2026-04-20',
      frozenUntil: null,
      legalNotice: 'x'.repeat(100),
      contactUrl: 'https://x.test/issues',
      methodologyUrl: '/metodologia',
    }
    const bad = {
      ...base,
      items: [
        {
          id: 'bad-1',
          party: 'PSOE',
          title: 'Sin cita',
          quote: '', // VIOLATION
          source: { url: 'https://x.test', publisher: 'Test' },
          madeAt: '2025-06-01',
          topic: 'fiscal',
          kind: 'anuncio-gobierno',
          status: 'documentada',
          evidence: [],
          createdAt: '2025-06-01',
        },
      ],
    }
    expect(() => validatePromisesSnapshot(JSON.stringify(bad))).toThrow(/quote/)
  })

  it('rejects a non-safe-V1 status without any evidence entries', () => {
    const base = {
      version: '1.0',
      generatedAt: '2026-04-20',
      frozenUntil: null,
      legalNotice: 'x'.repeat(100),
      contactUrl: 'https://x.test/issues',
      methodologyUrl: '/metodologia',
    }
    const bad = {
      ...base,
      items: [
        {
          id: 'bad-2',
          party: 'PP',
          title: 'Accusatory without evidence',
          quote: 'A verbatim quote that is at least twenty characters long.',
          source: { url: 'https://x.test', publisher: 'Test' },
          madeAt: '2025-06-01',
          topic: 'fiscal',
          kind: 'programa-electoral',
          status: 'no-ejecutada', // VIOLATION — requires ≥1 evidence entry
          evidence: [],
          createdAt: '2025-06-01',
        },
      ],
    }
    expect(() => validatePromisesSnapshot(JSON.stringify(bad))).toThrow(/evidence/)
  })
})
