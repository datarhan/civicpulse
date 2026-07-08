# Wave 4a — obras en curso (municipal infrastructure) — design

**Date:** 2026-07-08 · **Status:** approved design (pending spec review) · **Owner:** Sergei Lutchenko

Wave 4a of the ribarroja.es data-integration program
(`docs/superpowers/specs/2026-07-07-ribarroja-data-integration-design.md`).
The town's own **flagship infrastructure works in progress** — a small,
high-value, DANA-relevant dataset that ties directly to the Wave-1 finding that
Inversiones Reales were only 5% executed. Deterministic, no LLM, no verifier
(deferred).

## Why this wave (recon-confirmed, 2026-07-08)

The transparency cat-5 page ("urbanismo, obras públicas, medioambiente") →
**"Información precisa sobre cada una de las obras más importantes de
infraestructuras que están en curso"** (Item nº 69) is a **server-rendered
listing** of 7 obra fichas (PDFs). Each ficha is a fixed template (Item nº 69)
whose values **do extract** via pdf-parse:

| Obra | Contratista | Licitación | Adjudicación | Inicio |
|---|---|---|---|---|
| Porta del Barranc (flood infra) | LICUAS, S.A. | 925.455,74 € | 668.086,50 € | 25 mar 2019 |
| ampliación Cementerio | BLUEDEC, S.L. | 575.960,00 € | 457.197,05 € | 2 ago 2019 |
| recuperación Torre · 3× Pla Edificant CEIP · rotondas CV-372/CV-336 | … | … | … | … |

**Value:** the town's own priority obras (schools, flood, roads, heritage),
several DANA-relevant, each with contratista + importe de licitación/adjudicación
(→ baja%) + plazo + inicio. Distinct from the raw PLACSP contracts we already
have (a ficha is the *project record*). Every obra name resolves onto the map
via the **existing place-resolver**. NOT covered elsewhere.

Source URL: `ribarroja.es/portal_de_transparencia/5_transparencia_en_materias_de_urbanismo__obras_publicas_y_medioambiente/obras_de_infraestructuras_en_curso/contenidos/2467622/1909893`.

## Decisions

- **Deterministic, no LLM, no verifier corpus** (the verifier tie-in is
  libel-material — deferred to Wave 4.1, same call as Wave 1b).
- **Two surfaces:** an "Obras en curso" section on `/presupuesto` (the Inversiones
  execution tie-in) + "obras en curso" pins on the landing map (via the existing
  place-resolver). No new route.
- Repo shape + TDD: `scripts/scrape-X.ts` (fetch) → `src/scraper/X.ts` (pure
  parser, unit-tested vs committed fixtures) → `public/data/obras.json` →
  `src/hooks/useObras.js` → UI. RED→GREEN→wire.

## Components

- `src/scraper/obras.ts` — **two pure parsers**:
  - `parseObrasList(html) → { nombre, fichaUrl }[]` — the server-rendered listing
    (7 rows; each `<a href=…ficha…pdf>` with a "NN_Ficha obra <name>" title →
    strip the "NN_Ficha obra(s)" prefix for `nombre`).
  - `parseObraFicha(pdfText) → ObraFicha` — pattern extraction from the Item-nº-69
    template. Fields (all optional — an honest null beats a wrong value):
    `{ titulo?, descripcion?, empresa?, plazoMeses?, inicio? (ISO), importeLicitacion?, importeAdjudicacion? }`.
    Extraction rules (deterministic, testable): the **two € amounts** appear in
    fixed template order — first = importe de licitación, second = importe de
    adjudicación — via `parseSpanishAmount`; sanity-gate that adjudicación ≤
    licitación (else treat both as unextracted rather than emit a wrong baja);
    `plazoMeses` from `/(\d+)\s*meses/`; `inicio` from a Spanish long-date
    (`DD de <mes> de YYYY` → ISO); `empresa` from a token ending in a company
    suffix (`S\.A\.|S\.L\.U?\.|S\.C\.|S\.Coop`). Any field whose pattern doesn't
    match → omitted, never guessed.
  - Schema `ObraEnCurso` (the merged public row): `{ id, nombre, fichaUrl, empresa?, plazoMeses?, inicio?, importeLicitacion?, importeAdjudicacion?, bajaPct?, lat?, lng?, placeName?, placeKind? }`. `bajaPct` computed when both importes present (`(lic-adj)/lic*100`, rounded 1dp). `id` = slug of `nombre`.
