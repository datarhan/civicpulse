# Wave 3 — municipal hiring + associations registry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Two new municipal open-data surfaces — **procesos selectivos** (the town's own hiring processes → a `/empleo-publico` route) and the **registro de asociaciones** (a civil-society directory on `/datos`) — both server-rendered/static, deterministic, no libel-material surface.

**Architecture:** Repo's standard adapter shape per source — a pure parser (`src/scraper/X.ts`, unit-tested vs a committed fixture) + a node fetcher + a CLI writing `public/data/X.json` + a hook + UI. RED→GREEN→wire. Part A (Tasks 1-8) is procesos selectivos and is independently shippable; Part B (Tasks 9-14) is asociaciones.

**Tech Stack:** TypeScript (tsx), pdf-parse v1 (lazy, default export → `{text}`), Vitest, React 18, Playwright.

## Global Constraints

- Parsers are pure (no I/O); `fetch` lives only in CLI/fetch modules.
- Polite UA (ribarroja.es WAF): `'Mozilla/5.0 (compatible; CivicPulse/0.1; +https://github.com/datarhan/civicpulse)'`.
- Snapshots carry `{ generatedAt, source, … }` like every `public/data/*.json`.
- Fixtures are committed (the RED contract); parser tests pin real values read from the live source.
- **Nav is shared:** routes go in `src/nav.js` (the single `NAV` list both the Sidebar and the landing LeftRail render — see [[data-integration-program]] / CLAUDE.md); every `to:` needs a unique glyph in `src/components/SectionGlyph.jsx` (the `section-glyph.test.jsx` suite iterates NAV). i18n nav label in BOTH `es` and `ca` catalogues in `src/i18n.jsx`.
- UI: inline styles over CSS vars, `Card`/`Pill`/`SectionHead` from `../components/Primitives`, `.mono` for codes/counts, both themes via tokens; honest empty-states.
- New public route keeps the e2e + a11y-strict bar.
- Deterministic, NO LLM. No findings/promises/declaraciones/verifier touched.
- Pre-commit runs lint + prettier `format:check` on `src scripts bot`; run `npx prettier --write` on new files first; never `--no-verify`.

---

# PART A — Procesos selectivos (Tasks 1-8)

### Task 1: Feasibility fixture — the list page HTML

**Files:**
- Create: `tests/fixtures/procesos-selectivos_2026-07.html`

- [ ] **Step 1: Download the list page**

```bash
cd /Users/sergeilutchenko/Documents/CivicPulse
UA='Mozilla/5.0 (compatible; CivicPulse/0.1; +https://github.com/datarhan/civicpulse)'
curl -s -A "$UA" "https://www.ribarroja.es/es/noticia/publicaciones-procesos-selectivos" -o tests/fixtures/procesos-selectivos_2026-07.html
wc -c tests/fixtures/procesos-selectivos_2026-07.html
grep -c "Proceso selectivo\|Bolsa de trabajo\|estabilizaci" tests/fixtures/procesos-selectivos_2026-07.html
```

Expected: file > 50000 bytes; grep count ≥ 5.

- [ ] **Step 2: Commit**

```bash
git add tests/fixtures/procesos-selectivos_2026-07.html
git commit -m "test: procesos-selectivos list fixture — RED contract"
```

---

### Task 2: Parser — `parseProcesosList` (TDD)

**Files:**
- Create: `src/scraper/procesos-selectivos.ts`
- Test: `tests/parse-procesos-selectivos.test.ts`

**Interfaces:**
- Produces:
  - `type ProcesoTipo = 'oposicion' | 'bolsa' | 'estabilizacion' | 'otro'`
  - `interface ProcesoSelectivo { id: string; titulo: string; tipo: ProcesoTipo; url: string }`
  - `parseProcesosList(html: string): ProcesoSelectivo[]`

- [ ] **Step 1: Write the failing test**

Create `tests/parse-procesos-selectivos.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseProcesosList } from '../src/scraper/procesos-selectivos'

const html = readFileSync(join(__dirname, 'fixtures', 'procesos-selectivos_2026-07.html'), 'utf8')

describe('parseProcesosList', () => {
  const rows = parseProcesosList(html)

  it('extracts the municipal hiring processes (deduped)', () => {
    expect(rows.length).toBeGreaterThanOrEqual(8)
    const urls = rows.map((r) => r.url)
    expect(new Set(urls).size).toBe(urls.length) // no dup URLs
    for (const r of rows) {
      expect(r.titulo.length).toBeGreaterThan(6)
      expect(r.url).toMatch(/^https?:\/\//)
      expect(r.id.length).toBeGreaterThan(0)
    }
  })

  it('classifies tipo from the title', () => {
    const byTitle = (needle: string) => rows.find((r) => r.titulo.toLowerCase().includes(needle))
    // "Bolsa de trabajo …" → bolsa; "Procesos estabilización Ley 20/21" → estabilizacion
    expect(byTitle('bolsa de trabajo')?.tipo).toBe('bolsa')
    expect(byTitle('estabilizaci')?.tipo).toBe('estabilizacion')
    // "Proceso selectivo … Conserje" / "Provisión … plazas" → oposicion
    expect(rows.some((r) => r.tipo === 'oposicion')).toBe(true)
  })
})
```

