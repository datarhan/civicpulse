# Medición de eficiencia · Fase 1 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `/eficiencia` — a flag-gated panel of per-service unit-cost indicators for Riba-roja, each with a Comunitat Valenciana peer position (2021) and the town's own 2014–2024 trend, sourced entirely from the ministry's *coste efectivo de los servicios* return.

**Architecture:** Two new pure parsers (`coste-efectivo.ts` for CESEL's two input shapes, `indicadores.ts` for the arithmetic) feeding two CLIs that write `public/data/coste-efectivo.json` and `public/data/indicadores.json`, consumed by a `useSnapshot`-based hook and a new page. All honesty rules live in `indicadores.ts` and are enforced by unit tests plus a `check:indicadores` gate. No network in any parser; no LLM anywhere in this phase.

**Tech Stack:** TypeScript + tsx CLIs, `xlsx` (already a dependency), `cheerio` (already a dependency) for the ASP.NET consulta HTML, Vitest, React 18 + React Router 6, Playwright + axe.

## Context

`docs/superpowers/specs/2026-08-12-medicion-eficiencia-design.md` (commit `ceb8431`, branch `spec/medicion-eficiencia`) is the approved design; read it first. The site publishes what the council spends but nothing that relates spend to what it produced, so a reader cannot tell whether a figure is high, low or normal. Spain's *coste efectivo* return (art. 116 ter LRSAL) supplies both halves — cost per service **and** the physical output units per service — for every municipality, which makes both the ratio and the peer benchmark possible from one official source.

Decisions taken since the spec was written, and binding here:

- Peer band is **`cv-15k-40k`** — 60 CV municipalities in the committed CONPREL fixture. Riba-roja is 24.230 hab.
- The route ships **flag-gated** behind `EFICIENCIA_ENABLED`, mirroring `PERIODISTAS_ENABLED`.
- **Phase 1 only.** The CONPREL roster task is in scope because the peer set cannot be sized without population; the per-capita *benchmark indicators* it also enables are Phase 2 and must not be built here.

## Global Constraints

- **Never commit the 45 MB national workbook.** It is cached in a gitignored working dir; only derived snapshots and a small real-derived fixture slice enter git.
- **Enums are exported from the module and imported by tests.** Never restate a shape in a test (`DATA_INTEGRITY.md` rule 1). Every enum assertion is paired with a fallback ceiling.
- **A sentinel is never a value.** `0` in CE3 and `€0` under concesión are not quantities.
- **An honest miss beats a wrong number.** Where the source is ambiguous, the cell is `no-declarado` with a `motivo`; never first-wins.
- **Assert the check evaluated something.** Any "found nothing" assertion is paired with a positive count assertion.
- Parsers are pure, no `fetch`. `fetch` lives only in `scripts/`.
- Scrapers identify themselves in `User-Agent` and do not loop tightly.
- Inline styles driven by CSS variables; `.mono` on every numeric; anything responsive goes in a real stylesheet or `<style>` block, never the JSX `style` prop.
- `npm run typecheck` and `npm run lint` stay clean.
- **No row counts, euro totals or test counts in any `.md` outside the dated evidence block of the spec.**

## File Structure

**Create**

| Path | Responsibility |
| --- | --- |
| `src/scraper/coste-efectivo.ts` | Pure: CESEL workbook rows **and** consulta HTML → one `CesteRow[]`. Owns `MODOS_GESTION`, `clasificarGestion`, `ineFromEnte`. |
| `src/scraper/indicador-registry.ts` | The curated `SERVICIOS` map: programa → denominator attribute, unit, tier, label, caveats. |
| `src/scraper/indicadores.ts` | Pure: `CesteRow[]` + peers + registry → `Indicador[]` + `universe`. All honesty rules. |
| `scripts/scrape-coste-efectivo.ts` | CLI. Bulk 2021 workbook + consulta walk 2014–2024. Writes `coste-efectivo.json`. Run manifest. |
| `scripts/compute-indicadores.ts` | CLI. Pure compose → `indicadores.json`. Run manifest. |
| `scripts/check-indicadores.ts` | Gate: every `Magnitud.fuente` resolves to a real cell; invariants hold. |
| `src/hooks/useIndicadores.js` | Snapshot hook. |
| `src/pages/Eficiencia.jsx` | The page: cabecera, cobertura, tarjetas, bloqueados. |
| `src/components/eficiencia/CoberturaEficiencia.jsx` | Coverage strip from the snapshot's own `universe`. |
| `src/components/eficiencia/ServicioCard.jsx` | One service: cost, unit, ratio, sparkline, band, caveats, sources. |
| `src/components/eficiencia/BandaPares.jsx` | Quartile strip + own marker + peer disclosure table. |
| `tests/parse-coste-efectivo.test.ts` | Parser contract, both input shapes, all five traps. |
| `tests/parse-indicadores.test.ts` | Invariants + the concession reproducer. |
| `tests/fixtures/cesel_2021_cv_slice.xlsx` | Real rows, sliced from the ministry workbook. |
| `tests/fixtures/cesel_consulta_46214_2024.html` | One saved real consulta response. |
| `e2e/eficiencia.spec.ts` | Route render + axe strict. |

**Modify**

| Path | Change |
| --- | --- |
| `src/scraper/budget.ts` | Add `parseConprelRoster` — all CV municipalities with population, from rows the parser already walks. |
| `tests/parse-budget.test.ts` | Roster test against `conprel_CV_2024.xls`. |
| `src/flags.js` | `EFICIENCIA_ENABLED`. |
| `src/nav.js`, `src/components/SectionGlyph.jsx`, `src/App.jsx` | Route + nav entry + glyph, all flag-conditional. |
| `src/components/Charts.jsx` | Gap-aware sparkline primitive. |
| `src/i18n.jsx` | Chrome strings, both locales. |
| `package.json` | `scrape:coste-efectivo`, `compute:indicadores`, `check:indicadores`. |
| `scripts/scrape-all.sh` | Wire the adapter. |
| `src/pages/Metodologia.jsx` | New section describing the measurement contract. |

---

### Task 1: CONPREL peer roster

**Files:**
- Modify: `src/scraper/budget.ts`
- Test: `tests/parse-budget.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `export interface ConprelMunicipio { ine: string; nombre: string; poblacion: number }` and `export function parseConprelRoster(buffer: Buffer | ArrayBuffer, opts?: { sheetName?: string }): ConprelMunicipio[]`.

- [ ] **Step 1: Write the failing test**

Append to `tests/parse-budget.test.ts`:

```ts
import { parseConprelRoster } from '../src/scraper/budget'

describe('scraper/budget — parseConprelRoster', () => {
  const roster = parseConprelRoster(readFileSync(FIXTURE))

  it('returns every CV municipality with a positive population', () => {
    expect(roster.length).toBeGreaterThan(400)
    for (const m of roster) {
      expect(m.ine).toMatch(/^\d{5}$/)
      expect(m.nombre.length).toBeGreaterThan(1)
      expect(m.poblacion).toBeGreaterThan(0)
    }
  })

  it('includes Riba-roja with the population the budget parser reports', () => {
    const rr = roster.find((m) => m.ine === '46214')
    const budget = parseConprelBudget(readFileSync(FIXTURE), { ineCode: '46214', year: 2024 })
    expect(rr).toBeDefined()
    expect(rr!.poblacion).toBe(budget!.population)
  })

  it('has no duplicate INE codes', () => {
    expect(new Set(roster.map((m) => m.ine)).size).toBe(roster.length)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/parse-budget.test.ts -t parseConprelRoster`
Expected: FAIL — `parseConprelRoster is not a function`.

- [ ] **Step 3: Write minimal implementation**

In `src/scraper/budget.ts`, beside `parseConprelBudget`, reusing its documented column layout (0 `Pr`, 1 `Cor`, 3 `Nombre`, 4 `Pobla`):

```ts
export interface ConprelMunicipio {
  ine: string
  nombre: string
  poblacion: number
}

/**
 * Every municipality in the CONPREL sheet, for peer-set sizing.
 * Same rows `parseConprelBudget` walks; it just stops at the one it wants.
 */
export function parseConprelRoster(
  buffer: Buffer | ArrayBuffer,
  opts: { sheetName?: string } = {},
): ConprelMunicipio[] {
  const wb = XLSX.read(buffer, { type: 'buffer' })
  const sheet = wb.Sheets[opts.sheetName ?? 'Comunitat Valenciana']
  if (!sheet) return []
  const rows: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: null })
  const out: ConprelMunicipio[] = []
  const seen = new Set<string>()
  for (const row of rows) {
    if (!row || row.length < 30) continue
    const pr = String(row[0] ?? '').replace(/\D/g, '').padStart(2, '0')
    const cor = String(row[1] ?? '').replace(/\D/g, '').padStart(3, '0')
    const nombre = String(row[3] ?? '').trim()
    const poblacion = num(row[4])
    if (pr === '00' || !nombre || !Number.isFinite(poblacion) || poblacion <= 0) continue
    const ine = pr + cor
    if (seen.has(ine)) continue
    seen.add(ine)
    out.push({ ine, nombre, poblacion })
  }
  return out
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/parse-budget.test.ts && npm run typecheck`
Expected: PASS, typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add src/scraper/budget.ts tests/parse-budget.test.ts
git commit -m "feat(budget): expose the CV municipality roster for peer sets"
```

---

### Task 2: CESEL workbook parser

**Files:**
- Create: `src/scraper/coste-efectivo.ts`, `tests/parse-coste-efectivo.test.ts`, `tests/fixtures/cesel_2021_cv_slice.xlsx`

**Interfaces:**
- Consumes: nothing.
- Produces:

```ts
export const MODOS_GESTION = [
  'directa', 'concesion', 'mancomunada', 'convenio', 'mixta', 'otra', 'no-se-presta',
] as const
export type ModoGestion = (typeof MODOS_GESTION)[number]

export interface UnidadFisica { atributo: string; valor: number }
export interface CesteRow {
  anio: number
  ine: string
  ente: string
  nombre: string
  programa: string
  modoGestion: ModoGestion
  costeTotal: number | null
  unidades: UnidadFisica[]
}

export function clasificarGestion(codGestion: string): ModoGestion
export function ineFromEnte(ente: string): string | null
export function parseCeselWorkbook(
  buffer: Buffer | ArrayBuffer,
  opts: { anio: number; soloEntes?: Set<string> },
): CesteRow[]
```

`CesteRow` is **one row per CE2 row** — duplicates for the same `(ine, programa)` are preserved, never merged. `unidades` may contain the same `atributo` twice with different values. Resolving that ambiguity is Task 5's job, not this parser's.

- [ ] **Step 1: Build the fixture**

The 45 MB national workbook cannot be committed. Slice it, preserving real values and the real sheet names (`2021 CE2`, `2021 CE3`):

```bash
mkdir -p .cache/cesel
curl -sSL -A "CivicPulse/1.0 (monitor cívico Riba-roja; +https://github.com/datarhan/civicpulse)" \
  -o .cache/cesel/cesel-2021.xlsx "https://www.hacienda.gob.es/cdi/power%20bi/cesel-2021.xlsx"
npx tsx scripts/build-cesel-fixture.ts   # written in the next step
```

- [ ] **Step 2: Write the fixture builder**

Create `scripts/build-cesel-fixture.ts` — a one-shot dev tool, committed so the fixture is reproducible:

```ts
#!/usr/bin/env tsx
/**
 * Slice the CESEL national workbook down to the cv-15k-40k peer band so the
 * parser test runs against REAL ministry rows without a 45 MB file in git.
 * Values are copied verbatim; only rows are dropped.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import * as XLSX from 'xlsx'
import { parseConprelRoster } from '../src/scraper/budget'

const roster = parseConprelRoster(readFileSync('tests/fixtures/conprel_CV_2024.xls'))
const band = new Set(
  roster.filter((m) => m.poblacion >= 15000 && m.poblacion <= 40000).map((m) => m.ine),
)
band.add('46214')

const src = XLSX.read(readFileSync('.cache/cesel/cesel-2021.xlsx'), { type: 'buffer' })
const out = XLSX.utils.book_new()
for (const name of ['2021 CE2', '2021 CE3']) {
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(src.Sheets[name])
  const kept = rows.filter((r) => {
    const ente = String(r.Ente ?? '')
    const m = /^\d{2}-(\d{2})-(\d{3})-AA-000$/.exec(ente)
    return m ? band.has(m[1] + m[2]) : false
  })
  XLSX.utils.book_append_sheet(out, XLSX.utils.json_to_sheet(kept), name)
}
writeFileSync('tests/fixtures/cesel_2021_cv_slice.xlsx', XLSX.write(out, { type: 'buffer', bookType: 'xlsx' }))
```

Run: `npx tsx scripts/build-cesel-fixture.ts && ls -lh tests/fixtures/cesel_2021_cv_slice.xlsx`
Expected: a file well under 5 MB.

- [ ] **Step 3: Write the failing test**

Create `tests/parse-coste-efectivo.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  parseCeselWorkbook, clasificarGestion, ineFromEnte, MODOS_GESTION,
} from '../src/scraper/coste-efectivo'

const FIXTURE = join(__dirname, 'fixtures', 'cesel_2021_cv_slice.xlsx')
const rows = parseCeselWorkbook(readFileSync(FIXTURE), { anio: 2021 })
const rr = rows.filter((r) => r.ine === '46214')

describe('scraper/coste-efectivo — parseCeselWorkbook', () => {
  it('parsed something at all', () => {
    expect(rows.length).toBeGreaterThan(100)
    expect(rr.length).toBeGreaterThan(20)
  })

  it('joins cost to physical units for recogida de residuos', () => {
    const residuos = rr.filter((r) => r.programa === 'a1621')
    expect(residuos).toHaveLength(1)
    expect(residuos[0].costeTotal).toBeCloseTo(801040, 0)
    expect(residuos[0].modoGestion).toBe('directa')
    const t = residuos[0].unidades.find((u) => /toneladas/i.test(u.atributo))
    expect(t!.valor).toBeCloseTo(11059.41, 2)
  })

  it('classifies the water and sewer concessions, which report zero cost', () => {
    for (const programa of ['a160', 'a161']) {
      const row = rr.find((r) => r.programa === programa)
      expect(row!.modoGestion).toBe('concesion')
      expect(row!.costeTotal).toBe(0)
    }
  })

  it('keeps every duplicate row for a programa instead of picking the first', () => {
    const dupes = rr.filter((r) => r.programa === 'a1721/170P')
    expect(dupes.length).toBeGreaterThan(1)
    expect(new Set(dupes.map((d) => d.costeTotal)).size).toBeGreaterThan(1)
  })

  it('keeps contradictory repeated attributes rather than collapsing them', () => {
    const row = rr.find((r) => r.programa === 'a1721/170P')!
    const plantilla = row.unidades.filter((u) => /plantilla adscritas/i.test(u.atributo))
    expect(plantilla.length).toBeGreaterThan(1)
  })

  it('derives INE codes and keeps unknown gestión under the fallback ceiling', () => {
    expect(ineFromEnte('17-46-214-AA-000')).toBe('46214')
    expect(ineFromEnte('nonsense')).toBeNull()
    const otra = rows.filter((r) => r.modoGestion === 'otra').length
    expect(otra / rows.length).toBeLessThan(0.1)
    for (const r of rows) expect(MODOS_GESTION).toContain(r.modoGestion)
  })

  it('maps every CodGestion vocabulary item the fixture contains', () => {
    expect(clasificarGestion('Gestión directa por la entidad local')).toBe('directa')
    expect(clasificarGestion('No se presta el servicio')).toBe('no-se-presta')
    expect(
      clasificarGestion('Gestión indirecta mediante concesión, gestionando el concesionario el servicio a su riesgo y ventura'),
    ).toBe('concesion')
  })
})
```

- [ ] **Step 4: Run test to verify it fails**

Run: `npx vitest run tests/parse-coste-efectivo.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 5: Write the implementation**

Create `src/scraper/coste-efectivo.ts`. CE2 supplies cost (`Econ14` is the total; note CE2 uses the key `Litente` and CE3 uses `LitEnte`), CE3 supplies units, joined on `(Ente, Programa)`:

```ts
import * as XLSX from 'xlsx'

export const MODOS_GESTION = [
  'directa', 'concesion', 'mancomunada', 'convenio', 'mixta', 'otra', 'no-se-presta',
] as const
export type ModoGestion = (typeof MODOS_GESTION)[number]

export interface UnidadFisica { atributo: string; valor: number }
export interface CesteRow {
  anio: number
  ine: string
  ente: string
  nombre: string
  programa: string
  modoGestion: ModoGestion
  costeTotal: number | null
  unidades: UnidadFisica[]
}

export function clasificarGestion(codGestion: string): ModoGestion {
  const s = (codGestion ?? '').toLowerCase()
  if (!s.trim()) return 'otra'
  if (s.includes('no se presta')) return 'no-se-presta'
  if (s.includes('concesión') || s.includes('concesion')) return 'concesion'
  if (s.includes('mancomunada') || s.includes('comarcal') || s.includes('diputación')) return 'mancomunada'
  if (s.includes('convenio')) return 'convenio'
  if (s.includes('mixta') || s.includes('sociedad de economía mixta')) return 'mixta'
  if (s.includes('directa')) return 'directa'
  return 'otra'
}

/** '17-46-214-AA-000' → '46214'. Only municipal entes (AA); anything else is null. */
export function ineFromEnte(ente: string): string | null {
  const m = /^\d{2}-(\d{2})-(\d{3})-AA-\d{3}$/.exec(String(ente ?? '').trim())
  return m ? m[1] + m[2] : null
}

const numeric = (v: unknown): number => {
  const n = typeof v === 'number' ? v : Number(String(v ?? '').replace(/\./g, '').replace(',', '.'))
  return Number.isFinite(n) ? n : 0
}

export function parseCeselWorkbook(
  buffer: Buffer | ArrayBuffer,
  opts: { anio: number; soloEntes?: Set<string> },
): CesteRow[] {
  const wb = XLSX.read(buffer, { type: 'buffer' })
  const ce2Name = wb.SheetNames.find((n) => /CE2$/.test(n))
  const ce3Name = wb.SheetNames.find((n) => /CE3$/.test(n))
  if (!ce2Name || !ce3Name) return []

  const unidades = new Map<string, UnidadFisica[]>()
  for (const r of XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[ce3Name])) {
    const key = `${r.Ente}|${r.Programa}`
    const list = unidades.get(key) ?? []
    list.push({ atributo: String(r.Atributo ?? '').trim(), valor: numeric(r.Valor) })
    unidades.set(key, list)
  }

  const out: CesteRow[] = []
  for (const r of XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[ce2Name])) {
    const ente = String(r.Ente ?? '')
    const ine = ineFromEnte(ente)
    if (!ine) continue
    if (opts.soloEntes && !opts.soloEntes.has(ine)) continue
    const modoGestion = clasificarGestion(String(r.CodGestion ?? ''))
    const programa = String(r.Programa ?? '').trim()
    out.push({
      anio: opts.anio,
      ine,
      ente,
      nombre: String(r.Litente ?? r.LitEnte ?? '').trim(),
      programa,
      modoGestion,
      costeTotal: modoGestion === 'no-se-presta' ? null : numeric(r.Econ14),
      unidades: unidades.get(`${ente}|${programa}`) ?? [],
    })
  }
  return out
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run tests/parse-coste-efectivo.test.ts && npm run typecheck && npm run lint`
Expected: PASS, clean.

- [ ] **Step 7: Commit**

```bash
git add src/scraper/coste-efectivo.ts tests/parse-coste-efectivo.test.ts \
        tests/fixtures/cesel_2021_cv_slice.xlsx scripts/build-cesel-fixture.ts
git commit -m "feat(coste-efectivo): parse the CESEL workbook, keeping duplicates honest"
```

---

### Task 3: CESEL consulta (HTML) parser

**Files:**
- Modify: `src/scraper/coste-efectivo.ts`
- Test: `tests/parse-coste-efectivo.test.ts`
- Create: `tests/fixtures/cesel_consulta_46214_2024.html`

**Interfaces:**
- Consumes: `CesteRow`, `clasificarGestion` from Task 2.
- Produces: `export function parseCeselConsulta(html: string, opts: { anio: number; ine: string; ente: string; nombre: string }): CesteRow[]`.

The consulta renders one entrega for one ente as HTML tables. This is what supplies the 2014–2024 town series; the workbook only covers 2021.

- [ ] **Step 1: Capture the fixture**

Drive the viewstate cascade once by hand and save the response. The form fields are `ctl00$MainContentPlaceHolder$ddlEntrega` (value `13` = 2024), `…$ddlProvincia` (`46`), then `…$ddlTipoEnte` and `…$ddlEnte`, each POST echoing `__VIEWSTATE`, `__VIEWSTATEGENERATOR` and `__EVENTVALIDATION` from the previous response. Save the final HTML to `tests/fixtures/cesel_consulta_46214_2024.html`.

- [ ] **Step 2: Write the failing test**

Append to `tests/parse-coste-efectivo.test.ts`:

```ts
import { parseCeselConsulta } from '../src/scraper/coste-efectivo'

describe('scraper/coste-efectivo — parseCeselConsulta', () => {
  const html = readFileSync(join(__dirname, 'fixtures', 'cesel_consulta_46214_2024.html'), 'utf8')
  const consulta = parseCeselConsulta(html, {
    anio: 2024, ine: '46214', ente: '17-46-214-AA-000', nombre: 'Riba-roja de Túria',
  })

  it('yields rows in the same shape the workbook parser produces', () => {
    expect(consulta.length).toBeGreaterThan(10)
    for (const r of consulta) {
      expect(r.anio).toBe(2024)
      expect(r.ine).toBe('46214')
      expect(MODOS_GESTION).toContain(r.modoGestion)
      expect(Array.isArray(r.unidades)).toBe(true)
    }
  })

  it('carries a cost for a directly managed service', () => {
    const directa = consulta.filter((r) => r.modoGestion === 'directa' && (r.costeTotal ?? 0) > 0)
    expect(directa.length).toBeGreaterThan(0)
  })

  it('agrees with the workbook on the programa vocabulary', () => {
    const wbProgramas = new Set(rr.map((r) => r.programa))
    const overlap = consulta.filter((r) => wbProgramas.has(r.programa))
    expect(overlap.length).toBeGreaterThan(5)
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run tests/parse-coste-efectivo.test.ts -t parseCeselConsulta`
Expected: FAIL — `parseCeselConsulta is not a function`.

- [ ] **Step 4: Implement against the saved fixture**

Add to `src/scraper/coste-efectivo.ts`, using `cheerio`. Read the fixture before writing the selectors — the table ids and column order come from the real response, not from a guess:

```ts
import * as cheerio from 'cheerio'

export function parseCeselConsulta(
  html: string,
  opts: { anio: number; ine: string; ente: string; nombre: string },
): CesteRow[] {
  const $ = cheerio.load(html)
  const unidades = new Map<string, UnidadFisica[]>()
  const costes = new Map<string, { modo: ModoGestion; coste: number }[]>()

  // Two tables: one row per (programa, CodGestion, importe), one per
  // (programa, atributo, valor). Match them by their header text so a layout
  // change fails loudly instead of silently reading the wrong column.
  $('table').each((_, table) => {
    const headers = $(table).find('th').map((_, th) => $(th).text().trim().toLowerCase()).get()
    const isCoste = headers.some((h) => h.includes('coste'))
    const isUnidad = headers.some((h) => h.includes('atributo') || h.includes('unidad'))
    $(table).find('tbody tr').each((_, tr) => {
      const cells = $(tr).find('td').map((_, td) => $(td).text().trim()).get()
      if (cells.length < 3) return
      const programa = cells[0]
      if (isCoste) {
        const list = costes.get(programa) ?? []
        list.push({ modo: clasificarGestion(cells[1]), coste: numeric(cells[cells.length - 1]) })
        costes.set(programa, list)
      } else if (isUnidad) {
        const list = unidades.get(programa) ?? []
        list.push({ atributo: cells[1], valor: numeric(cells[2]) })
        unidades.set(programa, list)
      }
    })
  })

  const out: CesteRow[] = []
  for (const [programa, entries] of costes) {
    for (const e of entries) {
      out.push({
        anio: opts.anio, ine: opts.ine, ente: opts.ente, nombre: opts.nombre, programa,
        modoGestion: e.modo,
        costeTotal: e.modo === 'no-se-presta' ? null : e.coste,
        unidades: unidades.get(programa) ?? [],
      })
    }
  }
  return out
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/parse-coste-efectivo.test.ts && npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/scraper/coste-efectivo.ts tests/parse-coste-efectivo.test.ts \
        tests/fixtures/cesel_consulta_46214_2024.html
git commit -m "feat(coste-efectivo): parse the CESEL consulta for the 2014-2024 series"
```

---

### Task 4: Scraper CLI

**Files:**
- Create: `scripts/scrape-coste-efectivo.ts`
- Modify: `package.json`, `scripts/scrape-all.sh`, `.gitignore`

**Interfaces:**
- Consumes: `parseCeselWorkbook`, `parseCeselConsulta`, `CesteRow` (Tasks 2–3); `parseConprelRoster` (Task 1); `startRun` from `src/scraper/run-manifest`.
- Produces: `public/data/coste-efectivo.json`:

```ts
{
  generatedAt: string,
  source: { volcado: string, consulta: string, orden: string },
  municipio: { ine: '46214', nombre: string, filas: CesteRow[] },   // 2014–2024
  pares: {
    conjunto: 'cv-15k-40k',
    criterios: { ccaa: 17, popMin: 15000, popMax: 40000, tipoEnte: 'AA' },
    resolvedAt: string,
    anio: 2021,
    miembros: { ine: string, nombre: string, poblacion: number }[],
    filas: CesteRow[],
  },
  stats: { anios: number[], filasMunicipio: number, filasPares: number, miembros: number },
}
```

- [ ] **Step 1: Write the CLI**

```ts
#!/usr/bin/env tsx
/**
 * Build public/data/coste-efectivo.json — the coste efectivo de los servicios
 * (art. 116 ter LRSAL) for Riba-roja across every published entrega, plus the
 * cv-15k-40k peer band for 2021.
 *
 * Two sources, one row shape (src/scraper/coste-efectivo.ts):
 *   - the national workbook, which is the whole peer universe in one GET
 *   - the consulta app, which is the only way to reach the other entregas
 *
 * The workbook is ~45 MB and is cached under .cache/cesel (gitignored); it is
 * never committed and never shipped.
 *
 * Usage: npm run scrape:coste-efectivo [-- --skip-consulta]
 */
```

Implementation notes binding on the engineer:

- `User-Agent: 'CivicPulse/1.0 (monitor cívico Riba-roja; +https://github.com/datarhan/civicpulse)'` on every request.
- Cache the workbook to `.cache/cesel/cesel-2021.xlsx`; reuse it when present.
- Peer band from `parseConprelRoster` filtered to `poblacion >= 15000 && poblacion <= 40000`, plus `46214`; pass the resulting INE set as `soloEntes` so peer rows are bounded at parse time.
- Consulta walk: entregas `1→2014, 3→2015, 5→2016, 6→2017, 7→2018, 8→2019, 9→2020, 10→2021, 11→2022, 12→2023, 13→2024`, provincia `46`, one ente. **Sequential, never parallel**, with a delay between requests.
- A failed entrega is `rec.skip('entrega-no-disponible')`, never a silent gap.
- Instrument with `startRun('scrape-coste-efectivo', { getStats })`: `attempt()` per entrega, `judge()` per entrega that produced rows, `neverAttempt()` for entregas skipped by `--skip-consulta`.
- Do **not** add this script to `EXPECTED_PASSES` in `scripts/check-runs.ts` — no scheduler runs it yet, and a permanently-overdue check is a check people switch off.

- [ ] **Step 2: Add the npm script and gitignore the cache**

```jsonc
"scrape:coste-efectivo": "npx tsx scripts/scrape-coste-efectivo.ts",
```

Append `.cache/` to `.gitignore` if absent.

- [ ] **Step 3: Run it for real**

Run: `npm run scrape:coste-efectivo`
Expected: `public/data/coste-efectivo.json` written; `stats.anios` covers 2014–2024; `stats.miembros` is 60; the run manifest reports attempted and judged both non-zero.

- [ ] **Step 4: Verify the snapshot is sane and the size is bounded**

Run:

```bash
node -e "const d=require('./public/data/coste-efectivo.json');
console.log('años', d.stats.anios.join(','), '| miembros', d.stats.miembros);
const r=d.municipio.filas.find(f=>f.anio===2021&&f.programa==='a1621');
console.log('residuos 2021', r.costeTotal, r.unidades.find(u=>/toneladas/i.test(u.atributo)).valor);"
du -h public/data/coste-efectivo.json
npm run check:json
```

Expected: the residuos figures match the parser test; the file is a few hundred KB, not megabytes.

- [ ] **Step 5: Wire into scrape:all and commit**

Add the adapter to `scripts/scrape-all.sh` alongside the other ministry sources.

```bash
git add scripts/scrape-coste-efectivo.ts scripts/scrape-all.sh package.json .gitignore \
        public/data/coste-efectivo.json
git commit -m "feat(coste-efectivo): wire the CESEL adapter and ship the snapshot"
```

---

### Task 5: The service registry and the indicator engine

**Files:**
- Create: `src/scraper/indicador-registry.ts`, `src/scraper/indicadores.ts`, `tests/parse-indicadores.test.ts`

**Interfaces:**
- Consumes: `CesteRow`, `ModoGestion` (Task 2).
- Produces:

```ts
// indicador-registry.ts
export interface ServicioDef {
  label: string
  denominador: string          // exact CE3 attribute text
  unidad: string
  tier: Tier
  caveats: string[]
}
export const SERVICIOS: Record<string, ServicioDef>

// indicadores.ts
export type Tier = 'input' | 'carga' | 'output' | 'outcome'
export type Dimension = 'operativa' | 'respuesta' | 'fiscal' | 'friccion'
export type EstadoCelda = 'declarado' | 'no-declarado' | 'no-se-presta'
export type Motivo =
  | 'ausente' | 'cero-sin-declarar' | 'filas-duplicadas' | 'atributo-ambiguo' | 'concesion'

export interface Magnitud {
  valor: number | null
  estado: EstadoCelda
  motivo?: Motivo
  fuente: string
}
export interface Indicador { /* per the spec, incl. pares, serie, caveats, citas */ }
export interface IndicadoresSnapshot {
  indicadores: Indicador[]
  universe: {
    serviciosEnRegistro: number
    conRatio: number
    enConcesion: number
    sinUnidad: number
    noSePresta: number
    comparables: number
  }
}

export function resolverCoste(filas: CesteRow[], programa: string, anio: number): Magnitud
export function resolverUnidad(filas: CesteRow[], programa: string, anio: number, atributo: string): Magnitud
export function construirIndicadores(input: {
  municipio: { ine: string; nombre: string; filas: CesteRow[] }
  pares: { conjunto: string; anio: number; miembros: { ine: string; nombre: string; poblacion: number }[]; filas: CesteRow[] }
  anioBase: number
}): IndicadoresSnapshot
```

**The resolution rules**, which are the whole point of this task:

- `resolverCoste`: filter to `(programa, anio)`. Zero rows → `no-declarado / ausente`. One row → `no-se-presta` if that's the mode, else `declarado`. More than one row with **differing** `costeTotal` → `no-declarado / filas-duplicadas`. Never first-wins.
- `resolverUnidad`: collect matching `atributo` values. Zero → `no-declarado / ausente`. Value `0` → `no-declarado / cero-sin-declarar`. Multiple with differing values → `no-declarado / atributo-ambiguo`.
- `valor` is non-null only when both magnitudes are `declarado`.
- `pares` is non-null only when the peer subset shares the town's `modoGestion`, every member's own cells resolve `declarado`, and `n >= 15`.
- A `modoGestion` of `concesion` sets `comparable: false` and `motivo: 'concesion'` on the cost.

- [ ] **Step 1: Write the failing tests**

Create `tests/parse-indicadores.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseCeselWorkbook, type CesteRow } from '../src/scraper/coste-efectivo'
import { SERVICIOS } from '../src/scraper/indicador-registry'
import { construirIndicadores, resolverCoste, resolverUnidad } from '../src/scraper/indicadores'

const rows = parseCeselWorkbook(
  readFileSync(join(__dirname, 'fixtures', 'cesel_2021_cv_slice.xlsx')), { anio: 2021 },
)
const mias = rows.filter((r) => r.ine === '46214')
const miembros = [...new Set(rows.map((r) => r.ine))].map((ine) => ({
  ine, nombre: rows.find((r) => r.ine === ine)!.nombre, poblacion: 0,
}))
const snap = construirIndicadores({
  municipio: { ine: '46214', nombre: 'Riba-roja de Túria', filas: mias },
  pares: { conjunto: 'cv-15k-40k', anio: 2021, miembros, filas: rows },
  anioBase: 2021,
})
const byId = (id: string) => snap.indicadores.find((i) => i.id === id)!

describe('scraper/indicadores', () => {
  it('evaluated something', () => {
    expect(snap.indicadores.length).toBeGreaterThan(5)
    expect(snap.universe.serviciosEnRegistro).toBe(Object.keys(SERVICIOS).length)
  })

  it('computes the residuos ratio from the real cells', () => {
    const i = byId('residuos-coste-por-tonelada')
    expect(i.valor).toBeCloseTo(801040 / 11059.41, 2)
    expect(i.numerador.estado).toBe('declarado')
    expect(i.denominador.estado).toBe('declarado')
    expect(i.tier).toBe('carga')
  })

  // THE reproducer: the concession trap would otherwise publish
  // "Riba-roja supplies water for free, cheapest in the group".
  it('never turns a concession €0 into a ratio or a peer position', () => {
    const agua = byId('agua-coste-por-metro-de-red')
    expect(agua.modoGestion).toBe('concesion')
    expect(agua.valor).toBeNull()
    expect(agua.comparable).toBe(false)
    expect(agua.pares).toBeNull()
    expect(agua.numerador.motivo).toBe('concesion')
  })

  it('refuses a ratio when the denominator is an undeclared zero', () => {
    const bus = byId('transporte-coste-por-viajero')
    expect(bus.denominador.estado).toBe('no-declarado')
    expect(bus.denominador.motivo).toBe('cero-sin-declarar')
    expect(bus.valor).toBeNull()
  })

  it('refuses a cost when a programa has contradictory duplicate rows', () => {
    const m = resolverCoste(mias, 'a1721/170P', 2021)
    expect(m.estado).toBe('no-declarado')
    expect(m.motivo).toBe('filas-duplicadas')
  })

  it('refuses a unit when the same attribute is declared twice differently', () => {
    const m = resolverUnidad(mias, 'a1721/170P', 2021, 'Nº personas en plantilla adscritas al servicio')
    expect(m.estado).toBe('no-declarado')
    expect(m.motivo).toBe('atributo-ambiguo')
  })

  it('never selects a code attribute as a denominator', () => {
    for (const def of Object.values(SERVICIOS)) {
      expect(def.denominador).not.toMatch(/periodicidad/i)
    }
  })

  it('holds the invariants across every indicator', () => {
    let conPares = 0
    for (const i of snap.indicadores) {
      if (i.valor !== null) {
        expect(i.numerador.estado).toBe('declarado')
        expect(i.denominador.estado).toBe('declarado')
      }
      if (i.pares) {
        conPares++
        expect(i.pares.modoGestion).toBe(i.modoGestion)
        expect(i.pares.n).toBeGreaterThanOrEqual(15)
        expect(i.comparable).toBe(true)
      }
      for (const p of i.serie) if (p.estado !== 'declarado') expect(p.valor).toBeNull()
      expect(i.numerador.fuente).toMatch(/^cesel:\d{4}:CE2:/)
      expect(i.denominador.fuente).toMatch(/^cesel:\d{4}:CE3:/)
    }
    // The peer comparison must have actually run for someone.
    expect(conPares).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/parse-indicadores.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Write the registry**

Create `src/scraper/indicador-registry.ts`. Populate every entry by reading the fixture's actual CE3 attribute strings — the `denominador` must match the source text exactly. Start from the services with declared units: `a1621` residuos, `a163` limpieza viaria, `a171/170P` parques, `a164` cementerio, `a165` alumbrado, `a1532/150P` vías, `a3321/330P` biblioteca, `a161` agua, `a160` alcantarillado, `a4411/440P` transporte, `b132/130P` policía (`tier: 'input'`), `b4313/430P` licencias.

- [ ] **Step 4: Write the engine**

Create `src/scraper/indicadores.ts` implementing the resolution rules above. Build `fuente` as `cesel:<anio>:CE2:<programa>:Econ14` and `cesel:<anio>:CE3:<programa>:<atributo>`.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/parse-indicadores.test.ts && npm run typecheck && npm run lint`
Expected: PASS, clean.

- [ ] **Step 6: Commit**

```bash
git add src/scraper/indicador-registry.ts src/scraper/indicadores.ts tests/parse-indicadores.test.ts
git commit -m "feat(indicadores): unit-cost engine that refuses every ambiguous cell"
```

---

### Task 6: Compute CLI and the citation gate

**Files:**
- Create: `scripts/compute-indicadores.ts`, `scripts/check-indicadores.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: `construirIndicadores` (Task 5), `coste-efectivo.json` (Task 4).
- Produces: `public/data/indicadores.json` = `{ generatedAt, conjunto, anioBase, ...IndicadoresSnapshot, stats }`.

- [ ] **Step 1: Write compute-indicadores.ts**

Reads `public/data/coste-efectivo.json`, calls `construirIndicadores`, writes `public/data/indicadores.json`. Instrumented with `startRun('compute-indicadores', …)`: `attempt()` per registry service, `judge()` per indicator that resolved a ratio, `skip(motivo)` for each blocked one. Pure compose — no network.

- [ ] **Step 2: Write check-indicadores.ts**

The gate. For every indicator: resolve `numerador.fuente` and `denominador.fuente` back to a real cell in `coste-efectivo.json` and confirm the value matches; re-assert the five invariants; exit 1 on any failure. Print the count of citations checked — a gate that checked nothing must not print an all-clear.

```jsonc
"compute:indicadores": "npx tsx scripts/compute-indicadores.ts",
"check:indicadores": "npx tsx scripts/check-indicadores.ts",
```

- [ ] **Step 3: Run both for real**

Run: `npm run compute:indicadores && npm run check:indicadores`
Expected: snapshot written; the gate prints a non-zero number of citations verified and exits 0.

- [ ] **Step 4: Sanity-read the output**

Run:

```bash
node -e "const d=require('./public/data/indicadores.json');
console.log('universe', JSON.stringify(d.universe));
d.indicadores.filter(i=>i.valor!==null).forEach(i=>
  console.log(i.id.padEnd(34), i.valor.toFixed(2), i.unidad, '| pares', i.pares?i.pares.n:'—'));
console.log('bloqueados:'); d.indicadores.filter(i=>i.valor===null).forEach(i=>
  console.log(' ', i.id.padEnd(34), i.numerador.motivo ?? i.denominador.motivo));"
```

Expected: residuos shows the ratio from the parser test; agua and alcantarillado appear under bloqueados with `concesion`; transporte with `cero-sin-declarar`.

- [ ] **Step 5: Commit**

```bash
git add scripts/compute-indicadores.ts scripts/check-indicadores.ts package.json \
        public/data/indicadores.json
git commit -m "feat(indicadores): compute CLI and the citation gate over the arithmetic"
```

---

### Task 7: Flag, route, hook

**Files:**
- Create: `src/hooks/useIndicadores.js`, `src/pages/Eficiencia.jsx`
- Modify: `src/flags.js`, `src/nav.js`, `src/components/SectionGlyph.jsx`, `src/App.jsx`

**Interfaces:**
- Consumes: `indicadores.json` (Task 6).
- Produces: `EFICIENCIA_ENABLED`, `useIndicadores()` returning `{ loading, error, data }`.

- [ ] **Step 1: Add the flag**

In `src/flags.js`, matching the existing `PERIODISTAS_ENABLED` comment discipline:

```js
// «Eficiencia» publishes unit costs and peer positions about a named council —
// the first new claim type since the biographies. Gated the same way while the
// figures are read against real data: always on in dev, needs
// VITE_ENABLE_EFICIENCIA=true in production.
export const EFICIENCIA_ENABLED = isDev || import.meta.env.VITE_ENABLE_EFICIENCIA === 'true'
```

- [ ] **Step 2: Add the hook**

```js
// @ts-check
import { useJsonFetch } from './useJsonFetch'

// Ships empty until the first compute pass; a 404 resolves to the empty shape.
const EMPTY = { indicadores: [], universe: null }

export function useIndicadores() {
  return useJsonFetch('/data/indicadores.json', EMPTY)
}
```

- [ ] **Step 3: Register route, nav and glyph**

`src/App.jsx`: `const Eficiencia = EFICIENCIA_ENABLED ? lazy(() => import('./pages/Eficiencia')) : null`, plus a conditional `<Route path="/eficiencia" element={<Eficiencia />} />`.
`src/nav.js`: spread a conditional entry after `/presupuesto` — `{ to: '/eficiencia', id: 'eficiencia', labelKey: 'nav.eficiencia', label: 'Eficiencia', icon: Ic.chart, shortcut: 'G I' }`. Confirm `G I` is unused before committing.
`src/components/SectionGlyph.jsx`: `'/eficiencia': { glyph: '⊟', tone: 'civic' }, // el ratio: coste sobre unidad`.

- [ ] **Step 4: Minimal page that proves the wiring**

`src/pages/Eficiencia.jsx` rendering the heading and a raw count of indicators — enough to confirm the route, hook and flag work before any design lands.

- [ ] **Step 5: Verify in the browser**

Run: `npm run dev`, open `http://localhost:5173/eficiencia`.
Expected: page renders, sidebar shows the entry, Cmd+K finds it, no console errors.

- [ ] **Step 6: Commit**

```bash
git add src/flags.js src/hooks/useIndicadores.js src/pages/Eficiencia.jsx \
        src/nav.js src/components/SectionGlyph.jsx src/App.jsx
git commit -m "feat(eficiencia): flag-gated route, nav entry and snapshot hook"
```

---

### Task 8: The page

**Files:**
- Create: `src/components/eficiencia/CoberturaEficiencia.jsx`, `ServicioCard.jsx`, `BandaPares.jsx`
- Modify: `src/pages/Eficiencia.jsx`, `src/components/Charts.jsx`, `src/i18n.jsx`

**Interfaces:**
- Consumes: `useIndicadores()` (Task 7); `Pill`, `Delta` from the existing component set.
- Produces: `<Sparkline points={{x, y|null}[]} />` in `Charts.jsx` — **breaks the path at every null**, never interpolating.

- [ ] **Step 1: Add the gap-aware sparkline**

In `src/components/Charts.jsx`, following the existing SVG primitives. A null `y` starts a new sub-path; a series with fewer than two consecutive non-null points renders points only, no line.

- [ ] **Step 2: Coverage strip**

`CoberturaEficiencia.jsx`, modelled on `MoneyCoverage.jsx` including its discipline: read `universe` from the snapshot, and **return `null` if the block is missing** rather than implying a coverage that can't be backed. Copy states services with a ratio, services in concesión, services with no declared unit, and services not provided.

- [ ] **Step 3: Peer band**

`BandaPares.jsx`: p25–p75 band, median tick, own marker. The marker's value is rendered as text in the DOM, never colour-only. Below it, a `<details>` disclosure listing every peer — nombre, población, modo de gestión, valor — **unsorted by value**, so it reads as a reference table and not a ranking. Renders nothing when `comparable === false`.

- [ ] **Step 4: Service card**

`ServicioCard.jsx`: gestión badge, coste efectivo, unidad física with its tier tag, the ratio large in `.mono`, sparkline, `BandaPares`, caveats, and a source link to the entrega. When `valor === null` it shows the cost alone plus the plain-language `motivo`, and never a ratio.

- [ ] **Step 5: Assemble the page**

`Eficiencia.jsx`: cabecera with the question and the scope sentence, `CoberturaEficiencia`, cards sorted by cost descending, a town-wide section placeholder marked as Phase 2, and a **bloqueados** panel listing every blocked service with its reason. Add the i18n chrome keys in both locales; service labels stay in source-language Castilian per the i18n rule.

- [ ] **Step 6: Verify visually and for contrast**

Run: `npm run dev` and read `/eficiencia` in both light and dark mode.
Expected: agua/alcantarillado appear as concesión with no ratio; transporte appears in bloqueados; residuos shows its ratio, band and trend.

- [ ] **Step 7: Commit**

```bash
git add src/components/eficiencia src/components/Charts.jsx src/pages/Eficiencia.jsx src/i18n.jsx
git commit -m "feat(eficiencia): coverage strip, service cards and peer band"
```

---

### Task 9: e2e, accessibility, methodology

**Files:**
- Create: `e2e/eficiencia.spec.ts`
- Modify: `src/pages/Metodologia.jsx`

- [ ] **Step 1: Write the e2e spec**

Mirror an existing per-route spec. Assert: the heading renders; at least one service card is present; the coverage strip states a figure; a concession card shows no ratio; the peer disclosure opens. Then the axe strict pass — and assert the scan **evaluated rules**, not merely that it found nothing.

- [ ] **Step 2: Run it**

Run: `VITE_ENABLE_EFICIENCIA=true npx playwright test e2e/eficiencia.spec.ts`
Expected: PASS, zero axe violations, non-zero rules evaluated.

- [ ] **Step 3: Add the methodology section**

`/metodologia` is the published editorial contract and changes in the same PR. Add a section covering: the source and its legal basis; that unit costs are a division of two declared figures; the three cell states; why concession services show no cost; why peers are filtered to the same gestión mode and floored at n≥15; and that no composite score is published.

- [ ] **Step 4: Full suite**

Run: `npm test && npm run typecheck && npm run lint && npm run check:json && npm run check:indicadores`
Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add e2e/eficiencia.spec.ts src/pages/Metodologia.jsx
git commit -m "test(eficiencia): route spec, axe pass and the methodology contract"
```

---

## Verification

End to end, from a clean checkout:

```bash
npm run scrape:coste-efectivo      # ~11 polite consulta requests + one cached workbook
npm run compute:indicadores
npm run check:indicadores          # must print a non-zero citation count
npm test
npm run typecheck && npm run lint && npm run check:json
VITE_ENABLE_EFICIENCIA=true npm run test:e2e -- e2e/eficiencia.spec.ts
npm run dev                        # read /eficiencia in light and dark
```

The page is correct when: residuos shows a ratio matching `801040 / 11059.41` with a peer band and a 2014–2024 trend; agua and alcantarillado show concesión and **no** ratio and **no** peer position; transporte appears under bloqueados as `cero-sin-declarar`; the coverage strip's figures come from `universe` and match the cards beside them.

## Out of scope for this phase

The friction panel, the PMP adapter, the CONPREL per-capita benchmark, deviation candidates, the curator queue and DEA. `/aviso-legal` changes only if the finding generator ships, which it does not here.

## Self-review notes

- Spec coverage: five traps → Tasks 2 and 5; indicator model and invariants → Task 5; pipeline → Tasks 2–6; peer set committed → Task 4; surfaces → Tasks 7–8; tests → every task; methodology → Task 9. Findings, PMP and DEA are Phases 2–4 and correctly absent.
- Deviation from the spec, deliberate: the spec's three cell states are kept, with a `motivo` field added rather than a fourth state, so the bloqueados panel can explain *why* a cell is `no-declarado` without diluting the enum.
- Type consistency: `CesteRow`, `ModoGestion`, `Magnitud`, `EstadoCelda`, `Motivo` and `construirIndicadores` are used identically in Tasks 2–8.
- Task 3's selectors are deliberately not fully specified — they must be read off the saved fixture, since inventing them would be guessing at HTML nobody has looked at yet. The test asserting shape-parity with the workbook parser is what makes that safe.
