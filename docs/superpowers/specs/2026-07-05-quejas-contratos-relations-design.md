# Quejas ↔ Contratos relations — design

**Date:** 2026-07-05
**Status:** approved (architecture + gating) · engine spec for review
**D1 amendment (during build):** the `expediente` signal was **deferred**. A queja
carries no expediente of its own, so a correct "mismo expediente" tier needs the
pleno-agenda bridge (queja dept ↔ agenda item expediente ↔ contract), which D1
does not include — a naive "contract has an expediente" check produced 139 false
Tier-A links on real data. D1 Tier A is therefore strictly **place + department**;
the expediente/structural tier returns with the agenda bridge in a later deliverable.
**Author:** Claude Code session

## 1. Problem & context

We want a feature that finds and surfaces **relations between citizen complaints
(`quejas`) and municipal contracts (`contratos`)** — e.g. a complaint about a
pothole on a street where the town later awarded a paving contract.

A correlator already exists (`src/scraper/tender-queja-correlator.ts` + CLI +
`useTenderQuejaCorrelations` + a `CorrelationsCard` on `/quejas/:id`), but it is
**dormant and incomplete**:

1. **Stale input adapter.** The CLI (`scripts/scrape-tender-queja-correlations.ts`)
   reads `category` / `neighborhood` / `createdAt`, but the current bot snapshot
   (`bot/src/services/snapshot.ts`) emits `service_code` / `address_string` /
   `requested_datetime`. Its `.filter(q => q.category && q.createdAt)` drops
   every real queja → **0 correlations even when quejas exist.** The committed
   `public/data/tender-queja-correlations.json` is from 2026-04-20 (0 quejas).
2. **Geo-blind.** It ignores location entirely, though both sides now share the
   OSM gazetteer: a queja's `address_string` is a place slug
   (`urbanitzacio-valencia-la-vella`) and `tender-geo.json` already situates
   contracts to the same slug space (`urbanitzacio-la-reva`, …).
3. **Not in `scrape:all`/nightly**, and **no contract-side reverse view**.

### Decisions locked in (via brainstorming)

| Question | Decision |
|---|---|
| Direction | Rethink from scratch (supersede the old correlator) |
| Purpose | **Unified cross-reference** — queja→money, money→queja, town-wide overlap |
| Match model | **Deterministic multi-signal shortlist + curator-gated LLM rerank**, adding the missing geographic signal |
| Framing | **Neutral data, no causal claims** — plain figures, never "ignored"/"abandoned" |

## 2. Goals & non-goals

**Goals**
- One deterministic, explainable relation engine that scores queja↔contract links.
- Add a geographic co-location signal built on the existing gazetteer + tender-geo.
- Feed three views from one data file; sequence the views.
- Stay inside the repo's determinism + libel discipline (honesty gates, neutral
  phrasing, `requiresHumanApproval` on anything fuzzy).

**Non-goals**
- No causal/accusatory language ("the town ignored X"). Ever.
- No new PII surface — geo matching uses the already-published, neighborhood/place
  granularity of `address_string`; never re-introduces exact citizen coordinates.
- Not building all three views at once — engine + View 1 first, then 2 and 3.

## 3. Decomposition (sub-projects)