- [ ] **Step 2: Run — fails (module missing)**

Run: `npx vitest run tests/parse-procesos-selectivos.test.ts`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Implement**

Create `src/scraper/procesos-selectivos.ts`:

```ts
/**
 * Pure parser for the municipal hiring-processes list page
 * (ribarroja.es/es/noticia/publicaciones-procesos-selectivos, server-rendered
 * HTML). Extracts one row per hiring process (título + detail URL); tipo is
 * classified from the title. No I/O; per-process document extraction (bases /
 * listas / tribunal PDFs on the detail pages) is a deferred follow-up.
 */
export type ProcesoTipo = 'oposicion' | 'bolsa' | 'estabilizacion' | 'otro'

export interface ProcesoSelectivo {
  id: string
  titulo: string
  tipo: ProcesoTipo
  url: string
}

const HOST = 'https://www.ribarroja.es'
const decode = (s: string) =>
  s
    .replace(/<[^>]+>/g, '')
    .replace(/&aacute;/g, 'á').replace(/&eacute;/g, 'é').replace(/&iacute;/g, 'í')
    .replace(/&oacute;/g, 'ó').replace(/&uacute;/g, 'ú').replace(/&ntilde;/g, 'ñ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#\d+;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

// A link is a hiring process iff its (decoded) text reads like one.
const PROCESO_RE =
  /proceso selectivo|bolsa de trabajo|convocatoria|oposici|estabilizaci|provisi[oó]n|plazas?|bases|concurso|agente|auxiliar|conserje|inspector|profesor|polic[ií]a|t[eé]cnic/i
const CHROME_RE = /facebook|twitter|instagram|youtube|redes|inicio|buscar|portada|cookies|aviso legal|mapa web|^\W*$/i

function classify(titulo: string): ProcesoTipo {
  const t = titulo.toLowerCase()
  if (/estabilizaci/.test(t)) return 'estabilizacion'
  if (/bolsa/.test(t)) return 'bolsa'
  if (/proceso selectivo|oposici|convocatoria|provisi|plazas?|bases|concurso/.test(t)) return 'oposicion'
  return 'otro'
}

export function parseProcesosList(html: string): ProcesoSelectivo[] {
  // Restrict to the main content region when present (drops header/footer nav).
  const main = /<main[^>]*>([\s\S]*?)<\/main>/i.exec(html)?.[1] ?? html
  const out: ProcesoSelectivo[] = []
  const seen = new Set<string>()
  const linkRe = /<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi
  let m: RegExpExecArray | null
  while ((m = linkRe.exec(main))) {
    const titulo = decode(m[2])
    if (!titulo || titulo.length < 7) continue
    if (CHROME_RE.test(titulo) || !PROCESO_RE.test(titulo)) continue
    let url = m[1]
    if (url.startsWith('/')) url = HOST + url
    if (!/^https?:\/\//.test(url) || seen.has(url)) continue
    seen.add(url)
    const idMatch = url.match(/\/contenidos\/(\d+)/) || url.match(/([^/]+)\/?$/)
    out.push({ id: idMatch ? idMatch[1] : url, titulo, tipo: classify(titulo), url })
  }
  return out
}
```

- [ ] **Step 4: Run — passes**

Run: `npx vitest run tests/parse-procesos-selectivos.test.ts`
Expected: PASS. If `rows.length` is under 8 or a tipo assertion fails, widen/adjust `PROCESO_RE`/`CHROME_RE` against the committed fixture until the real processes are captured — do NOT loosen the assertions.

- [ ] **Step 5: Commit**

```bash
npx prettier --write src/scraper/procesos-selectivos.ts tests/parse-procesos-selectivos.test.ts
git add src/scraper/procesos-selectivos.ts tests/parse-procesos-selectivos.test.ts
git commit -m "feat(procesos-selectivos): list parser (TDD)"
```

---

### Task 3: Fetcher — `procesos-selectivos-fetch.ts`

**Files:**
- Create: `src/scraper/procesos-selectivos-fetch.ts`

**Interfaces:**
- Produces: `PROCESOS_URL` const; `fetchProcesosHtml(): Promise<string | null>` (node-only, UA, returns HTML or null on non-200).

- [ ] **Step 1: Implement**

Create `src/scraper/procesos-selectivos-fetch.ts`:

