import { describe, it, expect } from 'vitest'
import { validateFindingsSnapshot, FindingValidationError } from '../src/scraper/pleno-finding'

const VALID = {
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
      corroboration: [],
      contradiction: [],
      relatedPromiseIds: [],
      curatorName: 'curator-0',
      publishedAt: '2026-04-22',
      response: null,
    },
  ],
}

describe('validateFindingsSnapshot — happy path', () => {
  it('accepts a well-formed snapshot', () => {
    const snap = validateFindingsSnapshot(JSON.stringify(VALID))
    expect(snap.items).toHaveLength(1)
    expect(snap.items[0].severity).toBe('informational')
  })
})

describe('validateFindingsSnapshot — legal invariants', () => {
  it('rejects summary <40 chars', () => {
    const bad = JSON.parse(JSON.stringify(VALID))
    bad.items[0].summary = 'corto'
    expect(() => validateFindingsSnapshot(JSON.stringify(bad))).toThrow(FindingValidationError)
  })

  it('rejects quote <20 chars', () => {
    const bad = JSON.parse(JSON.stringify(VALID))
    bad.items[0].quotes[0].text = 'corto'
    expect(() => validateFindingsSnapshot(JSON.stringify(bad))).toThrow(/verbatim/)
  })

  it('rejects quotes array empty', () => {
    const bad = JSON.parse(JSON.stringify(VALID))
    bad.items[0].quotes = []
    expect(() => validateFindingsSnapshot(JSON.stringify(bad))).toThrow(/non-empty/)
  })

  it('rejects severity=critical without any evidence ref', () => {
    const bad = JSON.parse(JSON.stringify(VALID))
    bad.items[0].severity = 'critical'
    expect(() => validateFindingsSnapshot(JSON.stringify(bad))).toThrow(/critical/)
  })

  it('accepts severity=critical WITH ≥1 contradiction ref', () => {
    const withRef = JSON.parse(JSON.stringify(VALID))
    withRef.items[0].severity = 'critical'
    withRef.items[0].contradiction = [
      {
        kind: 'tender',
        ref: 'https://contrataciones.example/r1',
        snippet: 'Contrato registrado en la BD con importe distinto (450.000 €)',
      },
    ]
    const snap = validateFindingsSnapshot(JSON.stringify(withRef))
    expect(snap.items[0].severity).toBe('critical')
  })

  it('rejects speakerGroup outside allowed blocs', () => {
    const bad = JSON.parse(JSON.stringify(VALID))
    bad.items[0].quotes[0].speakerGroup = 'PODEMOS'
    expect(() => validateFindingsSnapshot(JSON.stringify(bad))).toThrow(/speakerGroup/)
  })

  it('allows speakerGroup=null (unknown from transcript)', () => {
    const withNull = JSON.parse(JSON.stringify(VALID))
    withNull.items[0].quotes[0].speakerGroup = null
    const snap = validateFindingsSnapshot(JSON.stringify(withNull))
    expect(snap.items[0].quotes[0].speakerGroup).toBeNull()
  })

  it('rejects duplicate ids', () => {
    const bad = JSON.parse(JSON.stringify(VALID))
    bad.items.push(JSON.parse(JSON.stringify(bad.items[0])))
    expect(() => validateFindingsSnapshot(JSON.stringify(bad))).toThrow(/duplicate/)
  })
})
