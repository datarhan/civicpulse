/**
 * ClaimReview JSON-LD payload tests.
 *
 * Two jobs:
 *
 *  1. Lock the schema.org/ClaimReview shape we publish, so a refactor
 *     doesn't silently break Google's Rich Results Test (which is how
 *     third-party indexers — including the Google Fact Check Tools API we
 *     *consume* — pick up our findings).
 *
 *  2. Lock the ADJUDICATION GATE. Until 2026-08-09 `reviewRating` was
 *     projected from `severity`, so a councillor's own words went out to
 *     Google's fact-check index carrying CivicPulse's 5/5 «Verificado» on
 *     the strength of nothing but the finding being filed as
 *     `informational` — which is what the auto-curators write by default.
 *     The rule now is: no adjudication, no markup; and the rating is never
 *     a function of severity.
 *
 * These tests must DISCRIMINATE, not merely be green. Every gate assertion
 * below is paired with a positive control, because "emit never" would pass
 * a suite that only checked for absence (docs/DATA_INTEGRITY.md).
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'

import ClaimReviewJsonLd, {
  hasAdjudication,
  _buildPayload,
  _buildPlenoPayload,
} from '../src/components/ClaimReviewJsonLd.jsx'
import { ALLOWED_FINDING_SEVERITIES } from '../src/scraper/pleno-finding'

/** A contradiction ref, the only thing that unlocks the markup. */
const CONTRA_REF = {
  kind: 'tender',
  ref: 'https://contrataciondelestado.es/exp/251-2023',
  snippet: 'El expediente sigue en licitación en la fecha en que se afirma que estaba terminado.',
}

/**
 * Press finding as the auto-curator writes it: `informational`, and
 * `contradiction: []`. It is the shape every published finding on both
 * surfaces had on 2026-08-09, which is why the old severity mapping was live
 * on essentially all of them.
 */
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
  crossChecked: [],
  contradiction: [],
  relatedPromiseIds: [],
  relatedPlenoItems: [],
  curatorName: 'Curador',
  publishedAt: '2026-05-01T09:00:00.000Z',
}

/** The same finding, after a curator lands a real refutation. */
const adjudicatedFinding = { ...baseFinding, contradiction: [CONTRA_REF] }

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
  crossChecked: [],
  contradiction: [],
  relatedPromiseIds: [],
  curatorName: 'Curador',
  publishedAt: '2026-05-01',
}

const adjudicatedPlenoFinding = { ...basePlenoFinding, contradiction: [CONTRA_REF] }

// ─── The gate ───────────────────────────────────────────────────────────────

describe('ClaimReview adjudication gate', () => {
  it('hasAdjudication is true only for a non-empty contradiction[]', () => {
    expect(hasAdjudication(adjudicatedPlenoFinding)).toBe(true)
    expect(hasAdjudication(basePlenoFinding)).toBe(false)
    // The three near-misses that have each been mistaken for a verdict.
    expect(hasAdjudication({ ...basePlenoFinding, severity: 'critical' })).toBe(false)
    expect(hasAdjudication({ ...basePlenoFinding, crossChecked: [CONTRA_REF] })).toBe(false)
    expect(hasAdjudication({ ...basePlenoFinding, contradiction: undefined })).toBe(false)
    expect(hasAdjudication(null)).toBe(false)
  })

  it('emits NOTHING for an unadjudicated pleno finding (the published-shape reproducer)', () => {
    expect(_buildPlenoPayload(basePlenoFinding)).toBeNull()
    expect(renderToStaticMarkup(<ClaimReviewJsonLd finding={basePlenoFinding} />)).toBe('')
  })

  it('emits NOTHING for an unadjudicated press finding', () => {
    expect(_buildPayload(baseFinding)).toBeNull()
    expect(renderToStaticMarkup(<ClaimReviewJsonLd finding={baseFinding} />)).toBe('')
  })

  it('POSITIVE CONTROL: still emits when the finding carries a contradiction', () => {
    // Without this the rule could be "emit never" and every absence
    // assertion above would still be green.
    const pleno = _buildPlenoPayload(adjudicatedPlenoFinding)
    expect(pleno).not.toBeNull()
    expect(pleno.reviewRating.ratingValue).toBe(1)
    expect(pleno.reviewRating.alternateName).toBe('Contradicho por datos municipales')

    const press = _buildPayload(adjudicatedFinding)
    expect(press).not.toBeNull()
    expect(press.reviewRating.ratingValue).toBe(1)

    const html = renderToStaticMarkup(<ClaimReviewJsonLd finding={adjudicatedPlenoFinding} />)
    expect(html).toContain('application/ld+json')
    expect(JSON.parse(html.replace(/^.*?>|<\/script>$/g, ''))['@type']).toBe('ClaimReview')
  })

  it('INVARIANT: reviewRating is never a function of severity', () => {
    // This is the policy, so it is asserted as a policy: hold the
    // adjudication fixed, sweep severity across the whole enum (imported,
    // never restated — docs/DATA_INTEGRITY.md rule 1) and require the
    // rating not to move.
    expect(ALLOWED_FINDING_SEVERITIES.length).toBeGreaterThan(1)
    const ratings = ALLOWED_FINDING_SEVERITIES.map(
      (severity) => _buildPlenoPayload({ ...adjudicatedPlenoFinding, severity }).reviewRating,
    )
    for (const r of ratings) expect(r).toEqual(ratings[0])

    const pressRatings = ALLOWED_FINDING_SEVERITIES.map(
      (severity) => _buildPayload({ ...adjudicatedFinding, severity }).reviewRating,
    )
    for (const r of pressRatings) expect(r).toEqual(pressRatings[0])

    // And severity never moves the gate either: an `informational` row with
    // a refutation publishes, a `critical`-looking row without one does not.
    expect(
      _buildPlenoPayload({ ...adjudicatedPlenoFinding, severity: 'informational' }),
    ).not.toBeNull()
    expect(_buildPlenoPayload({ ...basePlenoFinding, severity: 'critical' })).toBeNull()

    // The retired vocabulary must not come back through another door.
    const json = JSON.stringify(_buildPlenoPayload(adjudicatedPlenoFinding))
    expect(json).not.toContain('Verificado')
    expect(json).not.toContain('Parcialmente verificado')
  })
})

