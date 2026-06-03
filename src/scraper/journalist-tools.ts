/**
 * Research tools the journalist agent calls during Stage 2 of its pipeline.
 *
 * Every tool here is a small pure-ish function:
 *   · deterministic given (input, on-disk snapshots, network state)
 *   · returns a compact JSON payload suitable for inclusion in an LLM
 *     prompt without flooding the context window
 *   · wraps network calls in a research cache at
 *       .research-cache/<sha256(toolname+args)>.json
 *     so re-running the agent does not re-hit Wikipedia or Exa for the
 *     same query within a session.
 *
 * No tool here writes to public/data/* — that's reserved for the
 * curator-promoted reports file. These helpers feed the LLM and the
 * citation builder; the agent then assembles SourceCitation rows from
 * whatever the tools return.
 *
 * Politeness:
 *   · Every outbound request carries a CivicPulse User-Agent
 *   · Wikipedia + Wikidata are throttled to ≥1 req / 500 ms
 *   · Exa web search costs real money; capped at 8 results per query
 *   · Wayback look-ups never trigger Save-Page-Now from this module;
 *     callers go through audit() for explicit archival decisions
 */

// ───────────────────────────────────────────────────────────────────────────
// Decomposed in the journalist-agent refactor. Thin barrel over
// ./journalist-tools/* so every existing import keeps resolving. The shared
// internals (cache layer, tokenizer) live in ./journalist-tools/internal and
// are intentionally NOT re-exported — the public tool surface is unchanged.
// ───────────────────────────────────────────────────────────────────────────

export * from './journalist-tools/local'
export * from './journalist-tools/web'
export * from './journalist-tools/gazette'
export * from './journalist-tools/bio-extract'
export * from './journalist-tools/citations'
// CACHE_DIR was the one internal re-exported publicly (callers/tests).
export { CACHE_DIR } from './journalist-tools/internal'
