# CivicPulse — Real Data MVP Plan (Riba-roja de Túria)

**Status:** **closed · superseded** · **Owner:** TBA · **Last update:** 2026-04-20

> This plan is closed. The MVP shipped in full plus 6 additional adapters
> plus the LLM advisory layer (Phase 0–3). Next-horizon work is tracked in
> [`docs/ROADMAP.md`](./ROADMAP.md). Keep this file for historical context
> of what was originally scoped.

> The plan below is kept for historical context. **All 8 sprints ship
> end-to-end** on `civicpulse.es` — plus six extra
> subsystems added after Sprint 7 (BDNS, SEPE, Plenos, Wikidata, pleno
> agendas, promise tracker with legal-safe inference), a nightly
> GitHub Actions refresh job, and 106 vitest checks green. See
> `CLAUDE.md` → "Real data pipeline" for the authoritative current
> state. The sprint-by-sprint section below is maintained only as a
> reference for what was originally scoped vs. what was delivered.

## Shipped inventory (as of 2026-04-20)

| # | Domain | Records | Source | Surfaces |
|---|---|---|---|---|
| 1 | Officials | 21 councillors + photos | `ribarroja.es` HTML | `/cargos`, Direction D editorial column |
| 2 | Budget | €43.5M / 9+9+6 chapters | MinHac CONPREL XLS | `/presupuesto`, Direction D KPI strip |
| 3 | Tenders | 730 contratos / €16.5M | Gobierto API (PLACSP mirror) | `/presupuesto`, Direction D |
| 4 | Padrón | 30 years (1996-2025) | INE Tempus3 table 2903 | `/datos`, Direction D KPI strip |
| 5 | Participation | 6 posts | WP REST `participa.ribarroja.es` | `/plenos`, Direction D |
| 6 | Press | 99 / 18 medios | Google News RSS | `/ciudad` Prensa tab, Direction D |
| 7 | Geo | 484-pt boundary + 21 neighborhoods | OSM Overpass | StylizedMap boundary + labels |
| + | BDNS | 171 convocatorias | MinHac BDNS API | `/presupuesto` subsidies card |
| + | SEPE paro | 18 months (Sep 2024 → Mar 2026) | SEPE Muniacteco XLS | Direction D KPI strip (Paro) |
| + | Plenos | 53 sessions (2023–2026) | `ribarroja.es/plenos/<year>` | `/plenos` "Plenos recientes" |
| + | Pleno agendas | 246 items / 27 departments / 30 sessions | `ribarroja.es/…/pleno_<date>` individual convocatorias | `/plenos` `TopDepartmentsCard` + inline orden-del-día expander |
| + | Wikidata | full facts card | `Special:EntityData/Q23701.json` | `/datos` WikidataCard |
| + | **Promises** (curated) | 16 · PSOE 10 · PP 3 · VOX 1 · Compromís 1 · Otros 1 | Hand-seeded, schema-validated, press-cited; freezable | `/promesas`, `/metodologia`, `/aviso-legal`, Direction D `PromesasBlockD` |
| + | Promise suggestions | 16 auto-proposals (2 `en-progreso`, rest `documentada`) | `promise-inference.ts` over press + pleno agendas | `/promesas` per-card "propuesta automática" block |

Totals: **13 adapters + 1 curated dataset, ~3,500 real records,
106/106 vitest green, nightly refresh live, ~2 min full run.**

## Pre-election safeguards (LOREG-aware)

The promise tracker adds a second layer of discipline beyond the
scraper cadence:

- Schema validator (`src/scraper/promises.ts`) enforces verbatim-quote
  + primary-source-URL + dated-evidence invariants at runtime.
- Inference engine output (`promise-suggestions.json`) is never merged
  into the curated snapshot; its proposedStatus enum cannot include
  `inviable`; every record carries `requiresHumanApproval: true`.
- `frozenUntil` field + `isFrozen(snap)` helper + `npm run
  freeze:set/clear/status` admin CLI puts `/promesas` in read-only
  mode during the LOREG official campaign window.
- Right-of-reply is formalised via a GitHub issue template
  (`.github/ISSUE_TEMPLATE/promise-response.yml`) + deep-linked CTAs
  on every promise card + a curator-side `npm run reply` CLI that
  mutates only the `response` field and re-validates the snapshot.