// ─── The published snapshots ────────────────────────────────────────────────

const PLENO_SNAPSHOT = resolve(__dirname, '..', 'public', 'data', 'pleno-findings.json')
const PRESS_SNAPSHOT = resolve(__dirname, '..', 'public', 'data', 'press-findings.json')

describe('ClaimReview against the published snapshots', () => {
  it('emits zero blocks for the published pleno findings — and proves it measured them', () => {
    const items = JSON.parse(readFileSync(PLENO_SNAPSHOT, 'utf8')).items
    // Size gate FIRST. A "no bad blocks" pass over an empty file is the
    // exact failure this repo has shipped twice.
    expect(items.length).toBeGreaterThan(10)

    const emitted = items.map(_buildPlenoPayload).filter(Boolean)
    expect(emitted).toHaveLength(0)

    // Why it is zero: nothing published carries a refutation. Asserted
    // separately so a builder that always returned null could not pass as
    // "the data has no adjudications".
    expect(items.filter((f) => (f.contradiction ?? []).length > 0)).toHaveLength(0)

    // CONTROL on the real data: the very same published row emits as soon
    // as it carries one. The zero above measures the snapshot, not a dead
    // builder.
    const control = _buildPlenoPayload({ ...items[0], contradiction: [CONTRA_REF] })
    expect(control).not.toBeNull()
    expect(control.reviewRating.ratingValue).toBe(1)
  })

  it('emits zero blocks for the published press findings, and the identity holds when rows land', () => {
    const items = JSON.parse(readFileSync(PRESS_SNAPSHOT, 'utf8')).items
    expect(Array.isArray(items)).toBe(true)

    const emit = (rows) => rows.map(_buildPayload).filter(Boolean)
    const adjudicated = (rows) => rows.filter((f) => (f.contradiction ?? []).length > 0)

    expect(emit(items)).toHaveLength(0)
    expect(emit(items)).toHaveLength(adjudicated(items).length)

    // press-findings.json is legitimately empty, so a size gate here would be
    // a lie — and the two assertions above cannot fail over an empty array no
    // matter what the builder does. Re-run the identity over the snapshot
    // PLUS one row of each kind, so this test measures the gate and not the
    // emptiness of the file.
    const probe = [...items, baseFinding, adjudicatedFinding]
    expect(emit(probe)).toHaveLength(1)
    expect(emit(probe)).toHaveLength(adjudicated(probe).length)
    expect(emit(probe)[0].reviewRating.ratingValue).toBe(1)
  })
})

// ─── Envelope shape (only reachable on the adjudicated path now) ────────────

