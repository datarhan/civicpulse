/**
 * Degenerate-transcript detector for the Whisper pipeline.
 *
 * Whisper (all engines, but especially whisper-1 fed one multi-hour request)
 * can collapse into a repetition loop seeded by music/silence: the July-2026
 * corpus produced five published transcripts that were nothing but
 * "Más información www.alimmenta.com", "Más palabras", "no", "." or
 * "SEÑOR PRESIDENTE DE LA JUNTA DE EXTREMADURA" repeated for hours, plus one
 * half-real/half-loop file. This gate sits between the engine and
 * public/data/pleno-transcripts/ — a transcript that fails is quarantined,
 * never published, and the pleno stays in the pipeline's backlog for retry.
 *
 * Thresholds are calibrated against the real corpus (2026-07-29 sweep):
 * every genuine transcript passes — including a 21-line extraordinario —
 * and all six degenerate files fail. Deliberately blunt: an honest miss
 * (quarantining a weird-but-real transcript) costs one retry; a false pass
 * publishes hallucinated text on a fact-checking site.
 */

export interface TranscriptSanityReport {
  ok: boolean
  /** Machine-readable failure slugs, empty when ok. */
  reasons: string[]
  /** Non-empty content lines (timestamp prefix stripped). */
  lines: number
  uniqueLines: number
  /** uniqueLines / lines (1 when lines = 0 has no meaning — reported as 0). */
  uniqueRatio: number
  /** Share of the single most repeated content line. */
  topLineShare: number
  /** Occurrences of that most repeated line. */
  topLineCount: number
  /** Total characters across the DISTINCT content lines. */
  uniqueContentChars: number
}

/** A real pleno session never yields fewer content lines than this. */
const MIN_LINES = 12
/** Below this distinct-line ratio the file is a loop, not speech. */
const MIN_UNIQUE_RATIO = 0.2
/** One line owning more than this share of the file means a stuck decoder… */
const MAX_TOP_LINE_SHARE = 0.3
/** …but only when it repeats this often (small files repeat "Gracias." honestly). */
const TOP_LINE_COUNT_FLOOR = 20
/** Distinct content below this many chars can't be a session (catches all-dots). */
const MIN_UNIQUE_CONTENT_CHARS = 800

const TIMESTAMP_PREFIX = /^\[[^\]]*\]\s*/

export function assessTranscriptSanity(raw: string): TranscriptSanityReport {
  const contentLines = raw
    .split('\n')
    .map((l) => l.replace(TIMESTAMP_PREFIX, '').trim())
    .filter((l) => l.length > 0)

  const counts = new Map<string, number>()
  for (const line of contentLines) counts.set(line, (counts.get(line) ?? 0) + 1)

  const lines = contentLines.length
  const uniqueLines = counts.size
  let topLineCount = 0
  let uniqueContentChars = 0
  for (const [line, n] of counts) {
    if (n > topLineCount) topLineCount = n
    uniqueContentChars += line.length
  }
  const uniqueRatio = lines > 0 ? uniqueLines / lines : 0
  const topLineShare = lines > 0 ? topLineCount / lines : 0

  const reasons: string[] = []
  if (lines < MIN_LINES) reasons.push('too-few-lines')
  if (lines >= MIN_LINES && uniqueRatio < MIN_UNIQUE_RATIO) reasons.push('repetition-loop')
  if (topLineShare > MAX_TOP_LINE_SHARE && topLineCount >= TOP_LINE_COUNT_FLOOR)
    reasons.push('dominant-line')
  if (lines >= MIN_LINES && uniqueContentChars < MIN_UNIQUE_CONTENT_CHARS)
    reasons.push('no-content')

  return {
    ok: reasons.length === 0,
    reasons,
    lines,
    uniqueLines,
    uniqueRatio,
    topLineShare,
    topLineCount,
    uniqueContentChars,
  }
}
