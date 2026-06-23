# Fact-Checking Rebuild — Phase 2 (P2) Design

> Phase 2 of the decomposed rebuild (option C). Builds on P1 (eval harness + local
> NLI grounding, on `main`). Spec for P0/P1:
> `docs/superpowers/specs/2026-06-23-factcheck-rebuild-phase1-design.md`.

**Goal:** Strip the LLM-second-pass over-claiming (measured at P1: **20% false-
`contradicho`** + inflated `verificado`/`parcial`) from the *existing* published
verdicts — via a **flag-only** NLI re-grounding gate that produces a curator
review queue, plus a **deterministic-base / overlay file split** that makes
curator-approved downgrades safe to persist.

**Why this and not "rescue sin-datos":** the P1 production regen showed the
sin-datos backlog is genuinely unverifiable (0 NLI upgrades over 3,251). The
over-claiming the audit + eval measured lives in the verdicts the LLM second pass
*already produced* (non-sin-datos), which the upgrade-only NLI runner never
touches. P2 targets that pool.

**Architecture:** three pieces — (1) a base/overlay split so re-runs never
clobber second-pass or curator decisions; (2) a re-grounding gate that NLI-checks
whether each published `verificado`/`parcial`/`contradicho`'s cited evidence
actually entails (or, for contradicho, contradicts) the claim, emitting a review
queue; (3) a curator-apply CLI that is the *only* writer of downgrades.

**Tech stack:** TS/Node + Vitest; the P1 local NLI sidecar (`nli-client.ts`,
mDeBERTa-xnli); existing `src/scraper` + `scripts`.

## Global constraints

- **Flag-only, human-in-the-loop.** The gate and the published pipeline NEVER
  auto-change a verdict. Only `downgrade-verdict` (curator CLI) mutates the
  overlay. No published verdict — especially `contradicho` — changes without
  human sign-off. (Decided this session.)
- **Downgrade-only curator tool.** The curator CLI can only move a verdict toward
  less-certain (`verificado`→`parcial`/`sin-datos`, `parcial`→`sin-datos`,
  `contradicho`→`parcial`/`sin-datos`). Upgrades stay the deterministic/NLI
  pipeline's job. No libel-increasing change via this path.
- **Consumers unchanged.** `pleno-claims-verified.json` stays the published merged
  artifact with its current shape; the SPA chunks + every CLI keep reading it. The
  split is **write-side only**.
- **Local/$0**, TDD (RED→GREEN→commit), pure logic in `src/`, IO in CLI wrappers,
  `tsc --noEmit` + ESLint clean, Prettier before commits.
- **Libel:** `/metodologia` updated to document the re-grounding gate + the
  base/overlay contract (published editorial contract).
- **Deferred to P3:** hybrid BM25+dense retrieval; wiring `tendersTed`/`priorClaims`
  into the production deterministic runner (R3).

---

## Piece 1 — deterministic-base / overlay split (fixes R4/B5)

**Problem.** One mutable `pleno-claims-verified.json` is written by the
deterministic pass AND the second-pass runners. A stray `verify:pleno-claims`
rebuilds from scratch and wipes second-pass verdicts (this collapsed `contradicho`
24→1 twice this session).

**Files.**
- `public/data/pleno-claims-verified-base.json` — deterministic-only verdicts.
  Written solely by `verify:pleno-claims`. Same item shape as today.
- `public/data/pleno-claims-overlay.json` — second-pass + curator decisions,
  keyed by claimId:
  ```jsonc
  {
    "version": 1, "generatedAt": "<ISO>",
    "entries": {
      "<claimId>": {
        "verification": { /* ClaimVerification */ },
        "source": "nli" | "llm" | "curator-downgrade",
        "reason": "string (curator downgrades only, ≥20 chars)",
        "editor": "string (curator only)",
        "appliedAt": "<ISO>"
      }
    }
  }
  ```
- `public/data/pleno-claims-verified.json` — UNCHANGED shape; now a **derived**
  merge of base ⊕ overlay.

**Merge (pure, tested):** `src/scraper/verified-merge.ts`
```ts
export interface OverlayEntry { verification: ClaimVerification; source: string; reason?: string; editor?: string; appliedAt: string }
export interface Overlay { version: number; generatedAt: string; entries: Record<string, OverlayEntry> }
// base items in order; for each, overlay entry (by claimId) wins if present.
export function mergeVerified(baseItems: VerifiedItem[], overlay: Overlay): VerifiedItem[]
// Overlay entries whose claimId is absent from base are dropped (claim removed upstream).
export function rebuildVerified(): void  // read base + overlay → write verified.json → refresh chunks
```