```ts
/** Node-only fetcher for the procesos-selectivos list page. */
const UA = 'Mozilla/5.0 (compatible; CivicPulse/0.1; +https://github.com/datarhan/civicpulse)'

export const PROCESOS_URL =
  'https://www.ribarroja.es/es/noticia/publicaciones-procesos-selectivos'

export async function fetchProcesosHtml(): Promise<string | null> {
  const res = await fetch(PROCESOS_URL, { headers: { 'User-Agent': UA } })
  if (!res.ok) return null
  return res.text()
}
```

- [ ] **Step 2: Smoke-check**

Run: `npx tsx -e "import('./src/scraper/procesos-selectivos-fetch.ts').then(async m=>{const h=await m.fetchProcesosHtml();console.log('html bytes:', h?.length)})"`
Expected: prints a byte count > 50000.

- [ ] **Step 3: Commit**

```bash
npx prettier --write src/scraper/procesos-selectivos-fetch.ts
git add src/scraper/procesos-selectivos-fetch.ts
git commit -m "feat(procesos-selectivos): node fetcher"
```

---

### Task 4: CLI + `procesos-selectivos.json`

**Files:**
- Create: `scripts/scrape-procesos-selectivos.ts`
- Modify: `package.json` (script)
- Create (generated): `public/data/procesos-selectivos.json`

**Interfaces:**
- Consumes: `parseProcesosList` (T2), `fetchProcesosHtml`, `PROCESOS_URL` (T3).
- Produces: `public/data/procesos-selectivos.json` = `{ generatedAt, source, procesos: ProcesoSelectivo[] }`.

- [ ] **Step 1: Write the CLI**

Create `scripts/scrape-procesos-selectivos.ts`:

```ts
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseProcesosList } from '../src/scraper/procesos-selectivos'
import { fetchProcesosHtml, PROCESOS_URL } from '../src/scraper/procesos-selectivos-fetch'

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public/data/procesos-selectivos.json')

async function main() {
  const html = await fetchProcesosHtml()
  if (!html) throw new Error('procesos-selectivos: list page fetch failed')
  const procesos = parseProcesosList(html)
  await mkdir(dirname(OUT), { recursive: true })
  await writeFile(OUT, JSON.stringify({ generatedAt: new Date().toISOString(), source: PROCESOS_URL, procesos }, null, 2))
  console.log(`wrote ${procesos.length} procesos selectivos`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
```

- [ ] **Step 2: Add npm script**

In `package.json` `"scripts"`, next to `scrape:empleo`:

```json
    "scrape:procesos-selectivos": "npx tsx scripts/scrape-procesos-selectivos.ts",
```

- [ ] **Step 3: Run it live**

Run: `npm run scrape:procesos-selectivos`
Expected: `wrote N procesos selectivos` with N ≥ 8; `jq '.procesos[0]' public/data/procesos-selectivos.json` shows `{id,titulo,tipo,url}`. Re-run → identical `procesos` (idempotent; only `generatedAt` differs).

- [ ] **Step 4: Commit**

```bash
npx prettier --write scripts/scrape-procesos-selectivos.ts
git add scripts/scrape-procesos-selectivos.ts package.json public/data/procesos-selectivos.json
git commit -m "feat(procesos-selectivos): scrape CLI + snapshot"
```

---

### Task 5: Hook — `useProcesosSelectivos`

**Files:**
- Create: `src/hooks/useProcesosSelectivos.js`

- [ ] **Step 1: Implement**

Create `src/hooks/useProcesosSelectivos.js`:

```js
// @ts-check
import { useJsonFetch } from './useJsonFetch'

// Municipal hiring processes (the town's own oposiciones / bolsas). Ships empty
// until the first scrape; a 404 resolves to the empty shape.
const EMPTY = { procesos: [] }

export function useProcesosSelectivos() {
  return useJsonFetch('/data/procesos-selectivos.json', EMPTY)
}
```

- [ ] **Step 2: Verify**

Run: `npm run lint && npm run build`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useProcesosSelectivos.js
git commit -m "feat(procesos-selectivos): hook"
```

---

### Task 6: `/empleo-publico` route + nav + glyph + i18n

**Files:**
- Create: `src/pages/EmpleoPublico.jsx`
- Modify: `src/App.jsx` (lazy import + route)
- Modify: `src/nav.js` (NAV entry after `/empleo`)
- Modify: `src/components/SectionGlyph.jsx` (glyph for `/empleo-publico`)
- Modify: `src/i18n.jsx` (`nav.empleoPublico` in es + ca)

**Interfaces:**
- Consumes: `useProcesosSelectivos` (T5); `Card`, `Pill`, `SectionHead` from `../components/Primitives`.
- Produces: route `/empleo-publico`; page h1 `Empleo público` (Task 7's e2e asserts it).

- [ ] **Step 1: i18n keys**

In `src/i18n.jsx`, after the `es` `'nav.empleo': 'Empleo',` line add:
```js
    'nav.empleoPublico': 'Empleo público',
