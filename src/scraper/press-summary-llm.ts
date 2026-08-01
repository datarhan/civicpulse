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
  if (!input.body || input.body.trim().length < MIN_BODY_CHARS) return null

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

export async function summarizePressBatch(
  inputs: PressSummaryInput[],
  options: SummarizeOptions = {},
): Promise<PressSummaryResult[]> {
  const out: PressSummaryResult[] = []
  for (const input of inputs) {
    const result = await summarizePressArticle(input, options)
    if (result) out.push(result)
  }
  return out
}