1. **Engine** (this spec's focus) — pure deterministic scorer + Tier-B LLM rerank
   + data file + CLI + nightly wiring + tests. Independently valuable: it revives
   the queja→money card.
2. **View 1 — queja→money**: re-point the existing `CorrelationsCard` on
   `/quejas/:id` at the new data. (Bundled with the engine as Deliverable 1 so the
   slice is visible + verifiable.)
3. **View 2 — money→queja**: reverse card on `/presupuesto` + the shared
   `ContractCard` (the hook already exposes `correlationsForTender`/`byTender`).
4. **View 3 — town-wide overlap/gap**: neutral figures view (quejas vs situated
   spend per barrio/materia). Each view gets its own spec → plan later.

## 4. Engine design

### 4.1 Placement

New module `src/scraper/queja-contract-relations.ts` with a **pure core**
(`scoreRelation`, `buildRelations`) that does no I/O. The CLI
`scripts/scrape-queja-contract-relations.ts` reads the JSON snapshots, normalizes
inputs, calls the core, runs the optional LLM rerank on Tier-B, and writes the
output file. The old `tender-queja-correlator.ts` is **retired**; its reusable
LLM plumbing (client, prompt scaffolding, freeze gate) is lifted into the new
module/prompts.

### 4.2 Normalized inputs

```ts
interface RelQueja {
  id: string            // service_request_id
  serviceCode: string   // service_code (→ QUEJA_CATEGORY_TO_CPV / theme)
  department: DepartmentSlug | null   // canonicalizeDepartment(concejalia_area)
  placeSlug: string | null            // normalized address_string
  description: string
  createdAt: string     // requested_datetime (ISO)
}
interface RelContract {
  id: string
  permalink: string
  title: string
  department: DepartmentSlug | null   // from categoryTitle/CPV → canonicalize
  cpvs: string[]
  places: string[]      // situated place slugs (tender-geo assignments[].place)
  zones: string[]       // situated barrio slugs (tender-geo assignments[].zones)
  awardDate: string | null
  amount: number | null
  assignee: string | null
  expediente: string | null   // joined from the `tenders` collection twin
                              // (documentNumber, e.g. "251/2023 BSDA") by shared
                              // permalink/idEvl; often absent → expediente signal
                              // simply doesn't fire (honest miss), place+dept carries
}
interface RelContext {
  agendaItems: PlenoAgendaItem[]   // expediente ↔ department, for structural
  now?: Date
  frozen?: boolean                 // LOREG freeze (isFrozen on promises snapshot)
}
```

### 4.3 Signals (deterministic, each returns a sub-result + evidence)

1. **`expediente` (ironclad).** The queja's routed department aligns with a pleno
   agenda item whose `expediente` matches the contract's expediente
   (normalized: strip spaces, uppercase). Present → **Tier A**.
2. **`place` (strong).** The queja's `placeSlug` matches one of the contract's
   situated places. Granularity, best-first:
   - **exact place** — `queja.placeSlug === contract.places[i]` (street / POI /
     urbanización). Highest.
   - **barrio** — `queja.placeSlug ∈ contract.zones` (both are barrio slugs).
     Medium. (Resolving a *specific* place slug up to its containing barrio via
     `geo.json` is a later refinement, not D1 — an honest miss beats a guessed
     containment.)
   Slug comparison reuses the place-resolver's normalization (diacritics fold,
   ca/es synonym dict) so `valencia-la-vella` ↔ `valència-la-vella` unify.
3. **`department` / theme (medium).** `queja.department === contract.department`
   (canonical slug equality), plus a lighter CPV thematic check reusing
   `tenderMatchesQuejaCpv(serviceCode, cpvs)` / `QUEJA_CATEGORY_TO_CPV`.
4. **`temporal` (modifier only).** Contract awarded in `[queja − 3mo, queja + 18mo]`.
   Peaks ~3 months after the queja. **Never creates a link alone** — only boosts
   or dampens a link that already has a place/department/expediente signal.

### 4.4 Tiering, scoring, honesty gates

- **Tier A — publishable fact** (`requiresHumanApproval: false`, `via:'deterministic'`):
  `expediente` present **OR** (`place` exact-or-barrio **AND** `department` match).
  These are verifiable co-occurrence facts; the place-resolver already publishes
  deterministic geo without a human gate, so these render directly with neutral
  phrasing.
- **Tier B — gated suggestion** (`requiresHumanApproval: true`, `via:'deterministic'|'llm'`):
  `department`/theme match with weak/no geo, or place-only with no department.
  Shortlisted, optionally LLM-reranked, **never rendered until a curator promotes.**
- **No link:** temporal-only, or nothing fired.

Hard gates (enforced in code + unit-tested):
- Never emit on `temporal` alone.
- Never emit `department`-theme alone into Tier A (must have geo or expediente).
- `relationLabel` is a fixed neutral enum: `"misma zona y materia"`,
  `"misma zona"`, `"misma materia"`, `"mismo expediente"` — no causal words.
- Every link carries a `signals` breakdown (what fired + matched value) so the UI
  can render an explainable "por qué".
- LOREG freeze halts emission (same `isFrozen` gate as promises/journalist).

### 4.5 LLM rerank (Tier B only)

