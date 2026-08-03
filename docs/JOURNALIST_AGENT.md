# Journalist agent

The first iterative-LLM subsystem in the repo. Surfaces at
`/laboratorio/agentes` and `/laboratorio/agentes/:assignmentId`.

The journalist agent is the first iterative-LLM subsystem in the repo.
It accepts an investigative assignment (kickoff: a public-record
biography of alcalde Robert Raga, slug `robert-raga-gadea`) and emits a
machine-drafted report that a curator promotes before publication.

Files (mirror the promises → claims → findings 3-layer contract):

- `public/data/journalist-assignments.json` — curator-seeded via
  `npm run journalist:assign`. Status: `pending → running → drafted →
promoted | failed`.
- `editorial/journalist-drafts/journalist-reports-suggestions.json` —
  **machine-written**, gitignored, **not web-served**. Every record carries
  `requiresHumanApproval:true`; only the `/curator` preview reads it.

  > This lived under `public/data/` until 2026-08-01. Nothing linked to it,
  > which is why it went unnoticed that **24 unreviewed drafts about named
  > councillors were fetchable by URL for weeks** — one of them carrying Caso
  > Malaya sources about an entirely different man. Vercel serves the whole
  > directory: "not rendered" is not "not published". Never move it back.

- `public/data/journalist-reports.json` — **curator-promoted**, what
  the SPA renders. The validator strips `requiresHumanApproval` and
  refuses to accept it on this shape.

Architecture:

Each of the three big modules below was decomposed (May 2026) into a directory
behind a thin **barrel** of the same name — every `import … from
  '…/scraper/journalist*'` keeps resolving unchanged, and the barrels re-export
only the original public surface.

- Schemas + validators: `src/scraper/journalist.ts` — barrel over
  `journalist/{types,core,sections,validators}.ts` (vanilla TS, mirrors
  `pleno-finding.ts` discipline — `must()` invariants, snapshot-wide
  re-validation on every write). `journalist/validators.ts` owns the single
  `isHighSensitivity()` libel predicate shared by the validator and
  `computeLegalSensitivity` (no drift).
- Tools: `src/scraper/journalist-tools.ts` — barrel over
  `journalist-tools/{internal,local,web,gazette,bio-extract,citations}.ts`
  (pure functions — `searchLocalSnapshots`, `fetchOfficialBySlug`,
  `fetchPressForSubject`, `fetchWikidata`, `fetchWikipedia`, `fetchUrl`,
  `webSearch` Exa, `audit` with Wayback). Network results cached at
  `.research-cache/<sha256>.json` (the `internal` module).
- 4-stage pipeline: `src/scraper/journalist-agent.ts` — the orchestrator
  (helpers + section builders extracted to `journalist-agent/{shared,builders}.ts`)
  — `runJournalistAgent`:
  1. **Plan** (LLM, `JOURNALIST_PLAN_VERSION`) — emits 4–8 research questions, each tagged with a tool.
  2. **Research** (deterministic Node) — dispatches each question through the tools; accumulates `SourceCitation[]` + parallel `evidence[]` rows.
  3. **Synth** (LLM, `JOURNALIST_SYNTH_VERSION`) — projects the evidence into a draft skeleton (portrait, narratives, timeline, relationships, sparkline, promise-board, quote-cards).
  4. **Verify** (LLM, `JOURNALIST_VERIFY_VERSION`) — re-reads the draft + sources, escalates `legalSensitivity`, appends warnings.
- LLM I/O via the existing `callLLM` infra (cache, telemetry, backend
  fallback chain). Token budget per assignment: `JOURNALIST_TOKEN_BUDGET`
  (default 200K).
- **Stage 3.5 (deterministic grounding, 2026-07-29):**
  `journalist-agent/grounding.ts` checks every narrative against the
  excerpts of the sources it cites — figures absent from cited evidence
  (the fabricated-number tell) + a lexical-overlap floor → `[grounding]`
  warnings that persist into the draft and feed the verify LLM
  (prompt v2: evidence-only judging, temporal rule, softening bias).
  Warn-only; zero LLM cost.
