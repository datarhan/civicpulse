import { describe, it, expect } from 'vitest'
import {
  validatePressFindingsSnapshot,
  type PressFinding,
  type PressFindingsSnapshot,
} from '../src/scraper/press-finding'

function makeFinding(overrides: Partial<PressFinding> = {}): PressFinding {
  return {
    id: 'pf-test-001',
    sourceClaimIds: ['test-art-001-0-num'],
    articleIds: ['test-art-001'],
    articleFingerprints: ['fp-fake-001'],
    attributedOutlets: ['Test Outlet'],
    earliestArticleDate: '2026-05-19',
    latestArticleDate: '2026-05-20',
    title: 'Verificación: la cifra coincide con BDNS',
    summary:
      'El medio menciona 185.000 € destinados al parque del Túria. La convocatoria BDNS BDB-2026-001 registra una cifra equivalente.',
    severity: 'informational',
    quotes: [
      {
        text: 'Riba-roja invierte 185.000 € en el parque del Túria.',
        outlet: 'Test Outlet',
        articleUrl: 'https://example.test/articles/001',
        sourceClaimId: 'test-art-001-0-num',
      },
    ],
    crossChecked: [
      {
        kind: 'bdns',
        ref: 'BDB-2026-001',
        snippet: 'BDNS BDB-2026-001 · 184.940 € · convocatoria municipal abierta el 2026-04-10',
      },
    ],
    contradiction: [],
    relatedPromiseIds: [],
    relatedPlenoItems: [],
    curatorName: 'test-suite',
    publishedAt: '2026-05-20',
    ...overrides,
  }
}

function makeSnapshot(items: PressFinding[]): PressFindingsSnapshot {
  return {
    version: '1',
    generatedAt: '2026-05-20',
    legalNotice:
      'Auditoría editorial. Las verificaciones contrastan datos municipales públicos con la prensa citada.',
    contactUrl: 'https://github.com/datarhan/civicpulse/issues',
    methodologyUrl: '/metodologia#laboratorio-prensa',
    items,
  }
}

describe('press-finding — validatePressFindingsSnapshot', () => {
  it('round-trips a valid informational finding', () => {
    const snap = makeSnapshot([makeFinding()])
    const parsed = validatePressFindingsSnapshot(JSON.stringify(snap))
    expect(parsed.items.length).toBe(1)
    expect(parsed.items[0].severity).toBe('informational')
  })

  it('rejects title shorter than 10 chars', () => {
    const snap = makeSnapshot([makeFinding({ title: 'short' })])
    expect(() => validatePressFindingsSnapshot(JSON.stringify(snap))).toThrow(/title must be 10/)
  })

  it('rejects summary shorter than 40 chars', () => {
    const snap = makeSnapshot([makeFinding({ summary: 'too short for a curator summary.' })])
    expect(() => validatePressFindingsSnapshot(JSON.stringify(snap))).toThrow(/summary/)
  })

  it('rejects severity=critical without a contradiction ref', () => {
    // A cross-checked document is not a refutation: the gate used to accept
    // `crossChecked.length + contradiction.length > 0`, so the rule
    // /metodologia publishes had never once been enforced.
    const snap = makeSnapshot([
      makeFinding({
        severity: 'critical',
        contradiction: [],
      }),
    ])
    expect(() => validatePressFindingsSnapshot(JSON.stringify(snap))).toThrow(/critical requires/)
  })

  it('accepts severity=critical when contradiction is present', () => {
    const snap = makeSnapshot([
      makeFinding({
        severity: 'critical',
        contradiction: [
          {
            kind: 'tender',
            ref: 'TEND-2025-042',
            snippet: 'El contrato sigue abierto en PLACSP · expediente 2025-042.',
          },
        ],
      }),
    ])
    expect(() => validatePressFindingsSnapshot(JSON.stringify(snap))).not.toThrow()
  })

  it('rejects an id that does not begin with "pf-"', () => {
    const snap = makeSnapshot([makeFinding({ id: 'wrong-prefix-001' })])
    expect(() => validatePressFindingsSnapshot(JSON.stringify(snap))).toThrow(/pf-/)
  })

  it('rejects a response.from that is not in attributedOutlets', () => {
    const snap = makeSnapshot([
      makeFinding({
        response: {
          from: 'Outlet Not In The Bundle',
          quote:
            'Réplica del medio sobre la cifra publicada por el ayuntamiento (≥20 chars de cita).',
          respondedAt: '2026-05-21',
        },
      }),
    ])
    expect(() => validatePressFindingsSnapshot(JSON.stringify(snap))).toThrow(/response.from/)
  })

  it('rejects a response quote shorter than 20 chars', () => {
    const snap = makeSnapshot([
      makeFinding({
        response: {
          from: 'Test Outlet',
          quote: 'corto',
          respondedAt: '2026-05-21',
        },
      }),
    ])
    expect(() => validatePressFindingsSnapshot(JSON.stringify(snap))).toThrow(/response.quote/)
  })

  it('accepts a valid response payload (right-of-reply)', () => {
    const snap = makeSnapshot([
      makeFinding({
        response: {
          from: 'Test Outlet',
          quote: 'Réplica oficial del medio sobre la verificación municipal de la cifra.',
          respondedAt: '2026-05-21',
          sourceUrl: 'https://example.test/replica',
        },
      }),
    ])
    const parsed = validatePressFindingsSnapshot(JSON.stringify(snap))
    expect(parsed.items[0].response?.from).toBe('Test Outlet')
  })

  it('rejects on missing top-level snapshot fields', () => {
    expect(() => validatePressFindingsSnapshot('{}')).toThrow()
  })

  it('rejects on non-JSON input', () => {
    expect(() => validatePressFindingsSnapshot('{not-json')).toThrow(/not valid JSON/)
  })
})
