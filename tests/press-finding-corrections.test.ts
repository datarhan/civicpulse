/**
 * Corrections-log schema tests (Package 4b).
 *
 * Locks the per-correction shape so a future curator can never ship a
 * finding-edit without the IFCN-required {original, corrected, reason,
 * editor, correctedAt} trail.
 */
import { describe, expect, it } from 'vitest'

import {
  validatePressFindingsSnapshot,
  type PressFinding,
  type PressFindingCorrection,
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
    generatedAt: '2026-05-21',
    legalNotice:
      'Auditoría editorial. Las verificaciones contrastan datos municipales públicos con la prensa citada.',
    contactUrl: 'https://github.com/datarhan/civicpulse/issues',
    methodologyUrl: '/metodologia#laboratorio-prensa',
    items,
  }
}

function validCorrection(over: Partial<PressFindingCorrection> = {}): PressFindingCorrection {
  return {
    field: 'summary',
    original: 'Old summary text that was approved on first publication.',
    corrected: 'New summary text after the correction was issued and approved.',
    reason: 'The original mislabelled the BDNS reference; this fixes the number.',
    editor: 'Curador A',
    correctedAt: '2026-05-21',
    ...over,
  }
}

describe('press-finding — corrections log', () => {
  it('round-trips a finding with one correction', () => {
    const finding = makeFinding({ corrections: [validCorrection()] })
    const parsed = validatePressFindingsSnapshot(JSON.stringify(makeSnapshot([finding])))
    expect(parsed.items[0].corrections).toHaveLength(1)
    expect(parsed.items[0].corrections?.[0].field).toBe('summary')
    expect(parsed.items[0].corrections?.[0].editor).toBe('Curador A')
  })

  it('defaults corrections to empty array when omitted', () => {
    const finding = makeFinding()
    delete (finding as unknown as Record<string, unknown>).corrections
    const parsed = validatePressFindingsSnapshot(JSON.stringify(makeSnapshot([finding])))
    expect(parsed.items[0].corrections).toEqual([])
  })

  it('rejects a correction with a reason <20 chars', () => {
    const finding = makeFinding({
      corrections: [validCorrection({ reason: 'too short' })],
    })
    expect(() => validatePressFindingsSnapshot(JSON.stringify(makeSnapshot([finding])))).toThrow(
      /reason must be ≥20/,
    )
  })

  it('rejects an invalid field', () => {
    const bad = { ...validCorrection(), field: 'severity_x' as unknown as 'severity' }
    const finding = makeFinding({ corrections: [bad] })
    expect(() => validatePressFindingsSnapshot(JSON.stringify(makeSnapshot([finding])))).toThrow(
      /field must be one of/,
    )
  })

  it('rejects a non-ISO correctedAt', () => {
    const finding = makeFinding({
      corrections: [validCorrection({ correctedAt: 'yesterday' })],
    })
    expect(() => validatePressFindingsSnapshot(JSON.stringify(makeSnapshot([finding])))).toThrow(
      /correctedAt must be ISO/,
    )
  })

  it('rejects an empty editor', () => {
    const finding = makeFinding({
      corrections: [validCorrection({ editor: '' })],
    })
    expect(() => validatePressFindingsSnapshot(JSON.stringify(makeSnapshot([finding])))).toThrow(
      /editor required/,
    )
  })

  it('accepts multiple corrections on a single finding', () => {
    const finding = makeFinding({
      corrections: [
        validCorrection({ field: 'summary' }),
        validCorrection({
          field: 'severity',
          original: 'informational',
          corrected: 'notable',
          correctedAt: '2026-05-22',
          reason: 'second look at data showed only partial match, not full verification',
        }),
      ],
    })
    const parsed = validatePressFindingsSnapshot(JSON.stringify(makeSnapshot([finding])))
    expect(parsed.items[0].corrections).toHaveLength(2)
    expect(parsed.items[0].corrections?.[1].field).toBe('severity')
  })
})
