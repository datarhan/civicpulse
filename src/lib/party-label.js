// @ts-check
/**
 * How a political-group code is written for a reader.
 *
 * `Otro` carries two incompatible meanings in this repo's data, and the
 * ambiguity is legally material. In `officials.json` it was the label for a
 * real party the logo classifier could not recognise; in `pleno-claims` and
 * `pleno-findings` it is the LLM's "I cannot tell which group is speaking"
 * fallback. Because Riba-roja's corporación had exactly ONE councillor sitting
 * under `Otro` — José Manuel Gallardo Martínez, Grupo Municipal Esquerra
 * Unida-Podem — the site published sentences like «El grupo Otro afirma que…»
 * beside a seat map stating Otro holds one seat. Bloc-level attribution, the
 * whole libel guard, named a specific man by elimination.
 *
 * The recognised party now carries its real name (see `partyFromLogo`), so
 * `Otro` is left meaning only "not determined" — and is rendered as such,
 * never as a party.
 *
 * As of the `retire:otro-sentinel` migration no published snapshot carries
 * `speakerGroup: "Otro"` any more, and the validators reject it (see
 * SPEAKER_GROUPS in src/scraper/pleno-votes.ts). The branch below is kept
 * deliberately: a reader mid-session can still be holding an older snapshot
 * from the HTTP cache, and this is the layer that has to render it honestly.
 * It is a stale-data guard, not a live code path.
 */

/** Group codes that identify a real political group. */
export const REAL_BLOCS = ['PSOE', 'PP', 'VOX', 'Compromís', 'Ciudadanos', 'EU-Podem']

/**
 * Reader-facing name for a bloc code.
 * @param {string|null|undefined} bloc
 * @returns {string}
 */
export function blocLabel(bloc) {
  if (!bloc || bloc === 'Otro') return 'Grupo no identificado'
  return bloc
}

/**
 * Does this code name an actual political group? Use before attributing a
 * statement, a vote or a ClaimReview author to a party.
 * @param {string|null|undefined} bloc
 */
export function isRealBloc(bloc) {
  return Boolean(bloc) && REAL_BLOCS.includes(/** @type {string} */ (bloc))
}
