/**
 * Does a verbatim passage still appear in the document it was lifted from?
 *
 * Shared by every surface that has to answer that question, because they all
 * answer it about the same corpus and a second copy would drift:
 *
 *   · `check:finding-quotes` — a published quote vs its pleno transcript.
 *   · `check:citations`      — a source excerpt vs the document at its URL.
 *   · `repoint-source-url`   — refuses to move a citation to a document that
 *                              no longer contains what the citation quotes.
 *
 * It lived in `scripts/check-finding-quotes.ts` first and was hoisted here the
 * day a second caller appeared, rather than copied. `DATA_INTEGRITY.md` rule 1
 * is about exactly that fork: six tests restated a shape instead of importing
 * it and stayed green while production matched nothing.
 */

/**
 * Normalise for comparison. The two sides are formatted differently in ways
 * that have nothing to do with what was said:
 *
 *   transcripts   `[12.3 → 15.6] (SPEAKER_00)` prefixes, line breaks
 *   PDF extracts  list bullets orphaned onto their own line, page numbers
 *                 injected mid-sentence, hard-wrapped lines
 *   quotes        curly punctuation, trimmed differently by each curator
 *
 * Collapsing both to bare lowercase words compares the words, not the layout.
 * Dropping all punctuation is what makes the PDF case work: a `- ` bullet and
 * a bare newline normalise to the same single space.
 */
export function normaliseForQuoteMatch(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\[\d+\.?\d*\s*→\s*\d+\.?\d*\]/g, ' ')
    .replace(/\((?:SPEAKER_\d+|UNKNOWN)[^)]*\)/gi, ' ')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Is `quote` present in `haystack`?
 *
 * Slides a word window across the whole quote rather than testing only its
 * start. The leading-window-only version reported four published quotes as
 * untraceable that were verbatim in the transcript, because a curator had
 * trimmed the opening differently:
 *
 *   quote      "los 50-60% que sí que se retiran de contenedores al día"
 *   transcript "pasar esos 50-60% que sí que se retiran de contenedores al día"
 *
 * Every word after the first two matches. Anchoring on the first eight made
 * that indistinguishable from an invented sentence — and these checks exist
 * precisely to tell those apart, so a false positive here is not cosmetic: it
 * spends a curator's attention on a sound citation and, worse, trains everyone
 * to discount the ones that are real.
 */
export function quoteAppearsIn(quote: string, haystack: string, words = 8): boolean {
  return quoteAppearsInPrepared(quote, prepararHeno(haystack), words)
}

/**
 * Un texto ya normalizado, para quien pregunta MUCHAS citas contra el mismo.
 *
 * Normalizar es todo el coste de `quoteAppearsIn`: medido sobre una
 * transcripción de 274 KB, 6,11 ms de normalización contra 0,04 ms de búsqueda
 * — el 100 % dentro del ruido. La puerta de publicación pregunta por las 6.919
 * declaraciones del corpus y normalizaba las ~25 transcripciones una vez por
 * cada una: 42 s de trabajo del que 41,8 son repetir lo mismo.
 *
 * Va envuelto en un objeto y no como `string` a propósito: un heno crudo pasado
 * por error a `quoteAppearsInPrepared` compilaría y devolvería falsos negativos
 * silenciosos, que en este emparejador significa publicar «esta cita no consta
 * en ninguna acta» de una que sí.
 */
export interface HenoPreparado {
  readonly normalizado: string
}

export function prepararHeno(haystack: string): HenoPreparado {
  return { normalizado: normaliseForQuoteMatch(haystack) }
}

/**
 * La regla de emparejamiento, una sola vez. `quoteAppearsIn` es esto con el
 * heno preparado al vuelo; no hay dos implementaciones que puedan discrepar.
 */
export function quoteAppearsInPrepared(quote: string, heno: HenoPreparado, words = 8): boolean {
  const q = normaliseForQuoteMatch(quote).split(' ').filter(Boolean)
  if (q.length === 0) return false
  const hay = heno.normalizado
  const n = Math.min(words, q.length)
  for (let i = 0; i + n <= q.length; i += 1) {
    if (hay.includes(q.slice(i, i + n).join(' '))) return true
  }
  return false
}

/**
 * Longest contiguous run of the quote's words present in the haystack, as a
 * share of the quote. Reported for the ones that fail, because "0.15 of it is
 * there" and "0.85 of it is there" are different editorial problems: the first
 * is an invented sentence, the second is a quote welded together from two
 * separate passages.
 */
export function quoteCoverage(quote: string, haystack: string): number {
  const q = normaliseForQuoteMatch(quote).split(' ').filter(Boolean)
  if (q.length === 0) return 0
  const hay = normaliseForQuoteMatch(haystack)
  let best = 0
  for (let i = 0; i < q.length; i += 1) {
    for (let n = q.length - i; n > best; n -= 1) {
      if (hay.includes(q.slice(i, i + n).join(' '))) {
        best = n
        break
      }
    }
  }
  return best / q.length
}
