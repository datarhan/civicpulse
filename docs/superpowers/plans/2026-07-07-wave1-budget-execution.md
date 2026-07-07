# Wave 1 — Budget-execution scraper Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Scrape Riba-roja's quarterly budget-EXECUTION PDFs (estados de ejecución) into a typed snapshot and surface *ejecutado vs. presupuestado* on `/presupuesto` — the accountability layer we lack (we only hold the approved budget).

**Architecture:** Repo's standard adapter shape — a pure parser (`src/scraper/budget-execution.ts`, unit-tested against committed PDF-text fixtures) + a node-only fetcher (`budget-execution-fetch.ts`, mirrors `bop-fetch.ts`) + a CLI (`scripts/scrape-budget-execution.ts`) that writes `public/data/budget-execution.json` + a hook + a `/presupuesto` section. RED→GREEN→wire, frequent commits.

**Tech Stack:** TypeScript (tsx), pdf-parse v1 (lazy-loaded, default export → `{text}`), Vitest, React 18, Playwright.

## Global Constraints

- Scrapers are pure-parser + thin-CLI: `fetch` lives only in the CLI/fetch module, never in the parser (`src/scraper/*.ts` parsers take text/data, no I/O).
- Polite fetch UA (ribarroja.es WAF rejects bare UAs): `'Mozilla/5.0 (compatible; CivicPulse/0.1; +https://github.com/datarhan/civicpulse)'`.
- Spanish number format: `.` = thousands, `,` = decimals. `parseSpanishAmount('62.123.153,08') === 62123153.08`.
- Amounts vs percentages: both end `,DD`; exclude percentages with a negative lookahead `(?!%)`.
- Snapshot files carry `{ generatedAt, source, … }` like every other `public/data/*.json`.
- Fixtures are committed (they are the RED contract). Parser tests pin exact euro values.
- UI: inline styles over CSS variables, `Card`/`SectionHead` from `../components/Primitives`, `.mono` + `toLocaleString('es-ES')` for numbers; both light/dark themes work through tokens.
- Every new public route/section keeps the e2e + a11y-strict bar; add the section's assertions.
- Pre-commit runs `npm run lint` (+ prettier `format:check` on `src scripts bot`). Never `--no-verify`; run `npx prettier --write` on new files before committing.
- **Out of scope for this plan (documented Wave 1b follow-up):** wiring `budget-execution.json` as a new evidence source in `src/scraper/claim-verifier.ts`. That modifies a libel-material pipeline and gets its own spec/plan/review. This plan ships the scraper + surface, which is independently valuable.

---

### Task 1: Feasibility fixtures (commit real PDF text)

**Files:**
- Create: `tests/fixtures/budget-execution-gastos_2t2025.txt`
- Create: `tests/fixtures/budget-execution-ingresos_2t2025.txt`

**Interfaces:**
- Produces: the two committed PDF-text fixtures Task 2/3 pin the parser against.

- [ ] **Step 1: Download the two PDFs and extract their text**

```bash
cd /Users/sergeilutchenko/Documents/CivicPulse
TMP=$(mktemp -d)
UA='Mozilla/5.0 (compatible; CivicPulse/0.1; +https://github.com/datarhan/civicpulse)'
G='https://www.ribarroja.es/sites/www.ribarroja.es/files/migrate/746352/filesGroup/1.2-ITEM-37.-Ejecucin-presupuesto-de-gastos-2T2025.pdf'
I='https://www.ribarroja.es/sites/www.ribarroja.es/files/migrate/746352/filesGroup/1.2-ITEM-37.-Ejecucin-presupuesto-de-ingresos-2T2025.pdf'
curl -s -A "$UA" -o "$TMP/g.pdf" "$G"
curl -s -A "$UA" -o "$TMP/i.pdf" "$I"
node -e "const fs=require('fs'),pdf=require('pdf-parse');(async()=>{for(const [f,o] of [['$TMP/g.pdf','tests/fixtures/budget-execution-gastos_2t2025.txt'],['$TMP/i.pdf','tests/fixtures/budget-execution-ingresos_2t2025.txt']]){const d=await pdf(fs.readFileSync(f));fs.writeFileSync(o,d.text);console.log(o,d.text.length,'chars');}})()"
```

Expected: two files written, each > 100000 chars.

- [ ] **Step 2: Confirm the anchor lines are present**

Run:
```bash
grep -c "Total Gastos" tests/fixtures/budget-execution-gastos_2t2025.txt
grep -c "Total Ingresos" tests/fixtures/budget-execution-ingresos_2t2025.txt
grep -m1 "Total Gastos" tests/fixtures/budget-execution-gastos_2t2025.txt | head -c 140
```
Expected: each grep count ≥ 1; the `Total Gastos` line begins `Total Gastos37.599.838,1524.523.314,93...`.

- [ ] **Step 3: Commit**

