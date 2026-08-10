/**
 * Carry the speaker map onto the published transcript.
 *
 * The map is built from a second, independent pass over the audio, so its
 * segmentation is not the published transcript's and its timestamps are only
 * approximately the same clock — a 60-minute request placed its final turn
 * ~116 s late when measured. Aligning on time alone would therefore attach
 * blocs to the wrong lines, which is the failure this whole exercise exists to
 * remove.
 *
 * So alignment is **by text**, with time used only to bound the search. The
 * scoring function is `quoteCoverage`, the same matcher `check-finding-quotes`
 * uses against published quotes, so a line the audit considers to be the same
 * text and a line the aligner considers to be the same text cannot diverge.
 */
// `locateQuote` below reproduces `quoteCoverage`'s scoring and adds the match
// POSITION, which is what selects a speaker. The two are pinned to each other
// by a test over real transcript lines rather than by importing one into the
// other, because only the position-carrying variant is usable here.
import { normaliseForQuoteMatch } from './quote-match'
import type { RawSegment, SpeakerMap } from './speaker-map'
import { blocForLabel } from './speaker-map'

/**
 * How far the map's clock may sit from the transcript's before a candidate is
 * ruled out. Generous: the measured drift was ~116 s on an hour-long request,
 * and the cost of an over-wide window is a slower search, while the cost of a
 * narrow one is silently losing a correct alignment.
 */
export const ALIGN_DRIFT_SECONDS = 300

/**
 * Minimum share of a line's words that must appear contiguously in the map
 * before its bloc is carried over.
 *
 * Two transcripts of the same speech differ in punctuation, fillers and proper
 * nouns, so exact equality would align almost nothing. 0.7 keeps short
 * interjections («Sí.», «Gràcies.») from matching everywhere while tolerating
 * the ordinary divergence between two ASR passes.
 */
export const ALIGN_MIN_COVERAGE = 0.7

export interface AlignedLine {
  /** Index into the published transcript's parsed segments. */
  index: number
  start: number
  /** The published transcript's own anonymous, chunk-local label. */
  publishedSpeaker: string
  /** The map's global label, when one matched. */
  mapLabel: string | null
  /** The bloc the map vouches for, or null. Null is never a guess. */
  bloc: string | null
  coverage: number
  /** Set when candidates of equal quality disagree about the bloc. */
  conflict: boolean
}

export interface AlignmentResult {
  lines: AlignedLine[]
  stats: {
    /** Lines that matched the map well enough AND got a bloc. */
    aligned: number
    /** Lines whose text was not found in the map within the drift window. */
    unaligned: number
    /** Lines that matched, but where equally good candidates disagreed. */
    conflicting: number
    /**
     * Lines that matched a label the map does not vouch for — weak, rejected
     * or absent. Distinct from `unaligned`: the text WAS found, the identity
     * simply is not established. Folding the two together would report a
     * failure to identify as a failure to align.
     */
    matchedButNoBloc: number
  }
}

/**
 * Longest contiguous run of `needle`'s words inside `hay`, as a coverage
 * fraction plus where it starts.
 *
 * `quoteCoverage` gives the fraction but not the position, and the position is
 * what selects a speaker. The loop below is the same shape; the test suite
 * asserts the two agree on real data rather than trusting that they do.
 */
export function locateQuote(needle: string, hay: string): { coverage: number; at: number } {
  const words = normaliseForQuoteMatch(needle).split(' ').filter(Boolean)
  if (words.length === 0) return { coverage: 0, at: -1 }
  const haystack = normaliseForQuoteMatch(hay)
  let best = 0
  let at = -1
  for (let i = 0; i < words.length; i += 1) {
    for (let n = words.length - i; n > best; n -= 1) {
      const run = words.slice(i, i + n).join(' ')
      const found = haystack.indexOf(run)
      if (found >= 0) {
        best = n
        at = found
        break
      }
    }
  }
  return { coverage: best / words.length, at }
}

