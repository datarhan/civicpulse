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
import { sha256Short } from '../scraper/hash'

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
    // `input` ES la clave de caché de `callLLM`. Contaba sólo cuántas fuentes
    // había, así que dos semanas con el mismo número de artículos distintos
    // compartían respuesta. Ahora entra qué artículo es y qué texto se le dio.
    input: {
      existingTitles: input.existingTitles,
      sources: input.sources.map((s) => ({
        kind: s.kind,
        items: s.items.map((it) => `${it.url}#${sha256Short(it.snippet ?? '')}`),
      })),
    },
  })
}