**Runner changes (write-side only):**
- `verify-pleno-claims.ts` → writes `…-base.json`, then `rebuildVerified()` (base ⊕ existing overlay → verified.json + chunks). Re-running is now safe: it rebuilds the base and re-applies the overlay; second-pass/curator decisions survive.
- `verify-pleno-claims-nli.ts` (+ `…-llm.ts`) → write their upgrades into the **overlay** (`source:'nli'`/`'llm'`) via a shared `applyOverlayEntries(map)` helper, then `rebuildVerified()`. They no longer write `verified.json` directly.

**Migration:** a one-shot `scripts/migrate-verified-split.ts` seeds
`…-base.json` + an empty `…-overlay.json` from the current `verified.json` (so the
split bootstraps without recomputation). Run once; idempotent.

## Piece 2 — re-grounding gate (flag-only)

**Runner:** `scripts/reground-verdicts.ts` → `npm run reground:verdicts [-- --plenoId ID] [--max N]`.

Reads `verified.json`, selects items with verdict ∈ {`verificado`,`parcial`,
`contradicho`} that carry ≥1 evidence row. For each, NLI-scores
(premise = `evidence.snippet`, hypothesis = `claim.verbatim`) in chunked batches
(reuse `scoreNliPairs`). Pure decision in `src/scraper/reground.ts`:

```ts
export interface RegroundFlag { claimId: string; verbatim: string; currentVerdict: ClaimVerdict
  reason: 'ungrounded' | 'weak-contradicho'; maxEntail: number; maxContra: number
  evidence: { ref: string; snippet: string }[] }
// verificado/parcial → flag 'ungrounded' if maxEntail < REGROUND_ENTAIL_FLOOR (0.5)
// contradicho       → flag 'weak-contradicho' if maxContra < REGROUND_CONTRA_FLOOR (0.5)
export function regroundDecision(item, nliScores): RegroundFlag | null
```

**Output:** `public/data/pleno-claims-regrounding-flags.json`
`{ generatedAt, model, flags: RegroundFlag[] }`. **No verdict changes.** This file
is the curator's review queue (and a future `/curator` surface).

Thresholds (`REGROUND_*`) live in one exported const, tunable on the P1 gold set.

## Piece 3 — curator-apply CLI (the only downgrade writer)

- `scripts/regrounding-review.ts` → `npm run regrounding:review` — prints the
  flags file readably (claim, current verdict, reason, NLI scores, evidence), for
  the curator to scan.
- `scripts/downgrade-verdict.ts` → `npm run downgrade-verdict -- <claimId>
  <verificado|parcial|sin-datos> --reason "<≥20 chars>" [--editor "<name>"]`.
  Validates: claimId exists in base; the move is a **downgrade** (rank
  `verificado` > `parcial` > `sin-datos`; `contradicho` may only go to
  `parcial`/`sin-datos`); reason ≥20 chars. Writes an overlay entry
  (`source:'curator-downgrade'`, reason, editor, appliedAt), then
  `rebuildVerified()`. Re-validates the overlay before writing.
- Validator `validateOverlay(overlay)` (pure) enforces the schema +
  downgrade-only invariant; called on every write.

## Data flow (P2)

```
suggestions ──verify:pleno-claims──▶ verified-base.json ─┐
                                                         ├─ mergeVerified ─▶ verified.json ─▶ chunks ─▶ SPA
overlay.json (nli upgrades · curator downgrades) ────────┘        ▲
        ▲                                                         │
        │ applyOverlayEntries                                     │ rebuildVerified()
   verify:pleno-claims:nli                                        │
        │                                                         │
   downgrade-verdict (curator) ◀── regrounding:review ◀── reground:verdicts ──▶ regrounding-flags.json
```

## Testing
- `verified-merge.test.ts` — overlay wins per claimId; missing-base entries
  dropped; base order preserved; round-trip rebuild.
- `reground.test.ts` — `regroundDecision`: verificado/parcial below entail floor →
  ungrounded; above → null; contradicho below contra floor → weak-contradicho;
  with no evidence → null (not flagged).
- `overlay-validate.test.ts` — downgrade-only enforced (reject an upgrade); reason
  length; schema.
- Runner wiring: a fixture-level test that `verify:pleno-claims` re-applies an
  existing overlay entry after rebuilding the base (guards the R4/B5 regression).

## Risks
- The split touches the verify pipeline (untested today per the audit) — mitigated
  by keeping `verified.json` consumer-identical + a runner-wiring regression test.
- Re-grounding thresholds on lexical-shortlist evidence may over-flag; the gate is
  flag-only so the cost is curator review time, not wrong published verdicts. Tune
  on the gold set.

## Self-review
- Covers the two locked decisions (C scope; flag-only). Pieces map 1:1 to tasks.
- `mergeVerified`/`Overlay`/`rebuildVerified` names consistent across pieces.
- Consumers untouched (verified.json shape preserved) — blast radius is write-side.
- The only verdict-mutating path is `downgrade-verdict`, downgrade-only,
  reason-gated — the libel boundary holds.
