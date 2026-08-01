/**
 * ClaimReview JSON-LD payload tests (Package 4).
 *
 * Locks the schema.org/ClaimReview shape we publish so a future
 * refactor doesn't silently break Google's Rich Results Test (which
 * is how third-party indexers — including the Google Fact Check
 * Tools API we *consume* — pick up our findings).
 */
import { describe, expect, it } from 'vitest'

import { _buildPayload, _buildPlenoPayload } from '../src/components/ClaimReviewJsonLd.jsx'

const baseFinding = {
  id: 'F-2026-001',
  sourceClaimIds: ['C-1'],
  articleIds: ['A-1'],
  articleFingerprints: ['FP-1'],
  attributedOutlets: ['Levante-EMV', 'Las Provincias'],
  earliestArticleDate: '2026-04-01T08:00:00.000Z',
  latestArticleDate: '2026-04-15T08:00:00.000Z',
  title: 'Test finding title at least ten characters long',
  summary:
    'A summary of at least forty characters with the data point that drove the verdict so readers know why.',
  severity: 'informational',
  quotes: [
    {
      text: 'La obra del parque costó 185.000 euros según fuentes municipales',
      outlet: 'Levante-EMV',
      articleUrl: 'https://www.levante-emv.com/parque',
      sourceClaimId: 'C-1',
    },
  ],
  corroboration: [],
  contradiction: [],
  relatedPromiseIds: [],
  relatedPlenoItems: [],
  curatorName: 'Curador',
  publishedAt: '2026-05-01T09:00:00.000Z',
}

describe('ClaimReviewJsonLd._buildPayload', () => {
  it('emits a schema.org/ClaimReview envelope with required fields', () => {
    const payload = _buildPayload(baseFinding)
    expect(payload['@context']).toBe('https://schema.org')
    expect(payload['@type']).toBe('ClaimReview')
    expect(payload.url).toContain('/hallazgos#finding-F-2026-001')
    expect(payload.author.name).toBe('CivicPulse')
    expect(payload.author['@type']).toBe('Organization')
  })

  it('uses the first quote text as claimReviewed (truncated ≤280 chars)', () => {
    const longText = 'x'.repeat(400)
    const payload = _buildPayload({
      ...baseFinding,
      quotes: [{ ...baseFinding.quotes[0], text: longText }],
    })
    expect(payload.claimReviewed.length).toBe(280)
  })

  it('falls back to the title when no quotes exist', () => {
    const payload = _buildPayload({ ...baseFinding, quotes: [] })
    expect(payload.claimReviewed).toBe(baseFinding.title)
  })

  it('maps severity onto a rating between 1 and 5', () => {
    expect(
      _buildPayload({ ...baseFinding, severity: 'informational' }).reviewRating.ratingValue,
    ).toBe(5)
    expect(_buildPayload({ ...baseFinding, severity: 'notable' }).reviewRating.ratingValue).toBe(3)
    expect(_buildPayload({ ...baseFinding, severity: 'critical' }).reviewRating.ratingValue).toBe(1)
  })

  it('uses the first attributedOutlet as the itemReviewed.author', () => {
    const payload = _buildPayload(baseFinding)
    expect(payload.itemReviewed.author.name).toBe('Levante-EMV')
  })

  it('caps itemReviewed.appearance at 3 entries', () => {
    const fiveQuotes = Array.from({ length: 5 }, (_, i) => ({
      text: `Quote ${i}`,
      outlet: `Outlet ${i}`,
      articleUrl: `https://example.com/${i}`,
      sourceClaimId: `C-${i}`,
    }))
    const payload = _buildPayload({ ...baseFinding, quotes: fiveQuotes })
    expect(payload.itemReviewed.appearance).toHaveLength(3)
  })

  it('uses publishedAt for datePublished, falling back to latestArticleDate', () => {
    const withPub = _buildPayload(baseFinding)
    expect(withPub.datePublished).toBe('2026-05-01T09:00:00.000Z')
    const noPub = _buildPayload({ ...baseFinding, publishedAt: '' })
    expect(noPub.datePublished).toBe('2026-04-15T08:00:00.000Z')
  })

  it('falls back to "Múltiples medios" when no outlet is attributed', () => {
    const payload = _buildPayload({ ...baseFinding, attributedOutlets: [] })
    expect(payload.itemReviewed.author.name).toBe('Múltiples medios')
  })

  it('serializes cleanly as JSON (no circular refs / undefineds)', () => {
    const payload = _buildPayload(baseFinding)
    expect(() => JSON.parse(JSON.stringify(payload))).not.toThrow()
  })
})