- **Web-citation trust** comes from the curated domain table
  (`journalist-tools/domain-trust.ts`): official/institutional zones →
  high, established Spanish/Valencian press + IFCN fact-checkers →
  medium, unknown domains → low (an unknown domain gets the curator's
  attention, not the benefit of the doubt). Explicit `trust` overrides
  still win.
- Right-of-reply: `.github/ISSUE_TEMPLATE/journalist-report-response.yml`
  - `.github/workflows/ingest-journalist-responses.yml` — fires when an
    issue gains BOTH labels `derecho-replica` AND `periodista`, parses the
    form, calls `npm run journalist-reply`, commits, closes the issue.

Curator CLIs (`scripts/`):

```bash
npm run journalist:assign -- --id a-robert-raga-bio --kind biography \
    --subject-slug robert-raga-gadea --subject-name "Robert Raga Gadea" \
    --subject-kind official --brief "<≥40 chars>"

EXA_API_KEY=… npm run journalist:run -- a-robert-raga-bio \
    [--token-budget N] [--dry-run] [--stop-after plan|research|synth|verify]

npm run promote-report -- a-robert-raga-bio \
    [--curator "<name>"] [--curator-notes "<text>"] \
    [--ack-legal-review]      # required when draft.legalSensitivity = 'high'
    [--edit]                  # write to /tmp instead of persisting

npm run correct-journalist-report -- <reportId> \
    --field <narrative.<heading>.bodyMarkdown | narrative.<heading>.heading | quote.<index>.attributedTo> \
    --new "<text>" --reason "<≥20 chars>" --editor "<name>"

npm run journalist-reply -- <reportId> <PSOE|PP|VOX|Compromís|Ciudadanos|Otro|person> \
    "<verbatim ≥20 chars>" [sourceUrl] [YYYY-MM-DD]
```

**Libel rules — non-negotiable, encoded in code:**

1. **`legalSensitivity:'high'` blocks `promote-report` without
   `--ack-legal-review`.** Auto-stamped by `computeLegalSensitivity()` +
   schema validator whenever a `SourceCitation.excerpt`/`title` or a
   `warnings[]` row matches `JUDICIAL_TOKENS` regex set (`PA \d+/\d+`,
   `Sentencia`, `recurso contencioso-administrativo`, `querella`,
   `demanda penal`, `imputad[oa]`, `investigad[oa]`).
2. **The published-report shape forbids `requiresHumanApproval`.** The
   curator promotion step strips it; the validator rejects on its
   presence — defence in depth.
3. **Every narrative + every relationship edge must cite ≥1 known
   `sourceId`.** Unsupported prose is dropped at section-build time;
   schema rejects orphan refs.
4. **The agent's prompts** in `src/llm/prompts.ts` explicitly forbid
   inventing facts about living persons, paraphrasing court rulings
   without a verbatim docket cite, or drawing causal lines between
   officials and contractors without evidence.
5. **LOREG freeze** (`isJournalistFrozen`) halts both `journalist:run`
   and `promote-report` — same gate as `auto-curate-findings.ts`.
6. **Corrections log is mandatory** (`corrections: []` on every
   published row); the CLI is the only path that mutates a published
   report.

**Web-search backend (Stage 2):** the agent's `web-search` tool prefers a
self-hosted **SearXNG** instance over the paid Exa REST API. Bootstrap
once with `npm run searxng:up` (requires Docker; compose file at
`scripts/searxng/docker-compose.yml`), then set
`SEARXNG_URL=http://localhost:8888` in `.env`. The dispatcher in
`src/scraper/journalist-tools.ts::webSearch()` picks SearXNG first, falls
back to Exa only when `SEARXNG_URL` is unset AND `EXA_API_KEY` is set,
and otherwise returns an empty result set with a helpful error so the
agent silently skips open-web queries and relies on local snapshots +
Wikidata + Wikipedia.

**Phase A→D — soul.md dossier & editorial-longform UI (May 2026):**