- `/metodologia` and `/aviso-legal` are the public editorial contract;
  any change to the tracker's classification behavior must land as a
  PR that touches those pages.

## IVE BDT note

The original Sprint 4 plan named a separate "IVE BDT" adapter that
would parse the Valencian statistical portal's Banco de Datos
Territorial. During implementation we discovered:

- IVE publishes per-municipality **Fichas** as vector PDFs only (no
  XLSX / CSV / JSON companion).
- The BDT full-text query UI is a PHP form with no stable REST surface.
- **Every indicator shown on the IVE Ficha for Riba-roja is already
  sourced upstream via INE (population, households), SEPE (unemployment),
  MinHac (budget), OSM (geography), and Wikidata (area, altitude,
  coords, identifiers).**

So the IVE-BDT adapter was retired in favour of the richer
**Wikidata** fall-back (shipped — see the `wikidata.ts` adapter +
`WikidataCard` on `/datos`). If IVE publishes a machine-readable
endpoint in the future we can add it alongside without disrupting the
existing pipelines.

---

This document maps the move from the current front-end-only prototype (all
data mocked in `src/data/mockData.js`) to an MVP that runs on **real, authoritative
data about Riba-roja de Túria**. Municipality INE code: **46214**. Region:
Valencia · Camp de Túria. Population as of March 2026: **24,600**. Mayor: Robert
Raga Gadea (PSPV-PSOE) since 2015, re-elected with absolute majority in 2023.
21 councillors: 10 PSPV-PSOE · 7 PP · 1 VOX · 1 Compromís · 2 others. (Composition
verified live against `ribarroja.es/ayuntamiento/corporacion_municipal`.)

The plan is written so a future Claude Code session can execute it without
re-doing the research.

---

## 1. Source of truth inventory

Every data domain in the mock layer is replaced with a real source below. For
each source we record: **URL**, **delivery format**, **licence**, **refresh
cadence**, and **scrape pattern**.

### 1.1 Who runs the city (officials, parties, portfolios, photos)

| Field | Source | Format | Refresh | Notes |
|---|---|---|---|---|
| Mayor & councillors (names, portfolios, emails, party, photo) | `http://www.ribarroja.es/ayuntamiento/corporacion_municipal` | HTML (Apache CMS with predictable tables) | On change (rare) | Photos: `http://www.ribarroja.es/contenidos.downloadimg.action?id=<id>`; CVs: linked PDFs; party logos: same image endpoint |
| Biographies / CVs | `/portal_de_transparencia/informacio_sobre_la_corporacio_municipal/dades_biografiques_...` | HTML + PDF | On change | One biography per councillor |
| Mayor's agenda | `/7_altres_dades_objecte_de_publicacio/agendes` | HTML | Weekly | Public appointments + meetings |
| Political composition of the pleno (historic) | `/ayuntamiento/corporacion_municipal` (current) + Junta Electoral Central (JEC) bulk results published in BOE (historic) | HTML + `BOE-A-2023-XXXXX` announcement | Every 4 years | JEC publishes final proclamation acts in BOE — bulk parseable |
| Election results (2023 municipal) | `juntaelectoralcentral.es/cs/jec/elecciones/ultimas` + `infoelectoral.interior.gob.es` | CSV/XLS bulk download | Static | Ministerio del Interior publishes machine-readable final results |

### 1.2 Public money (budget, contracts, subsidies, invoices, taxes)