```bash
git add tests/fixtures/budget-execution-gastos_2t2025.txt tests/fixtures/budget-execution-ingresos_2t2025.txt
git commit -m "test: budget-execution PDF-text fixtures (gastos+ingresos 2T2025) — RED contract"
```

---

### Task 2: Parser — `parseBudgetExecutionPdf` (gastos)

**Files:**
- Create: `src/scraper/budget-execution.ts`
- Test: `tests/parse-budget-execution.test.ts`

**Interfaces:**
- Produces:
  - `parseSpanishAmount(s: string): number`
  - `type ExecKind = 'gastos' | 'ingresos'`
  - `interface ExecLine { capitulo: number; label: string; inicial: number; modificaciones: number; actual: number; ejecutado: number }`
  - `interface ExecDoc { kind: ExecKind; year: number; fechaListado: string | null; chapters: ExecLine[]; total: Omit<ExecLine,'capitulo'|'label'> }`
  - `parseBudgetExecutionPdf(text: string): ExecDoc`
- Consumes: Task 1's gastos fixture.

- [ ] **Step 1: Write the failing test**

Create `tests/parse-budget-execution.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseSpanishAmount, parseBudgetExecutionPdf } from '../src/scraper/budget-execution'

const fx = (n: string) => readFileSync(join(__dirname, 'fixtures', n), 'utf8')

describe('parseSpanishAmount', () => {
  it('parses ES-formatted amounts incl. negatives', () => {
    expect(parseSpanishAmount('62.123.153,08')).toBe(62123153.08)
    expect(parseSpanishAmount('-13.086,58')).toBe(-13086.58)
    expect(parseSpanishAmount('0,00')).toBe(0)
  })
})

describe('parseBudgetExecutionPdf — gastos 2T2025', () => {
  const doc = parseBudgetExecutionPdf(fx('budget-execution-gastos_2t2025.txt'))

  it('reads kind + year', () => {
    expect(doc.kind).toBe('gastos')
    expect(doc.year).toBe(2025)
  })

  it('extracts the grand total (ejecutado = Obligaciones Reconocidas Netas, col 5)', () => {
    expect(doc.total.inicial).toBe(37599838.15)
    expect(doc.total.modificaciones).toBe(24523314.93)
    expect(doc.total.actual).toBe(62123153.08)
    expect(doc.total.ejecutado).toBe(18909465.12) // ORN — matches the listing's 30,44% (18.9M/62.1M)
  })

  it('extracts every chapter total incl. the wrapped Capítulo 2', () => {
    const caps = doc.chapters.map((c) => c.capitulo)
    expect(caps).toEqual([1, 2, 3, 4, 6, 7, 8, 9]) // no Cap 5 in this listing
    const c1 = doc.chapters.find((c) => c.capitulo === 1)!
    expect(c1.label).toBe('GASTOS DE PERSONAL')
    expect(c1.inicial).toBe(19516194.19)
    expect(c1.actual).toBe(20882613.97)
    expect(c1.ejecutado).toBe(9050222.8) // ORN — matches cap.1's 43,34%
    // Capítulo 6 = inversiones reales: budgeted €22.06M, executed €1.03M = 4.7% (the accountability signal)
    const c6 = doc.chapters.find((c) => c.capitulo === 6)!
    expect(c6.actual).toBe(22063735.33)
    expect(c6.ejecutado).toBe(1034230.67)
    // wrapped chapter still captured with a non-empty label + real amounts
    const c2 = doc.chapters.find((c) => c.capitulo === 2)!
    expect(c2.label.length).toBeGreaterThan(5)
    expect(c2.actual).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/parse-budget-execution.test.ts`
Expected: FAIL — `Cannot find module '../src/scraper/budget-execution'`.

- [ ] **Step 3: Write the parser**

Create `src/scraper/budget-execution.ts`:

