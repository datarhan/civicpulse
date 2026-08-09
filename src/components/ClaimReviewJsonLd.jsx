/**
 * <ClaimReviewJsonLd> — emits a schema.org/ClaimReview JSON-LD block for a
 * finding that carries an actual adjudication, and NOTHING AT ALL for one
 * that does not.
 *
 * Rendered inside each finding card on /hallazgos (pleno) and /laboratorio
 * (press). Multiple instances on a page are fine — search engines handle a
 * list of ClaimReview rows. Zero instances is also fine, and is the normal
 * state today; see below.
 *
 * Spec: https://schema.org/ClaimReview
 * Google docs: https://developers.google.com/search/docs/appearance/structured-data/factcheck
 *
 * ── Why the gate exists ─────────────────────────────────────────────────
 *
 * `claimReviewed` is the speaker's OWN words — a councillor's line from the
 * transcript, or an outlet's sentence — and `reviewRating` is published
 * beside it, in the format Google's Fact Check Tools API indexes, as
 * CivicPulse's verdict ON those words. Until 2026-08-09 that rating was
 * projected from `severity`:
 *
 *     informational → 5 «Verificado»
 *     notable       → 3 «Parcialmente verificado»
 *     critical      → 1 «Contradicho por datos municipales»
 *
 * That is a category error, not a mis-tuned scale. `severity` grades how
 * grave OUR finding is (`pleno-finding.ts`, `press-finding.ts`); `critical`
 * is gated on carrying a contradiction ref, and the other two are simply
 * editorial weight. None of it says whether the quoted sentence is true.
 * The two axes are orthogonal and one was being projected onto the other.
 *
 * The damage came from the default: `informational` is what the
 * auto-curators write, so on the snapshot as published on 2026-08-09 every
 * pleno finding but one was syndicating a politician's own line as
 * CivicPulse-rated 5/5 «Verificado» — including partisan attack lines, raw
 * Whisper fragments, and a statement about a named living man that carried
 * no `speakerGroup`, so the payload attributed it to «Pleno municipal de
 * Riba-roja de Túria» and rated it verified. Most of those quotes' own
 * claim-level verdicts were `sin-datos`. /metodologia says so in plain
 * words: «ningún paso de este proceso comprueba que un documento respalde
 * una frase —los cruces son coincidencias de importe o de palabras en un
 * título». The markup asserted the opposite of the published contract.
 *
 * ── What counts as an adjudication ──────────────────────────────────────
 *
 * `contradiction[]`, and only that. It is the one field in either finding
 * schema populated from a directional verdict about a claim: both
 * auto-curators route a ref into it exactly when
 * `evidenceStance(ev) === 'contradicts'` (`auto-curate.ts`,
 * `press-auto-curate.ts`), and a curator may add one by hand. Everything
 * else lands in `crossChecked[]`.
 *
 * `EvidenceStance` (claim-verifier.ts) has two members — `'contradicts'`
 * and `'checked'` — and the absent third is the whole reason this gate can
 * only ever rate downward. Nothing in this repo establishes that a document
 * SUPPORTS a sentence, so there is no honest source for a rating above the
 * floor. `crossChecked[]` explicitly means "what we looked at", not "what
 * agrees" — it was renamed from `corroboration` precisely because the old
 * name asserted a verdict its contents never carried.
 *
 * Claim-level verdicts are not a way around this. The press side has a
 * richer vocabulary (`verificado` / `parcial` / `contradicho` / `sin-datos`
 * in press-claims-verified.json), but it comes from the same deterministic
 * matcher — `press-verifier.ts` projects a press claim into `verifyClaim`
 * — whose `verificado` precision /metodologia publishes from the eval
 * harness as a minority of cases, and whose own header refuses to emit a
 * `corroborates` stance for exactly that reason. Its one directional
 * member, `contradicho`, already arrives here as a `contradiction[]` ref.
 * So the press variant is gated on the same field: mapping a press
 * `verificado` onto 5/5 would republish the same category error one layer
 * down.
 *
 * ── Consequence ─────────────────────────────────────────────────────────
 *
 * The rating therefore has exactly one reachable value, derived from the
 * contradiction refs and never from `severity`. On both published
 * snapshots `contradiction[]` is empty everywhere, so this component emits
 * zero blocks today. That is the correct output, not a regression: a
 * fact-check we did not perform must not be syndicated as one. The
 * capability stays wired — the day a curator lands a real contradiction
 * ref, the markup returns on its own, rating the claim contradicted.
 */
import React from 'react'
import { isRealBloc } from '../lib/party-label.js'

const SITE_URL = 'https://civicpulse.es'

/**
 * The only rating this component can honestly publish. `contradiction[]` is
 * the only adjudication either schema records, and it is directional in one
 * direction, so the scale collapses to its floor. Deliberately NOT a lookup
 * keyed by severity: there is no severity in this module any more, which is
 * the structural half of the fix.
 */
const ADJUDICATED_RATING = Object.freeze({
  ratingValue: 1,
  bestRating: 5,
  worstRating: 1,
  alternateName: 'Contradicho por datos municipales',
})

/**
 * Does this finding carry a verdict about the truth of the quoted claim?
 *
 * The single gate for both builders and for the component. Read the header
 * before loosening it: `severity`, `crossChecked[]` and a high
 * `similarity` are each a reason someone has already tried, and none of
 * them records that anybody adjudicated the sentence.
 */
export function hasAdjudication(finding) {
  return Array.isArray(finding?.contradiction) && finding.contradiction.length > 0
}

function buildPayload(finding) {
  // Unadjudicated → no payload. Emitting the envelope without a rating is
  // not an option either: `reviewRating` is required by the spec, and a
  // ClaimReview with no verdict still asserts that a review happened.
  if (!hasAdjudication(finding)) return null

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
    reviewRating: { '@type': 'Rating', ...ADJUDICATED_RATING },
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
 *
 * Same adjudication gate; see the header.
 */
function buildPlenoPayload(finding) {
  if (!hasAdjudication(finding)) return null

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
    reviewRating: { '@type': 'Rating', ...ADJUDICATED_RATING },
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
  // No adjudication, no markup. The card still renders — this component only
  // ever contributed the machine-readable verdict, and there isn't one.
  if (!payload) return null
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
