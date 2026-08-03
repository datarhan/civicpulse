# LLM & embedding backends

Which model runs where, what it costs, and which combinations are forbidden.

## Chat backends (`LLM_BACKEND`)

Auto-selected in this order when unset:
`OPENAI_API_KEY` → `openai` · `ANTHROPIC_API_KEY` → `anthropic` · `gemini` CLI →
`gemini` · `agy` CLI → `agy` · `claude` CLI → `claude-code` · else `ollama`.

> **Never let a metered backend be reached by fallback.** Set `LLM_BACKEND`
> explicitly for anything unattended. The repo has **no dotenv** — a script that
> assumes `.env` is loaded silently falls through to whatever key happens to be
> exported. For metered runs: `set -a; source .env; set +a`.

- **`ollama` is out of every automatic fallback chain** (2026-07-07). Local
  inference pins the machine; reach it only via an explicit `LLM_BACKEND=ollama`.
- **`claude-code` is opt-in.** It burns the Anthropic Max quota shared with
  interactive sessions — one full-pleno extract (~200 calls) can exhaust a
  5-hour window. It needs `--strict-mcp-config` (already in `src/llm/client.ts`,
  commit `5f687f5`); without it, headless runs hang on global MCP init. Keep
  `LLM_CONCURRENCY=1` — it is burst-rate limited.
- **`agy` auto-falls back to `claude-code`** when its Google quota caps
  (`3d940cc`). Necessary because a capped `agy -p` exits 0 with empty stdout and
  logs the 429 only to `--log-file`, which used to leak unattended runs onto
  metered OpenAI.
- **The auto-curators must use `gemini` or `claude-code`, never metered.** Their
  guard chain ends in DEFER rather than paying.

Concurrency: `LLM_CONCURRENCY=N` (extractor default 3). CLI backends had no
timeout until `75f1273` — a wedged gemini once stalled a batch for 6.5 h.

## Claim extraction & verification

```bash
npm run extract:pleno-claims -- <plenoId|--all> [--min-confidence 0.5] [--concurrency 3]
npm run verify:pleno-claims                       # pure local pass, no network
npm run extract-and-verify:pleno-claims -- <plenoId|--all>
npm run chunk-pleno-claims                        # regenerate SPA chunks (idempotent)
```

Extraction writes a per-pleno checkpoint to the suggestions file so a rate-limit
crash mid-batch preserves completed plenos (SIGINT flushes too). Verification
refreshes `public/data/pleno-claims/<id>.json` plus the manifest at
`pleno-claims/index.json` — the SPA reads chunks, the CLIs read the monolith.

`verify:pleno-claims` writes a base layer that an overlay preserves, so plain
runs no longer wipe LLM verdicts and are safe unattended. Only the deprecated
`verify:pleno-claims:llm` bypasses the overlay.

**Shortlist for the LLM second pass** (`VERIFIER_SHORTLIST`): `hybrid`
(default — union of lexical + semantic, deduped by ref) · `lexical` (word
overlap, no API calls) · `semantic` (cosine over the embedded corpus).

The second pass enforces structured cites (prompt v2): every `evidence.snippet`
must begin `<dataset>[<i>].<field>=<value> · …` and the cited value must appear
literally in the candidate snippet, or the citation is rejected as a
hallucination. Telemetry reports out-of-range / missing-cite /
cite-not-in-snippet per run.

## Embedding backends (`EMBED_BACKEND`)

| Value    | Dim  | Cost                  | Notes                                                                                                                                                                                           |
| -------- | ---- | --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `openai` | 1536 | ~$0.05 / full rebuild | `text-embedding-3-small`. **Use this.** ~113 s for the full corpus.                                                                                                                             |
| `ollama` | 768  | $0                    | `nomic-embed-text` via `ollama serve`. `ollama pull nomic-embed-text` (~275 MB). Custom model/host via `OLLAMA_EMBED_MODEL` / `OLLAMA_HOST`.                                                    |
| `gemini` | 768  | free tier             | `text-embedding-004` REST (**not** the gemini-CLI OAuth token — that one is chat-only). Weaker, and the free tier strands bulk rebuilds: one agent-corpus build stopped at 1,280 of 9,167 rows. |

**Anthropic / Claude Code is not an embeddings backend** — Anthropic publishes
no embeddings API. Pair `LLM_BACKEND=claude-code` with one of the three above.

**Switching backends requires `--rebuild`.** 1536-dim and 768-dim vectors are
not comparable, and a mixed corpus silently returns garbage neighbours. The
corpus `.model` sidecar is authoritative for the query backend, overriding an
ambient `EMBED_BACKEND`. `check:retrieval` warns on any gemini-built corpus.

Hybrid mode falls back to lexical with a stderr warning when the chosen backend
is unusable (no key, daemon down, model not pulled) — it never crashes the
verifier.

```bash
npm run embed:verifier-corpus [-- --rebuild]
npm run embed:agent-corpus [-- --rebuild]   # journalist agent's semantic recall
```

`embed:agent-corpus` is sha-incremental (a no-change run makes 0 API calls) and
is **not** in `scrape:all` — CI has no backend. It is chained best-effort into
`hallazgos-pipeline.sh` with `EMBED_BACKEND` pinned to `openai` so an ollama
fallback cannot mix 768-dim rows into the 1536-dim corpus.

## Cost dashboard

```bash
npm run llm:cost                 # summary table
npm run llm:cost -- --json
npm run llm:cost -- --since 7
```

Reads `.llm-cache/*.json` telemetry. It used to count Max-plan usage as spend
(fixed in `d58fd4a`).

## Model choice

Extractor stays on Sonnet. Measured: Haiku hits 97% verbatim fidelity — and
paraphrasing a councillor is disqualifying, not a rounding error — while being
slower and using more tokens. Re-measure with `npm run eval:extractor`.