```ts
/**
 * Pure parser for Riba-roja's quarterly budget-EXECUTION listings (SICALWIN
 * "Estado de ejecución de Gastos/Ingresos" PDFs, pdf-parsed to text upstream).
 * No I/O. The listing ends each chapter with a `Total Capítulo N <LABEL>.<run>`
 * summary line and a `Total Gastos|Ingresos <run>` grand total; each `<run>` is
 * a concatenation of ES-formatted amounts whose COLUMN ORDER DIFFERS between
 * the two listings (see COLS below). We keep inicial/modificaciones/actual and
 * `ejecutado` = the executed metric (gastos: Obligaciones Reconocidas Netas;
 * ingresos: Derechos Reconocidos) — validated against each listing's trailing %.
 */
export type ExecKind = 'gastos' | 'ingresos'

export interface ExecLine {
  capitulo: number
  label: string
  inicial: number
  modificaciones: number
  actual: number
  ejecutado: number
}

export interface ExecDoc {
  kind: ExecKind
  year: number
  fechaListado: string | null
  chapters: ExecLine[]
  total: Omit<ExecLine, 'capitulo' | 'label'>
}

export function parseSpanishAmount(s: string): number {
  return Number(s.replace(/\./g, '').replace(',', '.'))
}

const round2 = (n: number) => Math.round(n * 100) / 100

// ES amounts, EXCLUDING trailing-% figures (percentages share the `,DD` shape).
const AMT = /-?\d{1,3}(?:\.\d{3})*,\d{2}(?!%)/g

function firstAmounts(run: string, n: number): number[] {
  return (run.match(AMT) || []).slice(0, n).map(parseSpanishAmount)
}

// Column index of each metric within a summary line's amount run — the two
// listings have DIFFERENT layouts (confirmed against the fixtures + verified by
// the trailing execution %):
//   gastos   header: Inicial · Modificación · Actual · A · D · O(blig. recon.) · P · …
//            → ejecutado = Obligaciones Reconocidas Netas = index 5
//   ingresos header: Inicial · Actual · Compromisos · DR(derechos recon.) · … (no Modificación col)
//            → ejecutado = Derechos Reconocidos = index 3; actual = index 1
const COLS: Record<ExecKind, { modificaciones: number | null; actual: number; ejecutado: number }> = {
  gastos: { modificaciones: 1, actual: 2, ejecutado: 5 },
  ingresos: { modificaciones: null, actual: 1, ejecutado: 3 },
}

function amountsToLine(a: number[], kind: ExecKind): Omit<ExecLine, 'capitulo' | 'label'> {
  const c = COLS[kind]
  const inicial = a[0] ?? 0
  const actual = a[c.actual] ?? 0
  const ejecutado = a[c.ejecutado] ?? 0
  const modificaciones = c.modificaciones != null ? (a[c.modificaciones] ?? 0) : round2(actual - inicial)
  return { inicial, modificaciones, actual, ejecutado }
}

export function parseBudgetExecutionPdf(text: string): ExecDoc {
  const kind: ExecKind = /Estado de ejecuci[oó]n de Ingresos/i.test(text) ? 'ingresos' : 'gastos'
  const year = Number((text.match(/Periodo:\s*(\d{4})/) || [])[1]) || 0
  const fechaListado = (text.match(/Fecha de listado[^:]*:\s*([\d/]+)/) || [])[1] || null

  const chapters: ExecLine[] = []
  // Marker → label = chars up to the first amount digit (handles both the
  // wrapped gastos Capítulo 2 AND ingresos, whose amounts sit on the NEXT line).
  // Then read the amount run in a bounded window (firstAmounts caps at 9 so the
  // next partida row can't bleed in).
  const markerRe = /Total Cap[ií]tulo\s+(\d+)([\s\S]{0,80}?)(?=-?\d{1,3}(?:\.\d{3})*,\d{2})/g
  let m: RegExpExecArray | null
  while ((m = markerRe.exec(text))) {
    const capitulo = Number(m[1])
    const label = m[2].replace(/[.\s]+$/, '').replace(/\s+/g, ' ').trim()
    const a = firstAmounts(text.slice(markerRe.lastIndex, markerRe.lastIndex + 200), 9)
    chapters.push({ capitulo, label, ...amountsToLine(a, kind) })
  }

  // Grand total: amounts may share the "Total Gastos" line OR fall on the next
  // line ("Total Ingresos"). Window from the LAST marker occurrence handles both.
  const totMarker = kind === 'gastos' ? 'Total Gastos' : 'Total Ingresos'
  const ti = text.lastIndexOf(totMarker)
  const totAmounts = ti >= 0 ? firstAmounts(text.slice(ti + totMarker.length, ti + totMarker.length + 220), 9) : []

  return { kind, year, fechaListado, chapters, total: amountsToLine(totAmounts, kind) }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/parse-budget-execution.test.ts`
Expected: PASS (all cases). If the `capitulo` order or a euro value is off, the concatenation window/label boundary needs adjusting against the fixture — fix until green (that is the TDD contract).

- [ ] **Step 5: Commit**

```bash
npx prettier --write src/scraper/budget-execution.ts tests/parse-budget-execution.test.ts
git add src/scraper/budget-execution.ts tests/parse-budget-execution.test.ts
git commit -m "feat(budget-execution): SICALWIN execution-PDF parser (gastos, TDD)"
```

---

### Task 3: Parser — ingresos coverage

**Files:**
- Modify: `tests/parse-budget-execution.test.ts` (add an ingresos block)

**Interfaces:**
- Consumes: `parseBudgetExecutionPdf` (Task 2); Task 1's ingresos fixture.

- [ ] **Step 1: Add the failing ingresos test**

Append to `tests/parse-budget-execution.test.ts`:

