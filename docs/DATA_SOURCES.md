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
| `eficiencia-findings.json`                          | `src/scraper/eficiencia-finding.ts` · `npm run promote-indicador`, `correct-indicador`, `retract-indicador`                   |
| `eficiencia-preguntas.json`                         | `src/scraper/eficiencia-preguntas.ts` · curated · hand-edit via PR                                                            |
| `competencias.json`                                 | `src/scraper/competencias.ts` · curated · hand-edit via PR · `npm run competencia-reply` · `check:competencias`               |
| `sociedades.json`                                   | `src/scraper/sociedades.ts` · curated · hand-edit via PR · material vía `npm run scrape:borme`                                |
| `pleno-claim-reclassifications.json`                | `src/scraper/verified-merge.ts` · `npm run reclassify-claim` (sólo ALEJÁNDOSE de `acusacion_publica`)                         |
| `pleno-claim-reanchors.json`                        | `src/scraper/verified-merge.ts` · `npm run reanchor-claim` (sólo sobre citas SIN procedencia, y el literal ha de constar entero en un acta)                         |

Each CLI re-validates the whole snapshot before writing, so an invariant
(≥20-char verbatim quote, ≥10-char title) cannot silently slip. Route
algorithmic output through the CLI, never straight into the file — the schema
validator and the git history are the audit trail.

