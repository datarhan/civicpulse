/**
 * Pleno-finding corrections log schema tests. Mirrors the press
 * version (Package 4b) so both publishing surfaces have symmetric
 * IFCN-compliant correction trails.
 */
import { describe, expect, it } from 'vitest'

import {
  applyFindingCorrection,
  validateFindingsSnapshot,
  type PlenoFindingCorrection,
} from '../src/scraper/pleno-finding'

const BASE = {
  version: '1.0',
  generatedAt: '2026-04-22T00:00:00Z',
  legalNotice:
    'Registro editorial público con cita verbatim, contraste documental y derecho de réplica.',
  contactUrl: 'https://github.com/datarhan/civicpulse/issues/new/choose',
  methodologyUrl: '/metodologia',
  items: [
    {
      id: 'f-2026-03-09-ext-abc123',
      plenoId: '1sqj7is',
      plenoDate: '2026-03-09',
      title: 'Reconocimiento extrajudicial de 242K · contraste con la BD municipal',
      summary:
        'El pleno convalidó un expediente de 242.255 euros en reconocimientos extrajudiciales. La BD municipal de contratos no lo refleja porque se trata de facturas internas, no de una licitación pública.',
      severity: 'informational',
      sourceClaimIds: ['1sqj7is-042-afi-abcdef'],
      quotes: [
        {
          text: 'un expediente de 242.255 euros en reconocimientos extrajudiciales',
          speakerGroup: 'PSOE',
          sourceClaimId: '1sqj7is-042-afi-abcdef',
        },
      ],
      crossChecked: [],
      contradiction: [],
      relatedPromiseIds: [],
      curatorName: 'curator-0',
      publishedAt: '2026-04-22',
      response: null,
    },
  ],
}

function withCorrections(corrections: Partial<PlenoFindingCorrection>[]) {
  const clone = JSON.parse(JSON.stringify(BASE))
  clone.items[0].corrections = corrections.map((c) => ({
    field: 'summary',
    original: 'Old summary text approved on first publication.',
    corrected: 'New summary text after the correction was issued.',
    reason: 'The original mislabelled the reconocimiento number; this fixes the cite.',
    editor: 'Curador A',
    correctedAt: '2026-04-23',
    ...c,
  }))
  return clone
}

