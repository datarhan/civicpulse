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

# Real-data ingestion (re-run after any upstream change; all idempotent).
# GitHub Actions runs scrape:all nightly at 04:30 UTC (see §Nightly refresh).
npm run scrape:officials   # 21 councillors + photos from ribarroja.es
npm run scrape:budget      # CONPREL municipal budget XLS (MinHac)
npm run scrape:tenders     # Gobierto tender/contract feed (mirrors PLACSP)
npm run scrape:padron      # INE Tempus3 30-year population series
npm run scrape:participa   # Votiveu (WordPress) citizen-participation blog
npm run scrape:press       # Google News RSS aggregator (99 headlines / 18 medios)
npm run scrape:geo         # OSM Overpass boundary + 21 neighborhoods
npm run scrape:bdns        # MinHac BDNS subsidies (171 convocatorias)
npm run scrape:paro        # SEPE monthly unemployment XLS (18 months)
npm run scrape:plenos      # Council-session index on ribarroja.es/plenos
npm run scrape:wikidata    # Wikidata Q23701 facts + cross-references
npm run scrape:all         # runs all 11 sequentially (~90 s)
```

No linter or formatter is configured. The test suite is Vitest + happy-dom;
fixtures live in `tests/fixtures/`.

## Architecture

CivicPulse is a **front-end-only prototype** (Vite + React 18 + React Router 6) styled as a **municipal data-OS dashboard** — sidebar + topbar shell with six surfaces: Overview, Quejas (complaints), Cargos (officials), Presupuesto (budget), Plenos (council sessions), Datos (open data).

**Two data layers coexist.** Sections we've already migrated to real data
pull static JSON from `/public/data/*.json` (produced by the
`scripts/scrape-*.ts` CLIs, TDD'd via `src/scraper/*.ts` parsers). The
rest still reads from the seed in `src/data/mockData.js`. See §"Real data
pipeline" below for what's wired; follow `docs/REAL_DATA_MVP_PLAN.md` for
the remaining sprints and the sources of truth.

The UI is derived from the "Direction A — Municipal Dashboard" handoff in the `civicpulse-design-system` bundle (Linear/Vercel data-OS feel, density 75, MHS score hero, map demoted to a widget inside Quejas). Don't reintroduce the old map-centric Dashboard/Scorecards shell — it was intentionally replaced.

### Layout
- `src/App.jsx` owns persistent Sidebar + Topbar, routes, and three overlays: Cmd+K spotlight, Tweaks panel, SimCity toggle hook.
- `tweaks` state (city, persona, dark mode, density) is persisted to `localStorage` under `cp:tweaks` and applied as `html.dark` class + `html` `font-size` (density maps to 13.5/14/15 px base).
- Breadcrumb is derived from `useLocation()` matched against the `NAV` array exported from `components/Sidebar.jsx`.

### Routes
Direction A (Sidebar + Topbar shell): `/` Overview · `/quejas` · `/cargos` · `/presupuesto` · `/plenos` · `/datos` · `/ciudad` (live Riba-roja map, Leaflet-based, kiosk-capable). A catch-all `*` renders Overview.

Variant routes — each renders its own full-page shell and hides the Sidebar/Topbar:
- `/hud` → `variants/Hud.jsx` (Direction B, dark SimCity-style HUD)
- `/briefing` → `variants/Briefing.jsx` (Direction C, editorial "Civic Briefing")
- `/d` → `variants/DirectionD.jsx` (Direction D, "El Mirador" — Leaflet map + editorial column + KPI strip)
- `/variants` → `variants/Chooser.jsx` (landing to pick a direction)

A floating `VariantSwitcher` (see `variants/VariantSwitcher.jsx`) is rendered on every variant page with per-variant `theme` and `position` props so it doesn't collide with that variant's layout (e.g. Direction D uses `position="bottom-right-d"` at `{bottom: 96, right: 440}` to sit inside the map column).

### Design tokens
All tokens live in `src/index.css` as CSS variables, with a `html.dark` override block that remaps `--ink`, `--surf`, `--paper`, `--soft`, `--border*`, and the `--*-soft` tonal surfaces. Tone names (`civic`, `ok`, `warn`, `crit`, `intel`, `neutral`, `ghost`) flow through `Pill`, `Delta`, and page status logic — add new semantic colors here, not inline. The `.mono` class switches to DM Mono with `font-variant-numeric: tabular-nums` and is used for every numeric/KPI value.

Components use **inline styles driven by CSS variables**, not per-component `.css` files. This matches the prototype's structure and keeps theming (dark mode, density) working through a single token layer — don't refactor to styled-components or CSS modules without the user asking.

### Charts & maps
`src/components/Charts.jsx` contains all SVG viz — `Sparkline`, `DualLine`, `Donut`, `BudgetBars`, `Heatmap`, and a stylized pure-SVG `MiniMap` used as decoration inside Quejas.

Leaflet + react-leaflet **are** installed and used by two real map surfaces:
- `src/components/LiveCity/LiveMap.jsx` — powers `/ciudad` (kiosk live monitor). CartoDB Dark Matter tiles, heat zones, landmarks, pulsing incident pins, budget-particle flow.
- `src/components/LiveCity/StylizedMap.jsx` — powers `/d` (Direction D "El Mirador"). **Deliberately minimal "information-first" map**. CartoDB Voyager (warm daytime) tiles + real OSM geometry, with a thin layer of overlays:
  - Neighborhood cards (`NeighborhoodCard`) — divIcons with a breathing health-ring (CSS keyframe `cpHoodBreathe`) colored by MHS score via the `mhsColor()` helper, the MHS score as a big tabular number, and the neighborhood name below as a chip.
  - Metro L9 animated train (`MetroTrain`) — position interpolated via haversine along a coord array (see `buildPathSegments`/`posAlongPath`) using `requestAnimationFrame`.
  - Polyline accents for CV-35, CV-370, and the L9 track.
  - Pulsing `IncidentPin`s (CSS `cpIncidentHalo`) and `BudgetParticles` (Leaflet `layerGroup` rebuilt on each tick).
  - `HeatOverlay` circles shown only when `layer` is `calor` or `aire`.
  - `MetroBadge` top-right with a 15-min cycle countdown.

  Earlier iterations tried hand-drawn SVG rectangles, Dorfromantik cottages, Tropico haciendas/factories, SimCity grids, and Kenney CC0 isometric sprite tiles on top of the tile layer. **All were removed** — they looked procedural, cluttered the view, and did not convey real municipal data at a glance. The current minimal design (health ring + MHS number per neighborhood) is the chosen baseline. Do not reintroduce synthetic buildings without a clear brief.

### Mock data structure
`src/data/mockData.js` is the single source of truth. Key exports:
- `CITIES` — city switcher items, each with `mhs`, `delta`, `pop`, `region`, and a 2-letter `code` used as the sidebar city avatar.
- `DEPTS` — used by Overview leaderboard, Cargos grid, and CmdK search. The `lead` field is joined by initials to make the card avatar.
- `PROMISES` — status is `'ok' | 'risk' | 'late'`, which maps to `ok / warn / crit` tones.
- `FEED`, `COMPLAINT_ROWS`, `COMPLAINT_CATS`, `AGENDA_CIVICA`, `AGENDA_PLENO`, `HISTORIC_VOTES`, `TOP_CONTRACTS`, `DATASETS`, `TAX_BREAKDOWN`, `BUDGET_*`, `MHS_15D`, `COMPLAINTS_30D`, `RESOLVED_30D`.
- Riba-roja / Direction-D data: `RIBA_ROJA` (center/zoom/bbox), `RR_NEIGHBORHOODS`, `RR_LANDMARKS`, `RR_INCIDENTS_SEED`, `RR_EVENT_POOL` (live-feed simulator pool), `RR_BUDGET_FLOW`, `RR_WEATHER`, `RR_LAYERS`, `RR_PRESS_POOL`, `RR_SOCIAL_POOL`. All coordinates are real lat/lng so they line up with the CartoDB tile base in `/d` and `/ciudad`.

## Real data pipeline

**Eleven** Spanish/international public-sector sources are wired
end-to-end for Riba-roja de Túria (INE **46214** · Wikidata **Q23701** ·
OSM relation **342356**). All 11 refresh nightly via GitHub Actions at
04:30 UTC. Follow the same RED→GREEN→wire cadence when adding the
twelfth.

**Architecture**: `scripts/scrape-*.ts` fetch the raw payload → call a
pure TypeScript parser in `src/scraper/*.ts` → write a typed snapshot
to `public/data/*.json`. The SPA loads JSON at runtime via one hook per
domain (`src/hooks/useX.js`) so there is **no backend** — Vercel serves
the static JSON next to the app. Re-running any `npm run scrape:*` is
idempotent; `npm run scrape:all` runs everything in ~90 s.

```
scripts/scrape-officials.ts  →  src/scraper/corporacion.ts  →  public/data/officials.json
scripts/scrape-budget.ts     →  src/scraper/budget.ts       →  public/data/budget.json
scripts/scrape-tenders.ts    →  src/scraper/tenders.ts      →  public/data/tenders.json
scripts/scrape-padron.ts     →  src/scraper/padron.ts       →  public/data/padron.json
scripts/scrape-participa.ts  →  src/scraper/participa.ts    →  public/data/participa.json
scripts/scrape-press.ts      →  src/scraper/press.ts        →  public/data/press.json
scripts/scrape-geo.ts        →  src/scraper/geo.ts          →  public/data/geo.json
scripts/scrape-bdns.ts       →  src/scraper/bdns.ts         →  public/data/bdns.json
scripts/scrape-paro.ts       →  src/scraper/paro.ts         →  public/data/paro.json
scripts/scrape-plenos.ts     →  src/scraper/plenos.ts       →  public/data/plenos.json
scripts/scrape-wikidata.ts   →  src/scraper/wikidata.ts     →  public/data/wikidata.json
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
- `useParticipa` + `KIND_ICON` / `KIND_LABEL`
- `usePress` + `timeAgo()`
- `useGeo`
- `useBdns`
- `useWikidata`

### Nightly refresh

`.github/workflows/scrape.yml` runs `npm run scrape:all` every day at
**04:30 UTC** (06:30 Europe/Madrid summer, 05:30 winter). The job:

1. Installs deps + runs the 11 adapters,
2. Runs the vitest suite against the fresh fixtures,
3. `git add public/data && git commit && git push` only if there's a
   diff (no-op runs land a summary log but no commit),
4. Vercel's GitHub integration picks up the push and redeploys.

`workflow_dispatch` accepts an `adapters` input so a single pipeline
can be re-run on demand (`all | officials | budget | tenders | padron
| participa | press | geo`). Add new adapter names to the `case`
switch when you add an eleventh.

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
coverage: **85 vitest checks green** across 11 adapters.

### What's still mocked

`src/data/mockData.js` still drives purely-synthetic UI scaffolding
(`FEED`, `PROMISES`, `AGENDA_CIVICA`, `RR_EVENT_POOL`,
`RR_SOCIAL_POOL`, `RR_INCIDENTS_SEED`, `RR_WEATHER`, `MHS_15D`,
`COMPLAINTS_30D`, `RESOLVED_30D`). These power the live-simulator
animations in `/ciudad` and the Direction D editorial boilerplate —
they have no upstream source. Replacing them would require either a
backend that generates authentic citizen-complaint streams or leaving
the simulation in place as a visible "demo" vs. "real" band.

### Legal / ethical guardrails

All 11 sources are public-sector / ODbL / CC-BY open data
(Transparencia Act 19/2013, datos.gob.es CC-BY 4.0, PLACSP/BDNS open
reuse clauses, OSM ODbL, Wikidata CC0).
Councillor photos are re-hosted from the Ayuntamiento's own publication.
Keep scrapers polite: every CLI sends a `User-Agent` identifying the
project; never run them in a tight loop; cache raw payloads locally
first when iterating. Any PII concerns (e.g. citizen complaints in
Sprint 5 onwards) should be aggregated to neighborhood level before
landing in `public/data/*`.

## Cmd+K / shortcuts

Cmd/Ctrl+K anywhere opens the spotlight in `components/CmdK.jsx`. It indexes `NAV`, all `DEPTS`, three most recent `PROMISES`, and a couple of action stubs. Navigation uses `react-router`'s `useNavigate`.

## Design bundle

`civicpulse-design-system/` (in `/tmp/civicpulse-design/` on dev machines, delivered as a tar.gz from Claude Design) ships three directions: A (Dashboard), B (City HUD / SimCity), C (Civic Briefing editorial). All three are implemented. Direction D ("El Mirador") is not in the bundle — it was added later as a fusion of A + C with a real map as the main canvas and a `/d` route. The README in the bundle says "recreate pixel-perfectly" for A/B/C — match the visual output, not the prototype's file structure.

## Product context

Spain-based civic monitor (Spanish UI, Castilian Spanish with some Valencian place names). Target personas per the PLAN: engaged citizen (default lens), journalist, municipal official, activist. The "Lentes" (lenses) section of the sidebar switches persona — right now it only changes the footer label, but future features should key off `tweaks.persona` to gate overlays. `first_description.md` describes the original intended FastAPI + PostGIS + pgvector backend — it's roadmap, not implemented.
