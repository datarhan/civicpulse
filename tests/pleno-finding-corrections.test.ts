/**
 * Pleno-finding corrections log schema tests. Mirrors the press
 * version (Package 4b) so both publishing surfaces have symmetric
 * IFCN-compliant correction trails.
 */
import { describe, expect, it } from 'vitest'

import {
  applyFindingCorrection,
  applyFindingRemoval,
  findingRemovalTarget,
  reasonEchoesRemoved,
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

  it('refuses to fake a removal by blanking through the edit path', () => {
    const f = finding()
    expect(() => applyFindingCorrection(f, 'quote.0', '')).toThrow(/is a removal path/)
    expect(() => applyFindingCorrection(f, 'crossChecked.0', '')).toThrow(/is a removal path/)
  })
})

// ─── Removal ────────────────────────────────────────────────────────────────

/**
 * A finding with something to remove from each collection, and neighbours on
 * both sides of every target — a removal that also perturbs its neighbours is
 * the failure these tests are shaped around.
 */
const REMOVABLE = {
  ...BASE,
  items: [
    {
      ...BASE.items[0],
      sourceClaimIds: [
        '1sqj7is-042-afi-abcdef',
        '1sqj7is-043-afi-bbbbbb',
        '1sqj7is-044-afi-cccccc',
      ],
      quotes: [
        {
          text: 'primera cita, la que se queda tal y como estaba antes',
          speakerGroup: 'PSOE',
          sourceClaimId: '1sqj7is-042-afi-abcdef',
        },
        {
          text: 'segunda cita, sin grupo, que menciona a Fulgencio Estévez',
          speakerGroup: null,
          sourceClaimId: '1sqj7is-043-afi-bbbbbb',
        },
        {
          text: 'tercera cita, la que también se queda tal y como estaba',
          speakerGroup: 'PP',
          sourceClaimId: '1sqj7is-044-afi-cccccc',
        },
      ],
      crossChecked: [
        {
          kind: 'tender',
          ref: 'https://example.test/uno',
          snippet: 'Expediente uno · estado: awarded',
        },
        {
          kind: 'tender',
          ref: 'https://example.test/dos',
          snippet: 'Expediente dos · Petronila Barrachina Gil · architecture',
        },
        { kind: 'pleno-video', ref: 'https://example.test/video', snippet: 'Vídeo del pleno' },
      ],
    },
  ],
}

describe('applyFindingRemoval', () => {
  const finding = () => validateFindingsSnapshot(JSON.stringify(REMOVABLE)).items[0]

  it('removes the addressed quote AND LEAVES EVERYTHING ELSE UNTOUCHED', () => {
    const before = finding()
    const f = finding()
    applyFindingRemoval(f, 'quote.1')

    expect(f.quotes).toHaveLength(2)
    expect(f.quotes.map((q) => q.text)).toEqual([before.quotes[0].text, before.quotes[2].text])
    // The half that must go red when a correction perturbs its neighbours:
    // every other field of the finding, byte for byte.
    expect({ ...f, quotes: [] }).toEqual({ ...before, quotes: [] })
  })

  it('removes the addressed crossChecked ref AND LEAVES EVERYTHING ELSE UNTOUCHED', () => {
    const before = finding()
    const f = finding()
    applyFindingRemoval(f, 'crossChecked.1')

    expect(f.crossChecked.map((r) => r.ref)).toEqual([
      before.crossChecked[0].ref,
      before.crossChecked[2].ref,
    ])
    expect({ ...f, crossChecked: [] }).toEqual({ ...before, crossChecked: [] })
  })

  it('never puts the removed text in the ledger — only a digest of it', () => {
    const before = finding()
    const f = finding()
    const { original, corrected } = applyFindingRemoval(f, 'quote.1')

    // `/hallazgos` prints `original` in full, struck through. If the removed
    // words reach it, the removal is undone on the page it was made for.
    expect(original).not.toContain('Fulgencio')
    expect(original).not.toContain(before.quotes[1].text)
    expect(original).toMatch(/^cita · sha256:[0-9a-f]{12}$/)
    expect(corrected).toBe('retirada del hallazgo')
  })

  it('digests the row so an auditor holding the old snapshot can verify it', () => {
    // Same row in, same digest out — that is what makes the ledger checkable
    // against a parent commit rather than merely readable.
    const a = applyFindingRemoval(finding(), 'crossChecked.1')
    const b = applyFindingRemoval(finding(), 'crossChecked.1')
    expect(a.original).toBe(b.original)
    // A different row must not share it.
    const c = applyFindingRemoval(finding(), 'crossChecked.0')
    expect(c.original).not.toBe(a.original)
    expect(c.corrected).toBe('retirado del hallazgo')
  })

  it('refuses an out-of-range index rather than removing a neighbour', () => {
    expect(() => applyFindingRemoval(finding(), 'quote.9')).toThrow(/quote index 9 out of range/)
    expect(() => applyFindingRemoval(finding(), 'crossChecked.3')).toThrow(
      /crossChecked index 3 out of range/,
    )
  })

  it('refuses to empty a finding of its last quote', () => {
    const f = validateFindingsSnapshot(JSON.stringify(BASE)).items[0]
    expect(f.quotes).toHaveLength(1)
    expect(() => applyFindingRemoval(f, 'quote.0')).toThrow(/refusing to remove the last quote/)
    expect(f.quotes).toHaveLength(1)
  })

  it('cannot reach contradiction[] or sourceClaimIds', () => {
    // contradiction[] is what gates severity=critical; a retraction that could
    // drain it would let a strong verdict outlive its evidence.
    expect(() => applyFindingRemoval(finding(), 'contradiction.0')).toThrow(/not a removal path/)
    expect(() => applyFindingRemoval(finding(), 'sourceClaimIds')).toThrow(/not a removal path/)
    expect(() => applyFindingRemoval(finding(), 'quote.0.text')).toThrow(/not a removal path/)
  })

  it('validates a snapshot carrying removal rows in its log', () => {
    const parsed = validateFindingsSnapshot(
      JSON.stringify(
        withCorrections([
          {
            field: 'quote.1' as 'summary',
            original: 'cita · sha256:0123456789ab',
            corrected: 'retirada del hallazgo',
            reason: 'se retira una cita sin atribución de grupo que el resumen no utiliza',
          },
          {
            field: 'crossChecked.2' as 'summary',
            original: 'documento cotejado · sha256:0123456789ab',
            corrected: 'retirado del hallazgo',
            reason: 'se retira del cotejo una referencia sin relación con la materia debatida',
          },
        ]),
      ),
    )
    expect(parsed.items[0].corrections?.map((c) => c.field)).toEqual(['quote.1', 'crossChecked.2'])
  })

  it('rejects a removal-shaped field that addresses nothing', () => {
    expect(() =>
      validateFindingsSnapshot(
        JSON.stringify(withCorrections([{ field: 'crossChecked' as 'summary' }])),
      ),
    ).toThrow(/field must be one of/)
    expect(() =>
      validateFindingsSnapshot(
        JSON.stringify(withCorrections([{ field: 'contradiction.0' as 'summary' }])),
      ),
    ).toThrow(/field must be one of/)
  })
})