| Field | Source | Format | Refresh | Notes |
|---|---|---|---|---|
| Annual budget & liquidations | **Portal de Entidades Locales (MinHac)** `hacienda.gob.es/...InformacionCCLLs/Presupuestos_EELL.aspx` + **CONPREL** `serviciostelematicosext.hacienda.gob.es/SGFAL/CONPREL` | XLS + HTML | Annual (budget) + quarterly (execution) | Datos.gob.es publishes national aggregated CSV: `e05188501-presupuestos-y-liquidaciones-de-las-entidades-locales-datos-agregados` |
| Quarterly budget execution | Same (`CONPREL` → Quarterly) | XLS | Quarterly | Filter by INE code 46214 |
| Full local budget document (PGO) | Municipal site `/areas_municipales/hacienda` + BOPV (official provincial bulletin) | PDF | Annual (Oct-Dec) | BOPV: `bop.dival.es/bop/` — searchable by "Riba-roja" + "presupuesto" |
| Public tenders (awarded + open) | **PLACSP OpenPLACSP** `contrataciondelestado.es/wps/portal/plataforma/datos_abiertos` | **Atom/XML bulk feeds** (monthly ZIP) + `datos.gob.es/en/catalogo/l01241152-licitaciones` | Daily Atom; monthly bulk | Filter by contracting-body ID (Ayuntamiento Riba-roja PLACSP ID — to fetch on first run) |
| Subsidies granted/received | **BDNS (Base de Datos Nacional de Subvenciones)** `pap.hacienda.gob.es/bdnstrans/` | **REST API** + web search | Weekly | `/GE/es/convocatorias/organo/L02000022` pattern — organo code maps to the municipality's BDNS ID |
| Supplier invoices (FACe) | Municipal transparency portal `/transparencia_en_las_contrataciones_y_costes_de_los_servicios` | PDF / HTML tables | Quarterly | Spain-wide e-invoicing hub is FACe but per-supplier detail is published here |
| Taxes & fees (IBI, IAE, tasas) | Ordenanzas fiscales → `/ayuntamiento/ordenanzas` + `/areas_municipales/hacienda` | PDF | Annual | Cadastral data (IBI) cross-referenced with Catastro |

### 1.3 Demographics, economy, society

| Field | Source | Format | Refresh | Notes |
|---|---|---|---|---|
| Population by age, sex, nationality | **INE Padrón Continuo** (API 29005 via `datos.gob.es`) | JSON API | Annual (Jan 1st cutoff) | `datos.gob.es/en/catalogo/ea0010587-cifras-oficiales-del-padron-por-municipio-dpop-identificador-api-29005` — direct JSON endpoint |
| Municipal fact sheet (all indicators in one place) | **IVE — Portal Estadístic GVA** `pegv.gva.es/auto/scpd/web/FM/CAS/ES_FM_46214.pdf` | PDF (also XLSX from parent page) | Annual (March publication) | 2026 edition already published. Contains: surface, density, altitude, population trend 2015-2025, natural movement, economy, labour, housing, education, environment |
| Full territorial database | **IVE Banco de Datos Territorial** `pegv.gva.es/es/bdt` | Query builder with CSV/XLS export | Continuous | Programmatic: POST with `territorio=46214` returns filtered time-series |
| Unemployment (monthly) | **SEPE** `sepe.es` + `datos.gob.es/en/catalogo/e05007801-paro-registrado-por-municipios` | CSV | Monthly | Per-municipality paro registrado |
| Cadastre (properties, parcels) | **Sede Electrónica del Catastro** OVC Web Services `ovc.catastro.meh.es/ovcservweb/` + `XYaCatastroCV` (`idev.gva.es/en/xyacatastrocv`) | SOAP + REST | Continuous | Useful for building footprints and land use |
| Weather | AEMET OpenData `opendata.aemet.es` | REST API (API key) | Hourly | Local station: Riba-roja/Manises airport |

### 1.4 Citizen life (complaints, participation, events)

| Field | Source | Format | Refresh | Notes |
|---|---|---|---|---|
| Citizen participation / budget votes | **Votiveu – Participa Riba-Roja** `participa.ribarroja.es` | HTML (Decidim platform) | Continuous | Decidim is open-source with a REST API — can consume proposals, votes, budgets |
| Citizen complaints (quejas ciudadanas) | Municipal site: `/areas_municipales/atencion_a_la_ciudadania` + Tablón de anuncios | HTML feed | Daily | No open API — scrape periodically |
| Pleno agenda + minutes | `/ayuntamiento/corporacion_municipal` + downloadable acta PDFs (e.g. `contenidos.downloadatt.action?id=...`) | PDF + HTML | Monthly | Each acta has numeric content id |
| Official announcements (edictos) | **BOPV (Boletín Oficial Provincia Valencia)** `bop.dival.es/bop/` | HTML + PDF | Daily | Search by municipality name; no public API, but HTML is structured |

### 1.5 Press + social

