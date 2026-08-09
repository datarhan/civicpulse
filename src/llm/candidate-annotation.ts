/**
 * The similarity annotation the verifier prompts glue onto a retrieved
 * candidate — and the inverse that takes it back off.
 *
 * Both live here, in one file, because they are one decision seen from two
 * sides. `buildClaimVerifierUserPrompt` and `engineCandBlock` render each
 * candidate as
 *
 *     [3] tender · <snippet> · sim=0.50
 *
 * so the model is looking at a line whose tail is a number this pipeline
 * computed, joined to the document's own text with the same ` · ` separator
 * the snippet already uses internally. Prompt v2 then asks the model to return
 * an `evidence[].snippet`, and models routinely return the line they were
 * shown rather than the substring that came from the document. The runner
 * stored that verbatim, `auto-curate`/`promote-claim` copied it into a
 * finding's `crossChecked[]`, and /hallazgos published it: on the snapshot as
 * shipped, one «Documentos cotejados» row ended «… · unknown · sim=0.50»,
 * presenting the matcher's own cosine score to the reader as if it were part
 * of the record it cites. The regrounding flags hold worse — one snippet there
 * carries the whole rendered line, `kind · ref=<url> …`, prefix included.
 *
 * A score is not evidence. It is how confident a retrieval step was, and this
 * repo's published contract (/metodologia) is explicit that «los cruces son
 * coincidencias de importe o de palabras en un título» — a number beside a
 * document invites exactly the reading that sentence exists to refuse.
 *
 * Keeping the emitter and its inverse apart is how the strip would rot: bump
 * the format in the prompt (three decimals, a different separator) and a
 * stripper written from memory elsewhere silently stops matching, which looks
 * identical to nothing needing stripping. Anything that renders the annotation
 * calls `formatSimilarityAnnotation`; anything that persists a model-authored
 * snippet calls `stripSimilarityAnnotation`. `round-trips through
 * formatSimilarityAnnotation` in tests/candidate-annotation.test.ts pins them
 * together.
 */

/**
 * Render the trailing similarity annotation, or '' when the candidate has no
 * score. Exactly the string the two candidate blocks used to build inline.
 */
export function formatSimilarityAnnotation(similarity?: number | null): string {
  return similarity != null ? ` · sim=${similarity.toFixed(2)}` : ''
}

/**
 * Matches one or more trailing annotations at the end of a string.
 *
 * Repeated (`(?:…)+`) because a snippet that has already round-tripped
 * through a re-verification pass can carry two, and tolerant of a trailing
 * full stop because the model sometimes ends the sentence it copied. Anchored
 * to the end: a `sim=` inside the body of a document title is not this
 * pipeline's annotation and is left alone.
 */
export const SIMILARITY_ANNOTATION_RE = /(?:\s*·\s*sim=\d+(?:[.,]\d+)?\.?)+\s*$/u

/**
 * Remove the annotation from a snippet a model gave back to us.
 *
 * Deterministic and idempotent. It removes only what
 * `formatSimilarityAnnotation` can produce, so it can never eat text that came
 * from a document.
 */
export function stripSimilarityAnnotation(snippet: string): string {
  return snippet.replace(SIMILARITY_ANNOTATION_RE, '').trimEnd()
}
