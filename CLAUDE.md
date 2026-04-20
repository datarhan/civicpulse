# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm install            # install dependencies
npm run dev            # Vite dev server on http://localhost:5173
npm run build          # production build to dist/
npm run preview        # serve the production build locally
npm test               # Vitest suite (runs all adapter tests once)
npm run test:watch     # Vitest in watch mode
npm run test:e2e       # Playwright e2e (landing + quejas + mobile + axe a11y)
npm run test:e2e:ui    # Playwright in headed UI mode

# Real-data ingestion (re-run after any upstream change; all idempotent).
# GitHub Actions runs scrape:all nightly at 04:30 UTC (see §Nightly refresh).
npm run scrape:officials            # 21 councillors + photos from ribarroja.es
npm run scrape:budget               # CONPREL municipal budget XLS (MinHac)
npm run scrape:tenders              # Gobierto tender/contract feed (mirrors PLACSP)
npm run scrape:padron               # INE Tempus3 30-year population series
npm run scrape:participa            # Votiveu (WordPress) citizen-participation blog
npm run scrape:press                # Google News RSS aggregator
npm run scrape:geo                  # OSM Overpass boundary + 21 neighborhoods
npm run scrape:bdns                 # MinHac BDNS subsidies
npm run scrape:paro                 # SEPE monthly unemployment XLS
npm run scrape:plenos               # Council-session index on ribarroja.es/plenos
npm run scrape:pleno-agendas        # Agenda items per pleno (orden del día)
npm run scrape:wikidata             # Wikidata Q23701 facts + cross-references
npm run scrape:promise-suggestions  # Inference engine (never mutates promises)
npm run scrape:all                  # runs all 13 sequentially (~2 min)

# Promise-tracker administration (schema-validated, PR-safe edits)
npm run freeze:status               # inspect LOREG electoral-freeze state
npm run freeze:set -- YYYY-MM-DD    # freeze /promesas until the given date
npm run freeze:clear                # lift the freeze (explicit action)
npm run reply -- <promise-id> <PARTY> "<verbatim quote>" [url publisher] [date]
                                    # apply an approved right-of-reply

# Queja legal router (pure fn · no network)
npm run route-queja -- "<title>" "<detail>" [category]
                                    # prints category → concejalía → plazos → escalado
npm run route-queja -- --file queja.json --raw    # JSON output for piping

# Queja right-of-reply (schema-validated, PR-safe edits to quejas-responses.json)
npm run queja-reply -- <Q-ID> "<role>" "<firmante>" "<verbatim text>" [source-url]

# Pleno vote transcription (schema-validated, PR-safe edits to pleno-votes.json)
npm run pleno-vote -- <pleno-id> <item#> <outcome> "<title>" <source-url> \
                     "PSOE:a_favor:11,PP:en_contra:7,VOX:abstencion:2,Compromís:a_favor:1"
npm run pleno-vote -- --file /path/to/vote.json         # JSON variant (for GH Issue ingestion)

