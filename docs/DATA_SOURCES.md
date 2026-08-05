# Data sources

Per-domain reference for the ingestion pipeline. Read the section for the
adapter you are touching; you do not need the rest.

Companion docs: [`DATA_INTEGRITY.md`](DATA_INTEGRITY.md) (read this before
writing an adapter), [`OPERATIONS.md`](OPERATIONS.md) (what runs when, and what
is allowed to fail).

## The convention

```
scripts/scrape-<x>.ts   fetch + CLI wrapper (the only place `fetch` lives)
  → src/scraper/<x>.ts  pure parser, no network, unit-tested against a fixture
  → public/data/<x>.json  typed snapshot, committed
  → src/hooks/use<X>.js   one hook per domain, returns { loading, error, data }
```

32 of the 41 pipeline scripts follow it exactly. Derive the file names rather
than looking them up. `compute-*` and `build-*` scripts derive a snapshot from
other snapshots instead of fetching.

**Exceptions** (parser is inline in the script, or the output name differs):
`build-cpv-labels`, `compute-dept-stats` (writes into `plenos-agendas.json.stats`),
`compute-press-analytics`, `scrape-fgv-gtfs` (→ `metro-schedule.json`),
`scrape-metro-network`, `scrape-officials`, `scrape-pleno-agendas`
(→ `plenos-agendas.json`), `scrape-promise-suggestions`, `scrape-transparency`
(→ `transparency-docs.json`).

Counts of rows, contracts, euros and sessions are **not** recorded here. Every
one that used to be was wrong when audited on 2026-08-03 — some by 4×. Each
snapshot carries its own `stats` block; that is the only figure that cannot go
stale.

## Who may write what

Three write-contracts. Mixing them is how libel-bearing prose reaches a page.

### Scraper-owned — regenerated nightly, never hand-edited

Everything produced by the convention above. Safe to delete and rebuild.

### Curated — human-edited only, NEVER written by automation

| File                                                | Schema / CLI                                                                                                                  |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `promises.json`                                     | `src/scraper/promises.ts` · `npm run reply`, `freeze:set`                                                                     |
| `pleno-votes.json`                                  | `src/scraper/pleno-votes.ts` · `npm run pleno-vote`, `promote-vote`, `retract-vote`                                           |
| `pleno-findings.json`                               | `src/scraper/pleno-finding.ts` · `npm run promote-claim`, `finding-reply`, `correct-pleno-finding`                            |
| `journalist-reports.json` (+ `journalist-reports/`) | `src/scraper/journalist.ts` · `npm run promote-report`, `correct-journalist-report`, `journalist-reply`, `repoint-source-url` |
| `quejas-responses.json`                             | `scripts/apply-queja-response.ts` · `npm run queja-reply`                                                                     |
| `sindic.json`                                       | `src/scraper/sindic.ts` · `npm run sindic:add`                                                                                |
| `plantilla.json`, `dedicaciones.json`               | curated · cited · `src/scraper/dedicaciones.ts`                                                                               |
| `place-overrides.json`                              | `src/scraper/place-suggestion.ts` · `npm run promote-place`                                                                   |
| `gazetteer-supplement.json`                         | `src/scraper/gazetteer-supplement.ts`                                                                                         |
| `entity-overrides.json`                             | `src/scraper/entities.ts` · `npm run entity-alias`                                                                            |
| `area-fit.json`                                     | `src/scraper/area-fit.ts` · `npm run promote-area-fit`                                                                        |
| `requisitos-cargo.json`                             | curated · cited al BOE · hand-edit via PR                                                                                     |

Each CLI re-validates the whole snapshot before writing, so an invariant
(≥20-char verbatim quote, ≥10-char title) cannot silently slip. Route
algorithmic output through the CLI, never straight into the file — the schema
validator and the git history are the audit trail.

`repoint-source-url` is the odd one out and worth knowing about: when a
publisher MOVES a document, the claim, the excerpt and `retrievedAt` are all
still right — only the address is stale. That is not a correction, and filing it
under `corrections[]` would tell readers we got something wrong. It records
`previousUrl` + `relocatedAt` instead, and **refuses to move a citation unless
the frozen excerpt still appears verbatim in the document at the new URL** — so
"repoint" can never quietly become "swap the evidence".

