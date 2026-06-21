/**
 * Pure content-sanity check for a pleno transcript, run before the LLM claim
 * extractor consumes it. The extractor windows the transcript by character
 * count and feeds each window to the LLM; a corrupt, empty, truncated, or
 * non-transcript file (e.g. an HTML error page saved by a failed download)
 * would silently yield junk claims that then flow toward curated findings —
 * a libel surface. This gate lets the extractor skip such files loudly.
 *
 * Deliberately NOT validating timestamp monotonicity: the extractor ignores
 * timestamps, and ~70% of our corpus is acta-derived text stamped with
 * placeholder [0.0 → 0.0] on every line. Both audio- and acta-style
 * transcripts are valid here.
 */

/** A line that opens with a `[start → end]` (or `->`) timestamp marker. */
const TIMESTAMP_LINE = /^\s*\[\s*\d+(?:\.\d+)?\s*(?:→|->)\s*\d+(?:\.\d+)?\s*\]/

/** Minimum substantive (non-whitespace) characters for a usable transcript. */
export const MIN_SUBSTANTIVE_CHARS = 200
/** Minimum non-empty lines. */
export const MIN_NON_EMPTY_LINES = 3
/** Minimum fraction of non-empty lines that must carry a timestamp marker. */
export const MIN_PARSEABLE_FRACTION = 0.5

export interface TranscriptAssessment {
  ok: boolean
  issues: string[]
  stats: {
    chars: number
    nonEmptyLines: number
    timestampedLines: number
    parseableFraction: number
  }
}

export function assessTranscript(text: string): TranscriptAssessment {
  const raw = typeof text === 'string' ? text : ''
  const substantiveChars = raw.replace(/\s+/g, '').length
  const lines = raw.split(/\r?\n/)
  const nonEmpty = lines.filter((l) => l.trim().length > 0)
  const timestamped = nonEmpty.filter((l) => TIMESTAMP_LINE.test(l))
  const parseableFraction = nonEmpty.length === 0 ? 0 : timestamped.length / nonEmpty.length

  const issues: string[] = []
  if (substantiveChars < MIN_SUBSTANTIVE_CHARS) {
    issues.push(
      `transcripción vacía o demasiado corta (${substantiveChars} caracteres < ${MIN_SUBSTANTIVE_CHARS})`,
    )
  }
  if (nonEmpty.length < MIN_NON_EMPTY_LINES) {
    issues.push(`muy pocas líneas (${nonEmpty.length} < ${MIN_NON_EMPTY_LINES})`)
  }
  // Only flag the format when there IS substantive content — an empty file is
  // already covered above, and we don't want to double-report it as "wrong
  // format".
  if (substantiveChars >= MIN_SUBSTANTIVE_CHARS && parseableFraction < MIN_PARSEABLE_FRACTION) {
    issues.push(
      `formato no reconocido: solo ${timestamped.length}/${nonEmpty.length} líneas con marca de tiempo ` +
        `(¿no es una transcripción [inicio → fin]?)`,
    )
  }

  return {
    ok: issues.length === 0,
    issues,
    stats: {
      chars: raw.length,
      nonEmptyLines: nonEmpty.length,
      timestampedLines: timestamped.length,
      parseableFraction: Math.round(parseableFraction * 100) / 100,
    },
  }
}