| Field | Source | Format | Refresh | Notes |
|---|---|---|---|---|
| Local press coverage | Levante-EMV, Las Provincias, El Periódico, elperiodic.com, Valencia Plaza | RSS feeds (each publisher) | Hourly | Aggregate per "Riba-roja" keyword |
| Local magazine "SOM Riba-roja" | `appriba-roja.es/uploads/files/...pdf` (monthly) | PDF | Monthly | Archive of editions exists — mirror |
| Municipality social media | Facebook / Twitter-X / Instagram / YouTube (linked from `ribarroja.es` header) | HTML / platform APIs | Continuous | Platform APIs have changed (X is paid). Alternative: Nitter / public RSS bridges for read-only |
| Mayor's social | Robert Raga on X/Facebook | Same | Continuous | Verify accounts first |
| Community press magazine SOM | AP Riba-roja (AMPA federation) | PDF | Monthly | Already captured in repo (`session 1776604315548`) |

---

## 2. Target data schema (normalised)

All scraped/fetched sources land in a typed schema. Proposal (PostgreSQL + Drizzle ORM):

```sql
-- Canonical entities
person          (id, full_name, slug, photo_url, bio_md, linkedin, twitter, email, cv_pdf_url)
party           (id, name, short, color, logo_url, national_id)
official        (id, person_id, party_id, role, portfolios[], term_start, term_end, active)
municipality    (id=46214, name, bbox, centroid, population_total)
neighborhood    (id, muni_id, name, centroid, bbox, population, mhs_score)

-- Finance
budget          (id, muni_id, year, chapter, subchapter, amount_approved, amount_executed, source_url)
tender          (id, muni_id, placsp_id, object, amount, status, awarded_to, awarded_date, close_date, source_url)
subsidy         (id, bdns_id, muni_id, object, amount, awarded_to, awarded_date, source_url)
supplier        (id, nif, name, address)
invoice         (id, supplier_id, muni_id, amount, concept, date, source_url)
tax_ordinance   (id, muni_id, year, kind, base, rate, source_pdf_url)

-- Democracy
pleno_session   (id, muni_id, date, acta_url, summary, agenda_json)
vote            (id, pleno_id, topic, person_id, choice)  -- per-councillor voting record
election_result (id, muni_id, date, party_id, votes, pct, seats)

-- Citizen
incident        (id, muni_id, lat, lng, severity, category, dept, status, reported_at, resolved_at, source)
participation   (id, muni_id, platform, kind, title, url, stance, votes)

-- Stats (time series)
stat_series     (id, muni_id, indicator_code, year, value, unit, source)

-- Press/social
news_item       (id, source, url, title, published_at, summary, sentiment, related_muni_id)
social_post     (id, platform, author_handle, url, text, published_at, related_muni_id, sentiment)

-- Geo
building        (id, muni_id, geom, use, height_m, area_m2, catastro_ref)
parcel          (id, muni_id, geom, catastro_ref, owner_type)
```

Indicator codes (for `stat_series`) follow the IVE dictionary (`pegv.gva.es/bdt` codebook).

---

## 3. Architecture

```
┌────────────────────────────────────────────────────────────────────────┐
│                        Data sources (external)                         │
│  ribarroja.es · INE · IVE · MinHac · PLACSP · BDNS · BOPV · Decidim    │
│  · Catastro · AEMET · RSS feeds · social APIs                          │
└───────────┬─────────────────────────────────────┬──────────────────────┘
            ▼                                     ▼
    ┌───────────────┐                    ┌─────────────────┐
    │  Scrapers /   │                    │ Scheduled pulls │
    │ adapters/*.ts │                    │  (cron / Edge)  │
    └───────┬───────┘                    └────────┬────────┘
            ▼                                     ▼
    ┌─────────────────────────────────────────────────────┐
    │   Normalizer + dedup layer (server, TypeScript)     │
    │   - Validates with Zod                              │
    │   - Upserts into Postgres (Supabase/Neon/Railway)   │
    │   - Writes raw payload to S3 / Supabase Storage     │
    └────────────────────┬────────────────────────────────┘
                         ▼
    ┌────────────────────────────────────────────────────┐
    │   API (Hono or Next.js Route Handlers)             │
    │   /api/officials, /api/tenders, /api/budget/...    │
    │   Edge-cached; ETag-aware                          │
    └────────────────────┬───────────────────────────────┘
                         ▼
    ┌────────────────────────────────────────────────────┐
    │   Front-end (current CivicPulse SPA)               │
    │   Replaces mockData.js imports with React Query    │
    │   calls to /api/* hitting the new API              │
    └────────────────────────────────────────────────────┘
```

