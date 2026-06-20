# Design — Interactive "where the money goes" map for `/presupuesto`

**Date:** 2026-06-20
**Status:** approved (design), pending implementation plan
**Surface:** `/presupuesto`
**Sensitivity:** medium — it makes geographic claims about public spending, so the
honesty contract below is load-bearing, in the same spirit as `/promesas` and the
"no synthetic data / no fake scores" rule in `CLAUDE.md`.

---

## 1. Problem & intent

A citizen looking at `/presupuesto` today sees bar charts of budget chapters and a
list of recent contracts. They cannot answer the question they actually care about:
**"what was built in *my* urbanization, and what did it cost?"**

The goal is an interactive municipal map that makes *located* public spending legible
to any resident — which zones/urbanizations received money and what works were done —
without ever implying we know the geography of money that has no location in the data.

## 2. The honesty contract (non-negotiable)

This feature can easily become exactly the kind of fabricated visualization the project
forbids. These invariants are load-bearing and must be enforced in code + reflected in
`/metodologia`:

1. **Budget totals are never mapped.** `budget.json` is classified by economic chapter
   and program — it has no spatial dimension. The existing budget bar charts stay as-is.
   Only *contracts* (awarded + in-execution physical works/services with a usable amount)
   are eligible for the map.
2. **A contract is placed on the map only when its `title` contains a zone-specific
   alias** — a real place/urbanization/landmark name unique to one of the 21 OSM zones.
   Generic words ("calle", "parque", "obras") never, on their own, assign a zone.
3. **The coverage meter compares like-for-like.** Numerator = Σ amount of located
   contracts (deduped by contract `id`); denominator = Σ amount over the same universe
   (contracts with `amount > 0`). The ratio is therefore always ≤ 100%. The meter
   prominently shows the *unplaced* remainder and states plainly that the rest
   (salaries, services, supplies) has no single location and is **not** guessed at.