### Machine-written suggestions — a curator promotes, nothing auto-publishes

`officials-social-suggestions.json`, `place-suggestions.json`,
`pleno-claims-suggestions.json`, `pleno-votes-suggestions.json`,
`press-claims-suggestions.json`, `promise-suggestions.json`.

Every row carries `requiresHumanApproval: true`, and the corresponding published
schema **rejects** that field — defence in depth.

> **These six sit under `public/` and are therefore served.** "Not rendered by
> any page" is not "not published". Vercel serves the whole directory, so any
> file there is fetchable by URL whether or not something links to it. Weigh
> that before adding a seventh: if the rows are unreviewed machine prose about a
> named living person, they belong in `editorial/` (gitignored), which is where
> the journalist drafts were moved on 2026-08-01 after 24 of them were
> discovered web-fetchable. See [`JOURNALIST_AGENT.md`](JOURNALIST_AGENT.md).

### Bot-owned

`quejas.json` — written by `bot/src/services/snapshot.ts` on the Fly.io bot and
pulled into the repo daily by `pull-quejas.yml`. Do not hand-edit; the next pull
overwrites it. Change the bot's SQLite instead.

---

## Domains

### Mayor + 20 councillors + party + portfolios + photos + CV links

- **Pipeline** — `corporacion.ts` → `officials.json`
- **Source** — Scraped HTML from `ribarroja.es/ayuntamiento/corporacion_municipal`; photos mirrored into `public/data/photos/<slug>.jpg`
- **Surfaces** — `/cargos` "Corporación Municipal" section; Direction D editorial column (`AlcaldeBox` + `CoalitionRing`)

### Municipal budget (9 income + 9 expense chapters + 6 program groups)

- **Pipeline** — `budget.ts` → `budget.json`
- **Source** — MinHac **CONPREL** XLS, sheet "Comunitat Valenciana". Parser tries 2025→2024→2023
- **Surfaces** — `/presupuesto` (KPIs + 3 chapter charts); Direction D KPI strip

### Budget execution (ejecutado vs presupuestado, quarterly)

- **Pipeline** — `budget-execution.ts` → `budget-execution.json`
- **Source** — Ayuntamiento estados de ejecución PDFs (SICALWIN)
- **Surfaces** — `/presupuesto` "Ejecución presupuestaria"

### Municipal hiring (procesos selectivos)

- **Pipeline** — `procesos-selectivos.ts` → `procesos-selectivos.json`
- **Source** — ribarroja.es procesos-selectivos list
- **Surfaces** — `/empleo-publico`

### Association register

- **Pipeline** — `asociaciones.ts` → `asociaciones.json`
- **Source** — Registro Municipal de Asociaciones PDF
- **Surfaces** — `/datos` entidades directory

### Obras municipales (fichas 2019–2024)

- **Pipeline** — `obras.ts` → `obras.json`
- **Source** — Portal de Transparencia · obras-de-infraestructuras-en-curso fichas (FEDER 2019–20) + urbanismo/vias_y_obras Plan RENOVE fichas (2023–24, zona afectada → gazetteer geo)
- **Surfaces** — `/presupuesto` section + landing-map layer

### Contracts + tenders

- **Pipeline** — `tenders.ts` → `tenders.json`
- **Source** — **Gobierto** SQL-over-HTTP API at `ribalicita.ribarroja.es/api/v1/data/data.csv?sql=select * from {contratos,licitaciones}` — public mirror of PLACSP. Parser keeps the full row incl. `duration`/`estimatedValue`/`contractorType` and the winner (`assignee`, NOT `contractor` = the buyer).
- **Surfaces** — `/presupuesto` (`Últimos contratos adjudicados`); Direction D editorial column (`LiveContracts`); the shared `ContractCard` (winner + baja% + CPV label + procedimiento + nº licitadores) on the landing `PlacePopup` + `/presupuesto` `ZoneDrilldown`

### Street/camino gazetteer