**Deployment targets**
- DB: Supabase (Postgres + Storage + Auth) OR Neon + Cloudflare R2
- API: Vercel serverless (same project as front-end) OR Cloudflare Workers
- Scheduled ingestion: Vercel Cron OR GitHub Actions on schedule
- Observability: Upstash Redis for queues + Logtail / Grafana Loki

---

## 4. Legal and ethical guardrails

1. **Transparency Law 19/2013 & GDPR** — all municipal data we reuse is
   already public by law. However:
   - Do **not** scrape councillor *personal* emails into public views; surface
     only the functional ones (e.g. `alcaldia@ribarroja.es`).
   - Publish a clear *"Fuentes"* page that lists every source and refresh
     stamp per data point.
   - Honor `robots.txt` on every third-party site; back off on rate limits.
2. **LOPD/GDPR** — citizen complaints can include PII. Never ingest raw
   complaint text with names/addresses into client-visible state; aggregate
   to neighborhood level.
3. **Licensing** —
   - `datos.gob.es` datasets are **CC-BY 4.0** (Spanish government open data).
   - IVE, INE, MinHac follow the same Aviso Legal — free reuse with attribution.
   - PLACSP and BDNS are explicitly open for reuse.
   - BOPV / municipal HTML — reusable but check individual page footers.
   - Press feeds — link out; do *not* republish full article text.
4. **Photos of officials** — publicly posted by the Ayuntamiento itself on
   `ribarroja.es`; permissible to mirror with attribution to the municipal
   website.
5. **Add a `/legal`** page with: data sources, refresh policy, contact for
   removal requests, and a statement that CivicPulse is a civic-tech
   third-party project, not affiliated with the Ayuntamiento.

---

## 5. Sprint plan (8 weeks to MVP)

All implementation is **TDD-first**. RED / GREEN / Refactor commits per feature.

### Sprint 0 — foundations (week 1)
- [ ] Add `apps/ingestion` (Node/TS) and `apps/api` (Hono or Next Route
      Handlers) workspaces; keep current SPA as `apps/web`.
- [ ] Provision Postgres (Supabase free tier), migrate the schema in §2,
      generate TypeScript types (Drizzle or Kysely).
- [ ] Create `/legal` and `/fuentes` static pages in the SPA.
- [ ] Set up GitHub Actions CI: `pnpm test` + `pnpm build` + Playwright E2E
      smoke on every PR.

**Tests first:** schema migration roundtrip, `/api/health` returns 200.

### Sprint 1 — people + parties (week 2)
- [ ] `adapters/ribarroja-corporacion.ts` — scrape councillor table, mirror
      photos to Storage, upsert `person` + `official` + `party`.
- [ ] `GET /api/officials` returns normalised list + cached photo URLs.
- [ ] Wire Direction A `/cargos` page to the real API.
- [ ] Display coalition composition + 21-seat ring on Direction D.

**Tests first:** scraper returns ≥21 officials, all have a party, mayor is
flagged `role='alcalde'`, every photo URL returns 200. Golden-file test
using today's HTML snapshot.

### Sprint 2 — budget + taxes (week 3)
- [ ] `adapters/minhac-conprel.ts` — fetch annual + quarterly budget for
      INE 46214; normalise into `budget`.
- [ ] `adapters/bopv-ordenanzas.ts` — download + hash latest IBI/IAE/tasas
      PDFs; OCR to structured `tax_ordinance` rows.
- [ ] Wire `/presupuesto` page in Direction A + the €-flujo overlay in
      Direction D to real budget chapters.

**Tests first:** total chapter sum equals liquidated amount ± tolerance;
IBI rate for a reference parcel matches the published ordinance.

### Sprint 3 — contracts + subsidies (week 4)
- [ ] `adapters/placsp.ts` — parse daily Atom feed; filter by Ayto.
      Riba-roja PLACSP body id; backfill last 2 years.
- [ ] `adapters/bdns.ts` — call BDNS search API; backfill awarded subsidies.
- [ ] Expose `/api/tenders?status=open|awarded` and wire the "Tenders"
      widget to Direction D's editorial column.

**Tests first:** daily-Atom test replays a fixture from 2026-04-01 and
extracts the expected 3 tenders; BDNS search returns non-empty for the last
year; awarded amount > 0 for at least one contract.