```ts
describe('parseBudgetExecutionPdf — ingresos 2T2025', () => {
  const doc = parseBudgetExecutionPdf(fx('budget-execution-ingresos_2t2025.txt'))

  it('detects the ingresos kind', () => {
    expect(doc.kind).toBe('ingresos')
    expect(doc.year).toBe(2025)
  })

  it('uses the ingresos column layout: actual = col 1, ejecutado (DR) = col 3', () => {
    // Ingresos has no Modificación column; actual is the previsión definitiva.
    expect(doc.total.inicial).toBe(39034883.74)
    expect(doc.total.actual).toBe(59611751.19)
    expect(doc.total.ejecutado).toBe(36814321.64) // Derechos Reconocidos ≈ 61.8% ejecución
    expect(doc.total.modificaciones).toBe(20576867.45) // derived: actual − inicial
  })

  it('extracts revenue chapters incl. Cap 1 Impuestos directos', () => {
    expect(doc.chapters.length).toBeGreaterThan(2)
    const c1 = doc.chapters.find((c) => c.capitulo === 1)!
    expect(c1.label).toBe('Impuestos directos')
    expect(c1.inicial).toBe(17963497.13)
    expect(c1.actual).toBe(17963497.13)
    expect(c1.ejecutado).toBe(12730686.61)
  })
})
```

- [ ] **Step 2: Run it**

Run: `npx vitest run tests/parse-budget-execution.test.ts`
Expected: PASS. The parser already handles ingresos via the `kind` branch — if `doc.kind` is wrong, widen the `ejecuci[oó]n de Ingresos` detector to match the fixture's header wording (read it from the fixture); if chapters are empty, the ingresos listing uses the same `Total Capítulo` markers, so the same code path applies.

- [ ] **Step 3: Commit**

```bash
git add tests/parse-budget-execution.test.ts
git commit -m "test(budget-execution): ingresos parse coverage"
```

---

### Task 4: Period merge — `mergeExecutionPeriod`

**Files:**
- Modify: `src/scraper/budget-execution.ts` (add the merge fn + period types)
- Modify: `tests/parse-budget-execution.test.ts` (add a merge block)

**Interfaces:**
- Produces:
  - `interface BudgetExecutionPeriod { year: number; trimestre: number | null; fechaListado: string | null; gastos: { total: ExecDoc['total']; chapters: ExecLine[] }; ingresos: { total: ExecDoc['total']; chapters: ExecLine[] }; ejecucionPct: { gastos: number; ingresos: number } }`
  - `mergeExecutionPeriod(gastos: ExecDoc, ingresos: ExecDoc, meta: { trimestre: number | null }): BudgetExecutionPeriod`
  - `pct(ejecutado: number, actual: number): number` (0–100, one decimal; 0 when `actual<=0`)

- [ ] **Step 1: Write the failing test**

Append:

```ts
import { mergeExecutionPeriod, pct } from '../src/scraper/budget-execution'

describe('mergeExecutionPeriod', () => {
  it('pct is executed/actual as a 0–100 percentage, safe on zero', () => {
    expect(pct(18909465.12, 62123153.08)).toBe(30.4)
    expect(pct(5, 0)).toBe(0)
  })

  it('combines gastos+ingresos into one period with execution %', () => {
    const g = parseBudgetExecutionPdf(fx('budget-execution-gastos_2t2025.txt'))
    const i = parseBudgetExecutionPdf(fx('budget-execution-ingresos_2t2025.txt'))
    const p = mergeExecutionPeriod(g, i, { trimestre: 2 })
    expect(p.year).toBe(2025)
    expect(p.trimestre).toBe(2)
    expect(p.gastos.total.actual).toBe(62123153.08)
    expect(p.ejecucionPct.gastos).toBe(30.4)
    expect(p.ejecucionPct.ingresos).toBe(61.8)
    expect(p.ingresos.chapters.length).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 2: Run it (fails — merge fn missing)**

Run: `npx vitest run tests/parse-budget-execution.test.ts`
Expected: FAIL — `mergeExecutionPeriod`/`pct` not exported.

- [ ] **Step 3: Implement**

Append to `src/scraper/budget-execution.ts`:

```ts
export interface BudgetExecutionPeriod {
  year: number
  trimestre: number | null
  fechaListado: string | null
  gastos: { total: ExecDoc['total']; chapters: ExecLine[] }
  ingresos: { total: ExecDoc['total']; chapters: ExecLine[] }
  ejecucionPct: { gastos: number; ingresos: number }
}

export function pct(ejecutado: number, actual: number): number {
  if (!(actual > 0)) return 0
  return Math.round((ejecutado / actual) * 1000) / 10
}