- `src/scraper/obras-fetch.ts` — node fetcher: `OBRAS_URL`, `fetchObrasHtml()`, `fetchFichaText(url)` (lazy pdf-parse, mirrors `budget-execution-fetch.ts`).
- `scripts/scrape-obras.ts` — CLI: fetch listing → `parseObrasList` → per-ficha `fetchFichaText` + `parseObraFicha` (best-effort per ficha; a bad ficha keeps `{nombre, fichaUrl}` only, never fatal) → **geo-resolve** each `nombre` via `buildGazetteer({streets, pois, …})` + `matchNameToGazetteer(nombre, candidates)` (attach `lat/lng/placeName/placeKind` when matched; the LLM never involved — this is the deterministic name→gazetteer path) → write `public/data/obras.json` = `{ generatedAt, source, obras: ObraEnCurso[] }`. Idempotent.
- `src/hooks/useObras.js` — standard `useJsonFetch` hook.
- **`/presupuesto` "Obras en curso" section** — cards per obra: nombre, importe de adjudicación (`.mono` es-ES), baja% pill, contratista, plazo, inicio, "Ver ficha ↗" link. An intro line tying to the Inversiones-execution figure. Honest empty-state. Reuses `Card`/`Pill`/`SectionHead` + tokens.
- **Landing map "Obras en curso" layer** — a new `src/components/LiveCity/layers/ObrasLayer.jsx` (mirrors `MoneyLayer.jsx`): one `CircleMarker` per obra with `lat/lng`, radius modest/uniform (count is small), click → a popup with the same obra fields. A `LayerControl` toggle ("Obras en curso", off by default). Obras without a resolved point simply don't paint (honest — no fabricated location).

## Feasibility spike (first plan task)

Commit the listing HTML fixture + 2 ficha PDF-text fixtures (Porta del Barranc,
Cementerio). Pin `parseObraFicha` against the real values above
(LICUAS S.A. / 925.455,74 → 668.086,50 / 6 meses / 2019-03-25). If a ficha's
values don't extract cleanly for some obras, the CLI keeps the listing row
(`nombre + fichaUrl`) and omits the missing fields — the section still lists the
obra with a link to the official ficha.

## Analysis refinement + re-runs

- `/presupuesto` gains the flagship-obras layer under the Wave-1 execution
  section. Landing map gains an obras layer.
- **No verifier corpus, no LLM** — no re-runs triggered. `/datos` catalog gains
  one entry (obras.json). `scrape-all.sh` gains one best-effort adapter (runs
  after `scrape:streets` + `scrape:civic-poi` + `scrape:geo` so the gazetteer
  exists).

## Out of scope / deferred (Wave 4.1)

- **Verifier corpus** (claims like "la obra X está terminada") — libel-material,
  deferred with the same discipline as Wave 1b.
- **PGOU / planeamiento** (large static reference PDFs) — low accountability
  value, skip.
- **Per-área concejalía enrichment of `/departamentos`** (audit #10) — separate,
  smaller follow-up.
- **`técnico municipal responsable`** — a named individual; libel-adjacent, and
  not needed for the accountability story. Parsed-but-not-published, or skipped.

## Success criteria

- `scrape:obras` writes `obras.json` (7 obras; those that geo-resolve carry
  `lat/lng`), idempotent; in `scrape-all.sh` best-effort.
- `/presupuesto` renders the obras section (or honest empty-state) without console
  errors; e2e + a11y-strict pass.
- The landing-map obras layer renders resolved obras; a hidden layer never runs.
- Full vitest + lint stay green; no libel-material surface (findings/promises/
  declaraciones/verifier) touched; `técnico` not published.
