# ribarroja.es new-data integration — program design

**Date:** 2026-07-07 · **Status:** approved design (pending spec review) · **Owner:** Sergei Lutchenko

Turns the July-2026 site audit (`docs/DATA_SOURCES_AUDIT_2026-07.md`) into a
sequenced build program: new scrapers for the genuinely-new municipal data, plus
a policy for how that data refines existing analysis and what to re-run.

## Decisions (locked)

- **Sequencing:** wave-by-wave. Spec + build one wave, ship, review, then the next.
  This document is the program roadmap; each wave gets its own implementation plan.
- **LLM posture:** deterministic re-runs first ($0); the metered LLM `sin-datos`
  second-pass runs once per new corpus, *after* the corpus is wired — never
  re-run LLM *extraction* (it reads transcripts/press, unaffected by municipal data).
- **Wave 1 = financial depth (budget execution)** — see the recon pivot below.

## Recon pivot — why Wave 1 is NOT "contract truth"

The audit's #1 pick (Actas de Mesas de Contratación → real prices) collapsed on
inspection and is **demoted out of the wave plan**:

1. The score-as-amount artifacts are **already handled** by
   `isScoreArtifactAmount` (src/lib/tenders.js; applied at
   src/scraper/tenders.ts:214). Current `tenders.json` has one sub-€100 awarded
   contract and it is a genuine €41.82 purchase. The 73 DANA / €2.24M figures are
   **already clean**.
2. The "Actas" transparency item just links to `ribalicita.ribarroja.es`
   (the Gobierto instance we already scrape) → PLACSP. Memory
   `reference_gobierto_contract_data_ceiling` already establishes Gobierto is at
   its ceiling and PLACSP-direct is brittle/non-geo.

→ Actas survives only as a **deferred, curator-gated micro-task** (look up the
real price for a specific contract when an investigation needs it), not a wave.

## Architecture principle (applies to every wave)

**New municipal sources become deterministic verifier evidence corpora, not new
LLM inputs.** This keeps the analysis refinement almost free: the deterministic
verifier (`src/scraper/claim-verifier.ts`), `compute:tender-geo`, and
`compute:dept-stats` re-run at $0 and produce better verdicts; the metered LLM
only runs a single targeted `sin-datos` second-pass once each corpus is wired.

Every scraper follows the repo's established shape and TDD cadence:
`scripts/scrape-X.ts` (fetch, node-only) → `src/scraper/X.ts` (pure parser,
unit-tested against a committed fixture) → `public/data/X.json` (typed snapshot)
→ `src/hooks/useX.js` → UI. RED→GREEN→wire, three commits.

---

## The waves

| Wave | Sources | Feeds | Feasibility |
|---|---|---|---|
| **1 · Financial depth** | budget execution (estados de ejecución, modificaciones de crédito, liquidaciones, cuentas generales, indicadores económicos) | `/presupuesto`, `/datos`, verifier budget corpus | **High** — structured year/trimestre pages → PDFs |
| **2 · Municipal legal feed** | Tablón de edictos; convenios y encomiendas | new `/edictos` surface, `/quejas` legal-clock, verifier corpus | Medium — edictos board is JS/cert-gated; needs a feasibility spike to locate the static PDF listing |
| **3 · New surfaces** | procesos selectivos (municipal hiring); registro de asociaciones | new `/empleo-publico`; `entidades` directory + outreach export | Medium — HTML lists + PDFs |
| **4 · Verifier corpora + geo** | urbanismo/obras + per-área data | `/departamentos`, landing map, verifier corpus | Easy-medium |
| **5 · Meta-transparency** | FOI annual stats; morosidad/PMP/indicadores | `/datos` transparency-health | Low urgency |

Waves 2–5 are mapped, not detailed, in this spec — each gets its own plan when
its wave starts. The rest of this document details **Wave 1**.

---

## Wave 1 — financial depth (budget execution)