- **Pipeline** — `streets.ts` → `streets.json`
- **Source** — **OSM Overpass API** — every named `highway` way inside `wikidata=Q23701`, segments merged per accent/case-folded name, point = the longest segment's middle vertex (on-street)
- **Surfaces** — Input to the tender **place-resolver** (`compute-tender-geo.ts`) — never fetched at runtime

### CPV-2008 → Spanish labels

- **Pipeline** — `build-cpv-labels.ts` → `cpv-labels.json`
- **Source** — Official **EU/TED CPV-2008** vocabulary (`ted.europa.eu/…/cpv_2008_xml`, EU open data). Occasional curator build; `src/lib/cpv.js` degrades to embedded 2-digit division labels for misses
- **Surfaces** — `ContractCard` CPV chips on the money popups + `/presupuesto` drilldown

### Subsidies (BDNS convocatorias)

- **Pipeline** — `bdns.ts` → `bdns.json`
- **Source** — MinHac **BDNS** REST endpoint `/bdnstrans/api/convocatorias/busqueda?vpd=GE&descripcion=riba-roja`, paginated
- **Surfaces** — `/presupuesto` (`Subvenciones · BDNS` card)

### Population (Total / Hombres / Mujeres)

- **Pipeline** — `padron.ts` → `padron.json`
- **Source** — **INE Tempus3** CSV table 2903 (Valencia province)
- **Surfaces** — `/datos` full-width SVG chart; Direction D KPI strip (Población panel)

### Registered unemployment (monthly series)

- **Pipeline** — `paro.ts` → `paro.json`
- **Source** — **SEPE** Muniacteco XLS feeds (3-sheet: AMBOS / HOMBRES / MUJERES); CLI walks back up to 24 months
- **Surfaces** — Direction D KPI strip (Paro panel with MoM delta + 12-month sparkline)

### Plenos (council sessions)

- **Pipeline** — `plenos.ts` → `plenos.json`
- **Source** — Scraped HTML from `ribarroja.es/plenos/<year>`, Spanish-date → ISO, kind classifier (ordinario / extraordinario / urgente / otro)
- **Surfaces** — `/plenos` "Plenos recientes" card with linked titles + kind pills

### Citizen participation

- **Pipeline** — `participa.ts` → `participa.json`
- **Source** — WordPress REST API at `participa.ribarroja.es/wp-json/wp/v2/posts` + `/categories`
- **Surfaces** — `/plenos` "Participación ciudadana" grid; Direction D editorial column (`ParticipaBlockD`)

### Press (multi-source · Google News + infoturia + Ayuntamiento RSS)

- **Pipeline** — `press.ts` → `press.json`
- **Source** — Three feeds merged with FNV fingerprint dedup: (1) Google News RSS `news.google.com/rss/search?q="Riba-roja de Túria"` covering national + regional Spanish outlets (Levante-EMV, Las Provincias, Valencia Plaza, elDiario.es, Cadena SER, Comunica GVA, …); (2) `infoturia.com/riba-roja-de-turia/feed/` — direct WordPress feed of the local comarcal paper _Periòdic del Camp de Túria_, catches stories the Google News indexer misses; (3) `ribarroja.es/es/noticias/rss.xml` — the **Ayuntamiento's OWN** Drupal news feed (primary source), stamped `official:true` + a `Sección` taxonomy by `parseOfficialNewsRss`, merged FIRST so its attribution wins on a fingerprint collision (needs a Mozilla-leading UA for the ribarroja.es WAF). Each feed has its own parser (`parseGoogleNewsRss` for the " - Pub" suffix quirk; `parseStandardRss` for plain WordPress RSS; `parseOfficialNewsRss` for the official Drupal feed + section lift); one feed failing does not block the others.
- **Surfaces** — `/laboratorio` + Direction D editorial column (`PressBlockD`, with an "Oficial" badge on town-hall rows)

### Geo (municipal boundary 484 pts + 21 neighborhoods)

- **Pipeline** — `geo.ts` → `geo.json`
- **Source** — **OSM Overpass API** — relation 342356 stitched from outer ways + `place=neighbourhood/suburb/quarter/hamlet/village` inside the muni area
- **Surfaces** — Direction D StylizedMap: dashed boundary polyline + OSM neighborhood dots/labels