Deterministic signals build a shortlist (top-N by score); an LLM picks/ranks the
best ≤1 per queja and returns a confidence + reasoning. Guardrails (reuse the old
correlator's discipline):
- Hallucination guard: the returned `tenderPermalink` MUST be in the shortlist.
- Confidence floor (default 0.6); below → dropped.
- Output is **always** `requiresHumanApproval: true` (Tier B never auto-publishes).
- **Backend policy (per repo memory):** unattended/nightly uses a $0 backend —
  `claude-code` (Sonnet, `--strict-mcp-config`) or `gemini`; **never** metered
  OpenAI. `LLM_CONCURRENCY=1`. Prompt is versioned
  (`QUEJA_CONTRACT_RERANK_PROMPT_VERSION`) and cache-keyed.
- The rerank is **optional**: if no backend is configured, the engine still emits
  Tier A + deterministic Tier-B candidates (LLM just doesn't refine them). Nightly
  runs deterministic-only; LLM rerank is a curator/opt-in pass.

## 5. Data contract

`public/data/queja-contract-relations.json` (machine-written):

```jsonc
{
  "generatedAt": "ISO",
  "source": "queja-contract-relations engine vN",
  "stats": {
    "frozen": false, "quejasScanned": 0, "contractsScanned": 0,
    "tierA": 0, "tierB": 0, "llmCalls": 0, "llmRejectedHallucinated": 0,
    "llmRejectedLowConfidence": 0, "reason": null
  },
  "links": [
    {
      "quejaId": "Q-...", "tenderPermalink": "https://...", "tenderId": "…",
      "tier": "A",                       // 'A' | 'B'
      "score": 0.9,
      "via": "deterministic",            // 'deterministic' | 'llm'
      "relationLabel": "misma zona y materia",
      "signals": {
        "expediente": { "value": "251/2023" } | undefined,
        "place": { "granularity": "exact"|"barrio", "slug": "…", "name": "…" } | undefined,
        "department": { "slug": "urbanismo" } | undefined,
        "temporal": { "monthsAfter": 4.2 } | undefined
      },
      "requiresHumanApproval": false,    // false only for Tier A
      "reasoning": "…"                   // present for via:'llm'
    }
  ]
}
```

**Curator promotion (Tier B → published).** Mirrors the place-suggestions →
place-overrides pattern: a curator CLI `npm run promote-relation -- <quejaId>
<tenderId>` records the approved pair in a curated
`public/data/queja-contract-relations-approved.json` (schema forbids
`requiresHumanApproval`). The UI renders a link when **Tier A** OR the pair is in
the approved set. Machine suggestions (`requiresHumanApproval:true`, un-promoted)
are **never rendered**.

## 6. Surfaces (sketched; own specs later)

- **View 1 (with Deliverable 1):** `CorrelationsCard` on `/quejas/:id` reads the
  new file; renders Tier A + approved Tier B as "Posibles actuaciones municipales
  relacionadas" with the `signals` explainer + neutral label.
- **View 2:** reverse card on `/presupuesto` + `ContractCard` — "Quejas
  ciudadanas relacionadas (por zona/materia)". Uses `correlationsForTender`.
- **View 3:** town-wide overlap — per barrio/materia, `N quejas · €X situado`,
  honest empty/zero states; no causal flags. Likely a `/quejas` or `/datos`
  panel + optional map layer.

## 7. Nightly wiring

Add `scrape:queja-contract-relations` to `package.json` and to
`scripts/scrape-all.sh` (deterministic-only; **best-effort** class so a flake
never blocks the commit). Runs after `scrape:tenders` + `compute:tender-geo`
(needs both) and after the bot's queja export. LLM rerank stays a manual/curator
pass, not nightly.

## 8. Testing (TDD)

- **Pure scorer** (`tests/parse-queja-contract-relations.test.ts`): each signal in
  isolation + tier assignment, using small hand-built `RelQueja`/`RelContract`
  fixtures. Explicit cases for every honesty gate (temporal-alone → no link;
  department-theme-alone → not Tier A; frozen → empty; neutral label enum).
- **Geo join**: fixture with a queja `placeSlug` matching a contract's
  `tender-geo` place (exact) and another matching only a `zone` (barrio).
- **Input adapter**: a fixture `quejas.json` in the *current* snapshot schema
  (`service_code`/`address_string`/`requested_datetime`) parses to `RelQueja`
  (regression against the stale-adapter bug).
- **LLM rerank**: injected fake `LlmCaller` (no network) — hallucination guard +
  confidence floor + always-`requiresHumanApproval`.
- Full suite + `tsc --noEmit` + eslint/prettier stay green.

## 9. Migration / retirement

- Delete `tender-queja-correlator.ts` + `scrape-tender-queja-correlations.ts` +
  the old output file; move their tests' still-valid cases into the new suite.
- `useTenderQuejaCorrelations` hook + `QuejaDetail` card are **kept** but pointed
  at `queja-contract-relations.json` (new shape) — update the field reads.
- `/metodologia` gains a "Relación quejas ↔ contratos" section documenting the
  signals, tiers, neutral framing, and the curator gate (published editorial
  contract — required whenever this behavior changes).

## 10. Phasing / deliverables

- **D1 (now):** engine (pure scorer + Tier-A + deterministic Tier-B) + data file +
  CLI + nightly + tests + View 1 revived + `/metodologia`. Ships something real.
- **D2:** LLM rerank layer + `promote-relation` curator CLI + approved file.
- **D3:** View 2 (money→queja).
- **D4:** View 3 (town-wide overlap/gap).