### Source
`https://www.ribarroja.es/es/hacienda/1_presupuesto` → sub-sections:
- **Estados de ejecución presupuestaria** — indexed by year + trimestre
  (2023-Q2, 2023-Q3, 2024-Q1, 2025, 2026…), each a content page linking to
  execution PDFs (ingresos/gastos: presupuestado vs. ejecutado, by chapter).
- **Modificaciones de crédito** — budget-modification records.
- **Liquidaciones** — annual budget settlements (resultado presupuestario, remanente).
- **Cuentas generales** — general accounts.
- **Indicadores económicos** — autonomía fiscal, capacidad/necesidad de financiación, deuda.

### Components (one responsibility each)
- `src/scraper/budget-execution.ts` — **pure parser**. `parseBudgetExecution(pdfText, {year, trimestre}) → BudgetExecutionPeriod`. No I/O. Unit-tested against a committed PDF-text fixture.
  - Schema `BudgetExecutionPeriod`: `{ year, trimestre|null, ingresos: { presupuestado, ejecutado, pct }, gastos: { presupuestado, ejecutado, pct }, byChapter?: [{ chapter, label, presupuestado, ejecutado, pct }], sourceUrl, retrievedAt }`.
- `scripts/scrape-budget-execution.ts` — CLI wrapper. Walks the estados-de-ejecución index (browser-style UA, per the ribarroja.es WAF note in memory), resolves each year/trimestre content page, extracts the PDF link, `pdf-parse` → text → `parseBudgetExecution`. Writes `public/data/budget-execution.json` = `{ generatedAt, source, periods: BudgetExecutionPeriod[], latest: {...} }`. Idempotent.
- `src/hooks/useBudgetExecution.js` — standard `useJsonFetch` hook + formatters.
- `/presupuesto` UI — a new "Ejecución presupuestaria" section: **ejecutado vs. presupuestado** (the accountability story), latest-quarter execution %, and a small time series. Reuses `Charts.jsx` primitives + the site's tokens.

### npm scripts
`scrape:budget-execution` (autonomous — add to `scrape-all.sh`);
`build:cpv-labels`-style occasional if needed.

### Feasibility spike (first task of the plan, before the parser)
Fetch ONE execution PDF, inspect its text structure (chapter tables vary between
Sedipualba templates), commit it as `tests/fixtures/budget-execution_<period>.pdf.txt`,
and pin the parser contract against it. If the PDFs are scanned images (no text
layer), fall back to the summary figures on the HTML content page instead and
narrow the schema — decide at the spike, don't assume.

### TDD cadence
1. RED — fixture + `tests/parse-budget-execution.test.ts` pinning the parser on the real PDF text.
2. GREEN — `parseBudgetExecution`.
3. Wire — CLI, JSON, hook, `/presupuesto` section, e2e + a11y for the new section, add to `scrape-all.sh`.