# Telegram bot (sibling package under /bot — Sprints A→E)
cd bot && npm install && npm test   # 36 tests (db + batch + escalation)
cd bot && npm run dev               # long-polling (set BOT_TOKEN in bot/.env)
cd bot && npm run export            # SQLite → ../public/data/quejas.json
# Admin-only bot commands (ADMIN_USER_IDS env):
#   /batch  /batch_register  /escalar  — weekly batch to sede + Síndic escalation
```

No linter or formatter is configured. The unit/integration suite is Vitest +
happy-dom; fixtures live in `tests/fixtures/`. The end-to-end suite is
Playwright (`tests/e2e/*.spec.ts`): landing smoke test, quejas empty-state,
mobile viewport checks across 7 routes + hamburger drawer, and axe-core WCAG
2.1 AA scans across all 10 public routes. CI runs E2E on every push/PR via
`.github/workflows/e2e.yml`.

## Architecture

CivicPulse is a **front-end-only SPA** (Vite + React 18 + React Router 6)
backed by a sibling **Node.js Telegram bot** (`/bot/`) that runs on
macOS launchd as a local long-polling service. All primary data comes
from static JSON in `/public/data/*.json`, produced by 15 nightly
scrapers. The bot writes its own snapshot (`quejas.json`) to the same
tree via a daily launchd export agent.

**No external backend.** Vercel serves the static assets next to the
JSON. The bot process reads + writes SQLite locally; exports are
committed back to git (daily at 04:00 local, or on demand via
`bash bot/scripts/local-export.sh`).

`src/data/mockData.js` is **retired** — every production surface now
reads real JSON. The file is only kept as a compile reference.

### Layout
- `src/App.jsx` — SPA root. `/` renders `DirectionD` as the landing
  page (full-bleed map + editorial column + KPI strip). Every other
  route renders inside `InnerShell` (Sidebar + Topbar).
- `tweaks` state (dark mode, density) persists to `localStorage` under
  `cp:tweaks` and applies `html.dark` class + `html` font-size.
- Breadcrumb derives from `useLocation()` matched against the `NAV`
  array in `components/Sidebar.jsx`.

### Routes
- `/` → `variants/DirectionD.jsx` — the MVP landing (no sidebar).
  Map (`components/LiveCity/StylizedMap.jsx`) + editorial column
  (Alcalde, CoalitionRing, PromesasBlockD, PressBlockD, LiveContracts,
  ParticipaBlockD, LeadStory from press) + KPI strip (padrón, budget,
  tenders, paro, último pleno).
- `/cargos` — officials grid + QuejaBadge per concejal
- `/presupuesto` — CONPREL + tenders + BDNS subsidies
- `/plenos` — 53 sessions + orden del día + Participa block
- `/promesas` — legal-chrome promise tracker + LOREG freeze
- `/datos` — catálogo of every JSON snapshot w/ Wikidata + padrón charts
- `/quejas` — public feed + heatmap + Síndic/CTBG resolution cards
- `/quejas/dashboard` — analytics surface (KPIs, LPACAP lifecycle, per-concejalía SLA)
- `/quejas/:id` — detail view (timeline, legal clock, right-of-reply)
- `/metodologia` + `/aviso-legal` — editorial contract
- catch-all → redirect to `/`

Legacy routes `/hud`, `/briefing`, `/d`, `/variants`, `/ciudad`,
`/overview` have been removed. Don't reintroduce them.

### Design tokens
All tokens live in `src/index.css` as CSS variables, with a `html.dark` override block that remaps `--ink`, `--surf`, `--paper`, `--soft`, `--border*`, and the `--*-soft` tonal surfaces. Tone names (`civic`, `ok`, `warn`, `crit`, `intel`, `neutral`, `ghost`) flow through `Pill`, `Delta`, and page status logic — add new semantic colors here, not inline. The `.mono` class switches to DM Mono with `font-variant-numeric: tabular-nums` and is used for every numeric/KPI value.

Components use **inline styles driven by CSS variables**, not per-component `.css` files. This matches the prototype's structure and keeps theming (dark mode, density) working through a single token layer — don't refactor to styled-components or CSS modules without the user asking.

### Charts & maps
`src/components/Charts.jsx` holds SVG primitives (`Sparkline`, `DualLine`, `Donut`, `BudgetBars`, `Heatmap`).

Leaflet + react-leaflet map surfaces:
- `src/components/LiveCity/StylizedMap.jsx` — the `/` landing map. CartoDB Voyager tiles + real OSM geometry. Kept deliberately minimal: municipal boundary + OSM neighborhood dots + L9 metro geometry. No synthetic buildings, no fake scores.
- `src/components/QuejasHeatmap.jsx` — `/quejas` heatmap. One `Circle` per OSM neighborhood with ≥1 queja; radius ∝ √count, color encodes health signal (silencio-rate → red/amber/green/civic-blue). Hidden when there's nothing to show.

## Real data pipeline

**15 adapters** feed Riba-roja de Túria (INE **46214** · Wikidata
**Q23701** · OSM relation **342356**). 14 are autonomous scrapers that
refresh nightly via GitHub Actions at 04:30 UTC; 2 are curated files
that only move via the `npm run reply` / `npm run sindic:add` / `npm
run queja-reply` CLIs. Follow the RED→GREEN→wire TDD cadence when
adding adapter #16.

**Architecture**: `scripts/scrape-*.ts` fetch the raw payload → call a
pure TypeScript parser in `src/scraper/*.ts` → write a typed snapshot
to `public/data/*.json`. The SPA loads JSON at runtime via one hook per
domain (`src/hooks/useX.js`) — Vercel serves the static JSON next to
the app. Re-running any `npm run scrape:*` is idempotent;
`npm run scrape:all` walks the autonomous adapters in ~2 min.

```
# Autonomous scrapers (14):
scripts/scrape-officials.ts           →  src/scraper/corporacion.ts       →  public/data/officials.json
scripts/scrape-budget.ts              →  src/scraper/budget.ts            →  public/data/budget.json
scripts/scrape-tenders.ts             →  src/scraper/tenders.ts           →  public/data/tenders.json
scripts/scrape-padron.ts              →  src/scraper/padron.ts            →  public/data/padron.json
scripts/scrape-participa.ts           →  src/scraper/participa.ts         →  public/data/participa.json
scripts/scrape-press.ts               →  src/scraper/press.ts             →  public/data/press.json
scripts/scrape-geo.ts                 →  src/scraper/geo.ts               →  public/data/geo.json
scripts/scrape-bdns.ts                →  src/scraper/bdns.ts              →  public/data/bdns.json
scripts/scrape-paro.ts                →  src/scraper/paro.ts              →  public/data/paro.json
scripts/scrape-plenos.ts              →  src/scraper/plenos.ts            →  public/data/plenos.json
scripts/scrape-pleno-agendas.ts       →  src/scraper/pleno-agenda.ts      →  public/data/plenos-agendas.json
scripts/scrape-wikidata.ts            →  src/scraper/wikidata.ts          →  public/data/wikidata.json
scripts/scrape-ctbg.ts                →  src/scraper/ctbg.ts              →  public/data/ctbg.json
scripts/scrape-promise-suggestions.ts →  src/scraper/promise-inference.ts →  public/data/promise-suggestions.json

# Curated (human-edited) — NEVER touched by automated scrapers:
public/data/promises.json            (schema: src/scraper/promises.ts)
public/data/quejas-responses.json    (schema: scripts/apply-queja-response.ts)
public/data/sindic.json              (schema: src/scraper/sindic.ts)

# Bot-owned, exported daily by launchd agent:
public/data/quejas.json              (schema: bot/src/services/snapshot.ts)
```

### Sources of truth

| Domain | Scraper → JSON | Source | Wired surfaces |
|---|---|---|---|
| Mayor + 20 councillors + party + portfolios + photos + CV links | `corporacion.ts` → `officials.json` | Scraped HTML from `ribarroja.es/ayuntamiento/corporacion_municipal`; photos mirrored into `public/data/photos/<slug>.jpg` | `/cargos` "Corporación Municipal" section; Direction D editorial column (`AlcaldeBox` + `CoalitionRing`) |
| Municipal budget (9 income + 9 expense chapters + 6 program groups) | `budget.ts` → `budget.json` | MinHac **CONPREL** XLS, sheet "Comunitat Valenciana". Parser tries 2025→2024→2023 | `/presupuesto` (KPIs + 3 chapter charts); Direction D KPI strip |
| Contracts + tenders (730 + 449 at last snapshot, €16.5M awarded) | `tenders.ts` → `tenders.json` | **Gobierto** SQL-over-HTTP API at `ribalicita.ribarroja.es/api/v1/data/data.csv?sql=select * from {contratos,licitaciones}` — public mirror of PLACSP | `/presupuesto` (`Últimos contratos adjudicados`); Direction D editorial column (`LiveContracts`) |
| Subsidies (171 BDNS convocatorias, 153 granted by the Ayto) | `bdns.ts` → `bdns.json` | MinHac **BDNS** REST endpoint `/bdnstrans/api/convocatorias/busqueda?vpd=GE&descripcion=riba-roja`, paginated | `/presupuesto` (`Subvenciones · BDNS` card) |
| Population (1996–2025, Total / Hombres / Mujeres) | `padron.ts` → `padron.json` | **INE Tempus3** CSV table 2903 (Valencia province) | `/datos` full-width SVG chart; Direction D KPI strip (Población panel) |
| Registered unemployment (18 months 2024-09 → 2026-03) | `paro.ts` → `paro.json` | **SEPE** Muniacteco XLS feeds (3-sheet: AMBOS / HOMBRES / MUJERES); CLI walks back up to 24 months | Direction D KPI strip (Paro panel with MoM delta + 12-month sparkline) |
| Plenos (53 sessions 2023–2026) | `plenos.ts` → `plenos.json` | Scraped HTML from `ribarroja.es/plenos/<year>`, Spanish-date → ISO, kind classifier (ordinario / extraordinario / urgente / otro) | `/plenos` "Plenos recientes" card with linked titles + kind pills |
| Citizen participation (6 posts: 4 actividades + 2 encuestas) | `participa.ts` → `participa.json` | WordPress REST API at `participa.ribarroja.es/wp-json/wp/v2/posts` + `/categories` | `/plenos` "Participación ciudadana" grid; Direction D editorial column (`ParticipaBlockD`) |
| Press (99 headlines from 18 outlets) | `press.ts` → `press.json` | Google News RSS `news.google.com/rss/search?q="Riba-roja de Túria"` with FNV fingerprint dedup; Spanish regional outlets (Levante-EMV, Las Provincias, Valencia Plaza, elDiario.es, Cadena SER, Comunica GVA, …) | `/ciudad` Prensa tab (replaces mock rotation); Direction D editorial column (`PressBlockD`) |
| Geo (municipal boundary 484 pts + 21 neighborhoods) | `geo.ts` → `geo.json` | **OSM Overpass API** — relation 342356 stitched from outer ways + `place=neighbourhood/suburb/quarter/hamlet/village` inside the muni area | Direction D StylizedMap: dashed boundary polyline + OSM neighborhood dots/labels |
| Municipal facts (area 57.5 km², 125 m alt., coords, INE/OSM/GeoNames/Commons cross-refs + images) | `wikidata.ts` → `wikidata.json` | Wikidata `Special:EntityData/Q23701.json` | `/datos` `WikidataCard` above the population chart |
| Pleno agendas (246 items, 27 departments, 30 sessions) | `pleno-agenda.ts` → `plenos-agendas.json` | Scrapes each individual session's convocatoria HTML on `ribarroja.es`, extracts the ORDEN DEL DÍA, splits into {resolutiva / informativa / ruegos}, resolves department + expediente tuples | `/plenos` — `TopDepartmentsCard` + inline "Ver orden del día" expander per session |
| Promises (16 curated) — PSOE / PP / VOX / Compromís | **human-curated** · `promises.ts` validates the schema | Hand-seeded from press citations (`press.json`) + real pleno votes + budget/tender snapshots. Every record has verbatim quote + source URL + publisher + ISO date | `/promesas`, `/` landing editorial column (`PromesasBlockD`), `/metodologia`, `/aviso-legal` |
| Promise suggestions (inference layer) | `promise-inference.ts` → `promise-suggestions.json` | Scans `press.json` + `plenos-agendas.json` for keyword matches; light Spanish stemmer; conservative enum (never `inviable`, never publishes `cumplida`/`no-ejecutada` automatically) | `/promesas` — "propuesta automática · pendiente de revisión humana" block under each card |
| CTBG resoluciones (state-level, 10,551 rows, 12 yearly sheets) | `ctbg.ts` → `ctbg.json` | MinHac **CTBG** official XLSX; parser flattens sheets + filters by orthographic variants of Riba-roja/Ribarroja de Túria with Ebro-dam disambiguation | `/quejas` `CtbgCard` — honest "0 matches" surface when nothing hits |
| Síndic de Greuges CV resoluciones (curated) | **human-curated** · `sindic.ts` schema validator | Added via `npm run sindic:add` after the Síndic publishes a resolución naming Riba-roja; JS-POST portal makes automation brittle at this scale | `/quejas` `SindicCard` with expediente/fecha/materia/sentido/resumen + PDF link |
| Quejas ciudadanas (Telegram-captured, SQLite-backed) | **bot-owned** · `bot/src/services/snapshot.ts` | Exported daily at 04:00 local by a launchd agent (`bot/scripts/local-export.sh`); writes an Open311 GeoReport v2-flavoured payload; only non-PII fields are published | `/quejas` feed + heatmap · `/quejas/dashboard` analytics · `/quejas/:id` detail view · `/cargos` QuejaBadge |
| Queja responses (curated, right-of-reply) | **human-curated** · `apply-queja-response.ts` validator | Added via `npm run queja-reply` after receiving an official reply via the `.github/ISSUE_TEMPLATE/queja-response.yml` form | `/quejas/:id` verbatim response card under the timeline |
| Pleno votes (curated, transcribed from actas) | **human-curated** · `pleno-votes.ts` schema validator | Added via `npm run pleno-vote` or the `.github/ISSUE_TEMPLATE/pleno-vote.yml` form ingested by `ingest-pleno-votes.yml`. Each record cites the acta URL + retrieval date; misattribution is a libel risk, so the schema enforces verbatim ≥20 char title + per-bloc tuple with duplicate-bloc detection | `/plenos` — `PlenoVotesBlock` (empty-state honest when no votes registered) |

### Hooks

Every page loads its snapshot via a small hook that does `fetch()` +
`useState` (`loading / error / data`). No data-fetching libraries are
wired (yet) — React Query / SWR can be added when we hit a real refresh
loop.

- `useOfficials` + `partyColor()`
- `useBudget` + `formatEuros()` + `EXPENSE_COLORS` / `PROGRAM_COLORS`
- `useTenders` + `STATUS_LABEL` / `STATUS_TONE` + `formatDate()`
- `usePadron`
- `useParo`
- `usePlenos` + `PLENO_TONE` / `PLENO_LABEL`
- `usePlenoAgendas` + `SECTION_LABEL` / `SECTION_TONE`
- `useParticipa` + `KIND_ICON` / `KIND_LABEL`
- `usePress` + `timeAgo()`
- `useGeo`
- `useBdns`
- `useWikidata`
- `usePromises` + `usePromiseSuggestions` + `isPromiseFrozen()` + `PARTY_TONE` / `STATUS_LABEL` / `STATUS_TONE` / `TOPIC_LABEL`
- `useQuejas` + `useQuejaResponses` + `STATE_LABEL` / `STATE_TONE` / `CATEGORY_LABEL` / `prettyNeighborhood` / `timeAgo`
- `usePlenoVotes` + `OUTCOME_LABEL` / `OUTCOME_TONE` / `DIRECTION_LABEL` / `DIRECTION_TONE` + `tallyByBloc()`
- `useCtbg`
- `useSindic` + `SINDIC_MATERIA_LABEL` / `SINDIC_SENTIDO_LABEL` / `SINDIC_SENTIDO_TONE`

### Nightly refresh

`.github/workflows/scrape.yml` runs `npm run scrape:all` every day at
**04:30 UTC** (06:30 Europe/Madrid summer, 05:30 winter). The job:

1. Installs deps + runs the 14 autonomous adapters in sequence,
2. Runs the vitest suite against the fresh fixtures,
3. `git add public/data && git commit && git push` only if there's a
   diff (no-op runs land a summary log but no commit),
4. Vercel's GitHub integration picks up the push and redeploys.

`workflow_dispatch` accepts an `adapters` input so a single pipeline
can be re-run on demand. Add new adapter names to the `case` switch
when you add adapter #16+.

A second workflow `.github/workflows/pull-quejas.yml` is feature-flagged
by `vars.BOT_EXPORT_URL` — it's a no-op until a remote bot deploy
(Fly.io etc.) is wired. The local Mac setup replaces it with a daily
launchd agent; see `bot/LOCAL.md`.

## Telegram bot (`/bot/`)

Sibling Node.js package that captures quejas via Telegram, runs the
batch registrar, and exposes the Síndic/CTBG escalation pipeline. See
[`bot/README.md`](bot/README.md) for the full command list,
[`bot/LOCAL.md`](bot/LOCAL.md) for the macOS launchd setup, and
[`bot/DEPLOY.md`](bot/DEPLOY.md) for Fly.io.

Key pieces worth knowing from this file:

- **Entry:** `bot/src/index.ts`. Runs in long-polling or webhook mode
  depending on `WEBHOOK_URL`. Resilient restart loop recovers from
  transient 409 conflicts. Mounts HTTP endpoints in webhook mode
  (`/health`, `/export/quejas.json`, `/batch/current.{md,html}`,
  `/sindic/<id>.{md,html}`) bearer-auth'd by `EXPORT_TOKEN`.
- **Queja router** (`src/scraper/queja-router.ts`, shared with the
  front-end CLI `npm run route-queja`): pure function that classifies a
  queja into one of 29 categorías, matches the concejalía responsible
  by portfolio, cites the relevant LPACAP / Ley 19/2013 articles, and
  composes the 6-step escalation ladder (sede → acuse 10d → silencio
  90/30d → recurso reposición → Síndic de Greuges CV → contencioso).
- **SQLite schema** (`bot/src/db/schema.sql`): quejas + apoyos + events
  with WAL + foreign keys. Auto-emits `capturada` and `apoyada_verificada`
  (at 10 apoyos) events.
- **Silencio cron** (`bot/src/services/cron.ts`): hourly worker that
  transitions registered quejas past their LPACAP plazo to
  `silencio_negativo` and broadcasts `[SILENCIO]` to the public channel.
  Paused during LOREG freeze windows.
- **Batch registrar** (`bot/src/services/batch.ts`): `/batch` preview
  + `/batch_register` admin command. Bundles the top 10 verified quejas
  into one solicitud genérica Markdown/HTML document the moderator
  signs at `sede.ribarroja.es` with Cl@ve. All 10 inherit the shared
  asiento nº + CSV.
- **Síndic template** (`bot/src/services/sindic.ts`): `/escalar Q-XXXX`
  generates a pre-filled Queja al Síndic with hechos + solicitud + base
  legal, served at `/sindic/<id>.{md,html}`.
- **LOREG freeze** (`bot/src/services/freeze.ts`): reads the same
  `promises.json frozenUntil` field as the front-end; gates broadcasts
  AND silencio auto-transitions.

Bot-side tests: **36** (17 db + 10 batch + 9 escalation). Front-end
tests: **161** (parser schemas + inference engines + queja-router +
sindic schema). `tsc --noEmit` must stay clean on both sides.

### TDD cadence

Every new adapter lands in three commits:

1. `test: add reproducer for <adapter> (RED)` — snapshot a real payload
   into `tests/fixtures/<source>_<date>.(html|csv|xls|json)`, pin the
   parser contract via vitest; should fail because the module doesn't
   exist yet.
2. `fix: implement <adapter> (GREEN)` — minimal parser to make all
   tests pass. Keep pure; `fetch` lives only in the CLI wrapper.
3. Wire-up: `feat(<domain>): wire real <domain>` — build the CLI
   script, produce the JSON, add the hook, wire the UI, commit the
   generated `public/data/*.json` alongside the code change.

Fixtures are committed to the repo (they're the RED contract). Current
coverage: **161 front-end + 36 bot = 197 vitest checks green** across
17 front test files (14 adapter parsers + promise schema/inference +
queja-router + sindic schema) and 3 bot test files (db + batch +
escalation).

### No more mocks

`src/data/mockData.js` is retired — every production surface reads
real JSON now. The file is only still imported as a compile reference
and contains no data a page actually renders. Queja capture streams
come from the Telegram bot, not a simulator.

### Legal / ethical guardrails

All 14 automated sources are public-sector / ODbL / CC-BY open data
(Transparencia Act 19/2013, datos.gob.es CC-BY 4.0, PLACSP/BDNS open
reuse clauses, OSM ODbL, Wikidata CC0, CTBG open XLSX).

### Promise tracker (sensitive subsystem)

`/promesas` is the one place where the project makes potentially
defamatory claims about named elected officials. Treat every change to
this subsystem as legally material.

**Two-file architecture — do not merge them:**

- `public/data/promises.json` is **curated, human-edited only**. The
  schema validator in `src/scraper/promises.ts` enforces at runtime
  that every record has: verbatim quote (≥20 chars), source URL +
  publisher, ISO `madeAt`, unique id, allowed party/topic/kind/status
  enums. Any status beyond the V1 safe set (`documentada` +
  `en-verificacion`) requires ≥1 dated + URL-backed evidence entry
  with its own quote — enforced by test + at write time by the admin
  CLIs.
- `public/data/promise-suggestions.json` is **machine-written** by the
  inference engine. The engine's return type excludes `inviable` at
  the type level; it never proposes `cumplida` or `no-ejecutada`;
  every record has `requiresHumanApproval: true`. Suggestions render
  in the UI as "propuesta automática · pendiente de revisión" and
  *never* substitute for the published status.

**LOREG freeze mode** (`frozenUntil: string | null` in
`promises.json`): when set and in the future, `isFrozen(snap)` returns
true. The UI enters read-only mode (`FreezeBanner` + hides the
suggestion block), and `scrape-promise-suggestions.ts` emits an empty
suggestion set with a banner referencing LOREG art. 50. Toggle only
via `npm run freeze:set -- YYYY-MM-DD` / `freeze:clear` — these CLIs
mutate *only* `frozenUntil` + `generatedAt` and re-validate the whole
snapshot before writing.

**Right-of-reply flow** is end-to-end:

- `.github/ISSUE_TEMPLATE/promise-response.yml` structured form for
  affected parties,
- "Responder como partido →" deep-link on every promise card
  (pre-fills `promise-id` + `party` fields),
- `npm run reply -- <id> <PARTY> "quote" [url publisher] [date]`
  applies an approved reply into the `response` field only and
  re-validates.

**When a future session needs to extend this subsystem**, the three
non-obvious rules are:

1. The suggestion engine never writes to `promises.json`. If you need
   to change a status based on algorithmic output, route it through
   the curator CLIs so the schema validator and git history stay
   authoritative.
2. Don't loosen the V1 status gate (`V1_STATUSES` set in
   `promises.ts`) without an explicit editorial decision — the gate
   is what keeps `no-ejecutada` / `cumplida` / `inviable` from
   shipping without evidence, which is the libel-risk boundary.
3. `/metodologia` + `/aviso-legal` are not marketing copy; they are
   the published editorial contract. Update them via PR whenever the
   tracker's behavior changes, not whenever UX copy is reworded.
Councillor photos are re-hosted from the Ayuntamiento's own publication.
Keep scrapers polite: every CLI sends a `User-Agent` identifying the
project; never run them in a tight loop; cache raw payloads locally
first when iterating. Any PII concerns (e.g. citizen complaints in
Sprint 5 onwards) should be aggregated to neighborhood level before
landing in `public/data/*`.

## Cmd+K / shortcuts

Cmd/Ctrl+K anywhere opens the spotlight in `components/CmdK.jsx`. It
indexes `NAV` + real `useOfficials()` + the three most recent
`usePromises()` items + action stubs. Navigation uses
`react-router`'s `useNavigate`.

## Product context

Spain-based civic monitor targeting Riba-roja de Túria (pop. ~24,600,
Comunitat Valenciana). Bilingual UI via `src/i18n.jsx` — Castilian Spanish
(default) and Valencià (standard AVL/GVA spelling). Only **chrome strings**
(nav, topbar, page headings, empty states, tweaks panel) are translated;
**data content** (press headlines, acta titles, official names, promise
quotes, legal citations) stays in the source language to preserve verbatim
accuracy. The toggle lives in the TweaksPanel, persists to
`localStorage['cp:lang']`, and updates `<html lang>` for a11y. Target personas: engaged citizen (default), journalist,
municipal official, activist. The MVP runs locally via launchd
(bot/LOCAL.md) with all data committed to git; `docs/QUEJAS_DESIGN.md`
is the full architectural rationale for the Telegram-first Quejas OS.
