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

/**
 * Share of substantive lines that are duplicates of another line.
 *
 * `transcript-sanity` already refuses CATASTROPHIC degeneration — under 20%
 * unique lines, or one line filling 30% of the file — which is what the July
 * 2026 hallucination loop looked like. It is blind to the DIFFUSE kind: many
 * different lines each repeated two to four times, which is what Whisper
 * produces on Valencian speech. `mvb5nl` is 74% duplicated by this measure and
 * passes that gate with uniqueRatio 0.476 and topLineShare 0.007.
 *
 * The separation between engines is stark and leaves no judgement call:
 * the 18 transcripts redone with gpt-4o-transcribe-diarize average **0.4%**;
 * the 26 still on Whisper average **15.4%**. 25% sits far above the clean
 * population and below every genuinely contaminated one worth blocking.
 *
 * Extracting claims from repeated lines manufactures duplicate "declarations"
 * that a councillor said once — worse than extracting nothing, because it
 * looks like corroboration.
 */
export const MAX_DUPLICATE_SHARE = 0.25

/** Ignore short lines: "Sí.", "Gracias." legitimately repeat in a plenary. */
const DUPLICATE_MIN_LINE_CHARS = 15

export function duplicateShare(text: string): number {
  const lines = (text ?? '')
    .split('\n')
    .map((l) =>
      l
        .replace(/^\[[^\]]*\]\s*/, '')
        .replace(/^\([^)]*\)\s*/, '')
        .trim(),
    )
    .filter((l) => l.length > DUPLICATE_MIN_LINE_CHARS)
  if (lines.length === 0) return 0
  const counts = new Map<string, number>()
  for (const l of lines) counts.set(l, (counts.get(l) ?? 0) + 1)
  const duplicated = [...counts.values()].filter((n) => n > 1).reduce((a, b) => a + b, 0)
  return duplicated / lines.length
}

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
  // Diffuse repetition: the failure mode Whisper produces on Valencian, and the
  // one transcript-sanity is blind to. Blocking extraction here is deliberate —
  // claims mined from repeated lines look like a councillor said the same thing
  // four times, which reads as emphasis or corroboration and is neither.
  const dupShare = duplicateShare(raw)
  if (substantiveChars >= MIN_SUBSTANTIVE_CHARS && dupShare > MAX_DUPLICATE_SHARE) {
    issues.push(
      `repetición difusa: ${Math.round(dupShare * 100)}% de las líneas están duplicadas ` +
        `(máx ${Math.round(MAX_DUPLICATE_SHARE * 100)}%) — típico de Whisper sobre valenciano; ` +
        `re-transcribe antes de extraer`,
    )
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