describe('ClaimReviewJsonLd._buildPayload', () => {
  it('emits a schema.org/ClaimReview envelope with required fields', () => {
    const payload = _buildPayload(adjudicatedFinding)
    expect(payload['@context']).toBe('https://schema.org')
    expect(payload['@type']).toBe('ClaimReview')
    expect(payload.url).toContain('/hallazgos#finding-F-2026-001')
    expect(payload.author.name).toBe('CivicPulse')
    expect(payload.author['@type']).toBe('Organization')
  })

  it('uses the first quote text as claimReviewed (truncated ≤280 chars)', () => {
    const longText = 'x'.repeat(400)
    const payload = _buildPayload({
      ...adjudicatedFinding,
      quotes: [{ ...adjudicatedFinding.quotes[0], text: longText }],
    })
    expect(payload.claimReviewed.length).toBe(280)
  })

  it('falls back to the title when no quotes exist', () => {
    const payload = _buildPayload({ ...adjudicatedFinding, quotes: [] })
    expect(payload.claimReviewed).toBe(adjudicatedFinding.title)
  })

  it('uses the first attributedOutlet as the itemReviewed.author', () => {
    const payload = _buildPayload(adjudicatedFinding)
    expect(payload.itemReviewed.author.name).toBe('Levante-EMV')
  })

  it('caps itemReviewed.appearance at 3 entries', () => {
    const fiveQuotes = Array.from({ length: 5 }, (_, i) => ({
      text: `Quote ${i}`,
      outlet: `Outlet ${i}`,
      articleUrl: `https://example.com/${i}`,
      sourceClaimId: `C-${i}`,
    }))
    const payload = _buildPayload({ ...adjudicatedFinding, quotes: fiveQuotes })
    expect(payload.itemReviewed.appearance).toHaveLength(3)
  })

  it('uses publishedAt for datePublished, falling back to latestArticleDate', () => {
    const withPub = _buildPayload(adjudicatedFinding)
    expect(withPub.datePublished).toBe('2026-05-01T09:00:00.000Z')
    const noPub = _buildPayload({ ...adjudicatedFinding, publishedAt: '' })
    expect(noPub.datePublished).toBe('2026-04-15T08:00:00.000Z')
  })

  it('falls back to "Múltiples medios" when no outlet is attributed', () => {
    const payload = _buildPayload({ ...adjudicatedFinding, attributedOutlets: [] })
    expect(payload.itemReviewed.author.name).toBe('Múltiples medios')
  })

  it('serializes cleanly as JSON (no circular refs / undefineds)', () => {
    const payload = _buildPayload(adjudicatedFinding)
    expect(() => JSON.parse(JSON.stringify(payload))).not.toThrow()
  })
})

describe('ClaimReviewJsonLd._buildPlenoPayload', () => {
  it('emits a ClaimReview envelope with the pleno session as the source', () => {
    const payload = _buildPlenoPayload(adjudicatedPlenoFinding)
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
    const payload = _buildPlenoPayload(adjudicatedPlenoFinding)
    expect(payload.itemReviewed.author['@type']).toBe('Organization')
    expect(payload.itemReviewed.author.name).toBe('Grupo Municipal PP')
  })

  it('never publishes the "Otro" sentinel as an author', () => {
    // `Otro` is the extractor's "cannot tell which group is speaking" value.
    // It is not a group, and in this corporación it identified one councillor
    // by elimination.
    const payload = _buildPlenoPayload({
      ...adjudicatedPlenoFinding,
      quotes: [{ ...adjudicatedPlenoFinding.quotes[0], speakerGroup: 'Otro' }],
    })
    expect(JSON.stringify(payload)).not.toContain('Otro')
    expect(payload.itemReviewed.author['@type']).toBe('Organization')
  })

  it('prefers the individualSpeaker name when present (curator promoted)', () => {
    const payload = _buildPlenoPayload({
      ...adjudicatedPlenoFinding,
      individualSpeaker: { slug: 'jane-doe', name: 'Jane Doe', party: 'PP' },
    })
    expect(payload.itemReviewed.author.name).toBe('Jane Doe')
  })

  it('falls back to the council itself when no speaker is recorded', () => {
    const payload = _buildPlenoPayload({ ...adjudicatedPlenoFinding, quotes: [] })
    expect(payload.itemReviewed.author['@type']).toBe('Organization')
    expect(payload.itemReviewed.author.name).toBe('Pleno municipal de Riba-roja de Túria')
  })

  it('serializes cleanly as JSON', () => {
    const payload = _buildPlenoPayload(adjudicatedPlenoFinding)
    expect(() => JSON.parse(JSON.stringify(payload))).not.toThrow()
  })
})