### Civic POIs (schools/health/parks/sport/culture/civic incl. townhall/cemetery)

- **Pipeline** — `civic-poi.ts` → `civic-poi.json`
- **Source** — **OSM Overpass API** — `amenity`/`leisure`/`healthcare`/`tourism` civic tags inside the `wikidata=Q23701` area. Requires a `name` on the noisy `leisure` bucket so the ~1.5k private backyard pools never reach the map; parser drops unnamed + dedups node/area
- **Surfaces** — Direction D StylizedMap "Servicios" layer (category-coloured markers + legend)

### Flood-risk zones (no snapshot — live WMS)

- **Pipeline** — _(none — WMS overlay)_
- **Source** — **PATRICOVA** WMS · Generalitat Valenciana / ICV `carto.icv.gva.es/…/WMSServer` layer 59 "Riesgo de Inundación" (EPSG:3857)
- **Surfaces** — Direction D StylizedMap "Riesgo inundación" layer (`WMSTileLayer`, off by default)

### Full Metrovalencia network (L1–L10)

- **Pipeline** — `scrape-metro-network.ts` → `metro-network.json`
- **Source** — **OSM Overpass API** — every `route=subway\|tram\|light_rail` relation tagged `network=Metrovalencia`/`operator=FGV`; platform polygons filtered out. Brand colours sourced from metrovalencia.es icon SVGs
- **Surfaces** — Direction D StylizedMap `FullNetwork` layer: thin coloured polylines + small station dots across the whole region, plus a line-legend pill row

### Metrovalencia GTFS static schedule (L9 + L2 at 4 local stations)

- **Pipeline** — `scrape-fgv-gtfs.ts` → `metro-schedule.json`
- **Source** — **MobilityDatabase mdb-1054** mirror of FGV's Google-Transit feed (FGV's own URL is inside-CDN only). Parses `calendar_dates.txt` + `stop_times.txt` + `trips.txt`; services classified by dominant day-of-week
- **Surfaces** — Direction D topbar L9 chip (real next departure) + StylizedMap `GtfsSchedulePopup` (both directions per line on click)

### Municipal facts (area 57.5 km², 125 m alt., coords, INE/OSM/GeoNames/Commons cross-refs + images)

- **Pipeline** — `wikidata.ts` → `wikidata.json`
- **Source** — Wikidata `Special:EntityData/Q23701.json`
- **Surfaces** — `/datos` `WikidataCard` above the population chart

### Spain-wide live ticker (Luz PVPC · Gasolina 95 · Diésel · Euribor 12m · BCE MRO · IPC interanual · AEMET avisos · DGT tráfico)

- **Pipeline** — `spain-ticker.ts` → `spain-ticker.json`
- **Source** — **REE apidatos** (`apidatos.ree.es/precios-mercados-tiempo-real`) · **Minetur Carburantes** REST (municipio `7177`) · **ECB SDMX** (`FM/M.U2.EUR.RT.MM.EURIBOR1YD_.HSTA` + `FM/D.U2.EUR.4F.KR.MRR_FR.LEV`) · **INE Tempus3** (serie `IPC251856`) · **AEMET** avisos HTML (`p=46`) · **DGT DATEX II v3.6** XML filtered to Valencia-area roads `A-3 / A-7 / CV-35 / V-30 / V-31 / V-11`
- **Surfaces** — Direction D `LiveTicker` — Bloomberg-style auto-scrolling marquee overlaying the top-center of the map. Press headlines interleaved every 3 chips. Each chip opens a details popover with source + citation.

### Pleno agendas

- **Pipeline** — `pleno-agenda.ts` → `plenos-agendas.json`
- **Source** — Scrapes each individual session's convocatoria HTML on `ribarroja.es`, extracts the ORDEN DEL DÍA, splits into {resolutiva / informativa / ruegos}, resolves department + expediente tuples
- **Surfaces** — `/plenos` — `TopDepartmentsCard` + inline "Ver orden del día" expander per session

### Open job vacancies