export function mergeExecutionPeriod(
  gastos: ExecDoc,
  ingresos: ExecDoc,
  meta: { trimestre: number | null }
): BudgetExecutionPeriod {
  return {
    year: gastos.year || ingresos.year,
    trimestre: meta.trimestre,
    fechaListado: gastos.fechaListado ?? ingresos.fechaListado,
    gastos: { total: gastos.total, chapters: gastos.chapters },
    ingresos: { total: ingresos.total, chapters: ingresos.chapters },
    ejecucionPct: {
      gastos: pct(gastos.total.ejecutado, gastos.total.actual),
      ingresos: pct(ingresos.total.ejecutado, ingresos.total.actual),
    },
  }
}
```

- [ ] **Step 4: Run it (passes)**

Run: `npx vitest run tests/parse-budget-execution.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
npx prettier --write src/scraper/budget-execution.ts tests/parse-budget-execution.test.ts
git add src/scraper/budget-execution.ts tests/parse-budget-execution.test.ts
git commit -m "feat(budget-execution): merge gastos+ingresos into a period w/ execution %"
```

---

### Task 5: Fetcher — `budget-execution-fetch.ts`

**Files:**
- Create: `src/scraper/budget-execution-fetch.ts`

**Interfaces:**
- Produces:
  - `fetchPdfText(url: string): Promise<string | null>` — node-only; UA + `Accept: application/pdf`; returns pdf-parsed text, or `null` on non-200 / non-PDF.
  - `EXEC_INDEX_URL` const = the estados-de-ejecución index URL.
  - `fetchExecutionIndex(): Promise<Array<{ label: string; href: string }>>` — fetches the index HTML, returns the year/trimestre content-page links.

- [ ] **Step 1: Implement (network module — no unit test, mirrors `bop-fetch.ts`)**

Create `src/scraper/budget-execution-fetch.ts`:

```ts
/**
 * Node-only fetcher for Riba-roja budget-execution PDFs (sibling of
 * bop-fetch.ts). The pure parser in budget-execution.ts never touches network.
 */
const UA = 'Mozilla/5.0 (compatible; CivicPulse/0.1; +https://github.com/datarhan/civicpulse)'

export const EXEC_INDEX_URL =
  'https://www.ribarroja.es/es/1_gestion_presupuestaria/2_estados_ejecucion_presupuesto'

