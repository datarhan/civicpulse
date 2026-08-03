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

  it('any published status is a known enum value (V1 gate now governed by the evidence invariant below)', () => {
    for (const p of snap.items) {
      expect(ALLOWED_STATUSES).toContain(p.status)
    }
    // Guard the enum itself from accidental widening.
    expect(ALLOWED_STATUSES).toEqual(
      expect.arrayContaining([
        'documentada',
        'en-verificacion',
        'en-progreso',
        'cumplida',
        'parcial',
        'no-ejecutada',
        'inviable',
      ]),
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

  it('accepts optional dueBy + departmentSlug when provided', () => {
    const base = {
      version: '1.0',
      generatedAt: '2026-04-20',
      frozenUntil: null,
      legalNotice: 'x'.repeat(100),
      contactUrl: 'https://x.test/issues',
      methodologyUrl: '/metodologia',
    }
    const withOpt = {
      ...base,
      items: [
        {
          id: 'opt-1',
          party: 'PSOE',
          title: 'Compromiso con plazo',
          quote: 'A verbatim quote that is at least twenty characters long.',
          source: { url: 'https://x.test', publisher: 'Test' },
          madeAt: '2024-06-01',
          topic: 'vivienda',
          kind: 'programa-electoral',
          status: 'en-verificacion',
          evidence: [],
          createdAt: '2024-06-01',
          dueBy: '2026-12-31',
          departmentSlug: 'vivienda',
        },
      ],
    }
    const snap = validatePromisesSnapshot(JSON.stringify(withOpt))
    expect(snap.items[0].dueBy).toBe('2026-12-31')
    expect(snap.items[0].departmentSlug).toBe('vivienda')
  })

  it('rejects a dueBy that is not ISO YYYY-MM-DD', () => {
    const bad = {
      version: '1.0',
      generatedAt: '2026-04-20',
      frozenUntil: null,
      legalNotice: 'x'.repeat(100),
      contactUrl: 'https://x.test/issues',
      methodologyUrl: '/metodologia',
      items: [
        {
          id: 'bad-3',
          party: 'PSOE',
          title: 'Fecha inválida',
          quote: 'A verbatim quote that is at least twenty characters long.',
          source: { url: 'https://x.test', publisher: 'Test' },
          madeAt: '2024-06-01',
          topic: 'fiscal',
          kind: 'anuncio-gobierno',
          status: 'documentada',
          evidence: [],
          createdAt: '2024-06-01',
          dueBy: '31/12/2026',
        },
      ],
    }
    expect(() => validatePromisesSnapshot(JSON.stringify(bad))).toThrow(/dueBy/)
  })

  it('rejects a departmentSlug that is not kebab-case', () => {
    const bad = {
      version: '1.0',
      generatedAt: '2026-04-20',
      frozenUntil: null,
      legalNotice: 'x'.repeat(100),
      contactUrl: 'https://x.test/issues',
      methodologyUrl: '/metodologia',
      items: [
        {
          id: 'bad-4',
          party: 'PSOE',
          title: 'Slug inválido',
          quote: 'A verbatim quote that is at least twenty characters long.',
          source: { url: 'https://x.test', publisher: 'Test' },
          madeAt: '2024-06-01',
          topic: 'fiscal',
          kind: 'anuncio-gobierno',
          status: 'documentada',
          evidence: [],
          createdAt: '2024-06-01',
          departmentSlug: 'URBANISMO',
        },
      ],
    }
    expect(() => validatePromisesSnapshot(JSON.stringify(bad))).toThrow(/kebab/)
  })

  it('accepts an item carrying a valid autoPublished block', () => {
    const base = {
      version: '1.0',
      generatedAt: '2026-07-02',
      frozenUntil: null,
      legalNotice: 'x'.repeat(100),
      contactUrl: 'https://x.test/issues',
      methodologyUrl: '/metodologia',
    }
    const ok = {
      ...base,
      items: [
        {
          id: 'ac-psoe-carrilbici',
          party: 'PSOE',
          title: 'Carril bici en la Avenida del Camp de Túria',
          quote: 'Construiremos un carril bici en la Avenida del Camp de Túria antes de 2027.',
          source: { url: 'https://x.test/n', publisher: 'Levante-EMV' },
          madeAt: '2026-06-20',
          topic: 'movilidad',
          kind: 'anuncio-gobierno',
          status: 'documentada',
          evidence: [],
          createdAt: '2026-07-02',
          autoPublished: {
            at: '2026-07-02T06:00:00.000Z',
            by: 'auto-curation-v1',
            confidence: 0.83,
            reviewState: 'pending-review',
          },
        },
      ],
    }
    const snap = validatePromisesSnapshot(JSON.stringify(ok))
    expect(snap.items[0].autoPublished?.reviewState).toBe('pending-review')
  })

  it('rejects an autoPublished block with a bad reviewState', () => {
    const base = {
      version: '1.0',
      generatedAt: '2026-07-02',
      frozenUntil: null,
      legalNotice: 'x'.repeat(100),
      contactUrl: 'https://x.test/issues',
      methodologyUrl: '/metodologia',
    }
    const bad = {
      ...base,
      items: [
        {
          id: 'ac-bad',
          party: 'PP',
          title: 'Algo',
          quote: 'Una cita verbatim con longitud suficiente para el validador.',
          source: { url: 'https://x.test/n', publisher: 'X' },
          madeAt: '2026-06-20',
          topic: 'fiscal',
          kind: 'anuncio-gobierno',
          status: 'documentada',
          evidence: [],
          createdAt: '2026-07-02',
          autoPublished: {
            at: '2026-07-02T06:00:00.000Z',
            by: 'auto-curation-v1',
            confidence: 0.83,
            reviewState: 'live',
          },
        },
      ],
    }
    expect(() => validatePromisesSnapshot(JSON.stringify(bad))).toThrow(/reviewState/)
  })

  it('accepts an evidence entry with kind "tender"', () => {
    const base = {
      version: '1.0',
      generatedAt: '2026-07-02',
      frozenUntil: null,
      legalNotice: 'x'.repeat(100),
      contactUrl: 'https://x.test/issues',
      methodologyUrl: '/metodologia',
    }
    const ok = {
      ...base,
      items: [
        {
          id: 'p-tender-ev',
          party: 'PSOE',
          title: 'Obra con adjudicación',
          quote: 'Una promesa verbatim con longitud más que suficiente para el validador.',
          source: { url: 'https://x.test/n', publisher: 'X' },
          madeAt: '2026-01-01',
          topic: 'urbanismo',
          kind: 'anuncio-gobierno',
          status: 'en-progreso',
          evidence: [
            {
              date: '2026-05-01',
              url: 'https://contrataciondelestado.es/deeplink',
              quote: 'Contrato de obra adjudicado por 240.000 €',
              publisher: 'PLACSP',
              kind: 'tender',
              addedBy: 'auto-curation-v1',
            },
          ],
          createdAt: '2026-01-01',
        },
      ],
    }
    expect(() => validatePromisesSnapshot(JSON.stringify(ok))).not.toThrow()
  })
})

describe('promises — a promise may not cite us as its own source', () => {
  /**
   * `psoe-alumbrado-led-680k` was published on /promesas with a «cita» nobody
   * uttered — a sentence we wrote ourselves — and `source.url` pointing at our
   * own `tenders.json`. We cited ourselves as the evidence for an accusation of
   * favouritism against a named party, and the schema was satisfied because it
   * only asked for «≥20 chars + URL + publisher». Retracted in c66cf93.
   *
   * Nothing stopped the next one. This does: a primary source has to be
   * somebody else's document. Our own snapshots are what a claim is CHECKED
   * against, never what it RESTS on.
   */
  const base = {
    version: '1.0',
    generatedAt: '2026-04-20',
    frozenUntil: null,
    legalNotice: 'x'.repeat(100),
    contactUrl: 'https://x.test/issues',
    methodologyUrl: '/metodologia',
  }
  const withSource = (url: string) => ({
    ...base,
    items: [
      {
        id: 'p-1',
        party: 'PSOE',
        title: 'Una promesa cualquiera',
        quote: 'una cita suficientemente larga para el esquema',
        source: { url, publisher: 'Test' },
        madeAt: '2025-06-01',
        topic: 'fiscal',
        kind: 'anuncio-gobierno',
        status: 'documentada',
        evidence: [],
        createdAt: '2025-06-01',
      },
    ],
  })

  it.each([
    'https://civicpulse.es/data/tenders.json',
    'https://civicpulse.es/promesas',
    'http://www.civicpulse.es/data/budget.json',
    'https://CIVICPULSE.ES/data/x.json',
  ])('rejects %s as a primary source', (url) => {
    expect(() => validatePromisesSnapshot(JSON.stringify(withSource(url)))).toThrow(
      /no puede citarse a sí mismo|self/i,
    )
  })

  it.each([
    'https://www.levante-emv.com/una-noticia',
    'https://ribalicita.ribarroja.es/visualizaciones/contratos',
    'https://www.ribarroja.es/es/plenos/2026',
    'https://contrataciondelestado.gob.es/x',
  ])('still accepts a real third-party source: %s', (url) => {
    expect(() => validatePromisesSnapshot(JSON.stringify(withSource(url)))).not.toThrow()
  })

  it('does not reject a domain that merely contains our name', () => {
    // `notcivicpulse.es.example.com` is somebody else's host.
    expect(() =>
      validatePromisesSnapshot(JSON.stringify(withSource('https://notcivicpulse.example.com/x'))),
    ).not.toThrow()
  })

  it('the shipped snapshot passes — this guard is not retroactively broken', () => {
    // c66cf93 removed the only offenders; if this ever fails, something
    // re-introduced a self-citation rather than the guard being wrong.
    expect(() => validatePromisesSnapshot(readFileSync(SNAPSHOT, 'utf8'))).not.toThrow()
  })
})
