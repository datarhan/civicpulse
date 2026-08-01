import { describe, it, expect } from 'vitest'
import {
  parseFactCheckResponse,
  normalizeVerdict,
  matchFactChecks,
  type FactCheckRow,
} from '../src/scraper/factcheck'

const FAKE_REVIEW = {
  publisher: { name: 'Newtral', site: 'https://www.newtral.es' },
  url: 'https://www.newtral.es/riba-roja-fake-claim/20260201/',
  title: 'No es cierto que Riba-roja de Túria invertirá 50 millones en el parque',
  reviewDate: '2026-02-01',
  textualRating: 'Falso',
  languageCode: 'es',
}

describe('factcheck — normalizeVerdict', () => {
  it('maps Spanish "Falso" / "Engañoso" to contradicho', () => {
    expect(normalizeVerdict('Falso')).toBe('contradicho')
    expect(normalizeVerdict('engañoso')).toBe('contradicho')
    expect(normalizeVerdict('bulo desinformativo')).toBe('contradicho')
  })

  it('maps "Verdadero" / "Cierto" / "Confirmado" to verificado', () => {
    expect(normalizeVerdict('Verdadero')).toBe('verificado')
    expect(normalizeVerdict('cierto')).toBe('verificado')
    expect(normalizeVerdict('Confirmado por la fuente')).toBe('verificado')
  })

  it('maps "Engañoso a medias" / mixto to parcial', () => {
    expect(normalizeVerdict('Engañoso a medias')).toBe('parcial')
    expect(normalizeVerdict('mostly true')).toBe('parcial')
    expect(normalizeVerdict('Mixto')).toBe('parcial')
  })

  it('maps "sin evidencia" / "no evidence" to sin-datos', () => {
    expect(normalizeVerdict('Sin evidencia suficiente')).toBe('sin-datos')
    expect(normalizeVerdict('no evidence')).toBe('sin-datos')
  })

  it('falls back to unknown for unrecognised ratings', () => {
    expect(normalizeVerdict('Sátira')).toBe('unknown')
    expect(normalizeVerdict('')).toBe('unknown')
  })
})

describe('factcheck — parseFactCheckResponse', () => {
  it('flattens claimReview rows + normalises ratings + dedupes by URL', () => {
    const pages = [
      {
        claims: [
          {
            text: 'Riba-roja invertirá 50 millones en el parque del Túria',
            claimant: 'Anonymous source',
            claimDate: '2026-01-15',
            claimReview: [FAKE_REVIEW],
          },
          {
            text: 'Otra afirmación sobre Riba-roja de Túria, revisada por Newtral',
            claimReview: [
              {
                ...FAKE_REVIEW,
                url: 'https://www.newtral.es/another-review/20260205/',
                title: 'Engañoso a medias',
                textualRating: 'Engañoso a medias',
                reviewDate: '2026-02-05',
              },
            ],
          },
          // Duplicate review URL — should collapse.
          {
            text: 'Afirmación repetida sobre Riba-roja de Túria',
            claimReview: [FAKE_REVIEW],
          },
        ],
      },
    ]
    const rows = parseFactCheckResponse(pages)
    expect(rows.length).toBe(2)
    expect(rows[0].reviewDate).toMatch(/^2026-02-05/)
    expect(rows[0].normalizedVerdict).toBe('parcial')
    expect(rows[1].normalizedVerdict).toBe('contradicho')
    expect(rows[1].reviewerSite).toBe('newtral.es')
    expect(rows[1].claim).toMatch(/Riba-roja invertirá/)
    expect(rows[1].claimant).toBe('Anonymous source')
  })

  it('drops reviews that never name the municipality', () => {
    // The API matches fuzzily on "Riba-roja" and returns stories about the
    // Ebro-river dam of the same name. One shipped: a Maldita debunk of a DANA
    // chain letter about the embalse de Forata, published on /laboratorio as
    // this town's only external fact-check.
    const rows = parseFactCheckResponse([
      {
        claims: [
          {
            text: 'La presa de Ribaroja está a punto de reventar y se desbordará Forata',
            claimReview: [{ ...FAKE_REVIEW, title: 'Bulo sobre la presa' }],
          },
        ],
      },
    ])
    expect(rows).toEqual([])
  })

  it('strips empty claimReview entries safely', () => {
    expect(parseFactCheckResponse([{ claims: [] }])).toEqual([])
    expect(parseFactCheckResponse([{}])).toEqual([])
    expect(parseFactCheckResponse([])).toEqual([])
  })

  it('skips reviews missing a URL', () => {
    const rows = parseFactCheckResponse([
      {
        claims: [
          {
            text: 'Claim with no URL on the review',
            claimReview: [{ publisher: { name: 'Maldita' } }],
          },
        ],
      },
    ])
    expect(rows.length).toBe(0)
  })

  it('produces stable 12-char ids per review URL', () => {
    const rows = parseFactCheckResponse([{ claims: [{ text: 'x', claimReview: [FAKE_REVIEW] }] }])
    expect(rows[0].id).toMatch(/^[a-f0-9]{12}$/)
    const again = parseFactCheckResponse([{ claims: [{ text: 'x', claimReview: [FAKE_REVIEW] }] }])
    expect(again[0].id).toBe(rows[0].id)
  })
})

describe('factcheck — matchFactChecks', () => {
  const factchecks: FactCheckRow[] = [
    {
      id: 'fc-1',
      claim: 'Riba-roja invertirá 50 millones de euros en el parque del Túria',
      claimant: null,
      claimDate: null,
      reviewerName: 'Newtral',
      reviewerSite: 'newtral.es',
      reviewTitle: 'No es cierto que Riba-roja de Túria invertirá 50 millones',
      reviewUrl: 'https://www.newtral.es/riba-roja-fake-claim/20260201/',
      reviewDate: '2026-02-01',
      verdict: 'Falso',
      normalizedVerdict: 'contradicho',
      languageCode: 'es',
    },
    {
      id: 'fc-2',
      claim: 'Unrelated national politics claim about taxes',
      claimant: null,
      claimDate: null,
      reviewerName: 'Maldita',
      reviewerSite: 'maldita.es',
      reviewTitle: 'Sobre los impuestos en España',
      reviewUrl: 'https://maldita.es/taxes/',
      reviewDate: '2026-02-10',
      verdict: 'Engañoso',
      normalizedVerdict: 'contradicho',
      languageCode: 'es',
    },
  ]

  it('matches by token overlap with a score', () => {
    const matches = matchFactChecks(
      { claimVerbatim: 'Riba-roja de Túria invertirá 50 millones en el parque municipal' },
      factchecks,
    )
    expect(matches.length).toBe(1)
    expect(matches[0].row.id).toBe('fc-1')
    expect(matches[0].score).toBeGreaterThan(0.15)
    expect(matches[0].reason).toBe('token-overlap')
  })

  it('returns no matches when token overlap is below floor', () => {
    const matches = matchFactChecks(
      {
        claimVerbatim: 'Headline about an entirely different topic about gobierno general',
      },
      factchecks,
    )
    expect(matches.length).toBe(0)
  })

  it('caps results at 3', () => {
    const many: FactCheckRow[] = Array.from({ length: 10 }).map((_, i) => ({
      ...factchecks[0],
      id: `fc-many-${i}`,
      reviewUrl: `https://www.newtral.es/r${i}/`,
    }))
    const matches = matchFactChecks(
      {
        claimVerbatim: 'Riba-roja invertirá 50 millones de euros en el parque del Túria',
      },
      many,
    )
    expect(matches.length).toBe(3)
  })
})
