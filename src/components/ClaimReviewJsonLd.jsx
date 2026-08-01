/**
 * <ClaimReviewJsonLd> — emits a schema.org/ClaimReview JSON-LD block
 * for a press finding. Lets Google's Rich Results Test recognise our
 * editorial findings as structured fact-checks, the same standard
 * the Google Fact Check Tools API indexes (which is what we *read*
 * from in factcheck.ts — now we *publish* in the same format).
 *
 * Aligns CivicPulse with IFCN's transparency pillar #4 (methodology
 * disclosure) and GIJN's verification best practice.
 *
 * Rendered inside each finding card on /laboratorio and /hallazgos.
 * Multiple instances on a page are fine — search engines handle a
 * list of ClaimReview rows.
 *
 * Spec: https://schema.org/ClaimReview
 * Google docs: https://developers.google.com/search/docs/appearance/structured-data/factcheck
 */
import React from 'react'
import { isRealBloc } from '../lib/party-label.js'

const SITE_URL = 'https://civicpulse.es'

// schema.org best practice: ratingValue is an integer 1..5, alternateName
// is the human-readable rating. We project our severity buckets onto
// the ClaimReview rating scale — "informational" ≈ 5 (factually
// supported), "notable" ≈ 3 (mixed/partial), "critical" ≈ 1 (contradicted).
const SEVERITY_TO_RATING = {
  informational: { ratingValue: 5, alternateName: 'Verificado' },
  notable: { ratingValue: 3, alternateName: 'Parcialmente verificado' },
  critical: { ratingValue: 1, alternateName: 'Contradicho por datos municipales' },
}

function buildPayload(finding) {
  const rating = SEVERITY_TO_RATING[finding.severity] ?? SEVERITY_TO_RATING.informational
  const findingUrl = `${SITE_URL}/hallazgos#finding-${finding.id}`
  const author = finding.attributedOutlets?.[0] ?? 'Múltiples medios'
  const claimQuote = finding.quotes?.[0]?.text ?? finding.title

  return {
    '@context': 'https://schema.org',
    '@type': 'ClaimReview',
    url: findingUrl,
    claimReviewed: claimQuote.slice(0, 280),
    datePublished: finding.publishedAt || finding.latestArticleDate,
    author: {
      '@type': 'Organization',
      name: 'CivicPulse',
      url: SITE_URL,
    },
    itemReviewed: {
      '@type': 'Claim',
      author: { '@type': 'Organization', name: author },
      datePublished: finding.earliestArticleDate,
      appearance: (finding.quotes ?? []).slice(0, 3).map((q) => ({
        '@type': 'CreativeWork',
        url: q.articleUrl,
        publisher: { '@type': 'Organization', name: q.outlet },
      })),
    },
    reviewRating: {
      '@type': 'Rating',
      ratingValue: rating.ratingValue,
      bestRating: 5,
      worstRating: 1,
      alternateName: rating.alternateName,
    },
  }
}

/**
 * Pleno-finding variant. Schema differs from the press variant:
 *   · no `attributedOutlets[].articleUrl[]` — the "source" is the
 *     pleno session itself (acta URL when available, otherwise the
 *     session permalink on /plenos).
 *   · `itemReviewed.author` is the bloc (or named councillor when a
 *     curator promoted an individualSpeaker via promote-claim).
 *   · `appearance` collapses to a single CreativeWork pointing at
 *     the session — there's only one source per pleno finding.
 */
function buildPlenoPayload(finding) {
  const rating = SEVERITY_TO_RATING[finding.severity] ?? SEVERITY_TO_RATING.informational
  const findingUrl = `${SITE_URL}/hallazgos#${finding.id}`
  // `/plenos` renders no element with an id, so the old `#${plenoId}` fragment
  // resolved nowhere. `/plenos/:id` is the real route for a session.
  const plenoUrl = `${SITE_URL}/plenos/${finding.plenoId}`
  const claimQuote = finding.quotes?.[0]?.text ?? finding.title

  // Who is asserted to have made the claim, in the payload Google's Fact Check
  // Tools API indexes. Three cases, and the distinction is legally material:
  //
  // 1. A curator promoted an individual attribution → a real Person.
  // 2. Only bloc-level attribution → an Organization. A political group is not
  //    a person, and typing it `Person` published `{"@type":"Person","name":
  //    "PSOE"}` — and worse, `{"@type":"Person","name":"Otro"}` on 15 findings,
  //    where `Otro` was the extractor's "cannot tell" sentinel AND the label of
  //    a one-seat group, so it named that councillor by elimination.
  // 3. Neither → the council itself. Never a fabricated party name.
  const individual = finding.individualSpeaker?.name
  const bloc = finding.quotes?.[0]?.speakerGroup
  const claimAuthor = individual
    ? { '@type': 'Person', name: individual }
    : isRealBloc(bloc)
      ? { '@type': 'Organization', name: `Grupo Municipal ${bloc}` }
      : { '@type': 'Organization', name: 'Pleno municipal de Riba-roja de Túria' }

  return {
    '@context': 'https://schema.org',
    '@type': 'ClaimReview',
    url: findingUrl,
    claimReviewed: claimQuote.slice(0, 280),
    datePublished: finding.publishedAt || finding.plenoDate,
    author: {
      '@type': 'Organization',
      name: 'CivicPulse',
      url: SITE_URL,
    },
    itemReviewed: {
      '@type': 'Claim',
      author: claimAuthor,
      datePublished: finding.plenoDate,
      appearance: [
        {
          '@type': 'CreativeWork',
          url: plenoUrl,
          publisher: {
            '@type': 'GovernmentOrganization',
            name: 'Ajuntament de Riba-roja de Túria',
          },
        },
      ],
    },
    reviewRating: {
      '@type': 'Rating',
      ratingValue: rating.ratingValue,
      bestRating: 5,
      worstRating: 1,
      alternateName: rating.alternateName,
    },
  }
}

/**
 * Discriminator: press findings carry `attributedOutlets`; pleno
 * findings carry `plenoId`. Pick the right builder so each surface
 * gets a schema.org-valid payload without intermixing fields that
 * Rich Results would reject.
 */
function isPlenoFinding(finding) {
  return Boolean(finding && finding.plenoId)
}

export default function ClaimReviewJsonLd({ finding }) {
  if (!finding || !finding.title) return null
  const payload = isPlenoFinding(finding) ? buildPlenoPayload(finding) : buildPayload(finding)
  // dangerouslySetInnerHTML + JSON.stringify is the canonical pattern —
  // React doesn't trust `<script>` contents, but JSON-LD is data, not code.
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(payload) }}
    />
  )
}

export { buildPayload as _buildPayload, buildPlenoPayload as _buildPlenoPayload }
