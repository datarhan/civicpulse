/**
 * Deterministic LLM mock for unit tests.
 *
 * Keyed by `sha256(systemPrompt + userPrompt)` → canned response. A test that
 * forgets to register a response gets a loud error, not a silent hang. This
 * matches the real cache key (which also folds in model + promptVersion +
 * schema) at the system+user-prompt axis, which is the minimum necessary to
 * disambiguate test scenarios.
 */
import { createHash } from 'node:crypto'
import type { ZodTypeAny, z } from 'zod'
import type { CallLlmOptions } from '../../src/llm/client'

const responses = new Map<string, unknown>()

export function mockKey(systemPrompt: string, userPrompt: string): string {
  return createHash('sha256').update(systemPrompt + '\0' + userPrompt).digest('hex')
}

/** Register a canned response. Subsequent mockCallLLM() invocations with the
 *  same (systemPrompt, userPrompt) pair will return this value. */
export function stubResponse(systemPrompt: string, userPrompt: string, response: unknown): void {
  responses.set(mockKey(systemPrompt, userPrompt), response)
}

export function resetMock(): void {
  responses.clear()
}

/** Drop-in replacement for the real callLLM() — useful in tests that pass a
 *  client via DI. */
export async function mockCallLLM<TSchema extends ZodTypeAny>(
  opts: CallLlmOptions<TSchema>,
): Promise<z.infer<TSchema> | null> {
  const key = mockKey(opts.systemPrompt, opts.userPrompt)
  if (!responses.has(key)) {
    throw new Error(
      `mockCallLLM: no response registered for prompt pair (hash=${key.slice(0, 12)}…). ` +
        `Register with stubResponse(system, user, canned) before the call.`,
    )
  }
  const canned = responses.get(key)
  if (canned === null) return null
  const parsed = opts.schema.safeParse(canned)
  if (!parsed.success) {
    throw new Error(`mockCallLLM: canned response fails schema: ${parsed.error.toString().slice(0, 200)}`)
  }
  return parsed.data as z.infer<TSchema>
}
