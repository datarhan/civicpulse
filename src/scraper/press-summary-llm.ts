/**
 * Press article summariser.
 *
 * Generates a neutral 2-3 sentence editorial summary per article for
 * the /laboratorio page. The prompt explicitly forbids individual
 * names, valuative adjectives, and rhetorical framing — the summary
 * reads "what happened, what figure / work / convention is named,
 * what it affects." Opinion columns get prefixed with "Pieza de
 * opinión sobre …".
 *
 * Caching: keyed on article fingerprint + body-presence flag, so
 * the same article that gets fetched again on day-2 hits cache.
 */

import { callLLM, type ClientConfig } from '../llm/client'
import {
  PRESS_SUMMARY_PROMPT_VERSION,
  buildPressSummarySystemPrompt,
  buildPressSummaryUserPrompt,
} from '../llm/prompts'
import { PressSummaryResponseSchema } from '../llm/schemas'

/** Shortest body we will summarise. Below this there is nothing to compress. */
export const MIN_BODY_CHARS = 400

export interface PressSummaryInput {
  articleId: string
  fingerprint: string
  source: string
  title: string
  date: string
  body?: string
}

export interface PressSummaryResult {
  articleId: string
  fingerprint: string
  summary: string
  generatedAt: string
}

export interface SummarizeOptions {
  config?: ClientConfig
  caller?: typeof callLLM
}

/**
 * Is there enough article body here to summarise at all?
 *
 * The single source of truth for the MIN_BODY_CHARS floor. `summarizePressArticle`
 * uses it to fail closed; `summarizePressBatch` uses it to tell its two very
 * different kinds of null apart. Restating the threshold in the batch would be
 * exactly the hand-copied shape CLAUDE.md's rule 1 is about.
 */
export function hasSummarizableBody(input: PressSummaryInput): boolean {
  return !!input.body && input.body.trim().length >= MIN_BODY_CHARS
}

export async function summarizePressArticle(
  input: PressSummaryInput,
  options: SummarizeOptions = {},
): Promise<PressSummaryResult | null> {
  // Fail closed without an article body.
  //
  // press.json carries only {title, link, source, date} — RSS gives us no body
  // — so every summary written so far was a 150-500 character elaboration of a
  // headline, and the model filled the gap the only way it could: by inventing.
  // Published examples: a Valencia Plaza headline about a park became "El
  // Ayuntamiento … ha presentado" (the headline attributes it to nobody); an
  // unemployment headline gained "se enmarca en las iniciativas locales para
  // fomentar el empleo y la formación" (invented framing, invented source); an
  // ice-cream sales figure gained "durante la temporada estival" (invented
  // period). All 7 were rendered under the outlet's own name and labelled
  // "revisada por curaduría".
  //
  // The length floor is what makes this a real gate rather than a formality:
  // a headline echoed into the body field would otherwise pass.
  if (!hasSummarizableBody(input)) return null

  const caller = options.caller ?? callLLM
  const response = await caller({
    systemPrompt: buildPressSummarySystemPrompt(),
    userPrompt: buildPressSummaryUserPrompt({
      source: input.source,
      title: input.title,
      date: input.date,
      body: input.body,
    }),
    schema: PressSummaryResponseSchema,
    promptVersion: PRESS_SUMMARY_PROMPT_VERSION,
    input: {
      kind: 'press-summary',
      fingerprint: input.fingerprint,
      bodyHash: input.body ? input.body.length : 0,
    },
    config: options.config,
  })
  if (!response) return null
  return {
    articleId: input.articleId,
    fingerprint: input.fingerprint,
    summary: response.summary,
    generatedAt: new Date().toISOString(),
  }
}

export interface SummarizeBatchStats {
  /** Articles handed to the batch. */
  total: number
  /** Articles the model actually answered for. */
  summarized: number
  /**
   * Articles NEVER ATTEMPTED — no body, or a body under MIN_BODY_CHARS, so the
   * fail-closed gate short-circuited before any LLM call. A deliberate policy
   * skip, not a backend problem.
   *
   * This is currently ALL of them: press.json carries no article bodies and
   * nothing in the pipeline fetches one for the summariser, so the run makes
   * zero LLM calls. Keeping this separate from `llmUnavailable` is the whole
   * point — folding "never attempted" into either "done" or "failed" is
   * CLAUDE.md's data-integrity rule 2.
   */
  skippedNoBody: number
  /**
   * Articles ATTEMPTED AND FAILED — the call was made and the model produced
   * nothing usable (backend unreachable, circuit tripped, unparseable answer).
   * The CLI exits non-zero on any of these so a dead backend cannot read as a
   * clean run, mirroring extractPressClaimsBatch's counter of the same name.
   */
  llmUnavailable: number
}

/**
 * Articles this run left unresolved — what `decideSnapshotWrite` needs to know.
 *
 * BOTH unfinished categories count, and that is the policy, not an arithmetic
 * convenience: neither a dead backend nor a body that never arrived is evidence
 * that an already-published summary should be deleted. Named and exported so
 * the rule is unit-testable instead of being two inline additions in the CLI.
 */
export function unresolvedSummaries(stats: SummarizeBatchStats): number {
  return stats.llmUnavailable + stats.skippedNoBody
}

export async function summarizePressBatch(
  inputs: PressSummaryInput[],
  options: SummarizeOptions = {},
): Promise<{ summaries: PressSummaryResult[]; stats: SummarizeBatchStats }> {
  const out: PressSummaryResult[] = []
  let skippedNoBody = 0
  let llmUnavailable = 0

  for (const input of inputs) {
    // Ask BEFORE the call, so a null can be attributed. Afterwards the two
    // causes are indistinguishable — which is why the old batch, returning a
    // bare array, could not tell "we refuse to summarise a headline" from
    // "the backend is down".
    const attemptable = hasSummarizableBody(input)
    const result = await summarizePressArticle(input, options)
    if (result) {
      out.push(result)
    } else if (attemptable) {
      llmUnavailable += 1
    } else {
      skippedNoBody += 1
    }
  }

  return {
    summaries: out,
    stats: {
      total: inputs.length,
      summarized: out.length,
      skippedNoBody,
      llmUnavailable,
    },
  }
}