4. **Every placement is auditable.** Each assignment stores the exact substring that
   triggered it (`matchedAlias`), surfaced in the zone drill-down ("situado por:
   'Monte Alcedo'").
5. **Multi-zone contracts** (e.g. "…Monte Alcedo y Valencia la Vella") appear in *both*
   zones on the map but are counted **once** in the coverage total. Per-zone sums are
   therefore non-additive — this is stated in the UI microcopy and the spec.
6. **No fabricated amounts.** The drill-down shows each contract's real
   `finalAmount`; when only `initialAmount` exists the row is labelled "en ejecución /
   importe de licitación". No per-line amount is ever invented.

## 3. Scope

**In scope (v1):**
- A new `GastoDashboard` section on `/presupuesto` (layout "B": map hero + reactive side
  panel + tabbed extras), built from a new build-time enrichment file.
- Build-time geo-matching of contracts → zones (`public/data/tender-geo.json`).
- Components: interactive map, coverage meter, per-zone drill-down, time slider,
  searchable contracts explorer, contractor leaderboard, spending-type breakdown.
- DANA flood-recovery (Oct-2024) as a first-class filter/highlight.

**Out of scope (documented future work):**
- Scraping PLACSP "lugar de ejecución" per contract — **verified 2026-06-20 to not be
  published** (no such field in the detalle HTML, even for obras), so not a viable source.
- Mapping *open tenders* (`tenders[]`, the 478 licitaciones) as a "money to come" layer.
- Geocoding BDNS subsidies (descriptions rarely name a zone).
- Polygon choropleth (geo.json has only centroids, no per-zone polygons).
- Street-level pins (no per-street coordinates in the feed). The most promising v2
  coverage boost (better than PLACSP): geocode street names found in titles (`c/`, senda,
  glorieta, CV-roads) via OSM Nominatim → point-in-zone — deferred for the build-time
  network dependency + false-precision risk on partial street names.

## 4. Data feasibility (measured 2026-06-20)

- 811 contracts; only the `title` free-text can carry a location.
- ~55 contracts name a known urbanization outright; the curated alias table (below) will
  raise this modestly by catching landmarks (CEIP Mas d'Escoto, Senda/Paseo Molinet,
  pedanía El Oliveral, etc.).
- **DANA recovery: 77 contracts · €3.41 M** — a large, highly-locatable cluster.
- Per-zone real sums (illustrative): Molinet €790k, Valencia la Vella €603k, Monte Alcedo
  €536k, La Reva €534k, l'Oliveral €532k, Mas d'Escoto €360k.
- `contractType`: construction 196 / services 381 / supplies 157 / other 24. Located works
  are overwhelmingly `construction`.
- `awardDate` range 2017→2026; some are null.
- **Source location check (verified 2026-06-20):** the Gobierto `contratos` feed exposes
  29 columns, **none geographic**; the PLACSP detalle pages behind each `permalink` carry
  **no "Lugar de ejecución"/NUTS/municipio** field — verified on a *service* and a
  *construction* contract; the only matching text was the echoed title — and the endpoint
  fails TLS verification from CI anyway. TED notices only carry NUTS `ES523` (València
  province). The contract **title is therefore the only sub-municipal signal that exists**;
  title-matching is the honest floor, not a shortcut.

## 5. Architecture

Follows the repo's established pipeline (`scripts/* → src/scraper/* (pure) →
public/data/*.json → src/hooks/useX → UI`) and the *derived-step* precedent of
`scripts/compute-dept-stats.ts` + `src/lib/department-stats.js`.

```
scripts/compute-tender-geo.ts   (no network; reads tenders.json + geo.json)
   → src/scraper/tender-geo.ts   (pure: matchContractsToZones, ZONE_ALIASES, aggregates)
   → public/data/tender-geo.json
   → src/hooks/useTenderGeo.js   (fetch) + src/lib/tender-geo.js (pure client helpers)
   → src/components/Presupuesto/* (dashboard B)
```

**Why build-time, not client-side:** matching is a deterministic transform that must be
unit-tested against fixtures (TDD cadence), kept out of every browser, and auditable in
git — exactly how `compute-dept-stats` works. The alias table is curator-maintained
source in `tender-geo.ts`.

**`scrape:all` wiring:** add `compute:tender-geo` to `scripts/scrape-all.sh` **after**
`scrape:tenders` and `scrape:geo` (it depends on both fresh snapshots). It is
deterministic/local → classed as a normal (not best-effort) step.

## 6. Data model — `public/data/tender-geo.json`

`tender-geo.json` holds the **mapping + aggregates only**; contract details
(title/status/permalink) stay sourced from `tenders.json` and are joined client-side by
`id`. This avoids duplicating the contracts corpus and keeps amounts single-sourced.

```jsonc
{
  "generatedAt": "ISO",
  "source": { "tenders": "<tenders.generatedAt>", "geo": "<geo.generatedAt>" },
  "universe": {
    "totalContracts": 0, "totalAmount": 0,        // universe = contracts with amount>0
    "locatedContracts": 0, "locatedAmount": 0,    // deduped by id  (≤ total*)
    "danaContracts": 0, "danaAmount": 0,
    "dateMin": "ISO|null", "dateMax": "ISO|null"  // over located contracts (for slider)
  },
  "zones": [                                       // one per OSM zone WITH ≥1 placement
    { "slug": "...", "name": "...", "centroid": [lat,lng],
      "contractCount": 0, "amount": 0, "danaAmount": 0 }
  ],
  "assignments": [                                 // one per located contract
    { "id": "auto-...", "zones": ["monte-alcedo","valencia-la-vella"],
      "matchedAlias": { "monte-alcedo": "Monte Alcedo", "valencia-la-vella": "Valencia La Vella" },
      "dana": true, "amount": 536334, "amountKind": "final"|"initial",
      "date": "ISO|null", "contractType": "construction", "categoryTitle": "construction" }
  ]
}
```

\* `locatedAmount ≤ totalAmount` always (each contract counted once); `Σ zones[].amount`
may exceed `locatedAmount` because multi-zone contracts are in each zone.

The slider recomputes per-zone amounts at time *T* client-side from `assignments`
(cumulative: `date ≤ T`), so the file needs no per-time precomputation.

## 7. Matching algorithm (`src/scraper/tender-geo.ts`)

- `ZONE_ALIASES: Record<zoneSlug, string[]>` — curated, diacritics-folded, **specific**
  aliases per zone. Prefer multi-word, unambiguous names ("monte alcedo", "valencia la
  vella", "mas d'escoto", "senda molinet", "polígon industrial l'oliveral") over bare
  tokens. Seeded from the 21 OSM `geo.json` names + curated landmarks; documented as
  curator-maintained.
- `matchContractsToZones(contracts, zones)`:
  1. Restrict to universe = contracts with `amount = finalAmount ?? initialAmount > 0`.
  2. Fold + lowercase the title (reuse `src/scraper/normalize.ts`).
  3. For each zone, test its aliases (longest-first to avoid substring collisions, e.g.
     "poio de reva" vs "la reva"); on hit, record zone + the matched alias.
  4. `dana = /\bdana\b|temporal de lluvias|29 de octubre/` on the folded title.
  5. Emit `assignments`, per-`zones` aggregates, and `universe` totals (deduped).
- All placements are "strong" confidence in v1 — no generic/weak placement. False-positive
  guard: aliases are zone-specific; `matchedAlias` is persisted for human audit.
- Deterministic + pure; `fetch`/`fs` live only in the CLI wrapper.

## 8. UI — `src/components/Presupuesto/` (dashboard B)

Page order in `Presupuesto.jsx`: `RealBudgetHeader` (KPIs + title) → **`GastoDashboard`
(new hero)** → existing chapter/income bar charts (context, moved below) →
`RealSubsidies`. The old `RealContracts` "top 8" list is **removed** — the Explorar tab
supersedes it (default sort = most recent).

- **`GastoDashboard.jsx`** — container. Owns shared state: `selectedZone`, `sliderDate`,
  `danaOnly`, `activeTab`. Lays out map (≈62%) + side panel (≈38%) + slider + tabs.
  Collapses to a single column at ≤768px (map → panel → tabs).
- **`GastoMap.jsx`** — react-leaflet, reusing the `QuejasHeatmap` pattern (CartoDB Voyager
  tiles, dashed boundary polyline, `ResizeOnMount`). One `Circle` per zone, `radius ∝
  √(amount at sliderDate)`, color civic-blue / DANA-amber, click → `setSelectedZone`,
  tooltip = name + € + count. Honors `danaOnly` and `sliderDate`.
- **`CoverageMeter.jsx`** — default side-panel state: the two-segment honesty bar
  (located vs unplaced) + plain-language sentence + the top-zones ranking.
- **`ZoneDrilldown.jsx`** — selected-zone state: total € + work count + list of its works
  (join `assignments` → `useTenders` by `id`: title, date, status pill, contractType,
  `matchedAlias` audit line, PLACSP link). Back/clear control.
- **`TimeSlider.jsx`** — native `<input type=range>` over `[dateMin, dateMax]` + play/pause
  (rAF stepping). DANA marker at 2024-10. Respects `prefers-reduced-motion` (no autoplay).
- **`ContractsExplorer.jsx`** (Explorar tab) — filterable list over `useTenders.contracts`:
  free-text, zone (from `assignments`), `categoryTitle`, year, DANA, `contractType`.
- **`ContractorLeaderboard.jsx`** (¿Quién recibe el dinero? tab) — `useMemo` aggregation of
  `contracts` by `assignee` (Σ amount, count), top 15, each expandable to its contracts.
- **`SpendingTypeBreakdown.jsx`** (Tipos de gasto tab) — `Donut`/`BudgetBars` from
  `Charts.jsx` by `contractType` + the DANA share, framing the located map against total
  contracting volume.

**Hook + lib:** `src/hooks/useTenderGeo.js` (fetch loading/error/data) +
`src/lib/tender-geo.js` (pure, unit-tested helpers: `zoneAmountAt(assignments, slug,
date)`, `topContractors(contracts)`, `filterContracts(...)`).

## 9. i18n & a11y

- **i18n:** new *chrome* strings (section titles, tab labels, meter copy, legend,
  "¿Qué se hizo en tu urbanización?") added to `src/i18n.jsx` for `es` + `ca`. Data
  content (contract titles, zone names) stays in its source language (verbatim accuracy).
- **a11y (presupuesto is in e2e `STRICT_ROUTES` → must pass axe):** map gets
  `role="region"` + `aria-label`; the side-panel zone ranking is the text equivalent of
  the decorative circles; slider has `aria-label` + `aria-valuetext` (the date); tabs use
  `tablist`/`tab`/`tabpanel` + keyboard nav. Color is never the only signal (DANA rows
  also carry a text tag).

## 10. Testing (RED → GREEN → wire)

1. **RED:** `tests/fixtures/tenders_geo_sample.json` — contracts with known place names,
   a multi-zone one, a DANA one, and unplaceable ones; reuse/add a geo fixture. Vitest pins
   `matchContractsToZones`: correct zone + `matchedAlias`, DANA flag, multi-zone in both,
   no false positives, `locatedAmount ≤ totalAmount`, deduped coverage.
2. **GREEN:** implement `src/scraper/tender-geo.ts`.
3. **Wire:** `scripts/compute-tender-geo.ts` + `npm run compute:tender-geo` + generated
   `public/data/tender-geo.json` + `useTenderGeo` + `src/lib/tender-geo.js` (+ its unit
   tests) + components + `scrape-all.sh` ordering.
4. **e2e:** extend `tests/e2e/presupuesto.spec.ts` — map present, coverage-meter text,
   tab switch, zone click → drill-down; keep axe strict-pass. `tsc --noEmit` + lint clean.

## 11. Edge cases

- **No located contracts** → map hidden, honest empty state ("Aún no hay obras situables").
- **Null date** → excluded from slider timeline; still in all-time totals, flagged "sin fecha".
- **finalAmount null** → use `initialAmount`, labelled "en ejecución".
- **Dark mode** → CartoDB Voyager tiles + token-driven circle colors verified for contrast.
- **Mobile 375px** → single-column collapse (covered by the mobile e2e shell).

## 12. File checklist

New: `scripts/compute-tender-geo.ts`, `src/scraper/tender-geo.ts`,
`public/data/tender-geo.json`, `src/hooks/useTenderGeo.js`, `src/lib/tender-geo.js`,
`src/components/Presupuesto/{GastoDashboard,GastoMap,CoverageMeter,ZoneDrilldown,TimeSlider,ContractsExplorer,ContractorLeaderboard,SpendingTypeBreakdown}.jsx`,
`tests/fixtures/tenders_geo_sample.json`, `src/scraper/__tests__/tender-geo.test.ts`,
`src/lib/__tests__/tender-geo.test.js`.
Edit: `src/pages/Presupuesto.jsx` (insert dashboard, remove `RealContracts`, move charts),
`package.json` (script), `scripts/scrape-all.sh` (ordering), `src/i18n.jsx`,
`tests/e2e/presupuesto.spec.ts`, `CLAUDE.md` (new scraper/hook/source rows),
`src/pages/Metodologia.jsx` (honesty contract).
