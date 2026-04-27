/**
 * LLM caller for auto-curation title + summary generation.
 *
 * Single-shot per bundle. The bundle has already passed the safety
 * gates in src/scraper/auto-curate.ts; here we just produce the
 * editorial chrome. Severity is fixed at informational by the caller —
 * the LLM only writes neutral framing.
 */
import { callLLM } from './client'
import type { CallLlmOptions } from './client'
import {
  AUTO_CURATE_PROMPT_VERSION,
  buildAutoCurateSystemPrompt,
  buildAutoCurateUserPrompt,
  type AutoCurateBundle,
} from './prompts'
import { AutoCurateResponseSchema, type AutoCurateResponse } from './schemas'
import type { ZodTypeAny, z } from 'zod'

export type LlmCaller = <TSchema extends ZodTypeAny>(
  opts: CallLlmOptions<TSchema>,
) => Promise<z.infer<TSchema> | null>

export async function generateTitleAndSummary(
  bundle: AutoCurateBundle,
  caller: LlmCaller = callLLM,
): Promise<AutoCurateResponse | null> {
  const systemPrompt = buildAutoCurateSystemPrompt()
  const userPrompt = buildAutoCurateUserPrompt(bundle)
  return caller({
    systemPrompt,
    userPrompt,
    promptVersion: AUTO_CURATE_PROMPT_VERSION,
    schema: AutoCurateResponseSchema,
    input: {
      plenoId: bundle.plenoId,
      topic: bundle.topic,
      blocs: bundle.blocs,
      claimIds: bundle.quotes.map((_q, i) => i),
      // Discriminate the cache by what's actually in the prompt:
      //   · verbatim hashes  ─ if the bundle's quotes change, the
      //     summary should re-draft (this rarely happens but it's
      //     correct).
      //   · evidence list    ─ curator-added evidence (URL/PDF
      //     snippets) is what makes the dashboard's "Re-draft with
      //     N evidence" button useful. Without this, two clicks
      //     with different evidence would return the same cached
      //     draft.
      quoteHashes: bundle.quotes.map((q) => q.verbatim.length + ':' + q.verbatim.slice(0, 32)),
      evidenceSnippets: bundle.evidenceSnippets,
    },
  })
}