- **Pipeline** — `empleo.ts` → `empleo.json`
- **Source** — **portalemp** SaaS at `ribaocupacio.portalemp.com` — the Riba-roja municipal employment agency (Agència de Col·locació · ADL). The offer list loads via an AJAX POST guarded by OWASP CSRFProtector: GET for the `CSRFPTOKEN` cookie → POST `ofertas.html?acc=tableData` echoing that token in a same-named field → HTML `<table>` fragment; then a plain GET per `?fo=<id>` for the server-rendered detail "ficha". Comarca-wide (agency brokers jobs beyond the town), so NOT municipality-filtered — each row carries an `inRibaRoja` flag (RIBA_ROJA_ALIASES) for the client toggle. Best-effort in `scrape-all.sh`; also emits an RSS 2.0 feed `empleo-rss.xml` (`src/scraper/empleo-rss.ts`, 60 newest)
- **Surfaces** — `/empleo` (filter-reactive stats + charts + opt-in municipality map + filters + pagination + rich cards + RSS link) · `/empleo/:id` (ficha) · landing `EmpleoBlockD` (closing-soon teaser in the editorial column) · `/datos` catalog

### Promises — PSOE / PP / VOX / Compromís

- **Pipeline** — **human-curated** · `promises.ts` validates the schema
- **Source** — Hand-seeded from press citations (`press.json`) + real pleno votes + budget/tender snapshots. Every record has verbatim quote + source URL + publisher + ISO date
- **Surfaces** — `/promesas`, `/` landing editorial column (`PromesasBlockD`), `/metodologia`, `/aviso-legal`

### Promise suggestions (inference layer)

- **Pipeline** — `promise-inference.ts` → `promise-suggestions.json`
- **Source** — Scans `press.json` + `plenos-agendas.json` for keyword matches; light Spanish stemmer; conservative enum (never `inviable`, never publishes `cumplida`/`no-ejecutada` automatically)
- **Surfaces** — `/promesas` — "propuesta automática · pendiente de revisión humana" block under each card

### Third-party fact-checks (Newtral, Maldita, EFE Verifica, AFP Factual, …)

- **Pipeline** — `factcheck.ts` → `factcheck.json`
- **Source** — Two sources merged via `mergeFactCheckRows`: (1) Google Fact Check Tools API `factchecktools.googleapis.com/v1alpha1/claims:search` queried with `"Riba-roja de Túria"` (`languageCode=es`) — requires `GOOGLE_FACT_CHECK_API_KEY` (free tier; skipped gracefully when absent); (2) Maldita.es + Newtral RSS feeds (`parseFactcheckRss`) filtered to items mentioning Riba-roja, category-mapped onto our `ClaimVerdict` enum. The press verifier cross-references every press claim against the merged index and emits `kind:'factcheck'` evidence rows when a published fact-check matches by token overlap; sin-datos verdicts are upgraded to the fact-checker consensus.
- **Surfaces** — `/laboratorio` — "Verificaciones externas" widget in the dashboard rail · per-claim cross-check row when an external fact-check matches. It lands in a press finding's `crossChecked[]`, never `contradiction[]`, even when the fact-checker's rating is "Falso": the directional judgement is theirs, our match is token overlap, and `contradiction[]` gates `severity: critical` about a named outlet.

### EU TED tenders (Tenders Electronic Daily, 54+ notices for Riba-roja)

- **Pipeline** — `tenders-ted.ts` → `tenders-ted.json`
- **Source** — TED v3 API at `api.ted.europa.eu/v3/notices/search`. Free, no auth. Expert-query syntax: `buyer-name~"Riba-roja"`. Catches contracts above the EU threshold (~€143k for supplies/services in 2026), NextGenerationEU + DANA recovery spending that PLACSP publishes late or routes via national funding lines. `asTenderRow()` projects each row onto the same `TenderRow` shape the verifier uses, so `[...local.contracts, ...ted.items]` merges cleanly in the amount-based cross-ref.
- **Surfaces** — `/laboratorio` — surfaces as `kind:'tender'` evidence rows on press findings whose amount + buyer-name match a TED notice. Auto-upgrades sin-datos → verificado when matched.

### BOE (Boletín Oficial del Estado)