`competencias.json` is curated for a reason worth stating, because it is the
only file here that puts a living person's name beside a cost figure. It maps
each panel indicator to the delegated portfolio that answers for it, and the
`cargo` strings come from the council's own
[corporación municipal](https://www.ribarroja.es/es/ayuntamiento/corporacion_municipal)
page — the same page `scrape-officials.ts` reads every night. That nightly
scrape is exactly why the map is frozen: derive the name at render time and a
cron could change which person appears on a published page. `check:competencias`
compares the two and goes red instead, with four outcomes — `coincide`,
`reformulado`, `desaparecido`, `oficial-inexistente` — the last two exiting 1.
Each row also declares whether the jump from portfolio to service is `literal`
(the portfolio names the service) or `editorial` (we made the link), and an
editorial row does not publish without its `razon`.

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
- **Surfaces** — `/cargos` "Corporación Municipal" section; Direction D editorial column (`AlcaldeBox` + `CoalitionRing`); `/eficiencia/:id` "Quién responde de esta área" (the portrait only — the NAME on that card comes from the curated `competencias.json`, never from here, and the join key is the signed `oficial` slug). A councillor may ask for their portrait to be withdrawn while keeping the rest of the record: the switch is `fotoRetirada` in `competencias.json`, **not** deleting the mirrored file, because `scrape:officials` re-downloads it nightly. `check:competencias` reports a photo axis with four outcomes — `presente` / `retirada` / `falta` / `enlazada`, the last one catching a failed mirror that left `photoUrl` pointing back at ribarroja.es.

### Municipal budget (9 income + 9 expense chapters + 6 program groups)

- **Pipeline** — `budget.ts` → `budget.json`
- **Source** — MinHac **CONPREL** XLS, sheet "Comunitat Valenciana". Parser tries 2025→2024→2023
- **Surfaces** — `/presupuesto` (KPIs + 3 chapter charts); Direction D KPI strip

### Budget execution (ejecutado vs presupuestado, quarterly)

- **Pipeline** — `budget-execution.ts` → `budget-execution.json`
- **Source** — Ayuntamiento estados de ejecución PDFs (SICALWIN)
- **Surfaces** — `/presupuesto` "Ejecución presupuestaria"

### Coste efectivo de los servicios (art. 116 ter LRSAL)

- **Pipeline** — `coste-efectivo.ts` → `coste-efectivo.json` → `indicadores.ts` →
  `indicadores.json`
- **Source** — Ministerio de Hacienda, CESEL. Two shapes, one row type: the
  national workbook (whole peer universe, one GET, ~45 MB — cached under
  `.cache/`, **never committed**) and the ASP.NET consulta app (the only way to
  reach the other entregas). Sheets CE2 = cost, CE3 = physical units, joined on
  `(Ente, Programa)`.
- **Peers** — `cv-15k-40k`, sized from `parseConprelRoster`. Ten entregas
  (2014–2024) for both the town and the band.
- **Surfaces** — `/eficiencia` (unit cost per service, peer band, own series)
- **Gate** — `check:indicadores`: every published figure resolves back to the
  cell it cites
- **The five traps** that shape the parser — a concession books €0, a zero means
  "I did not declare", a service can have contradictory duplicate rows, not every
  CE3 attribute is a quantity (one is a periodicity CODE), and tonnage is demand
  rather than achievement. See `docs/superpowers/specs/2026-08-12-medicion-eficiencia-design.md`.
- **CE4 (supramunicipal)** — `parseCe4` reads sheets CE4a/CE4b of the same CCAA
  books: which entity declares SERVING this municipality (the Mancomunitat Camp
  de Túria: turismo, ferias, promoción del deporte, ocio). It is the table that
  explains the €0 rows, it exists even for the entrega the council itself did
  not file (2020), and it feeds both the card caveat («sólo la parte
  municipal») and the «Lo que presta…» block on `/eficiencia`.
- **Deflactor** — `ipc.ts` → `ipc.json` (`npm run scrape:ipc`): INE Tempus3
  JSON API, table 24077, annual means of full years only. The series on
  `/eficiencia` render in constant euros of the titling entrega; the peer
  cross-section stays nominal on purpose (same-year comparison). The GDP
  deflator would be the textbook index for public spending; the INE API does
  not serve it as a series, and no reading on the page depends on the choice —
  the module docstring carries the full reasoning.

### Periodo medio de pago (PMP)

- **Pipeline** — `pmp.ts` → `pmp.json`
- **Source** — Ministerio de Hacienda, RD 1040/2017 quarterly returns. 30-day
  legal threshold.
- **Surfaces** — `/gestion` (municipal panel: plazos, concurrencia, ejecución);
  the first signed
  `eficiencia-finding`
- **Cadence** — class `manual` in `snapshot-cadence.ts` (130 days), with the
  refresh command in the stale note. They were deliberately OUT of the check on
  the argument that a short deadline leaves a quarterly source permanently red —
  true, and the answer was a LONG budget, not absence: outside the check,
  `scrape:pmp` silently never being run again was invisible, and PMP feeds a
  signed finding. `coste-efectivo.json` (430d) and `ipc.json` (400d) carry the
  same class.

### Deuda viva del ayuntamiento

- **Pipeline** — `scrape-deuda-viva.ts` → `deuda-viva.ts` → `deuda-viva.json`
- **Source** — Ministerio de Hacienda, CDI, «Deuda Viva de las Entidades
  Locales». One workbook per closed exercise, ~8.100 municipalities each.
- **Surfaces** — `/presupuesto` (series + percentile), `/datos`
- **Cadence** — class `manual` (430 days). Annual delivery published months
  after the exercise closes; deliberately out of `scrape:all` for the same
  reason as `coste-efectivo`: re-downloading 5 workbooks nightly against a
  public administration for data that changes once a year is the opposite of
  the "keep scrapers polite" rule.
- **Traps, both measured** — the ministry does **not** name every delivery the
  same way: 2022–2025 are `-<YYYY>12.xlsx`, 2021 is `-<YYYY>1231.xlsx`. With a
  single pattern the adapter reported 2021 as unpublished while the file was
  there, and the series then began in 2022 — right after the year the debt
  doubled. And matching by NAME finds `Riba-roja d'Ebre` (Tarragona, 43125)
  before Riba-roja de Túria (46214): the join is on the INE code, which the
  workbook carries in two separate columns.
- **What is NOT published** — only the national _distribution_, never the table.
  Naming eight thousand councils would sign a claim about each of them, and they
  have no right of reply here. Same line `/laboratorio/frontera` draws.

### Contratación menor

- **Pipeline** — no adapter of its own: `minorContract` already rides in
  `tenders.json` from ribalicita. `contratos-menores.ts` summarises it.
- **Surfaces** — `/presupuesto`
- **Trap** — the art. 118 ceiling is on the value **excluding tax**. Measured on
  gross amounts, 15 contracts sit above the ceiling; on net amounts, 4. The
  eleven in between are €39.900 net read as €48.279 with 21 % VAT. Publishing
  the gross count would assert the council breaks the law eleven times more
  often than it does.
- **What this does not claim** — the `minorContract` flag comes from the
  contracting portal, not from us. The surface measures the distance to the
  legal ceiling; calling it an infringement is a curator's step, not a
  program's.

### Frontera del gasto (DEA · laboratory experiment)

- **Pipeline** — `lp-simplex.ts` + `dea.ts` + `dea-bootstrap.ts` +
  `dea-especificacion.ts` + `declaracion-congelada.ts` → `compute:dea` →
  `dea.json`
- **Source** — no new fetch: recomposed from `coste-efectivo.json`
- **Surfaces** — `/laboratorio/frontera`, `/metodologia#frontera`
- **Gate** — `check:dea`, which asks two things a unit test cannot: does the
  score still reproduce from source with the published seed, and does the served
  JSON name any municipality other than Riba-roja
- **Why it is not on `/eficiencia`** — every other figure here is a
  transcription or a division of published numbers. A DEA score is this site's
  own model output, and its modelling choices move it. Read the block in
  `CLAUDE.md` under "Legally material surfaces" before touching it.
- **The measurement worth knowing** — across the ten entregas, most physical-unit
  series repeat the same value entrega after entrega while essentially no cost
  series does. That asymmetry, not any θ, is the useful result: a unit cost whose
  denominator is a copy can only rise.

### Coste esperado (OLS · laboratory experiment)

- **Pipeline** — `coste-esperado.ts` → `compute:coste-esperado` →
  `coste-esperado.json`
- **Source** — no new fetch: the cached CCAA-17 books (`.cache/cesel/ccaa/`,
  parsed WITHOUT `soloEntes` — the whole Comunitat, ~500 municipios) plus the
  CONPREL census (`conprel-cv.xls`) for population. Refresh path is manual and
  yearly, same as `coste-efectivo.json`; `snapshot-cadence` carries it in the
  `manual` class (430d) and it is deliberately NOT recomposed nightly — the
  inputs only change with the annual entrega, and a nightly recompute would
  churn a 300 KB file's `generatedAt` for nothing.
- **Surfaces** — `/laboratorio/coste-esperado`, `/metodologia#coste-esperado`
- **Gate** — `check:coste-esperado` (critical in the nightly): reproduces the
  OLS exactly from the anonymous sample published in the snapshot (analytic
  prediction intervals — no seed, no resampling), re-runs the whole analysis
  against the cached book when present (and SAYS so when it cannot), and scans
  the served JSON for any municipality other than Riba-roja against the
  542-name CONPREL census.
- **Cleaning** — the panel's own rules applied unchanged: direct management
  only (regla 4), duplicated cost rows exclude the municipality (regla 1), and
  declarations beyond ±`ATIPICO_FACTOR` of the service's median €/inhabitant
  are excluded as implausible (regla 7 — the real book carries councils
  declaring 1 € of schools cost). The cost+units row pair some programs
  publish per municipality is NOT a duplicate; duplication is judged among
  cost-bearing rows only.

### Incendios forestales (landing map layer)

- **Pipeline** — `incendios.ts` → `scrape:incendios` → `incendios.json`
  (attributes, centroid, bbox) + `incendios-perimetros.json` (rings only). Two
  files because `/datos` calls the hook purely to read `stats` and must not
  pull the geometry to render a row count.
- **Source** — MapServer of the Institut Cartogràfic Valencià (GVA),
  `tm_medio_ambiente/prevencion_de_incendios`, CC BY 4.0. One layer per year;
  the CLI **discovers** them instead of carrying a list, so a new year is
  picked up rather than silently missed. Queried with the municipal boundary
  from `geo.json` as the query geometry — the server does the intersect, so
  there is no turf.js and no client-side point-in-polygon.
- **Surfaces** — `/` (StylizedMap «Incendios forestales» layer), `/datos`
- **Gotchas** — four, all measured:
  1. **Never filter by `nom_mun`.** The source files the same town as
     «Riba-roja de Túria» and «RIBA-ROJA DEL TÚRIA»; a `LIKE '%Riba-roja%'`
     sweep returns **zero for 2019** and looks healthy. Matching goes through
     `RIBA_ROJA_ALIASES`.
  2. **`outFields=*`, never a field list.** The schema changes between layers —
     `detecp_txt` does not exist before ~2010 — and ArcGIS answers 400 «Failed
     to execute query» to an unknown field name instead of ignoring it. The
     explicit list took down half the series with an error that looked
     intermittent and was deterministic.
  3. **A 200 can carry an error envelope.** `{"error":{"code":400}}` in the
     body is not «zero fires»; the CLI rejects it, retries, and never caches
     it. Each layer is also counted twice — a `returnCountOnly` probe against
     the download — because a run has to prove it did work.
  4. **Attribution and cartography disagree.** `1994VL0267` (128 ha, the
     largest in the series) is filed under Riba-roja and drawn 5 km outside the
     boundary. It ships with `intersecta: false`: counted in `universe`, never
     painted. `sup_f` is always the WHOLE fire's area, never clipped.
     Cadence `manual` 400d — the ICV publishes annually, a year-plus behind.

### Criminalidad municipal (outcome beside the police cost card)

- **Pipeline** — `criminalidad.ts` → `scrape:criminalidad` →
  `criminalidad.json`; `compute:indicadores` embeds the validated copy as a
  `resultados` item (never divided by cost — the three rules live in
  `resultados.ts`).
- **Source** — Portal Estadístico de Criminalidad (Ministerio del Interior),
  deterministic Jaxi CSV per T4 balance; rate uses same-year population (INE
  DPOP). Ley 37/2007; attribution «Origen de los datos: Portal Estadístico de
  Criminalidad» travels in the snapshot and the card.
- **Surfaces** — `/eficiencia` (police card result block), `/datos`
- **Gotchas** — era joins are BY NORMALIZED NAME (INE-keyed joins silently
  dropped 2020–2022); T4 = full year; each file also carries the prior year.
  Cadence `manual` 420d.

### Recogida selectiva 2022 (single-edition outcome, waste card)

- **Pipeline** — `reciclaje.ts` → `scrape:reciclaje` → `reciclaje.json`;
  `compute:indicadores` embeds it as the `resultados` item
  `reciclaje-selectiva-2022` (FORS-arranque caveat is mandatory).
- **Source** — ICV/GVA WFS layer `0503_Residuos`
  (`ms:TasasGeneracion.Municipios_wfs`), CC BY 4.0, all fractions for 542
  municipios. ONE machine-readable edition: later years live only in a Power
  BI viewer, and that ABSENCE stays published on `/eficiencia`.
- **Edition proof** — the layer does not state its year; it was established by
  MEASUREMENT (file's habitantes for Riba-roja = INE padrón 2022 = 23.050),
  and the scraper fails if that equality breaks rather than publishing «2022»
  over some other year.
- **Gotchas** — decimal POINT (en-US), verified via kg/hab = tn·1000/hab; an
  empty fraction is null, never zero; the WKT geometry is discarded (and
  stubbed in the fixture). Peer band = coste-efectivo band ∩ usable rate, own
  n declared. Cadence `manual` 800d — the long budget is the re-check-upstream
  reminder, not a refresh promise.

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

### Mapa base de los cuatro mapas (no snapshot — teselas en vivo)

- **Pipeline** — _(ninguno — teselas ráster)_ · la URL y la clave viven en `src/lib/basemap.js`, en un solo sitio
- **Source** — **CARTO Voyager** (`basemaps.cartocdn.com/rastertiles/voyager`), cartografía derivada de **OpenStreetMap** (ODbL). Capa gratuita de CARTO para uso no comercial: 5M teselas/mes, clave en `VITE_CARTO_API_KEY`
- **Surfaces** — los cuatro mapas Leaflet: portada (`StylizedMap`), `/quejas` (`QuejasHeatmap`), `/presupuesto` (`GastoMap`), `/empleo` (`EmpleoMap`)
- **Atribución** — obligatoria por partida doble (la capa gratuita de CARTO la exige por escrito; la ODbL de OSM la exige igual) y se sirve desde `BASEMAP_ATTRIBUTION`. La portada usa su propia línea de crédito; los otros tres, el control de Leaflet sin prefijo
- **Trampa medida (3-sep-2026)** — sin clave, CARTO NO falla: devuelve `200 image/png` con «API KEY REQUIRED» estampado en diagonal. Y una clave **inválida** devuelve esa misma tesela **byte a byte** —sin 401 ni 403— así que un secreto sin poner en Vercel, una clave revocada o la cuota agotada son indistinguibles de acertar por HTTP. Lo mira `npm run check:basemap`, comparando la tesela con clave contra la de sin clave; entra en el parte nocturno, no en el pre-commit

### Flood-risk zones (no snapshot — live WMS)

- **Pipeline** — _(none — WMS overlay)_
- **Source** — **PATRICOVA** WMS · Generalitat Valenciana / ICV `carto.icv.gva.es/…/WMSServer`, capa «Riesgo de Inundación» (EPSG:3857). El número de capa vive en `src/lib/patricova.js` y **se mueve**: el ICV republicó el servicio y pasó de la 59 a la 60, con el mapa pidiendo la vieja sin que nada lo dijera —un WMS al que se le pide una capa que no existe responde `200 image/png` con la imagen en blanco. Lo vigila `npm run check:wms`, que busca por TÍTULO y nombra el id nuevo
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

### Provenance of every published verbatim (which transcript, and what the gate says)

- **Pipeline** — **derived** · `compute-finding-quote-provenance.ts` → `src/scraper/quote-provenance.ts` (+ `quote-contrast.ts`) → `finding-quote-provenance.json` → `useFindingQuoteProvenance.js`
- **Source** — `pleno-findings.json` × the transcript corpus (`pleno-transcripts/` and `pleno-transcripts/superseded/`). Three states per quote, keyed by finding id + quote index: `en-vigente` (matches the current transcript), `solo-en-sustituida` (matches only the pre-re-transcription text, and the current file is not smaller — so the absence is degraded ASR, not missing coverage), `sin-determinar` (cannot tell: no current transcript, or the current one is SHORTER than the one it replaced). A quote in **neither** transcript gets no label at all — the pass refuses to write, because that is the fabrication question and `check:finding-quotes` owns it.
- **Why derived, not curated** — the status is a fact about two files on disk. Writing it into `pleno-findings.json` would need dozens of curated corrections for something no human judged. Nothing here writes the findings snapshot; the only writer stays `npm run correct-pleno-finding`.
- **Matcher** — one, shared: `src/scraper/quote-match.ts`. And one classifier: `check:finding-quotes` re-derives through the same `classifyQuoteProvenance` and **exits 1 when the committed snapshot disagrees**, so a marker on the page cannot go stale silently. `check:relations` carries `findings-quote-provenance` so the count stays visible in the routine report.
- **Second axis, same file** — `gate` per quote: what `src/scraper/claim-public-gate.ts` would do with the claim behind the verbatim, in the gate's own `shown`/`toggle`/`hidden` vocabulary. The gate governs `/plenos`; `/hallazgos` never consulted it, and it would hide a large share of what that page quotes — every hidden one an `acusacion_publica` the verifier could not ground. Read from `mergeVerified(pleno-claims-verified-base.json, pleno-claims-overlay.json)` through `scripts/lib/verified-corpus.ts`: **the base alone gives the opposite answer** for most quotes, so the pass counts how many were decided on an overlay verdict and refuses to write when the overlay had entries and reached none of them. Nothing re-derives a verdict; `classifyClaimVisibility` decides and this records.
- **Re-anchoring** — `npm run triage:quote-reanchor` → `editorial/quote-reanchor-queue.json` (gitignored, never under `public/`), surfaced in `/curator`. It **proposes passages and selects none**; a curator applies the change with `npm run correct-pleno-finding -- <id> --field quote.<i>.text`.
- **The gate's exception** — `npm run triage:finding-exception` → `editorial/finding-exception-queue.json` (gitignored, never under `public/`), surfaced in `/curator`. One row per finding with no quote the gate would show, asking the gate's own question: does this finding earn the exception the gate reserves for a person? It **presents evidence and selects nothing** (`decision` is always `null`); a curator applies `npm run correct-pleno-finding`. `check:relations` carries `findings-quote-contrast`, which re-derives every quote's gate verdict from the live verifier output and reds when the published mark stops matching.
- **Surfaces** — `/hallazgos` and `/plenos/:id` (per-quote chips + per-card note, shared `QuoteProvenanceMark`/`QuoteProvenanceNote` in `PlenoFindings.jsx`; a quote can carry one mark from each axis and renders both), and the published editorial contract at `/metodologia#citas-transcripcion` and `/metodologia#citas-contraste`.

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

### Síndic de Greuges CV — índice de expedientes (scraped)

- **Pipeline** — `scripts/scrape-sindic-expedientes.ts` → `src/scraper/sindic-expedientes.ts` → `sindic-expedientes.json`
- **Source** — `POST https://www.elsindic.com/wp-admin/admin-ajax.php?action=buscador_expedientes_elastic_search`, el buscador Elasticsearch de `/actuaciones/`. Un solo campo `params` con JSON; devuelve HTML. El `robots.txt` del organismo lo permite explícitamente (`Allow: /wp-admin/admin-ajax.php`). **Dos ejes que NO se suman**: texto `"Riba-roja"` (todo lo que menciona el municipio) y facet `poblacion` (expedientes cuyo QUEJOSO vive aquí — **no** la administración reclamada: de sus 16 filas una va contra el Ayuntamiento de València). La puerta es el campo `Administración`, y reparte en «contra el Ayuntamiento» / «vecinos ante otras administraciones» / menciones descartadas. Materia, asunto y el título de cada resolución se transcriben **verbatim**: el vocabulario del Síndic (20 materias) no se recodifica al nuestro (15), porque «Servicios públicos y medio ambiente» es una suya y dos nuestras y el resto acabaría en `otros`. Se raspa en blando en la nocturna y en firme en `scrape-ci-blocked.sh` — la accesibilidad desde un runner de GitHub está sin medir
- **Surfaces** — `/quejas` `SindicCard` (las dos listas, separadas y con su nota de cobertura) · `/datos` · `/lab-health`

### Síndic de Greuges CV resoluciones (curated)

- **Pipeline** — **human-curated** · `sindic.ts` schema validator
- **Source** — Added via `npm run sindic:add` after a curator READS the resolución PDF. La división con el índice de arriba es la que importa: aquél transcribe un registro público sin emitir juicio y puede ser automático; una ficha de aquí lleva el `resumen` **verbatim** y un `sentido` que alguien ha decidido, y eso no lo escribe un cron. El `id` se **deriva** del expediente + el documento del PDF (`idResolucion`) y el validador comprueba la derivación: `sindic-<expediente>` colisionaba entre las dos resoluciones de un mismo expediente
- **Surfaces** — `/quejas` `SindicCard`, contadas aparte de los expedientes del índice para que un 0 firmado nunca se lea como «no hay nada»

### Quejas ciudadanas (Telegram-captured, SQLite-backed)

- **Pipeline** — **bot-owned** · `bot/src/services/snapshot.ts`
- **Source** — The bot runs on **Fly.io** (`munigraph-ribarroja`, webhook mode) and serves its own snapshot at `/export/quejas.json` behind `EXPORT_TOKEN`; `pull-quejas.yml` fetches it daily at 04:00 UTC. `npm run export` is the local equivalent, writing from whatever SQLite is on the host — useful in development, not the production path. Payload is Open311 GeoReport v2-flavoured; only non-PII fields are published
- **Surfaces** — `/quejas` feed + heatmap · `/quejas/dashboard` analytics · `/quejas/:id` detail view · `/cargos` QuejaBadge

### Queja responses (curated, right-of-reply)

- **Pipeline** — **human-curated** · `apply-queja-response.ts` validator
- **Source** — Added via `npm run queja-reply` after receiving an official reply via the `.github/ISSUE_TEMPLATE/queja-response.yml` form
- **Surfaces** — `/quejas/:id` verbatim response card under the timeline

### Sociedades mercantiles (BORME · fichas societarias de adjudicatarias)

- **Pipeline** — `borme.ts` (parser puro) + `borme-fetch.ts` → `.cache/borme/`
  → **curado a mano** en `sociedades.json`, validado por `sociedades.ts`
- **Source** — **API de datos abiertos del BOE**, que sí sirve BORME:

  ```
  GET boe.es/datosabiertos/api/borme/sumario/YYYYMMDD
    → data.sumario.diario[].seccion[codigo=A].item[]   (una por provincia)
    → item.url_html  →  boe.es/diario_borme/txt.php?id=BORME-A-…
  ```

  Esto **deroga una limitación declarada**: la skill `biografia-concejal` decía
  que no había camino («buscar/borme.php 404, libreborme tras Cloudflare»), y
  llevaba tiempo sin ser cierto. Una limitación caduca hace que nadie vuelva a
  intentarlo, que es el peor efecto posible de documentar un muro.

- **NO es un adaptador nocturno.** `npm run scrape:borme --desde --hasta
--provincia --empresa` es una herramienta de reportaje: escribe a `.cache/`,
  nunca a `public/data/`, y no entra en `scrape-all.sh`. Un barrido de BORME
  cada noche contra el BOE sería justo lo contrario de la regla de scrapers
  educados.
- **Cada dato lleva su cita literal del anuncio y su URL**; el validador exige
  `cita` de ≥25 caracteres y un bloque `limites` no vacío. Los agregadores
  (axesor, einforma, infoempresa) sirven para orientar la búsqueda y **no se
  citan jamás**: una paráfrasis del resumen de un modelo se coló como cita y la
  cazó `revisar-borrador`, no una comprobación.
- **Dos gramáticas que costaron datos**: el sumario **colapsa a objeto** las
  colecciones de un solo elemento (tiró dos días de barrido con «object is not
  iterable»), y tres variantes de «Datos registrales» devolvían **null en
  silencio** — prefijo tomo/folio, punto suelto, inscripción con letra— dejando
  3 de 20 anuncios sin identificador citable. El test que las caza recorre
  **todos** los anuncios y exige que ninguno quede sin leer.
- **Surfaces** — ficha societaria en `/reportajes/coste-efectivo`

### Pleno votes (curated, one citation per claim)

- **Pipeline** — **human-curated** · `pleno-votes.ts` schema validator
- **Source** — Added via `npm run pleno-vote` or the `.github/ISSUE_TEMPLATE/pleno-vote.yml` form ingested by `ingest-pleno-votes.yml`. Misattribution is a libel risk, so the schema enforces a verbatim ≥20 char title + per-bloc tuples with duplicate-bloc detection
- **Provenance is per claim, not per row.** A vote asserts two facts with two
  different sources, and `provenance.outcome` / `provenance.breakdown` cite them
  separately. `VOTE_SOURCE_KINDS` records what each kind of source actually
  publishes, and `BREAKDOWN_SOURCE_KINDS` is derived from it: regmeet publishes
  the orden del día and the result and **no per-bloc tally**, so the validator
  refuses a breakdown attributed to it. Until 2026-08-05 every row carried one
  `sourceUrl`, on all 17 of them regmeet, while the tallies came off an uncited
  Whisper transcript — `check:citations` could not see it because the URL
  resolves, it just does not carry half the claim. Read-side twins:
  `check:relations` → `votes-breakdown-source` (error) and
  `votes-breakdown-verified` (warn, currently red for every unverified row).
  One-shot migration: `scripts/migrate-vote-provenance.ts`
- **«verificado» means cotejado against an INDEPENDENT document.** A ref marked
  `verificado` must carry a verbatim quote, a curator signature and
  `verifiedAgainst` — the citation it was checked against — and
  `isIndependentVerificationSource` refuses a same-kind document whatever its
  URL (two Whisper runs share the failure mode they claim to rule out) and
  anything derived from the source under check. It ACCEPTS the session video
  over a transcript-derived tally: the error being checked is the transcription
  step and the video is upstream of it. The surfaces name the document actually
  consulted, never «el acta» by default. Until 2026-08-09 the gate asked only
  for a quote ≥20 chars and a name, so quoting the transcript a tally was read
  off passed as a verification of it. `isIndependentlyVerified` is the one
  predicate the validator, `check:relations`, `/datos` and `VoteProvenance` all
  read — none of them re-expresses the rule.
- **Nothing here has ever been cotejado, and the acta is unreachable.** All 16
  published breakdowns and all 17 outcomes are `sin-verificar`.
  `scripts/fetch-pleno-actas.ts` has four independent breakages against the
  Aug-2026 portal (reads a `link` that points at regmeet since 2026-05-25;
  extracts retired Drupal markup; plain `http://`; no npm script runs it), zero
  actas are cached, and every transcript on disk is Whisper output. Messages
  about this state must say _unreachable_, not _unread_
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
  `/plenos/:id` and `/departamentos/:slug`; a withdrawn record simply is not there.
  `VoteProvenance` names both sources under every vote on those two pages —
  `/departamentos/:slug` used to show one link labelled «Acta oficial» pointing
  at regmeet, and `/plenos/:id` showed none at all. Each provenance row's
  caveat comes from `VOTE_SOURCE_KINDS[kind].unverifiedNote`, which is null for
  `acta` and `regmeet` (the document states the claim in the council's own
  words) — before 2026-08-09 one hard-coded «sin cotejar con el acta» was
  printed under both rows, so every vote carried the acta caveat twice and the
  one under the outcome was false. `/datos` states the uncotejado count WITH its
  denominator («N de M desgloses»), so it cannot be read against the row count