export async function fetchPdfText(url: string): Promise<string | null> {
  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/pdf,*/*' } })
  if (!res.ok) return null
  const ct = res.headers.get('content-type') || ''
  if (!/pdf/i.test(ct) && !/\.pdf/i.test(url)) return null
  const buf = Buffer.from(await res.arrayBuffer())
  // pdf-parse v1: default export → { text }. Lazy-load (heavy pdfjs dep).
  const mod = (await import('pdf-parse')) as unknown as {
    default: (b: Buffer) => Promise<{ text: string }>
  }
  const { text } = await mod.default(buf)
  return text
}

export async function fetchExecutionIndex(): Promise<Array<{ label: string; href: string }>> {
  const res = await fetch(EXEC_INDEX_URL, { headers: { 'User-Agent': UA } })
  if (!res.ok) return []
  const html = await res.text()
  // Content-page links inside the estados-de-ejecución index (year / trimestre).
  const out: Array<{ label: string; href: string }> = []
  const re = /<a[^>]+href="([^"]+)"[^>]*>([^<]{4,80}?)<\/a>/g
  let m: RegExpExecArray | null
  while ((m = re.exec(html))) {
    const href = m[1]
    const label = m[2].replace(/\s+/g, ' ').trim()
    if (/ejecuci[oó]n|trimestre/i.test(label) && /2_estados_ejecucion|estados-de-ejecuci/i.test(href)) {
      out.push({ label, href: href.startsWith('http') ? href : `https://www.ribarroja.es${href}` })
    }
  }
  return out
}
```

- [ ] **Step 2: Smoke-check the fetcher against the live site**

Run:
```bash
npx tsx -e "import('./src/scraper/budget-execution-fetch.ts').then(async m=>{const ix=await m.fetchExecutionIndex();console.log('index periods:',ix.length,ix.slice(0,3));})"
```
Expected: prints ≥ 3 period links (2023-Q2 … 2026). If 0, widen the label/href filter in `fetchExecutionIndex` to match the live markup (inspect with `curl -A "$UA" "$EXEC_INDEX_URL" | grep -o 'href="[^"]*ejecucion[^"]*"'`).

- [ ] **Step 3: Commit**

```bash
npx prettier --write src/scraper/budget-execution-fetch.ts
git add src/scraper/budget-execution-fetch.ts
git commit -m "feat(budget-execution): node fetcher (index + pdf-parse)"
```

---

### Task 6: CLI — `scrape-budget-execution.ts` + `budget-execution.json`

**Files:**
- Create: `scripts/scrape-budget-execution.ts`
- Modify: `package.json` (add `scrape:budget-execution` script)
- Create (generated): `public/data/budget-execution.json`

**Interfaces:**
- Consumes: `parseBudgetExecutionPdf`, `mergeExecutionPeriod` (Task 2/4); `fetchPdfText`, `fetchExecutionIndex`, `EXEC_INDEX_URL` (Task 5).
- Produces: `public/data/budget-execution.json` = `{ generatedAt, source, periods: BudgetExecutionPeriod[], latest: BudgetExecutionPeriod | null }` — `periods` sorted oldest→newest, `latest` = the most recent by (year, trimestre).

- [ ] **Step 1: Write the CLI**

Create `scripts/scrape-budget-execution.ts`:

```ts
/**
 * Scrapes the estados-de-ejecución index → per-period gastos+ingresos PDFs →
 * public/data/budget-execution.json. Idempotent; polite (throttled). Best-effort
 * per period: a period whose PDFs 404 is skipped (logged), never fatal.
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  parseBudgetExecutionPdf,
  mergeExecutionPeriod,
  type BudgetExecutionPeriod,
} from '../src/scraper/budget-execution'
import { fetchPdfText, fetchExecutionIndex, EXEC_INDEX_URL } from '../src/scraper/budget-execution-fetch'

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public/data/budget-execution.json')
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

// From a period content-page, find its gastos + ingresos PDF URLs.
async function pdfUrlsFor(pageUrl: string): Promise<{ gastos?: string; ingresos?: string }> {
  const res = await fetch(pageUrl, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; CivicPulse/0.1)' },
  })
  if (!res.ok) return {}
  const html = await res.text()
  const links = [...html.matchAll(/href="([^"]+\.pdf[^"]*)"[^>]*>([^<]*)</gi)].map((m) => ({
    href: m[1].startsWith('http') ? m[1] : `https://www.ribarroja.es${m[1]}`,
    text: m[2],
  }))
  const pick = (rx: RegExp) => links.find((l) => rx.test(l.text) || rx.test(l.href))?.href
  return { gastos: pick(/gasto/i), ingresos: pick(/ingreso/i) }
}

function trimestreOf(label: string): number | null {
  const m = label.match(/(\d)\s*[ºo]?\s*trimestre|trimestre\s*(\d)/i)
  return m ? Number(m[1] || m[2]) : null
}

async function main() {
  const index = await fetchExecutionIndex()
  const periods: BudgetExecutionPeriod[] = []
  for (const it of index) {
    const { gastos: gUrl, ingresos: iUrl } = await pdfUrlsFor(it.href)
    if (!gUrl && !iUrl) {
      console.warn(`skip (no PDFs): ${it.label}`)
      continue
    }
    const [gText, iText] = await Promise.all([
      gUrl ? fetchPdfText(gUrl) : Promise.resolve(null),
      iUrl ? fetchPdfText(iUrl) : Promise.resolve(null),
    ])
    if (!gText && !iText) {
      console.warn(`skip (PDF fetch failed): ${it.label}`)
      continue
    }
    const g = gText ? parseBudgetExecutionPdf(gText) : { kind: 'gastos' as const, year: 0, fechaListado: null, chapters: [], total: { inicial: 0, modificaciones: 0, actual: 0, ejecutado: 0 } }
    const i = iText ? parseBudgetExecutionPdf(iText) : { kind: 'ingresos' as const, year: 0, fechaListado: null, chapters: [], total: { inicial: 0, modificaciones: 0, actual: 0, ejecutado: 0 } }
    periods.push(mergeExecutionPeriod(g, i, { trimestre: trimestreOf(it.label) }))
    await sleep(400)
  }
  periods.sort((a, b) => a.year - b.year || (a.trimestre ?? 0) - (b.trimestre ?? 0))
  const latest = periods[periods.length - 1] ?? null
  await mkdir(dirname(OUT), { recursive: true })
  await writeFile(
    OUT,
    JSON.stringify({ generatedAt: new Date().toISOString(), source: EXEC_INDEX_URL, periods, latest }, null, 2)
  )
  console.log(`wrote ${periods.length} periods · latest ${latest?.year} T${latest?.trimestre ?? '-'} · ejecución gastos ${latest?.ejecucionPct.gastos}%`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
```

- [ ] **Step 2: Add the npm script**

In `package.json` `"scripts"`, next to the other `scrape:*` entries, add:

```json
    "scrape:budget-execution": "npx tsx scripts/scrape-budget-execution.ts",
```

- [ ] **Step 3: Run it against the live site**

Run: `npm run scrape:budget-execution`
Expected: `wrote N periods · latest 2026 T… · ejecución gastos …%` with N ≥ 4; `public/data/budget-execution.json` exists and `jq '.latest.gastos.total.actual' public/data/budget-execution.json` prints a number. Re-run once → identical `periods` (idempotent; only `generatedAt` differs).

- [ ] **Step 4: Commit (code + generated snapshot)**

```bash
npx prettier --write scripts/scrape-budget-execution.ts
git add scripts/scrape-budget-execution.ts package.json public/data/budget-execution.json
git commit -m "feat(budget-execution): scrape CLI + budget-execution.json snapshot"
```

---

### Task 7: Hook — `useBudgetExecution`

**Files:**
- Create: `src/hooks/useBudgetExecution.js`

**Interfaces:**
- Produces: `useBudgetExecution()` → `{ loading, error, data }` (data = the snapshot or `null`); `execPct(period)` helper is NOT needed (the JSON carries `ejecucionPct`).
- Consumes: existing `useJsonFetch` (`src/hooks/useJsonFetch.js`).

- [ ] **Step 1: Implement**

Create `src/hooks/useBudgetExecution.js`:

```js
// @ts-check
import { useJsonFetch } from './useJsonFetch'

// Quarterly budget-EXECUTION snapshot (ejecutado vs. presupuestado). Ships empty
// until the first scrape; a 404 resolves to the empty shape rather than erroring.
const EMPTY = { periods: [], latest: null }

export function useBudgetExecution() {
  return useJsonFetch('/data/budget-execution.json', EMPTY)
}
```

- [ ] **Step 2: Verify it builds**

Run: `npm run lint && npm run build`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useBudgetExecution.js
git commit -m "feat(budget-execution): useBudgetExecution hook"
```

---

### Task 8: `/presupuesto` — "Ejecución presupuestaria" section + e2e/a11y

**Files:**
- Modify: `src/pages/Presupuesto.jsx` (add a section + render)
- Create: `tests/e2e/presupuesto-ejecucion.spec.ts`
- Modify: `tests/e2e/a11y.spec.ts` (no new route — `/presupuesto` is already in STRICT_ROUTES; just re-verify)

**Interfaces:**
- Consumes: `useBudgetExecution` (Task 7); `Card`, `SectionHead` from `../components/Primitives`.
- Produces: an "Ejecución presupuestaria" section on `/presupuesto` rendering the latest period's execution — headline `ejecutado vs. actual` for gastos + ingresos, execution %, and per-chapter bars for gastos.

- [ ] **Step 1: Add the section component to `Presupuesto.jsx`**

Near the top of `src/pages/Presupuesto.jsx`, add the import (join the existing hook import line group):

```jsx
import { useBudgetExecution } from '../hooks/useBudgetExecution'
```

Then add this component in the file (above the default export):

```jsx
function EjecucionSection() {
  const { data } = useBudgetExecution()
  const p = data?.latest
  if (!p || !(p.gastos?.total?.actual > 0)) return null
  const eur = (n) =>
    new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n)
  const maxCh = Math.max(...p.gastos.chapters.map((c) => c.actual), 1)
  return (
    <Card>
      <SectionHead
        eyebrow={`Ejecución · ${p.year}${p.trimestre ? ` · ${p.trimestre}º trimestre` : ''}`}
        title="Ejecución presupuestaria"
      />
      <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', margin: '10px 0 18px' }}>
        {[
          { k: 'Gastos ejecutados', e: p.gastos.total.ejecutado, a: p.gastos.total.actual, pc: p.ejecucionPct.gastos },
          { k: 'Ingresos ejecutados', e: p.ingresos.total.ejecutado, a: p.ingresos.total.actual, pc: p.ejecucionPct.ingresos },
        ].map((s) => (
          <div key={s.k} style={{ flex: '1 1 220px' }}>
            <div className="mono" style={{ fontSize: 22, fontWeight: 600, color: 'var(--civic)' }}>
              {s.pc}%
            </div>
            <div style={{ fontSize: 12.5, color: 'var(--ink60)', marginTop: 4 }}>
              {s.k} · <span className="mono">{eur(s.e)}</span> de <span className="mono">{eur(s.a)}</span>
            </div>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {p.gastos.chapters.map((c) => {
          const cp = c.actual > 0 ? Math.round((c.ejecutado / c.actual) * 100) : 0
          return (
            <div key={c.capitulo}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginBottom: 3 }}>
                <span style={{ color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {c.label}
                </span>
                <span className="mono" style={{ color: 'var(--ink60)', flexShrink: 0 }}>
                  {cp}% · {eur(c.ejecutado)}
                </span>
              </div>
              <div style={{ height: 7, background: 'var(--soft)', borderRadius: 4, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${Math.max(2, (c.actual / maxCh) * 100)}%`, background: 'var(--border)', borderRadius: 4, position: 'relative' }}>
                  <div style={{ position: 'absolute', inset: 0, width: `${cp}%`, background: 'var(--civic)', borderRadius: 4 }} />
                </div>
              </div>
            </div>
          )
        })}
      </div>
      <p style={{ fontSize: 11.5, color: 'var(--ink50)', marginTop: 12, marginBottom: 0 }}>
        Ejecutado = obligaciones reconocidas netas sobre presupuesto definitivo. Fuente: Ayuntamiento
        de Riba-roja · estados de ejecución presupuestaria.
      </p>
    </Card>
  )
}
```

Then render `<EjecucionSection />` inside the page's main content, immediately after the existing budget KPI `Card` (search for the first `</Card>` inside the default-export return and insert `<EjecucionSection />` after it).

- [ ] **Step 2: Verify build + the section renders with real data**

Run:
```bash
npm run lint && npm run build
(npm run preview -- --port 4174 >/dev/null 2>&1 &) ; sleep 2
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:4174/presupuesto
pkill -f "vite preview"
```
Expected: lint/build clean, HTTP 200. (Visual: the section shows the latest period's gastos/ingresos execution % + chapter bars.)

- [ ] **Step 3: Write the e2e spec**

Create `tests/e2e/presupuesto-ejecucion.spec.ts`:

```ts
import { test, expect } from '@playwright/test'

test.describe('Presupuesto · ejecución', () => {
  test('renders the execution section from budget-execution.json', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(String(e)))
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text())
    })
    await page.goto('/presupuesto', { waitUntil: 'domcontentloaded' })
    await expect(page.getByText('Ejecución presupuestaria').first()).toBeVisible({ timeout: 8000 })
    // execution figures render (a % and the "ejecutados" label)
    await expect(page.getByText(/Gastos ejecutados/).first()).toBeVisible()
    expect(errors.filter((e) => !/favicon|ws:/i.test(e))).toEqual([])
  })
})
```

- [ ] **Step 4: Run e2e + a11y for /presupuesto**

Run:
```bash
npx playwright test tests/e2e/presupuesto-ejecucion.spec.ts --project=chromium-desktop
npx playwright test tests/e2e/a11y.spec.ts --project=chromium-desktop -g "/presupuesto"
```
Expected: both pass (a11y strict — the new bars are decorative divs with text labels; if axe flags contrast on `--border` bar backgrounds, that's fine as they're non-text, but re-verify).

- [ ] **Step 5: Commit**

```bash
npx prettier --write src/pages/Presupuesto.jsx tests/e2e/presupuesto-ejecucion.spec.ts
git add src/pages/Presupuesto.jsx tests/e2e/presupuesto-ejecucion.spec.ts
git commit -m "feat(presupuesto): ejecución presupuestaria section (ejecutado vs actual)"
```

---

### Task 9: Wire into the nightly pipeline

**Files:**
- Modify: `scripts/scrape-all.sh` (add the adapter to the walk)
- Modify: `CLAUDE.md` (add the scraper to the commands list + the sources table — one line each)

**Interfaces:**
- Consumes: `scrape:budget-execution` (Task 6).

- [ ] **Step 1: Add to `scrape-all.sh`**

Open `scripts/scrape-all.sh`, find the list of `run npm run scrape:*` invocations (the autonomous walk), and add — grouped with the other ribarroja.es CMS scrapers, classed best-effort like `scrape:participa` since a single-source PDF layout change shouldn't red the whole run:

```bash
run_best_effort "scrape:budget-execution" "npm run scrape:budget-execution"
```

(Match the exact helper name the script uses — if it uses a plain `run`/`step` function with a best-effort flag, mirror the `scrape:participa` / `scrape:metro-network` line precisely.)

- [ ] **Step 2: Verify the script still parses**

Run: `bash -n scripts/scrape-all.sh && echo OK`
Expected: `OK`.

- [ ] **Step 3: Document in CLAUDE.md**

In the `npm run scrape:*` command block, add:
```
npm run scrape:budget-execution     # Estados de ejecución presupuestaria (gastos+ingresos, per quarter) → budget-execution.json
```
And add one row to the "Sources of truth" table:
```
| Budget execution (ejecutado vs presupuestado, quarterly) | `budget-execution.ts` → `budget-execution.json` | Ayuntamiento estados de ejecución PDFs (SICALWIN) | `/presupuesto` "Ejecución presupuestaria" |
```

- [ ] **Step 4: Commit**

```bash
git add scripts/scrape-all.sh CLAUDE.md
git commit -m "chore(budget-execution): add to scrape-all + document"
```

---

## Self-review

- **Spec coverage:** the spec's Wave-1 components — pure parser (T2-4), fetcher (T5), CLI+JSON (T6), hook (T7), `/presupuesto` section + e2e/a11y (T8), `scrape-all.sh` (T9), feasibility spike (T1). The one spec item deliberately **not** here — wiring `budget-execution.json` into `claim-verifier.ts` + the $0 verify re-run + the metered `sin-datos` second-pass — is called out in Global Constraints as **Wave 1b** (separate plan) because it modifies a libel-material pipeline. Flag this scoping to the user.
- **Placeholder scan:** none — every euro value in the tests is real (read from the downloaded PDF); the two "adjust the regex/filter if the fixture/markup differs" notes are TDD fix-instructions with a concrete target, not deferred work.
- **Type consistency:** `ExecDoc`/`ExecLine`/`BudgetExecutionPeriod`/`parseBudgetExecutionPdf`/`mergeExecutionPeriod`/`pct`/`fetchPdfText`/`fetchExecutionIndex`/`EXEC_INDEX_URL` are used identically across tasks; `ejecutado` = executed metric via the kind-aware `COLS` map (gastos col 5 ORN / ingresos col 3 DR); `ejecucionPct` carried on the period consumed unchanged by the hook + UI.