### Sprint 4 — stats + demographics (week 5)
- [ ] `adapters/ine-padron.ts` — call `datos.gob.es` API 29005 JSON, load
      population time-series into `stat_series`.
- [ ] `adapters/ive-bdt.ts` — parse the 2026 Ficha Municipal PDF + pull
      full BDT time-series for INE 46214.
- [ ] `adapters/sepe-paro.ts` — monthly unemployment CSV.
- [ ] Wire KPI strip on Direction D to real MHS-components (population
      trend, unemployment, natural movement).

**Tests first:** population at 2026-01-01 equals 24,600 ± 100; unemployment
rate is within valid range 0..100; monthly series has no gaps.

### Sprint 5 — citizen life + participation (week 6)
- [ ] `adapters/decidim-ribarroja.ts` — pull `participa.ribarroja.es` via
      Decidim API (proposals, votes, budgets).
- [ ] Scrape latest `Tablón de anuncios` + `Avisos` into `incident`-like
      entries (grouped by category).
- [ ] Pull pleno acta PDFs; summarise with a local LLM call into agenda +
      outcomes.
- [ ] Wire Direction A `/plenos` + `/quejas` pages + Direction D incident
      pins to live data.

**Tests first:** Decidim adapter hits a fixture with 50 proposals and
returns 50 normalized records; pleno-summary returns structured JSON
with fields `{date, agenda, outcomes[]}`.

### Sprint 6 — press + social (week 7)
- [ ] RSS feed aggregator for `levante-emv.com`, `lasprovincias.es`,
      `elperiodic.com`, `valenciaplaza.com` filtered by "Riba-roja".
- [ ] Social bridge: Nitter or public RSS for the mayor's and
      ayuntamiento's accounts. Store URL + timestamp only; fetch text on
      demand server-side for preview.
- [ ] Optional sentiment tag (local transformer, no external API).
- [ ] Wire the Pulso/Prensa/Social tabs in `/ciudad` (already wired in the
      prototype) to the new feed.

**Tests first:** aggregator returns ≥1 item per known local publication
for the past 7 days; deduplication test with a pair of near-identical
headlines collapses them.

### Sprint 7 — geo + map (week 8)
- [ ] `adapters/catastro.ts` — fetch building footprints for the BBOX of
      Riba-roja urban area; store as PostGIS geometries.
- [ ] Replace hard-coded `RR_NEIGHBORHOODS` in `mockData.js` with a
      `/api/neighborhoods` call that returns polygons + centroids from real
      cadastral + INE data.
- [ ] Update `StylizedMap.jsx` to render live neighborhood metrics + the
      real L9 station coords (already in place) + live CV-35/CV-370
      polylines from OpenStreetMap Overpass query.

**Tests first:** every neighborhood has ≥1 building footprint; population
sum across neighborhoods equals the municipal total ± 5 %.

### Launch week — polish + publish
- [ ] `/fuentes` page auto-generated from adapter registry (lists every
      source, last-ingest timestamp, row count).
- [ ] Daily freshness report emailed to the maintainer if any adapter
      failed > 48 h.
- [ ] `docs/RUNBOOK.md` — how to add a new adapter, how to diagnose a
      failing feed, how to rotate AEMET API keys.
- [ ] Delete `src/data/mockData.js` (or keep only as fallback seed for
      local dev without DB).
- [ ] Press release to SOM Riba-roja + the ayuntamiento.

---

## 6. Risks and fallbacks

| Risk | Mitigation |
|---|---|
| `ribarroja.es` HTML structure changes | Scraper contract-tests on a snapshotted HTML fixture; alert on layout drift; manual-review queue before propagating |
| BOPV / PLACSP rate-limit or IP-block | Cache raw payloads, exponential backoff, rotate request headers, run ingestion from Vercel Edge regions |
| IVE / INE publishing delay | Show "último dato oficial: YYYY-MM-DD" next to every stat; never pretend data is fresher than it is |
| Councillor complaint about photo reuse | `/legal` + a 1-click takedown email; honour within 24 h |
| GDPR — accidental PII in complaints | Ingestion pipeline strips names/addresses before persisting; stored hashes only |
| Election year 2027 — council changes mid-cycle | Schema already versions officials by `term_start/term_end`; add a diff-report after every scrape |
| Map-tile cost scales | Switch Leaflet base from CartoDB CDN to a self-hosted tile mirror once DAU exceeds free tier |
| SPA bundle size (already 520 KB) | Code-split by variant (A/B/C/D) via `React.lazy`; move Leaflet into async chunk |

