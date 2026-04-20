/**
 * Health check for the configured LLM backend.
 *
 *   npm run llm:doctor
 *
 * Prints backend/model, does a minimal round-trip, shows cache stats. Exits
 * non-zero on any failure so CI or a nightly runner can short-circuit before
 * wasting tokens on a misconfigured backend.
 */
import { z } from 'zod'
import { callLLM, gatherCacheStats, loadConfigFromEnv, resetBudget } from '../src/llm/client'

const PingSchema = z.object({ reply: z.string() })

async function main() {
  const config = loadConfigFromEnv()
  resetBudget(10_000)  // tiny budget — ping should use ≤100 tokens

  process.stdout.write(`[llm-doctor] backend=${config.backend} model=${config.backend === 'ollama' ? config.ollamaModel : config.openaiModel}\n`)
  process.stdout.write(`[llm-doctor] cache=${config.cacheDir}\n`)

  const stats = gatherCacheStats(config.cacheDir)
  process.stdout.write(
    `[llm-doctor] cache stats: ${stats.entries} entries · ${stats.totalTokens.toLocaleString()} tokens · $${stats.totalCostUSD.toFixed(4)} · ${(stats.totalBytes / 1024).toFixed(1)} KB\n`,
  )

  const t0 = Date.now()
  const result = await callLLM({
    systemPrompt: 'You are a JSON-only echo bot. Reply with {"reply":"pong"} and nothing else.',
    userPrompt: 'ping',
    promptVersion: 'doctor-v1',
    schema: PingSchema,
    input: { probe: 'ping' },
    config,
    maxRetries: 1,
  })

  if (!result) {
    process.stderr.write(`[llm-doctor] FAIL: no response after retries\n`)
    process.exit(1)
  }
  const dt = Date.now() - t0
  process.stdout.write(`[llm-doctor] OK: ${JSON.stringify(result)} (${dt}ms)\n`)
}

main().catch((err) => {
  process.stderr.write(`[llm-doctor] EXCEPTION: ${err instanceof Error ? err.message : String(err)}\n`)
  process.exit(1)
})
