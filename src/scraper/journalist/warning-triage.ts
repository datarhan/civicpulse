/**
 * The journalist agent's stage-4 verify pass writes free-text warnings, and
 * `promote-report` publishes them verbatim — `src/components/journalist/
 * Navigation.jsx` renders `report.warnings` on the public page, under the
 * legal-sensitivity badge, on a report about a named living councillor.
 *
 * Some of those warnings are deterministically false.
 *
 * On draft `a-robert-raga-bio-v4` (2026-07-30) the pass emitted:
 *
 *   "narrative[Cargo y responsabilidades municipales]: cites src-021, which is
 *    absent from the provided sources — unverifiable claim."
 *   "narrative[Actividad plenaria]: cites src-019/src-020/src-024/src-025, none
 *    present in provided sources; …"
 *
 * All five ids are in `sources[]`. Nothing stopped those strings reaching the
 * public page except an unrelated `legalSensitivity=high` gate.
 *
 * The cause is in the prompt, not the model: it was asked to do arithmetic
 * ("check the cited citationIds", "check the verbatim appears in the excerpt")
 * while also being told to prefer flagging when unsure. That bias is correct
 * for judgement and wrong for a lookup.
 *
 * ## What this module will and will not refute
 *
 * ONLY the two classes that are exactly decidable from the draft itself:
 *
 *   · "cited source id X is absent"      → is X in sources[]?
 *   · "quote card N is not in its excerpt" → quoteAppearsIn()
 *
 * Everything else is left alone and marked `judgement`, including warnings that
 * NAME an id but make a semantic claim about its content ("src-001's excerpt has
 * no birth data", "may overstate src-002's literal …"). Those need a reader.
 * Widening this module past what is exactly decidable would turn it into a
 * second opinion, and a second opinion silently deleting the first is the worst
 * of both.
 *
 * Refuting is only ever a DOWNGRADE — removing an unsupported machine-written
 * claim. `docs/DATA_INTEGRITY.md` §4: automatic verdicts may go down, never up.
 */
import { quoteAppearsIn } from '../quote-match'

export type WarningVerdict = 'refuted' | 'judgement'

export interface TriagedWarning {
  warning: string
  verdict: WarningVerdict
  /** Why it was refuted — printed for the curator, never published. */
  reason?: string
}

export interface TriageInput {
  warnings: string[]
  sources: Array<{ id: string; excerpt?: string }>
  sections: unknown[]
}

/** `src-NNN` is format-strict, so extracting it is exact, not a heuristic. */
const SOURCE_ID_RE = /\bsrc-\d+\b/g

/**
 * Does this warning assert that the ids it names are ABSENT?
 *
 * Deliberately narrow. It must claim non-existence — not "the excerpt does not
 * support", not "cited to X only", not "may overstate". Those name an id but
 * make a claim about its CONTENT, which this module cannot decide.
 */
const ASSERTS_ABSENCE =
  /\b(?:absent|ausente|inexistente|not present|no(?:ne)? present|not in (?:the )?(?:provided )?sources|no (?:figura|aparece|consta|existe)|missing from)\b/i

/** Does it assert a quote card is not in the excerpt it cites? */
const ASSERTS_QUOTE_MISMATCH =
  /\bquote-?card\b[^.]*\b(?:verbatim|literal|not found|no (?:aparece|se encuentra)|does not appear)\b/i

const QUOTE_CARD_INDEX = /\bquote-?card\s*\[?(\d+)\]?/i

interface QuoteCardLike {
  kind?: string
  payload?: { verbatim?: string; sourceId?: string }
}

export function triageWarnings(input: TriageInput): TriagedWarning[] {
  const ids = new Set(input.sources.map((s) => s.id))
  const byId = new Map(input.sources.map((s) => [s.id, s]))
  const quoteCards = (input.sections as QuoteCardLike[]).filter(
    (s) => s && typeof s === 'object' && s.kind === 'quote-card',
  )

  return input.warnings.map((warning): TriagedWarning => {
    const named = [...new Set(warning.match(SOURCE_ID_RE) ?? [])]

    // Class 1 — "these ids are absent", when every one of them is present.
    if (named.length > 0 && ASSERTS_ABSENCE.test(warning)) {
      const missing = named.filter((id) => !ids.has(id))
      if (missing.length === 0) {
        return {
          warning,
          verdict: 'refuted',
          reason:
            `claims ${named.join(', ')} ${named.length > 1 ? 'are' : 'is'} absent from ` +
            `sources[]; ${named.length > 1 ? 'all are' : 'it is'} present`,
        }
      }
      // Partially right — a curator should see it. Not ours to delete.
      return { warning, verdict: 'judgement' }
    }

    // Class 2 — "quote card N is not verbatim in its excerpt", when it is.
    if (ASSERTS_QUOTE_MISMATCH.test(warning)) {
      const m = warning.match(QUOTE_CARD_INDEX)
      const idx = m ? Number(m[1]) : NaN
      const card = Number.isInteger(idx) ? quoteCards[idx] : undefined
      const verbatim = card?.payload?.verbatim
      const excerpt = card?.payload?.sourceId ? byId.get(card.payload.sourceId)?.excerpt : undefined
      if (verbatim && excerpt && quoteAppearsIn(verbatim, excerpt)) {
        return {
          warning,
          verdict: 'refuted',
          reason: `quoteCard[${idx}] IS verbatim in the excerpt of ${card?.payload?.sourceId}`,
        }
      }
      return { warning, verdict: 'judgement' }
    }

    return { warning, verdict: 'judgement' }
  })
}

/** The warnings that may be published. */
export function publishableWarnings(triaged: TriagedWarning[]): string[] {
  return triaged.filter((t) => t.verdict !== 'refuted').map((t) => t.warning)
}
