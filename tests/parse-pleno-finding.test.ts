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

describe('FindingRef.kind — curator-only kinds', () => {
  // Three new kinds were added so the curator dashboard can persist
  // URL/PDF/transcript evidence into corroboration[]: 'press',
  // 'document', 'transcript'. The original six (tender/bdns/budget/
  // promise/pleno-video/pleno-acta) keep working.
  const PUBLISH_KINDS_OK = ['press', 'document', 'transcript']

  for (const kind of PUBLISH_KINDS_OK) {
    it(`accepts kind=${kind} in corroboration[]`, () => {
      const ok = JSON.parse(JSON.stringify(VALID))
      ok.items[0].corroboration = [
        { kind, ref: 'https://example.com/source', snippet: 'curator-supplied citation' },
      ]
      const snap = validateFindingsSnapshot(JSON.stringify(ok))
      expect(snap.items[0].corroboration[0].kind).toBe(kind)
    })
  }

  it('still accepts the six original kinds (no regression)', () => {
    const ok = JSON.parse(JSON.stringify(VALID))
    ok.items[0].corroboration = [
      { kind: 'tender', ref: 'https://t/1', snippet: 'tender' },
      { kind: 'bdns', ref: 'https://b/1', snippet: 'bdns' },
      { kind: 'budget', ref: 'budget:2025:cap3', snippet: 'budget' },
      { kind: 'promise', ref: 'promise:psoe-1', snippet: 'promise' },
      { kind: 'pleno-video', ref: 'https://yt/1', snippet: 'video' },
      { kind: 'pleno-acta', ref: 'https://ribarroja.es/acta', snippet: 'acta' },
    ]
    const snap = validateFindingsSnapshot(JSON.stringify(ok))
    expect(snap.items[0].corroboration).toHaveLength(6)
  })

  it('still rejects unknown kinds', () => {
    const bad = JSON.parse(JSON.stringify(VALID))
    bad.items[0].corroboration = [{ kind: 'rumor', ref: 'https://x', snippet: 'unverified' }]
    expect(() => validateFindingsSnapshot(JSON.stringify(bad))).toThrow(/kind invalid/)
  })

  it('rejects snippet >240 chars regardless of kind', () => {
    const bad = JSON.parse(JSON.stringify(VALID))
    bad.items[0].corroboration = [{ kind: 'press', ref: 'https://x', snippet: 'x'.repeat(241) }]
    expect(() => validateFindingsSnapshot(JSON.stringify(bad))).toThrow(/1-240 chars/)
  })
})

describe('individualSpeaker — voice-id attribution boundary', () => {
  it('accepts a well-formed individualSpeaker', () => {
    const ok = JSON.parse(JSON.stringify(VALID))
    ok.items[0].individualSpeaker = {
      slug: 'robert-raga-gadea',
      name: 'Robert Raga Gadea',
      party: 'PSOE',
    }
    const snap = validateFindingsSnapshot(JSON.stringify(ok))
    expect(snap.items[0].individualSpeaker?.slug).toBe('robert-raga-gadea')
  })

  it('rejects an individualSpeaker.slug that is not kebab-case', () => {
    const bad = JSON.parse(JSON.stringify(VALID))
    bad.items[0].individualSpeaker = {
      slug: 'Robert Raga',
      name: 'Robert Raga Gadea',
      party: 'PSOE',
    }
    expect(() => validateFindingsSnapshot(JSON.stringify(bad))).toThrow(/kebab-case/)
  })

  it('rejects an individualSpeaker.party outside allowed blocs', () => {
    const bad = JSON.parse(JSON.stringify(VALID))
    bad.items[0].individualSpeaker = {
      slug: 'foo-bar',
      name: 'Foo Bar',
      party: 'PODEMOS',
    }
    expect(() => validateFindingsSnapshot(JSON.stringify(bad))).toThrow(/party must be one of/)
  })

  it('rejects an individualSpeaker.name that is too short', () => {
    const bad = JSON.parse(JSON.stringify(VALID))
    bad.items[0].individualSpeaker = {
      slug: 'foo-bar',
      name: 'F',
      party: 'PSOE',
    }
    expect(() => validateFindingsSnapshot(JSON.stringify(bad))).toThrow(/name/)
  })

  it('omits individualSpeaker on the parsed object when absent', () => {
    const snap = validateFindingsSnapshot(JSON.stringify(VALID))
    expect(snap.items[0].individualSpeaker).toBeUndefined()
  })
})
