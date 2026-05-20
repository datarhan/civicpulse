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
