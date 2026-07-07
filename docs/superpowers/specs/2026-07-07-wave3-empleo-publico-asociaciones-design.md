# Wave 3 — municipal hiring + associations registry — design

**Date:** 2026-07-07 · **Status:** approved design (pending spec review) · **Owner:** Sergei Lutchenko

Wave 3 of the ribarroja.es data-integration program
(`docs/superpowers/specs/2026-07-07-ribarroja-data-integration-design.md`).
Two genuinely-new, **verified-feasible** municipal sources — both server-rendered
HTML / static PDF (no portal/AJAX risk, unlike Wave 2's edictos board).

## Why this wave (recon-confirmed feasibility)

- **Procesos selectivos** (`ribarroja.es/es/noticia/publicaciones-procesos-selectivos`)
  — server-rendered HTML (0 JS-app markers, 103 KB), a list of ~18 municipal
  hiring processes (oposiciones, bolsas de trabajo, estabilización Ley 20/21,
  policía), each linking to a detail page / PDFs (bases, listas, tribunales,
  results). **Distinct from `/empleo`** (that's the ADL brokering *external*
  jobs; this is the town hiring its *own* staff — public-employment / nepotism-
  watch transparency).
- **Registro Municipal de Asociaciones** — a direct static PDF
  (`…/20260528…Registro Asociaciones Web.pdf`, dated 2026-05-28) — the municipal
  register of civic/neighbourhood associations. **Dual-purpose:** a civil-society
  data map AND the named-local-partner outreach list that directly serves the
  nonprofit-watchdog strategy ([[strategy-nonprofit-watchdog]]).

## Decisions

- **Deterministic, no LLM.** Both are plain parse-and-list; no libel-material
  surface is touched. (Consistent with the program's architecture principle.)
- **Two independent sub-projects, one wave.** Sequence in the plan: 3a procesos
  selectivos first (richer, higher accountability value), then 3b asociaciones
  (a single-PDF parse). Each ships independently green.
- Every adapter follows the repo shape + TDD: `scripts/scrape-X.ts` (fetch,
  node-only) → `src/scraper/X.ts` (pure parser, unit-tested vs a committed
  fixture) → `public/data/X.json` → `src/hooks/useX.js` → UI. RED→GREEN→wire.

---

## Wave 3a — procesos selectivos (municipal hiring)

### Source
`https://www.ribarroja.es/es/noticia/publicaciones-procesos-selectivos` — a
server-rendered HTML list; each item is a hiring process linking to a detail
page carrying its documents (bases, listas provisionales/definitivas, tribunal,
resultados) as PDFs. Pagination ("Ver más").

### Components
- `src/scraper/procesos-selectivos.ts` — **pure parser**.
  `parseProcesosList(html) → ProcesoSelectivo[]`. No I/O. Unit-tested vs a
  committed HTML fixture. Optionally `parseProcesoDetail(html) → { documents: DocLink[] }`
  for the per-process document list (decide at the feasibility spike whether the
  detail pages are worth a second fetch, or the list page carries enough).
  - Schema `ProcesoSelectivo`: `{ id, titulo, tipo: 'oposicion'|'bolsa'|'estabilizacion'|'otro', estado?: string, fecha?: string (ISO), url, documents?: [{ label, href, kind: 'bases'|'lista'|'tribunal'|'resultado'|'otro' }] }`. `tipo`/`kind` classified by keyword on the title/label; unknown → `'otro'`.
- `src/scraper/procesos-selectivos-fetch.ts` — node-only fetcher (browser UA per the WAF note; walks the list + optionally each detail page). Mirrors `bop-fetch.ts`/`budget-execution-fetch.ts`.
- `scripts/scrape-procesos-selectivos.ts` — CLI → `public/data/procesos-selectivos.json` = `{ generatedAt, source, procesos: ProcesoSelectivo[] }`. Idempotent.
- `src/hooks/useProcesosSelectivos.js` — `useJsonFetch` hook.
- **`/empleo-publico` route** (new, in NAV + the shared `src/nav.js` so it appears in both menus + gets a SectionGlyph) — a list of municipal hiring processes: título, tipo pill, estado, fecha, document links. Reuses `Card`/`Pill`/`SectionHead` + site tokens. Honest empty-state when the list is empty.

### Feasibility spike (first plan task)
Fetch the list page, commit `tests/fixtures/procesos-selectivos_<date>.html`,
and pin `parseProcesosList` against it. Decide from the fixture whether the list
rows already carry the useful metadata (tipo/estado/date/doc-link) or a
per-process detail fetch is needed — narrow the schema to what's actually there,
don't assume the richer shape.

### TDD cadence
1. RED — fixture + `tests/parse-procesos-selectivos.test.ts` pinning the parser.
2. GREEN — parser.
3. Wire — fetcher, CLI, JSON, hook, `/empleo-publico` route (+ nav.js + SectionGlyph) + e2e + a11y, add to `scrape-all.sh`.

---

## Wave 3b — registro de asociaciones

### Source
The dated static PDF linked from the participación/transparencia page (current:
`…/files/20260528 20260527 Registro Asociaciones Web.pdf`). The listing page
also links prior/obligations docs — the CLI resolves the **most recent dated**
"Registro Asociaciones" PDF.

### Components
- `src/scraper/asociaciones.ts` — **pure parser**.
  `parseAsociacionesPdf(pdfText) → Asociacion[]`. No I/O. Unit-tested vs a
  committed PDF-text fixture.
  - Schema `Asociacion`: `{ nombre, seccion?: string, numeroRegistro?: string, ... }` — narrow to the columns the PDF actually exposes (determined at the spike; municipal registers vary).
- `scripts/scrape-asociaciones.ts` — CLI: locate the newest dated PDF on the listing page → `fetchPdfText` (reuse the same lazy pdf-parse pattern as budget-execution-fetch) → parse → `public/data/asociaciones.json` = `{ generatedAt, source, fechaRegistro, asociaciones: Asociacion[] }`. Idempotent.
- `src/hooks/useAsociaciones.js` — `useJsonFetch` hook.
- **Surface:** a compact "Entidades y asociaciones" directory. Decide at spec-review whether this is a section on an existing page (`/datos` catalog + a small directory) or its own light route. Default: a section on `/datos` (it's reference data, not a daily-changing feed) + a curator-only outreach export note. NOT a libel-material surface.

### Feasibility spike (first plan task for 3b)
Download the register PDF, `pdf-parse` it, commit
`tests/fixtures/asociaciones_<date>.txt`, inspect its structure (table vs prose;
columns present), and pin `parseAsociacionesPdf` against it. If it's a scanned
image with no text layer, fall back to listing just the count + the source link,
and narrow the schema — decide at the spike.

### TDD cadence
Same three-commit RED→GREEN→wire as 3a, over `asociaciones.ts` + its fixture.

---

## Analysis refinement + re-runs

- Both are **new standalone surfaces** — they don't change existing analysis, so
  **no re-runs** are triggered (no verifier corpus, no LLM). `/datos` catalog gains
  two entries. `scrape-all.sh` gains two best-effort adapters.
- Procesos selectivos could later become a `/departamentos` (RRHH/Secretaría)
  signal — deferred; not this wave.

## Out of scope / deferred

- **Per-process outcome analysis** (who got hired, tribunal composition scrutiny)
  — libel-sensitive; would need a curator gate. This wave only lists the public
  process metadata + document links.
- **The asociaciones outreach export** as an automated artifact — the JSON is the
  data; turning it into a mailing workflow is a manual curator task, not code.

## Success criteria

- `scrape:procesos-selectivos` + `scrape:asociaciones` each write their JSON,
  idempotent; both in `scrape-all.sh` (best-effort).
- `/empleo-publico` renders the hiring list (or an honest empty-state) without
  console errors; e2e + a11y-strict pass; the route is in the shared `src/nav.js`
  with a unique SectionGlyph.
- The asociaciones directory renders from `asociaciones.json`.
- Full vitest + lint stay green.
- No libel-material surface (findings/promises/declaraciones/verifier) touched.