- **Pipeline** — `boe.ts` → `boe.json`
- **Source** — Walks the last 30 days of the open-data sumario JSON at `boe.es/datosabiertos/api/boe/sumario/{YYYYMMDD}`. Free, no auth. Filters each item's titulo to those mentioning Riba-roja / Ribarroja. Catches convenios, expropiaciones, subvenciones nominativas, sanciones — actos administrativos PLACSP misses. Defensive parser: `epigrafe` and `item` can each be single object OR array.
- **Surfaces** — `/laboratorio` — press verifier's `applyBoeCrossRef` requires the press claim to contain an acto-administrativo trigger word (ordenanza / decreto / resolución / convenio / expropiación / sanción / plan general / subvención) AND token-overlap with a BOE titulo. Sin-datos → verificado on match. `kind:'boe'` evidence row.

### Catastro (OVC cadastre)

- **Pipeline** — **curator-only** · `catastro.ts` lookup helper, no snapshot file
- **Source** — Wraps `ovc.catastro.meh.es/.../Consulta_DNPLOC` (by address) and `Consulta_DNPRC` (by RefCat). Free, no auth. WCF stack is brittle (returns HTML help pages on malformed queries; municipio spellings vary "RIBA-ROJA DE TURIA" / "RIBARROJA"); the helper never auto-feeds the verifier — libel discipline keeps the human in the loop.
- **Surfaces** — Curator CLI `npm run lookup-catastro` (stdout-only). Used when investigating a press claim that names a specific address or RefCat.

### Press link rot + Wayback archival index

- **Pipeline** — **derived** · `audit-press-links.ts` → `press-link-rot.json`
- **Source** — Daily job. HEAD-checks every unique `articleUrl` in `press-claims-suggestions.json`, calls Wayback's Availability API to find an existing snapshot, optionally Save Page Now for dead/forced URLs. Writes `{articleUrl, status: alive\|dead\|error, archivedUrl, archivedAt, checkedAt, …}`. Chained nightly after `auto-curate-press`.
- **Surfaces** — `/laboratorio` — each press card shows "🔗 Wayback ↗" when a snapshot exists; "Ver original" link flips to red ⚠︎ when status='dead' so curators cite the snapshot instead.

### Press finding corrections log

- **Pipeline** — **human-curated** · `correct-press-finding.ts` CLI · embedded inside `press-findings.json`
- **Source** — Per-correction record `{field: title\|summary\|severity, original, corrected, reason ≥20 chars, editor, correctedAt ISO}` appended to `PressFinding.corrections[]`. CLI re-validates the whole snapshot before writing — invariants like ≥10-char title / ≥40-char summary stay intact. IFCN signatory pillar #5 (open corrections policy).
- **Surfaces** — `/laboratorio` — collapsible "Bitácora de correcciones" expander on each finding card with strike-through diff.

### Pleno finding corrections log

- **Pipeline** — **human-curated** · `correct-pleno-finding.ts` CLI · embedded inside `pleno-findings.json`
- **Source** — Same shape as press corrections. Same IFCN-compliant trail for the editorial findings auto-curated from pleno transcripts.
- **Surfaces** — `/hallazgos` — collapsible "Bitácora de correcciones" expander on each `FindingDetailCard`.

### Editorial findings as ClaimReview JSON-LD

- **Pipeline** — **published** · `src/components/ClaimReviewJsonLd.jsx`
- **Source** — Every press + pleno finding card embeds a `<script type="application/ld+json">` payload conforming to schema.org/ClaimReview. Two builders: `_buildPayload` (press — itemReviewed.appearance points at outlets) and `_buildPlenoPayload` (pleno — itemReviewed.appearance points at the council session). Severity maps to a 1-5 reviewRating.
- **Surfaces** — `/laboratorio` + `/hallazgos`. Lets Google's Rich Results Test recognise us as a fact-check publisher — same standard the Fact Check Tools API indexes (we both consume + publish).

### CTBG resoluciones (state-level, 10,551 rows, 12 yearly sheets)

- **Pipeline** — `ctbg.ts` → `ctbg.json`
- **Source** — MinHac **CTBG** official XLSX; parser flattens sheets + filters by orthographic variants of Riba-roja/Ribarroja de Túria with Ebro-dam disambiguation
- **Surfaces** — `/quejas` `CtbgCard` — honest "0 matches" surface when nothing hits