```
After the `ca` `'nav.empleo': 'Ocupació',` line add:
```js
    'nav.empleoPublico': 'Ocupació pública',
```

- [ ] **Step 2: NAV entry**

In `src/nav.js`, immediately after the `/empleo` object (the one with `id: 'empleo'`), add:
```js
  {
    to: '/empleo-publico',
    id: 'empleo-publico',
    labelKey: 'nav.empleoPublico',
    label: 'Empleo público',
    icon: Ic.building,
    shortcut: 'G U',
  },
```

- [ ] **Step 3: Glyph**

In `src/components/SectionGlyph.jsx`, after the `'/empleo'` entry in `SECTION_GLYPHS`, add:
```js
  '/empleo-publico': { glyph: '⊞', tone: 'civic' }, // la convocatoria pública
```
(`⊞` is unused elsewhere in the map — keep it unique.)

- [ ] **Step 4: Page**

Create `src/pages/EmpleoPublico.jsx`:

```jsx
import { Card, Pill, SectionHead } from '../components/Primitives'
import { useProcesosSelectivos } from '../hooks/useProcesosSelectivos'

const TIPO = {
  oposicion: { label: 'Oposición / concurso', tone: 'civic' },
  bolsa: { label: 'Bolsa de trabajo', tone: 'intel' },
  estabilizacion: { label: 'Estabilización', tone: 'ok' },
  otro: { label: 'Otro', tone: 'neutral' },
}