const basePlenoFinding = {
  id: 'PF-2026-001',
  plenoId: '2026-04',
  plenoDate: '2026-04-15',
  title: 'Verificación de declaración del bloc PP sobre presupuesto',
  summary:
    'El bloc PP afirmó que el presupuesto crecía un 20%. Los datos CONPREL muestran un crecimiento del 8%.',
  severity: 'notable',
  sourceClaimIds: ['C-pleno-001'],
  quotes: [
    {
      text: 'El presupuesto municipal crecerá un 20% el próximo ejercicio',
      speakerGroup: 'PP',
      claimId: 'C-pleno-001',
    },
  ],
  corroboration: [],
  contradiction: [],
  relatedPromiseIds: [],
  curatorName: 'Curador',
  publishedAt: '2026-05-01',
}

describe('ClaimReviewJsonLd._buildPlenoPayload', () => {
  it('emits a ClaimReview envelope with the pleno session as the source', () => {
    const payload = _buildPlenoPayload(basePlenoFinding)
    expect(payload['@type']).toBe('ClaimReview')
    expect(payload.url).toContain('/hallazgos#PF-2026-001')
    expect(payload.itemReviewed.appearance).toHaveLength(1)
    // `/plenos/:id`, not `/plenos#id` — the index page renders no anchors, so
    // the fragment form resolved nowhere and this was the payload's only
    // provenance link.
    expect(payload.itemReviewed.appearance[0].url).toContain('/plenos/2026-04')
    expect(payload.itemReviewed.appearance[0].publisher.name).toBe(
      'Ajuntament de Riba-roja de Túria',
    )
  })

  it('types a bloc attribution as an Organization, never a Person', () => {
    // This test previously asserted `Person` + the bare bloc name, which is
    // what shipped: 48 of 52 findings declared a political group to be a human
    // being in the payload Google indexes.
    const payload = _buildPlenoPayload(basePlenoFinding)
    expect(payload.itemReviewed.author['@type']).toBe('Organization')
    expect(payload.itemReviewed.author.name).toBe('Grupo Municipal PP')
  })

  it('never publishes the "Otro" sentinel as an author', () => {
    // `Otro` is the extractor's "cannot tell which group is speaking" value.
    // It is not a group, and in this corporación it identified one councillor
    // by elimination.
    const payload = _buildPlenoPayload({
      ...basePlenoFinding,
      quotes: [{ ...basePlenoFinding.quotes[0], speakerGroup: 'Otro' }],
    })
    expect(JSON.stringify(payload)).not.toContain('Otro')
    expect(payload.itemReviewed.author['@type']).toBe('Organization')
  })

  it('prefers the individualSpeaker name when present (curator promoted)', () => {
    const payload = _buildPlenoPayload({
      ...basePlenoFinding,
      individualSpeaker: { slug: 'jane-doe', name: 'Jane Doe', party: 'PP' },
    })
    expect(payload.itemReviewed.author.name).toBe('Jane Doe')
  })

  it('falls back to the council itself when no speaker is recorded', () => {
    const payload = _buildPlenoPayload({ ...basePlenoFinding, quotes: [] })
    expect(payload.itemReviewed.author['@type']).toBe('Organization')
    expect(payload.itemReviewed.author.name).toBe('Pleno municipal de Riba-roja de Túria')
  })

  it('maps severity onto a rating between 1 and 5', () => {
    expect(
      _buildPlenoPayload({ ...basePlenoFinding, severity: 'critical' }).reviewRating.ratingValue,
    ).toBe(1)
    expect(
      _buildPlenoPayload({ ...basePlenoFinding, severity: 'notable' }).reviewRating.ratingValue,
    ).toBe(3)
    expect(
      _buildPlenoPayload({ ...basePlenoFinding, severity: 'informational' }).reviewRating
        .ratingValue,
    ).toBe(5)
  })

  it('serializes cleanly as JSON', () => {
    const payload = _buildPlenoPayload(basePlenoFinding)
    expect(() => JSON.parse(JSON.stringify(payload))).not.toThrow()
  })
})