/**
 * A searchable rendering of the map's segments, with the label at every offset.
 */
function haystackFor(segments: readonly RawSegment[]) {
  let hay = ''
  const marks: Array<{ at: number; label: string }> = []
  for (const s of segments) {
    marks.push({ at: hay.length, label: s.speaker })
    hay += normaliseForQuoteMatch(s.text) + ' '
  }
  return { hay, marks }
}

function labelAt(marks: Array<{ at: number; label: string }>, offset: number): string | null {
  let label: string | null = null
  for (const m of marks) {
    if (m.at <= offset) label = m.label
    else break
  }
  return label
}

export interface AlignOptions {
  /** The published transcript, already parsed into segments. */
  published: readonly RawSegment[]
  map: SpeakerMap
  driftSeconds?: number
  minCoverage?: number
}

export function alignSpeakerMap(opts: AlignOptions): AlignmentResult {
  const drift = opts.driftSeconds ?? ALIGN_DRIFT_SECONDS
  const minCoverage = opts.minCoverage ?? ALIGN_MIN_COVERAGE
  const lines: AlignedLine[] = []
  let aligned = 0
  let unaligned = 0
  let conflicting = 0
  let matchedButNoBloc = 0

  for (const [index, line] of opts.published.entries()) {
    const candidates = opts.map.segments.filter(
      (s) => s.end >= line.start - drift && s.start <= line.end + drift,
    )
    const base: AlignedLine = {
      index,
      start: line.start,
      publishedSpeaker: line.speaker,
      mapLabel: null,
      bloc: null,
      coverage: 0,
      conflict: false,
    }

    if (candidates.length === 0) {
      unaligned += 1
      lines.push(base)
      continue
    }

    const { hay, marks } = haystackFor(candidates)
    const { coverage, at } = locateQuote(line.text, hay)
    if (coverage < minCoverage || at < 0) {
      unaligned += 1
      lines.push({ ...base, coverage })
      continue
    }

    const mapLabel = labelAt(marks, at)
    const bloc = mapLabel ? blocForLabel(opts.map, mapLabel) : null

    // The same words can sit in two speakers' segments — a repeated phrase, or
    // a matched run that straddles a turn. When the blocs on either side of the
    // matched span disagree, nothing here can say which is meant.
    const endLabel = labelAt(marks, at + normaliseForQuoteMatch(line.text).length - 1)
    const endBloc = endLabel ? blocForLabel(opts.map, endLabel) : null
    const conflict = Boolean(bloc && endBloc && bloc !== endBloc)

    if (conflict) {
      conflicting += 1
      lines.push({ ...base, mapLabel, coverage, conflict: true })
      continue
    }
    if (!bloc) {
      matchedButNoBloc += 1
      lines.push({ ...base, mapLabel, coverage })
      continue
    }
    aligned += 1
    lines.push({ ...base, mapLabel, bloc, coverage })
  }

  return { lines, stats: { aligned, unaligned, conflicting, matchedButNoBloc } }
}

/**
 * Bloc per published-transcript speaker label, but only where the whole label
 * agrees.
 *
 * The published labels are chunk-local, so one `SPEAKER_20` covers a single
 * stretch of one session and can legitimately be summarised. If different
 * lines under the same label resolve to different blocs, the label spans more
 * than one person and gets nothing — an averaged answer would be a new
 * mis-attribution invented by this very code.
 */
export function blocByPublishedSpeaker(result: AlignmentResult): Map<string, string> {
  const seen = new Map<string, Set<string>>()
  for (const l of result.lines) {
    if (!l.bloc) continue
    const set = seen.get(l.publishedSpeaker) ?? new Set<string>()
    set.add(l.bloc)
    seen.set(l.publishedSpeaker, set)
  }
  const out = new Map<string, string>()
  for (const [speaker, blocs] of seen) {
    if (blocs.size === 1) out.set(speaker, [...blocs][0])
  }
  return out
}