describe('pleno-finding — corrections log', () => {
  it('round-trips a finding with one correction', () => {
    const parsed = validateFindingsSnapshot(JSON.stringify(withCorrections([{}])))
    expect(parsed.items[0].corrections).toHaveLength(1)
    expect(parsed.items[0].corrections?.[0].field).toBe('summary')
    expect(parsed.items[0].corrections?.[0].editor).toBe('Curador A')
  })

  it('defaults corrections to empty array when omitted', () => {
    const parsed = validateFindingsSnapshot(JSON.stringify(BASE))
    expect(parsed.items[0].corrections).toEqual([])
  })

  it('rejects a correction with a reason <20 chars', () => {
    expect(() =>
      validateFindingsSnapshot(JSON.stringify(withCorrections([{ reason: 'too short' }]))),
    ).toThrow(/reason must be ≥20/)
  })

  it('rejects an invalid field', () => {
    expect(() =>
      validateFindingsSnapshot(
        JSON.stringify(withCorrections([{ field: 'severity_x' as 'severity' }])),
      ),
    ).toThrow(/field must be one of/)
  })

  it('rejects a non-ISO correctedAt', () => {
    expect(() =>
      validateFindingsSnapshot(JSON.stringify(withCorrections([{ correctedAt: 'yesterday' }]))),
    ).toThrow(/correctedAt must be ISO/)
  })

  it('rejects an empty editor', () => {
    expect(() =>
      validateFindingsSnapshot(JSON.stringify(withCorrections([{ editor: '' }]))),
    ).toThrow(/editor required/)
  })

  it('accepts citation-repair fields (quote.<i>.text / quote.<i>.sourceClaimId / sourceClaimIds)', () => {
    const parsed = validateFindingsSnapshot(
      JSON.stringify(
        withCorrections([
          {
            field: 'quote.0.text',
            original: 'old verbatim text from the superseded transcript body',
            corrected: 'new verbatim text from the re-transcribed record body',
            reason: 'la re-transcripción del pleno invalidó el verbatim citado originalmente',
          },
          {
            field: 'quote.0.sourceClaimId',
            original: '1sqj7is-000-afi-a9546e',
            corrected: '1sqj7is-001-afi-a1e446',
            reason: 'la re-transcripción del pleno re-generó el id del claim citado aquí',
          },
          {
            field: 'sourceClaimIds',
            original: '1sqj7is-000-afi-a9546e',
            corrected: '1sqj7is-001-afi-a1e446',
            reason: 'la re-transcripción del pleno re-generó los ids de claims citados',
          },
        ]),
      ),
    )
    expect(parsed.items[0].corrections).toHaveLength(3)
    expect(parsed.items[0].corrections?.[0].field).toBe('quote.0.text')
  })

  it('rejects citation-path fields that address nothing', () => {
    expect(() =>
      validateFindingsSnapshot(
        JSON.stringify(withCorrections([{ field: 'quote.x.text' as 'summary' }])),
      ),
    ).toThrow(/field must be one of/)
    expect(() =>
      validateFindingsSnapshot(JSON.stringify(withCorrections([{ field: 'quotes' as 'summary' }]))),
    ).toThrow(/field must be one of/)
  })

  it('accepts multiple corrections on a single finding', () => {
    const parsed = validateFindingsSnapshot(
      JSON.stringify(
        withCorrections([
          {},
          {
            field: 'severity',
            original: 'informational',
            corrected: 'notable',
            correctedAt: '2026-04-24',
            reason: 'second-look review changed the severity bucket per data trail',
          },
        ]),
      ),
    )
    expect(parsed.items[0].corrections).toHaveLength(2)
    expect(parsed.items[0].corrections?.[1].field).toBe('severity')
  })
})

describe('applyFindingCorrection', () => {
  const finding = () => JSON.parse(JSON.stringify(BASE)).items[0]

  it('re-points sourceClaimIds from a comma-separated list and returns the original', () => {
    const f = finding()
    const original = applyFindingCorrection(f, 'sourceClaimIds', '1sqj7is-001-afi-a1e446')
    expect(original).toBe('1sqj7is-042-afi-abcdef')
    expect(f.sourceClaimIds).toEqual(['1sqj7is-001-afi-a1e446'])
  })

  it('replaces a quote text in place', () => {
    const f = finding()
    const original = applyFindingCorrection(
      f,
      'quote.0.text',
      'proponemos al pleno convalidar y aprobar el expediente',
    )
    expect(original).toBe('un expediente de 242.255 euros en reconocimientos extrajudiciales')
    expect(f.quotes[0].text).toBe('proponemos al pleno convalidar y aprobar el expediente')
  })

  it('replaces a quote sourceClaimId in place', () => {
    const f = finding()
    applyFindingCorrection(f, 'quote.0.sourceClaimId', '1sqj7is-001-afi-a1e446')
    expect(f.quotes[0].sourceClaimId).toBe('1sqj7is-001-afi-a1e446')
  })

  it('still applies plain top-level fields (title/summary/severity)', () => {
    const f = finding()
    const original = applyFindingCorrection(f, 'severity', 'notable')
    expect(original).toBe('informational')
    expect(f.severity).toBe('notable')
  })

  it('throws on an out-of-range quote index and on unknown fields', () => {
    const f = finding()
    expect(() => applyFindingCorrection(f, 'quote.7.text', 'whatever text this is')).toThrow(
      /quote index 7/,
    )
    expect(() => applyFindingCorrection(f, 'quotes', 'nope')).toThrow(/unknown correction field/)
  })

  it('rejects an empty sourceClaimIds replacement', () => {
    const f = finding()
    expect(() => applyFindingCorrection(f, 'sourceClaimIds', '  ,  ')).toThrow(
      /sourceClaimIds correction needs ≥1 id/,
    )
  })
})