### Sindicatura de Comptes CV fiscalización reports (ex-post audit court)

- **Pipeline** — `sindicatura.ts` (+ `sindicatura-findings.ts`) → `sindicatura.json`
- **Source** — **Sindicatura de Comptes CV** `/informes` search (`text=Riba-roja de Túria&type=full`, indexes PDF content). Parser classifies each result row: `dedicated` (TITLE names the town) vs `sectoral` (Riba-roja inside a local-entities sweep, `isLocalEntityReport` filter). The CLI also **pdf-parses** the dedicated "control interno" report into structured findings — the 27 numbered _salvedades_ grouped by area + the 5 recomendaciones (`parseAuditFindings`) — and pulls Riba-roja's **art. 218 rendition row** (En plazo / ACR _acuerdos contrarios a reparos_ / OFP / AI) from the annual control-interno EELL report (`parseControlInternoArt218`, the freshest signal). curl-reachable (unlike PLACSP).
- **Surfaces** — `/quejas` `SindicaturaCard` — the ex-post audit pillar next to Síndic + CTBG; art. 218 status box (freshest), dedicated audits with a "27 deficiencias" expander, sectoral in a collapsible

### Síndic de Greuges CV resoluciones (curated)

- **Pipeline** — **human-curated** · `sindic.ts` schema validator
- **Source** — Added via `npm run sindic:add` after the Síndic publishes a resolución naming Riba-roja; JS-POST portal makes automation brittle at this scale
- **Surfaces** — `/quejas` `SindicCard` with expediente/fecha/materia/sentido/resumen + PDF link

### Quejas ciudadanas (Telegram-captured, SQLite-backed)

- **Pipeline** — **bot-owned** · `bot/src/services/snapshot.ts`
- **Source** — The bot runs on **Fly.io** (`munigraph-ribarroja`, webhook mode) and serves its own snapshot at `/export/quejas.json` behind `EXPORT_TOKEN`; `pull-quejas.yml` fetches it daily at 04:00 UTC. `npm run export` is the local equivalent, writing from whatever SQLite is on the host — useful in development, not the production path. Payload is Open311 GeoReport v2-flavoured; only non-PII fields are published
- **Surfaces** — `/quejas` feed + heatmap · `/quejas/dashboard` analytics · `/quejas/:id` detail view · `/cargos` QuejaBadge

### Queja responses (curated, right-of-reply)

- **Pipeline** — **human-curated** · `apply-queja-response.ts` validator
- **Source** — Added via `npm run queja-reply` after receiving an official reply via the `.github/ISSUE_TEMPLATE/queja-response.yml` form
- **Surfaces** — `/quejas/:id` verbatim response card under the timeline

### Pleno votes (curated, transcribed from actas)

- **Pipeline** — **human-curated** · `pleno-votes.ts` schema validator
- **Source** — Added via `npm run pleno-vote` or the `.github/ISSUE_TEMPLATE/pleno-vote.yml` form ingested by `ingest-pleno-votes.yml`. Each record cites the acta URL + retrieval date; misattribution is a libel risk, so the schema enforces verbatim ≥20 char title + per-bloc tuple with duplicate-bloc detection
- **Withdrawal** — `npm run retract-vote` is the only way out. Two scopes, because the
  two halves of a record do not share a provenance: `--reason/--editor` alone withdraws
  the **whole vote** (it leaves `items[]`, so it stops counting everywhere that reads
  `items`), while `--breakdown` withdraws **only the per-bloc tally** and leaves item,
  outcome and source published. Retractions are tombstoned into `retractions[]` with the
  original content, and `validateSnapshot` then refuses to let that id back into `items[]`
  — `pleno-vote` and `promote-vote` both run it, so a withdrawn vote cannot reappear
  without an explicit signed `--unretract`. Read-side twin: `check:relations`
  → `votes-retractions`
- **Surfaces** — `/plenos` — `PlenoVotesBlock` (empty-state honest when no votes registered).
  A withdrawn breakdown renders `VoteBreakdownRetracted` in the tally's place on
  `/plenos/:id` and `/departamentos/:slug`; a withdrawn record simply is not there