### Analysis refinement triggered by Wave 1
- **`/presupuesto`** gains spent-vs-approved (the core new value).
- **Verifier corpus:** `budget-execution.json` is added as a deterministic
  evidence source in `claim-verifier.ts` (a claim like "se ejecutó el X% del
  presupuesto de Y" can now be checked). **$0 re-run:** `verify:pleno-claims`
  (overlay-safe) + `verify:press-claims`.
- **LLM second-pass (metered, once):** after the corpus is wired, run one
  targeted `sin-datos` second-pass — some budget-related claims may flip to
  `verificado`. Guarded to the allowed backends (never openai; per memory
  `feedback_subagent_model_opus_fable`).
- No LLM extraction re-run. No findings rewrite unless a verdict flips (curator gate).

### Wave 1 success criteria
- `npm run scrape:budget-execution` writes `budget-execution.json` with ≥4 periods, idempotent.
- `/presupuesto` renders ejecución vs. presupuesto without console errors; e2e + a11y strict pass.
- `verify:pleno-claims` runs clean with the new corpus wired (base⊕overlay intact).
- Full vitest + lint stay green; `scrape:all` includes the new adapter.

---

## Cross-cutting: analysis-refinement map (whole program)

| Existing surface / pipeline | Refined by | Re-run (cost) |
|---|---|---|
| `/presupuesto` | budget execution (W1) | data only |
| `tenders.json` money map | (nothing — prices already clean; actas deferred) | — |
| deterministic **verifier** | every new corpus (budget-exec, edictos, convenios, obras) | `verify:pleno-claims` + `verify:press-claims` — **$0**, overlay-safe |
| LLM **sin-datos second-pass** | same corpora | once per corpus, metered, targeted — allowed backends only |
| LLM **extraction** (pleno/press) | — nothing | **never** (reads transcripts/press) |
| `/departamentos` | per-área contacts, procesos selectivos | `compute:dept-stats` — $0 |
| landing map / geo | urbanismo/obras, industrial maps | `compute:tender-geo` — $0 |
| `/quejas` legal-clock | edictos (official acts) | data + join logic |
| `/datos` | FOI stats, financial indicators | data only |
| DANA reportaje | NOT the actas (moot); possibly obras/urbanismo context | curator refresh only if a cited number changes |

## Wave 2 edictos — SPIKE DONE: not worth it (2026-07-08)

Feasibility spike ran all three approaches; edictos is **not HTTP-scrapeable**
and the value is already covered:
  1. CMS-republished PDFs — no discoverable listing (probed /es/tablon-*, /es/edictos, /es/anuncios, /es/bandos → all 404).
  2. Server body — the tablonEdictos.do page (200/161KB) has ZERO edict content: "edicto" appears only in nav chrome, 0 dates, 0 expediente refs, no table, no JSON island. Fully JS-loaded.
  3. Grid handshake — GET (JSESSIONID, no ViewState token) + POST formAction=btLoad returns the same 161KB shell, no edicts. The Sedipualba JSF grid builds its requests in JS; only a HEADLESS render would work.
**Decision: DEFER edictos.** Headless is heavy/fragile for a nightly, AND the
legally-material edicts already publish in the **provincial BOP** (`scrape:bop`
→ Riba-roja edictos) and **BOE** (`scrape:boe`) which we already scrape — the
municipal Tablón largely mirrors these. (Both showed 0 items on 2026-07-08 = a
quiet 30-day window, not a coverage gap.) Revisit only if a headless scraper is
justified for local-only edicts BOP misses.

## Wave 3.1 follow-up (from Wave 3 execution, 2026-07-08)

- **Asociaciones email extraction — town-gazetteer hardening.** The register
  PDF glues the domicilio column into the correo column; `extractEmail`
  (`src/scraper/asociaciones.ts`) trims observed remnants and gates on
  `EMAIL_ONLY_RE`, which guarantees a WELL-FORMED email but not a CORRECT one:
  an address ending in an unlisted town/venue glued to the email can pass as a
  wrong-but-valid email instead of an honest null (1/85 in the 2026-05 fixture,
  disclosed). The `email` field is JSON-only — NOT rendered (/datos shows
  nombre + tipo). Harden with a town gazetteer (prefer null on unresolved
  glue) BEFORE surfacing `email` on any public page.
- ~~**Add trim-regression tests** for the rewritten `extractEmail` branches~~
  **DONE (2026-07-08):** 4 regression tests lock town-strip / `s-n` / wrapped-row
  reconstruction + the Donadones known-limitation. Also DONE this pass:
  `email` OMITTED from the published snapshot (honesty); both new snapshots added
  to the `/datos` DatasetsCatalog; `/empleo-publico` page chrome bilingual (es+ca);
  AsociacionesCard eyebrow null-date guarded. STILL OPEN: the email town-gazetteer
  itself (only needed if `email` is ever surfaced), procesos `%`-encoded slug ids,
  per-process document extraction, BOP-0-items diagnostic.
- **Procesos-selectivos:** decode `%`-encoded slug ids; per-process document
  (bases/listas/tribunal PDF) extraction from detail pages; bilingual (ca)
  chrome for /empleo-publico (sibling /empleo is bilingual).

## Wave 2 feasibility (probed 2026-07-07 — SPIKE NEEDED before speccing)

The **Tablón de edictos** is NOT a static server-rendered table. It is the
authenticated Sedipualba **PortalCiudadania** portal shell
(`oficinavirtual.ribarroja.es/PortalCiudadania/tablonEdictos.do` → 200 / 161 KB,
but the body is login/auth/wizard/localizador forms; the edicts render in a JS
grid with no data endpoint exposed in the page HTML, no edict PDF links). A
dedicated feasibility spike is required first, trying in order:
  1. **Republished PDFs on the main CMS** — the section-audit noted edicts also
     publish via `ribarroja.es/contenidos.downloadatt.action?id=<id>`; look for a
     public HTML listing there (cleanest if it exists).
  2. **Reverse-engineer the grid AJAX endpoint** — mirror the empleo scraper
     pattern (`scrape-empleo.ts`: GET for CSRF token → POST `…?acc=tableData`).
  3. **Headless render** (Playwright) as a last resort — heavier, but the repo
     has `fetchUrlHeadless` in journalist-tools with a hostname allowlist.
Only after the spike identifies a stable source should Wave 2 be specced. If
none pans out cleanly, reorder: do **Wave 3** (procesos selectivos + registro
de asociaciones — plain HTML+PDF, low feasibility risk) before edictos.

## Wave 1b — deferred (2026-07-07 decision)

Wiring `budget-execution.json` into `claim-verifier.ts` is **deferred until
Wave 1.1 backfills more execution periods.** Recon during 1b design found the
immediate value is modest: (a) only 1 period (2025) currently ships, so the
corpus can only corroborate 2025-execution claims; (b) execution data is by
**económica capítulo** (Personal/Corrientes/Inversiones…) which does NOT map to
the claim **topic** axis (`TOPIC_TO_BUDGET_HINTS` targets program/functional
names), so matching must key off claim verbatim vs capítulo labels — narrow
(mostly capítulo-level claims like "las inversiones apenas se han ejecutado").
When built: **evidence-only** (emit a `budget-execution` ClaimEvidence row;
NEVER auto-flip a verdict on keyword matching — libel-safe), then the $0
deterministic re-run; the metered sin-datos second-pass only once there are
enough periods + matching claims to justify it.

## Wave 1.1 follow-up (from Wave 1 execution, 2026-07-07)

Wave 1 shipped **1 fully-clean budget-execution period (2025)** — the honesty
gate drops years whose PDF sheets use older/variant SICALWIN layouts the parser
can't yet read (spec asked for ≥4; operator accepted honesty-over-coverage).
Wave 1.1 backlog to reach broader coverage:

- Parse the **2023 "corrientes"** + **2026 "detalle"** estado-de-ejecución layouts.
- Fix the **2024 ingresos** mis-parse (empty chapters, 0.1% artifact).
- Per-quarter selection on year index pages (currently parse-and-select-best per page).
- When a multi-period time-series UI lands on `/presupuesto`, add per-metric
  validation so no partially-broken period can surface.

## Deferred / explicitly out of scope

- **Actas de Mesas de Contratación** → curator micro-task, not a wave (premise collapsed).
- **BIM, Obituario, Fil directe, Buzón AVAF** → no accountability value (audit-excluded).
- **Avisos** → already covered (= pleno convocatorias).
- **Farmacias / app REST backend** → only if a "servicios hoy" landing chip is ever wanted.
- **LLM extraction re-runs** → never triggered by municipal-data changes.

## Success criteria (program)

Each wave ships independently green (vitest + e2e/a11y + lint), is added to
`scrape-all.sh` where autonomous, and triggers only the $0 deterministic re-runs
by default. The metered LLM second-pass is a deliberate, logged, per-corpus
action — never automatic. No libel-material surface (findings, promises,
declaraciones) changes without a curator gate.