---

## 7. Adapter registry (seed file, Sprint 0 deliverable)

```ts
// apps/ingestion/src/adapters/index.ts
export const ADAPTERS = {
  'ribarroja-corporacion':  () => import('./ribarroja-corporacion'),
  'minhac-conprel':         () => import('./minhac-conprel'),
  'bopv-ordenanzas':        () => import('./bopv-ordenanzas'),
  'placsp':                 () => import('./placsp'),
  'bdns':                   () => import('./bdns'),
  'ine-padron':             () => import('./ine-padron'),
  'ive-bdt':                () => import('./ive-bdt'),
  'sepe-paro':              () => import('./sepe-paro'),
  'decidim-ribarroja':      () => import('./decidim-ribarroja'),
  'press-rss':              () => import('./press-rss'),
  'catastro':               () => import('./catastro'),
  'aemet-weather':          () => import('./aemet-weather'),
} as const
```

Each adapter must export:

```ts
export interface Adapter {
  id: string
  cadence: 'hourly' | 'daily' | 'weekly' | 'monthly' | 'annual' | 'on-demand'
  fetchOnce(ctx: Ctx): Promise<{ raw: unknown; normalized: Record<string, unknown>[] }>
  validate(normalized: unknown[]): Promise<void>  // Zod schemas live here
}
```

---

## 8. Out of scope for MVP

- Multi-city (we ship Riba-roja first; schema already keyed on `muni_id`
  so adding València, Paterna, Manises later is additive).
- User accounts / personal dashboards.
- AI-generated explanations (can be layered after the data is real).
- Mobile app (responsive SPA only).

---

## 9. First three concrete TDD milestones

1. **Milestone A — real corporation page (Sprint 1):** front-end shows
   real councillors with photos from `ribarroja.es`. Fully TDD'd scraper
   with HTML fixture + live integration test. **Exit criterion:** Direction
   A `/cargos` renders the real 21 councillors + mayor. Delete the
   corresponding mock in `mockData.js`.
2. **Milestone B — real budget (Sprint 2):** Direction A `/presupuesto`
   and Direction D "€ Flujo" overlay show real 2026 budget chapters from
   MinHac. **Exit criterion:** total in hero matches the published budget
   in EUR to within 0.5 %. Delete `BUDGET_*` mocks.
3. **Milestone C — real statistics (Sprint 4):** KPI strip on Direction D
   shows real population (24,600), unemployment, natural movement — each
   with a "última actualización" tooltip from the adapter. **Exit
   criterion:** all five KPIs on Direction D are sourced. Delete `MHS_15D`,
   `COMPLAINTS_30D`, `RESOLVED_30D` mocks.

After these three, the demo is defensible to real users; the remaining
sprints layer depth (contracts, subsidies, participation, press, geo)
without changing the baseline experience.

---

## 10. References (verified 2026-04-19)

- Municipal corporation (21 councillors, real names/photos):
  http://www.ribarroja.es/ayuntamiento/corporacion_municipal
- Transparency portal: http://www.ribarroja.es/ayuntamiento/portal_de_transparencia
- 2026 Ficha Municipal (IVE): https://pegv.gva.es/auto/scpd/web/FM/CAS/ES_FM_46214.pdf
- INE Padrón API 29005: https://datos.gob.es/en/catalogo/ea0010587-cifras-oficiales-del-padron-por-municipio-dpop-identificador-api-29005
- MinHac CONPREL (municipal budgets/liquidations):
  https://serviciostelematicosext.hacienda.gob.es/SGFAL/CONPREL
- PLACSP OpenPLACSP:
  https://contrataciondelestado.es/wps/portal/plataforma/datos_abiertos
- BDNS: https://www.pap.hacienda.gob.es/bdnstrans/GE/es/index
- BOPV: https://bop.dival.es/bop/
- GVA Open Data portal: https://portaldadesobertes.gva.es/
- Catastro OVC web services: https://ovc.catastro.meh.es/ovcservweb/
- Junta Electoral Central: https://www.juntaelectoralcentral.es/cs/jec/elecciones/ultimas
- Decidim (municipal participation): https://participa.ribarroja.es/