describe('reasonEchoesRemoved — Paso 2, the half a machine can check', () => {
  const target = { text: 'segunda cita, sin grupo, que menciona a Fulgencio Estévez', ref: null }

  it('denies a reason that names the person the removal took out', () => {
    expect(reasonEchoesRemoved('Se retira la cita sobre Fulgencio, que no procede.', target)).toBe(
      'Fulgencio',
    )
    expect(reasonEchoesRemoved('Se retira la cita que menciona a Estévez, sin más.', target)).toBe(
      'Estévez',
    )
  })

  it('accepts a reason that describes the criterion instead', () => {
    expect(
      reasonEchoesRemoved(
        'Se retira una cita sin atribución de grupo que el resumen no utiliza y que imputa un hecho grave a una persona identificable.',
        target,
      ),
    ).toBeNull()
  })

  it('does not trip on a capital that merely opens a sentence', () => {
    // The removed row starts with a lowercase word here, but a snippet
    // beginning «Se…» must not make every reason beginning «Se retira…» fail.
    const t = { text: 'Se adjudica el expediente. Segunda frase.', ref: null }
    expect(
      reasonEchoesRemoved('Se retira una referencia sin relación con lo debatido.', t),
    ).toBeNull()
    // …and a capital in the middle of a sentence still counts, so the
    // exemption is a rule about grammar and not a hole.
    expect(reasonEchoesRemoved('Se retira la referencia Segunda por no venir al caso.', t)).toBe(
      'Segunda',
    )
  })

  it('denies a reason that pastes the removed document URL', () => {
    const t = { text: 'Expediente dos · architecture', ref: 'https://example.test/dos' }
    expect(reasonEchoesRemoved('Se retira https://example.test/dos por lo dicho.', t)).toBe(
      'https://example.test/dos',
    )
  })
})

describe('findingRemovalTarget', () => {
  const finding = () => validateFindingsSnapshot(JSON.stringify(REMOVABLE)).items[0]

  it('reads the row the CLI is about to remove, without removing it', () => {
    const f = finding()
    expect(findingRemovalTarget(f, 'quote.1')?.text).toContain('Fulgencio')
    expect(findingRemovalTarget(f, 'crossChecked.1')?.ref).toBe('https://example.test/dos')
    expect(f.quotes).toHaveLength(3)
    expect(f.crossChecked).toHaveLength(3)
  })

  it('returns null for a path that addresses nothing', () => {
    expect(findingRemovalTarget(finding(), 'quote.9')).toBeNull()
    expect(findingRemovalTarget(finding(), 'summary')).toBeNull()
  })
})
