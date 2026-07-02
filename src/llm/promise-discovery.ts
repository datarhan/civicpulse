/**
 * LLM caller for promise discovery. Mirrors auto-curate-llm.ts: single-shot,
 * dependency-injected caller so tests pass a stub. Returns the parsed batch
 * or null (backend failure / budget / circuit).
 */
import { callLLM } from './client'
import type { CallLlmOptions } from './client'
import {
  PROMISE_DISCOVERY_PROMPT_VERSION,
  buildPromiseDiscoverySystemPrompt,
  buildPromiseDiscoveryUserPrompt,
  type PromiseDiscoveryInput,
} from './prompts'
import { PromiseDiscoveryBatchSchema, type PromiseDiscoveryBatch } from './schemas'
import type { ZodTypeAny, z } from 'zod'

export type LlmCaller = <TSchema extends ZodTypeAny>(
  opts: CallLlmOptions<TSchema>,
) => Promise<z.infer<TSchema> | null>

export async function discoverPromises(
  input: PromiseDiscoveryInput,
  caller: LlmCaller = callLLM,
): Promise<PromiseDiscoveryBatch | null> {
  return caller({
    systemPrompt: buildPromiseDiscoverySystemPrompt(),
    userPrompt: buildPromiseDiscoveryUserPrompt(input),
    promptVersion: PROMISE_DISCOVERY_PROMPT_VERSION,
    schema: PromiseDiscoveryBatchSchema,
    input: {
      existingTitles: input.existingTitles,
      sourceCount: input.sources.reduce((n, s) => n + s.items.length, 0),
    },
  })
}