- **New research tools** (`src/scraper/journalist-tools.ts`):
  `fetchPdfUrl` (pdf-parse v1), `fetchUrlHeadless` (Playwright SPA renderer
  with hostname allowlist), `fetchBoeForSubject`, `fetchDogvForSubject`,
  `fetchDialnet`, `fetchHemerotecaQuery`, `extractBioEntities` (Spanish
  regex for DOB/birthplace/degrees/career/judicial refs).
- **10 new ReportSection kinds** (`src/scraper/journalist.ts`):
  `identity`, `education`, `career-political`, `career-professional`,
  `legal-record`, `financial`, `online-presence`, `awards`, `publications`,
  `gaps-detected`. Schema validators enforce three new libel rules:
  legal-record auto-bumps `legalSensitivity:'high'`; family rows with
  names require all-`trust:'high'` citations; financial rows must cite
  hosts on `FINANCIAL_SOURCE_ALLOW` (transparentia.newtral.es, boe.es,
  dogv.gva.es).
- **New Stage 2c (bio-extract)** (`src/scraper/journalist-agent.ts`):
  LLM call between research and synth that distills fetched bodies +
  regex hints into a `JournalistBioResponse` the agent projects into
  the new section kinds. Falls back to regex-only when the LLM fails.
  Always emits `gaps-detected` for biography/profile assignments.
- **soul.md exporter** (`src/scraper/journalist-soul-export.ts` +
  `scripts/journalist-export-soul.ts`):
  deterministic `JournalistReport → markdown` with footnote-cited
  sources, written to `public/data/souls/<slug>.md`. CLI:
  `npm run journalist:export-soul -- <assignmentId>`.
- **UI redesign** (`src/pages/AgenteReporte.jsx` +
  `src/components/journalist/index.jsx` — a barrel over
  `journalist/{Citations,HeroBand,Navigation,Sections,SourceLedger}.jsx` +
  the `ReportSectionRenderer` dispatcher): editorial-longform 3-col grid
  (hero band + sticky TOC + main content + sticky facts sidebar +
  full-width sortable source ledger). Citation pills carry hover
  popovers. Relationship graph zoom-modal. Mobile collapses to one
  column. Typography tokens in `src/index.css`
  (`--type-display`, `--type-h2`, etc.).
- **Prompts** (`src/llm/prompts.ts`): synth v2; **plan v3** — the planner
  knows `pdf-fetch / headless-fetch / boe-search / dogv-search /
dialnet-search / hemeroteca-search`, AND those six are now present in the
  `JournalistPlanQuestion.suggestedTool` Zod enum (`src/llm/schemas.ts`), so
  validated plan output can actually request them (until May 2026 they were
  advertised but the schema rejected them — they were unreachable). The plan
  prompt also states `officials/press/plenoclaims/promises` are pre-seeded
  and must not be requested; the research dispatch treats them as explicit
  no-ops and `warns` on any genuinely-unhandled tool kind instead of dropping
  it silently. A planner-requested URL that fetches nothing now appends a
  `warnings[]` row (it used to be dropped silently).
- **PDF auto-routing:** `fetchTopUrls` detects URLs whose pathname ends
  in `.pdf` (case-insensitive, query/fragment stripped) via the local
  `looksLikePdf()` helper and routes them through `fetchPdfUrl`
  (pdf-parse) instead of `fetchUrl` (HTML). Validated against the PSOE
  flyer: same URL now returns 871 chars of clean text, which the regex
  extractor parses into DOB `1966-04-09`, birthplace `RIBA-ROJA DE
TÚRIA`, 4 degrees, 4 career spans. The bio-extract LLM stage receives
  the same body, so subsequent biography drafts populate
  identity/education/career-professional from PDFs the agent finds via
  the year-binned web sweep.

Update `/metodologia` whenever this pipeline's behavior changes —
that page is the published editorial contract.

Councillor photos are re-hosted from the Ayuntamiento's own publication.
Keep scrapers polite: every CLI sends a `User-Agent` identifying the
project; never run them in a tight loop; cache raw payloads locally
first when iterating. Any PII concerns (e.g. citizen complaints in
Sprint 5 onwards) should be aggregated to neighborhood level before
landing in `public/data/*`.
