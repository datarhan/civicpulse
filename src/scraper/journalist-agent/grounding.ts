/**
 * Deterministic narrative-grounding gate — Stage 3.5 of the journalist
 * agent, run BEFORE the LLM verify pass (idea credit: intruth-factcheck's
 * grounded re-judge, which only accepts verdicts justified by retrieved
 * evidence; here the deterministic half runs first and its findings are
 * handed to the LLM verifier as [grounding] warnings).
 *
 * Two signals per narrative section, both computed against the union of
 * excerpts+titles of the sources it cites:
 *
 *   1. FIGURES — every number in the narrative (years, amounts, counts)
 *      must appear somewhere in the cited evidence. A fabricated figure
 *      is the highest-precision hallucination signal there is: made-up
 *      numbers never appear in real excerpts.
 *   2. LEXICAL OVERLAP — the fraction of the narrative's significant
 *      tokens present in the evidence. Below MIN_OVERLAP the narrative
 *      is talking about things its citations don't mention.
 *
 * Warn-only by design: warnings persist into the draft (curator surface)
 * and feed the verify LLM. Nothing is dropped here — the synth builders
 * already drop orphan-ref prose; this catches *cited-but-unsupported*.
 */
import type { ReportSection, SourceCitation } from '../journalist'
import { stripDiacritics } from '../normalize'

const MIN_OVERLAP = 0.2
const MIN_BODY_TOKENS = 6

// Minimal Spanish stopword set — enough to keep function words from
// inflating overlap; deliberately small and auditable.
const STOPWORDS = new Set([
  'para',
  'como',
  'donde',
  'cuando',
  'entre',
  'desde',
  'hasta',
  'sobre',
  'este',
  'esta',
  'estos',
  'estas',
  'esos',
  'esas',
  'aquel',
  'aquella',
  'pero',
  'porque',
  'aunque',
  'tras',
  'ante',
  'bajo',
  'contra',
  'segun',
  'tambien',
  'ademas',
  'durante',
  'mediante',
  'sido',
  'sera',
  'esta',
  'estan',
  'fueron',
  'siendo',
  'haber',
  'hacer',
  'tiene',
  'tienen',
  'anos',
  'euros',
  'millones',
  'miles',
])

function foldTokens(text: string): string[] {
  return stripDiacritics(String(text ?? ''))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter(Boolean)
}

/** Significant word tokens: ≥4 chars, not stopwords, not pure numbers. */
function significantWords(tokens: string[]): string[] {
  return tokens.filter((t) => t.length >= 4 && !/^\d+$/.test(t) && !STOPWORDS.has(t))
}

/**
 * Number tokens, normalized: "242.255" / "242,255" → "242255". Digit
 * runs of 1–2 chars are ignored (list markers, ordinals — too noisy).
 */
function numberTokens(text: string): string[] {
  const out = new Set<string>()
  for (const m of String(text ?? '').matchAll(/\d[\d.,]*/g)) {
    const normalized = m[0].replace(/[.,]/g, '')
    if (normalized.length >= 2) out.add(normalized)
  }
  return [...out]
}

export interface GroundingResult {
  /** Narrative sections examined. */
  checked: number
  /** `[grounding] …` warnings, ready to append to draft.warnings. */
  warnings: string[]
}

export function groundNarrativeSections(
  sections: ReportSection[],
  sources: SourceCitation[],
): GroundingResult {
  const byId = new Map(sources.map((s) => [s.id, s]))
  const warnings: string[] = []
  let checked = 0

  for (const section of sections) {
    if (section.kind !== 'narrative') continue
    checked += 1
    const { heading, bodyMarkdown, sourceIds } = section.payload

    const cited = (sourceIds ?? [])
      .map((id) => byId.get(id))
      .filter((s): s is SourceCitation => !!s)
    const evidenceText = cited
      .map((s) => [s.excerpt ?? '', s.title ?? ''].join(' '))
      .join(' ')
      .trim()
    const hasExcerpts = cited.some((s) => (s.excerpt ?? '').trim().length > 0)

    if (!hasExcerpts) {
      warnings.push(
        `[grounding] narrativa «${heading}»: las fuentes citadas van sin extractos — imposible de contrastar deterministicamente`,
      )
      continue
    }

    const evidenceTokens = new Set(foldTokens(evidenceText))
    const evidenceNumbers = new Set(numberTokens(evidenceText))

    // Inline citation ids ("(src-001)") are references, not figures —
    // first live run flagged their digits as fabricated numbers.
    const bodySansCiteIds = bodyMarkdown.replace(/\bsrc-\d+\b/g, ' ')
    const missingNumbers = numberTokens(bodySansCiteIds).filter((n) => !evidenceNumbers.has(n))
    if (missingNumbers.length > 0) {
      warnings.push(
        `[grounding] narrativa «${heading}»: cifras sin respaldo en las fuentes citadas: ${missingNumbers.join(', ')}`,
      )
    }

    const bodyWords = significantWords(foldTokens(bodyMarkdown))
    if (bodyWords.length >= MIN_BODY_TOKENS) {
      const hit = bodyWords.filter((w) => evidenceTokens.has(w)).length
      const overlap = hit / bodyWords.length
      if (overlap < MIN_OVERLAP) {
        warnings.push(
          `[grounding] narrativa «${heading}»: bajo solape léxico con las fuentes citadas (${overlap.toFixed(2)})`,
        )
      }
    }
  }

  return { checked, warnings }
}