export default function EmpleoPublico() {
  const { loading, error, data } = useProcesosSelectivos()
  const procesos = data?.procesos ?? []
  return (
    <div className="cp-page" style={{ padding: 24, maxWidth: 900, margin: '0 auto' }}>
      <div
        className="mono"
        style={{ fontSize: 10.5, color: 'var(--ink50)', textTransform: 'uppercase', letterSpacing: '.08em' }}
      >
        Ayuntamiento · procesos selectivos
      </div>
      <h1 style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-.015em', marginTop: 2 }}>
        Empleo público
      </h1>
      <p style={{ color: 'var(--ink60)', maxWidth: '64ch' }}>
        Procesos selectivos del propio Ayuntamiento de Riba-roja de Túria —
        oposiciones, bolsas de trabajo y estabilización. Distinto de las ofertas
        de la Agència de Col·locació (ver{' '}
        <a href="/empleo" style={{ color: 'var(--civic)', textDecoration: 'underline' }}>
          /empleo
        </a>
        ). Fuente: portal municipal.
      </p>

      {loading && <p style={{ color: 'var(--ink60)' }}>Cargando…</p>}
      {error && <p style={{ color: 'var(--ink60)' }}>No se pudo cargar el listado.</p>}
      {!loading && !error && procesos.length === 0 && (
        <Card style={{ marginTop: 16 }}>
          <p style={{ margin: 0, color: 'var(--ink60)' }}>
            No hay procesos selectivos publicados ahora mismo.
          </p>
        </Card>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 16 }}>
        {procesos.map((p) => {
          const t = TIPO[p.tipo] ?? TIPO.otro
          return (
            <Card key={p.id} hover>
              <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', justifyContent: 'space-between' }}>
                <a href={p.url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--ink)', fontWeight: 600, textDecoration: 'none', flex: 1 }}>
                  {p.titulo}
                </a>
                <Pill tone={t.tone}>{t.label}</Pill>
              </div>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Route**

In `src/App.jsx`, add the lazy import next to the other page imports:
```js
const EmpleoPublico = lazy(() => import('./pages/EmpleoPublico'))
```
And a route (near `/empleo`):
```jsx
              <Route path="/empleo-publico" element={<EmpleoPublico />} />
```

- [ ] **Step 6: Verify**

Run: `npm run lint && npx vitest run tests/components/section-glyph.test.jsx && npm run build`
Expected: lint clean; glyph tests pass (the NAV-route-needs-a-glyph + uniqueness checks now cover `/empleo-publico`); build clean.

- [ ] **Step 7: Commit**

```bash
npx prettier --write src/pages/EmpleoPublico.jsx src/App.jsx src/nav.js src/components/SectionGlyph.jsx src/i18n.jsx
git add src/pages/EmpleoPublico.jsx src/App.jsx src/nav.js src/components/SectionGlyph.jsx src/i18n.jsx
git commit -m "feat(empleo-publico): /empleo-publico route + nav + glyph"
```

---

### Task 7: e2e + a11y for `/empleo-publico`

**Files:**
- Create: `tests/e2e/empleo-publico.spec.ts`
- Modify: `tests/e2e/a11y.spec.ts` (STRICT_ROUTES += `/empleo-publico`)
- Modify: `tests/e2e/chrome.spec.ts` (sidebar nav-links list += `Empleo público`)

- [ ] **Step 1: e2e spec**

Create `tests/e2e/empleo-publico.spec.ts`:

```ts
import { test, expect } from '@playwright/test'

test.describe('Empleo público (/empleo-publico)', () => {
  test('renders the municipal hiring processes', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(String(e)))
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text())
    })
    await page.goto('/empleo-publico', { waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('heading', { name: 'Empleo público' })).toBeVisible({ timeout: 8000 })
    // distinct from the ADL feed
    await expect(page.getByText(/procesos selectivos del propio Ayuntamiento/i).first()).toBeVisible()
    expect(errors.filter((e) => !/favicon|ws:/i.test(e))).toEqual([])
  })
})
```

- [ ] **Step 2: a11y + chrome nav-links**

In `tests/e2e/a11y.spec.ts` `STRICT_ROUTES`, add after the `/empleo` entry:
```ts
  '/empleo-publico',
```
In `tests/e2e/chrome.spec.ts`, find the sidebar nav-links list and add `'Empleo público'` following its neighbours' format.

- [ ] **Step 3: Run**

```bash
npx playwright test tests/e2e/empleo-publico.spec.ts --project=chromium-desktop
npx playwright test tests/e2e/a11y.spec.ts --project=chromium-desktop -g "empleo-publico"
npx playwright test tests/e2e/chrome.spec.ts --project=chromium-desktop
```
Expected: all pass (a11y strict — the cards are links + Pills with text; if the Pill contrast flags, that token pairing is already used elsewhere, so re-verify).

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/empleo-publico.spec.ts tests/e2e/a11y.spec.ts tests/e2e/chrome.spec.ts
git commit -m "test(e2e): empleo-publico route + a11y + nav coverage"
```

---

### Task 8: Wire procesos into scrape-all

**Files:**
- Modify: `scripts/scrape-all.sh` (best-effort adapter)

- [ ] **Step 1: Add to the SCRAPERS + BEST_EFFORT arrays**

In `scripts/scrape-all.sh`, add `scrape:procesos-selectivos` to the `SCRAPERS` array (grouped with the ribarroja.es scrapers) and to the `BEST_EFFORT` array (single-source HTML — a markup change must not red the nightly), mirroring the exact indentation of the existing `scrape:budget-execution` entry.

- [ ] **Step 2: Verify**

Run: `bash -n scripts/scrape-all.sh && echo OK`
Expected: `OK`.

- [ ] **Step 3: Commit**

```bash
git add scripts/scrape-all.sh
git commit -m "chore(procesos-selectivos): add to scrape-all (best-effort)"
```

**Part A ships here — `/empleo-publico` is a complete, independent feature.**

---

# PART B — Registro de asociaciones (Tasks 9-14)

### Task 9: Feasibility fixture — the register PDF text

**Files:**
- Create: `tests/fixtures/asociaciones_2026-05-28.txt`

- [ ] **Step 1: Download + pdf-parse the register PDF**

```bash
cd /Users/sergeilutchenko/Documents/CivicPulse
UA='Mozilla/5.0 (compatible; CivicPulse/0.1; +https://github.com/datarhan/civicpulse)'
URL='https://www.ribarroja.es/sites/www.ribarroja.es/files/20260528%2020260527%20Registro%20Asociaciones%20Web.pdf'
TMP=$(mktemp); curl -s -A "$UA" -o "$TMP" "$URL"
node -e "const fs=require('fs'),pdf=require('pdf-parse');pdf(fs.readFileSync('$TMP')).then(d=>{fs.writeFileSync('tests/fixtures/asociaciones_2026-05-28.txt',d.text);console.log(d.text.length,'chars')})"
grep -c "Riba-roja" tests/fixtures/asociaciones_2026-05-28.txt
```

Expected: > 8000 chars; grep count ≥ 50 (most rows carry the town in the address).

- [ ] **Step 2: Commit**

```bash
git add tests/fixtures/asociaciones_2026-05-28.txt
git commit -m "test: asociaciones register PDF-text fixture — RED contract"
```

---

### Task 10: Parser — `parseAsociacionesPdf` (TDD)

**Files:**
- Create: `src/scraper/asociaciones.ts`
- Test: `tests/parse-asociaciones.test.ts`

**Interfaces:**
- Produces:
  - `interface Asociacion { nombre: string; tipo: string | null; domicilio: string | null; email: string | null }`
  - `interface AsociacionesDoc { fechaRegistro: string | null; asociaciones: Asociacion[] }`
  - `parseAsociacionesPdf(text: string): AsociacionesDoc`

- [ ] **Step 1: Write the failing test**

Create `tests/parse-asociaciones.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseAsociacionesPdf } from '../src/scraper/asociaciones'

const text = readFileSync(join(__dirname, 'fixtures', 'asociaciones_2026-05-28.txt'), 'utf8')
const doc = parseAsociacionesPdf(text)

describe('parseAsociacionesPdf', () => {
  it('reads the register date', () => {
    expect(doc.fechaRegistro).toMatch(/2026/)
  })

  it('extracts the association rows', () => {
    expect(doc.asociaciones.length).toBeGreaterThanOrEqual(80)
    for (const a of doc.asociaciones) expect(a.nombre.length).toBeGreaterThan(2)
  })

  it('splits nombre / tipo / email on a known row', () => {
    const c = doc.asociaciones.find((a) => a.nombre.startsWith('Centro Cultural Cervantes'))!
    expect(c.tipo).toBe('Cultural')
    expect(c.email).toBe('afacundo@dib.upv.es')
    // most rows classify a tipo from the controlled vocabulary
    const typed = doc.asociaciones.filter((a) => a.tipo).length
    expect(typed).toBeGreaterThan(doc.asociaciones.length * 0.7)
  })
})
```

- [ ] **Step 2: Run — fails**

Run: `npx vitest run tests/parse-asociaciones.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement**

Create `src/scraper/asociaciones.ts`:

```ts
/**
 * Pure parser for the municipal association register PDF (pdf-parsed to text
 * upstream). Each row is "<Nombre><Tipo>␠␠<Domicilio><Correo>" — the type is a
 * controlled vocabulary glued to the name and followed by 2+ spaces; the email
 * (when present) is the trailing token. No I/O.
 */
export interface Asociacion {
  nombre: string
  tipo: string | null
  domicilio: string | null
  email: string | null
}

export interface AsociacionesDoc {
  fechaRegistro: string | null
  asociaciones: Asociacion[]
}

// Controlled vocabulary of tipos (from the register). Longest-first so
// "B.Animal" wins over "Animal" and multi-word types match before single.
const TIPOS = [
  'Medioambiental',
  'B.Animal',
  'Deportiva',
  'Educativa',
  'Solidaria',
  'Religiosa',
  'Comercial',
  'Cultural',
  'Vecinal',
  'Sanitaria',
  'Fiestas',
  'Musical',
  'Juvenil',
  'Social',
  'Mujer',
  'Falla',
  'Peña',
].sort((a, b) => b.length - a.length)

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/

export function parseAsociacionesPdf(text: string): AsociacionesDoc {
  const fechaRegistro = (text.match(/Fecha actualizaci[oó]n\s+(.+)/i) || [])[1]?.trim() || null

  const asociaciones: Asociacion[] = []
  for (const raw of text.split('\n')) {
    const line = raw.trim()
    if (line.length < 8) continue
    if (/^Fecha actualiz|Nombre de la entidad/i.test(line)) continue

    // Split "<Nombre><Tipo>" from the rest at the first 2+ space gap.
    const gap = line.match(/^(.+?)\s{2,}(.*)$/)
    const left = (gap ? gap[1] : line).trim()
    const rest = gap ? gap[2].trim() : ''

    // tipo = the vocabulary token the left segment ends with (glued to nombre).
    let tipo: string | null = null
    let nombre = left
    for (const t of TIPOS) {
      if (left.endsWith(t) && left.length > t.length) {
        tipo = t
        nombre = left.slice(0, left.length - t.length).trim()
        break
      }
    }

    const email = rest.match(EMAIL_RE)?.[0] ?? null
    const domicilio = (email ? rest.replace(email, '') : rest).trim() || null
    if (nombre.length < 3) continue
    asociaciones.push({ nombre, tipo, domicilio, email })
  }

  return { fechaRegistro, asociaciones }
}
```

- [ ] **Step 4: Run — passes**

Run: `npx vitest run tests/parse-asociaciones.test.ts`
Expected: PASS. If the typed-ratio assertion fails, a tipo is missing from `TIPOS` — inspect the fixture (`grep` the untyped rows' trailing tokens) and add it; do NOT loosen the assertions.

- [ ] **Step 5: Commit**

```bash
npx prettier --write src/scraper/asociaciones.ts tests/parse-asociaciones.test.ts
git add src/scraper/asociaciones.ts tests/parse-asociaciones.test.ts
git commit -m "feat(asociaciones): register-PDF parser (TDD)"
```

---

### Task 11: CLI + `asociaciones.json`

**Files:**
- Create: `scripts/scrape-asociaciones.ts`
- Modify: `package.json` (script)
- Create (generated): `public/data/asociaciones.json`

**Interfaces:**
- Consumes: `parseAsociacionesPdf` (T10).
- Produces: `public/data/asociaciones.json` = `{ generatedAt, source, fechaRegistro, asociaciones: Asociacion[] }`.

- [ ] **Step 1: Write the CLI**

Create `scripts/scrape-asociaciones.ts`:

```ts
/**
 * Locates the newest dated "Registro Asociaciones" PDF on the participación
 * page, pdf-parses it, and writes public/data/asociaciones.json. Idempotent.
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseAsociacionesPdf } from '../src/scraper/asociaciones'

const UA = 'Mozilla/5.0 (compatible; CivicPulse/0.1; +https://github.com/datarhan/civicpulse)'
const LISTING =
  'https://www.ribarroja.es/es/participacion_y_transparencia/2_pagina_web__relaciones_con_los_ciudadanos_y_la_sociedad__y_participacion_ciudadana/entidades_y_asociaciones_de_vecinos_del_municipio/contenidos/1141262/1043662'
const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public/data/asociaciones.json')

async function fetchPdfText(url: string): Promise<string | null> {
  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/pdf,*/*' } })
  if (!res.ok) return null
  const buf = Buffer.from(await res.arrayBuffer())
  const mod = (await import('pdf-parse')) as unknown as { default: (b: Buffer) => Promise<{ text: string }> }
  return (await mod.default(buf)).text
}

async function main() {
  const html = await fetch(LISTING, { headers: { 'User-Agent': UA } }).then((r) => r.text())
  // pick the newest "Registro Asociaciones" PDF (filenames start with a YYYYMMDD date).
  const pdfs = [...html.matchAll(/href="([^"]+\.pdf[^"]*)"[^>]*>([^<]*)</gi)]
    .map((m) => ({ href: m[1].startsWith('http') ? m[1] : `https://www.ribarroja.es${m[1]}`, text: m[2] }))
    .filter((p) => /registro\s*asociaciones/i.test(decodeURIComponent(p.href)) || /registro asociaciones/i.test(p.text))
  pdfs.sort((a, b) => b.href.localeCompare(a.href)) // date-prefixed filenames sort newest-last-alphabetically → reverse
  const target = pdfs[0]
  if (!target) throw new Error('asociaciones: no register PDF found on the listing page')

  const text = await fetchPdfText(target.href)
  if (!text) throw new Error('asociaciones: register PDF fetch failed')
  const doc = parseAsociacionesPdf(text)
  await mkdir(dirname(OUT), { recursive: true })
  await writeFile(
    OUT,
    JSON.stringify({ generatedAt: new Date().toISOString(), source: target.href, fechaRegistro: doc.fechaRegistro, asociaciones: doc.asociaciones }, null, 2)
  )
  console.log(`wrote ${doc.asociaciones.length} asociaciones · registro ${doc.fechaRegistro}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
```

- [ ] **Step 2: Add npm script**

In `package.json` `"scripts"`, next to `scrape:procesos-selectivos`:
```json
    "scrape:asociaciones": "npx tsx scripts/scrape-asociaciones.ts",
```

- [ ] **Step 3: Run it live**

Run: `npm run scrape:asociaciones`
Expected: `wrote N asociaciones · registro …` with N ≥ 80; `jq '.asociaciones[0]' public/data/asociaciones.json` shows `{nombre,tipo,domicilio,email}`. Re-run → identical `asociaciones` (idempotent).

- [ ] **Step 4: Commit**

```bash
npx prettier --write scripts/scrape-asociaciones.ts
git add scripts/scrape-asociaciones.ts package.json public/data/asociaciones.json
git commit -m "feat(asociaciones): scrape CLI + snapshot"
```

---

### Task 12: Hook — `useAsociaciones`

**Files:**
- Create: `src/hooks/useAsociaciones.js`

- [ ] **Step 1: Implement**

Create `src/hooks/useAsociaciones.js`:

```js
// @ts-check
import { useJsonFetch } from './useJsonFetch'

// Municipal association register (civil-society directory). Ships empty until
// the first scrape; a 404 resolves to the empty shape.
const EMPTY = { fechaRegistro: null, asociaciones: [] }

export function useAsociaciones() {
  return useJsonFetch('/data/asociaciones.json', EMPTY)
}
```

- [ ] **Step 2: Verify + commit**

```bash
npm run lint && npm run build
git add src/hooks/useAsociaciones.js
git commit -m "feat(asociaciones): hook"
```

---

### Task 13: `/datos` — "Entidades y asociaciones" directory section

**Files:**
- Modify: `src/pages/Datos.jsx` (add a section + render)

**Interfaces:**
- Consumes: `useAsociaciones` (T12); `Card`, `SectionHead`, `Pill` from `../components/Primitives`.

- [ ] **Step 1: Add the section component to `Datos.jsx`**

Add the import near the top of `src/pages/Datos.jsx`:
```jsx
import { useAsociaciones } from '../hooks/useAsociaciones'
```
Add this component (above the default export):
```jsx
function AsociacionesCard() {
  const { data } = useAsociaciones()
  const rows = data?.asociaciones ?? []
  if (rows.length === 0) return null
  const byTipo = rows.reduce((acc, a) => {
    const k = a.tipo || 'Otras'
    acc[k] = (acc[k] || 0) + 1
    return acc
  }, {})
  const tipos = Object.entries(byTipo).sort((a, b) => b[1] - a[1])
  return (
    <Card>
      <SectionHead
        eyebrow={`Registro municipal · ${data?.fechaRegistro ?? ''}`}
        title={`Entidades y asociaciones (${rows.length})`}
      />
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, margin: '10px 0 16px' }}>
        {tipos.map(([t, n]) => (
          <Pill key={t} tone="neutral">
            {t} · <span className="mono">{n}</span>
          </Pill>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '4px 16px' }}>
        {rows.map((a, i) => (
          <div key={i} style={{ fontSize: 12.5, color: 'var(--ink80)', padding: '3px 0', borderBottom: '1px solid var(--border2)' }}>
            {a.nombre}
            {a.tipo && <span style={{ color: 'var(--ink50)' }}> · {a.tipo}</span>}
          </div>
        ))}
      </div>
      <p style={{ fontSize: 11.5, color: 'var(--ink50)', marginTop: 10, marginBottom: 0 }}>
        Fuente: Registro Municipal de Asociaciones · Ayuntamiento de Riba-roja de Túria.
      </p>
    </Card>
  )
}
```
Render `<AsociacionesCard />` inside the page's default-export return, after the dataset-catalog card (search the return for the first `</Card>` after the catalog list and insert it there).

- [ ] **Step 2: Verify build + render**

```bash
npm run lint && npm run build
(npm run preview -- --port 4174 >/dev/null 2>&1 &) ; sleep 2
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:4174/datos
pkill -f "vite preview"
```
Expected: clean; HTTP 200.

- [ ] **Step 3: a11y re-verify /datos**

Run: `npx playwright test tests/e2e/a11y.spec.ts --project=chromium-desktop -g "/datos"`
Expected: pass (the directory is text rows + Pills; if the `--border2` hairline or Pill contrast flags, both tokens are already used across the app, so re-verify).

- [ ] **Step 4: Commit**

```bash
npx prettier --write src/pages/Datos.jsx
git add src/pages/Datos.jsx
git commit -m "feat(datos): entidades y asociaciones directory section"
```

---

### Task 14: Wire asociaciones into scrape-all + document

**Files:**
- Modify: `scripts/scrape-all.sh`
- Modify: `CLAUDE.md` (command lines + Sources-of-truth rows for both new adapters)

- [ ] **Step 1: scrape-all.sh**

Add `scrape:asociaciones` to the `SCRAPERS` + `BEST_EFFORT` arrays, mirroring the `scrape:procesos-selectivos` entry from Task 8.

- [ ] **Step 2: bash -n**

Run: `bash -n scripts/scrape-all.sh && echo OK`
Expected: `OK`.

- [ ] **Step 3: CLAUDE.md**

Add two command lines under the `scrape:*` block:
```
npm run scrape:procesos-selectivos   # Municipal hiring processes (oposiciones/bolsas) → procesos-selectivos.json → /empleo-publico
npm run scrape:asociaciones          # Registro Municipal de Asociaciones (dated PDF) → asociaciones.json → /datos directory
```
And two Sources-of-truth table rows:
```
| Municipal hiring (procesos selectivos) | `procesos-selectivos.ts` → `procesos-selectivos.json` | ribarroja.es procesos-selectivos list | `/empleo-publico` |
| Association register | `asociaciones.ts` → `asociaciones.json` | Registro Municipal de Asociaciones PDF | `/datos` entidades directory |
```

- [ ] **Step 4: Commit**

```bash
git add scripts/scrape-all.sh CLAUDE.md
git commit -m "chore(wave3): add asociaciones to scrape-all + document both adapters"
```

---

## Self-review

- **Spec coverage:** 3a procesos (T1-8: fixture, parser, fetcher, CLI+JSON, hook, route+nav+glyph+i18n, e2e/a11y, scrape-all) · 3b asociaciones (T9-14: fixture, parser, CLI+JSON, hook, /datos section, scrape-all+docs). The spec's "decide the asociaciones surface at spec-review" resolved to the `/datos` section default (per the spec). Per-process document extraction + the outreach-export workflow are the spec's explicit deferrals — not tasks.
- **Placeholder scan:** none — parser code is complete; the "widen the regex / add a missing tipo against the fixture" notes are TDD fix-instructions with concrete targets and real pinned values (Centro Cultural Cervantes / Cultural / afacundo@dib.upv.es; ≥8 procesos; ≥80 asociaciones).
- **Type consistency:** `ProcesoSelectivo`/`parseProcesosList`/`fetchProcesosHtml`/`PROCESOS_URL` and `Asociacion`/`AsociacionesDoc`/`parseAsociacionesPdf` are used identically across their tasks; the hooks + UI consume the exact snapshot shapes the CLIs write.
