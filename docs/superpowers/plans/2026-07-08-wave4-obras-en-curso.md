# Wave 4a — obras en curso Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface the town's 7 flagship "obras en curso" (municipal infrastructure works) with contratista/importes/baja/plazo, geo-located on the landing map and sectioned on `/presupuesto` under the Wave-1 execution story.

**Architecture:** Repo adapter shape — two pure parsers (listing HTML + ficha PDF) in `src/scraper/obras.ts` unit-tested vs committed fixtures, a node fetcher, a CLI that per-ficha parses + geo-resolves each obra name through the EXISTING place-resolver → `public/data/obras.json`, a hook, a `/presupuesto` section, and a landing-map layer. RED→GREEN→wire.

**Tech Stack:** TypeScript (tsx), pdf-parse v1 (lazy, default export → `{text}`), Vitest, React 18 + react-leaflet, Playwright.

## Global Constraints

- Parsers are pure (no I/O); `fetch`/`pdf-parse` only in CLI/fetch modules.
- Polite UA (ribarroja.es WAF): `'Mozilla/5.0 (compatible; CivicPulse/0.1; +https://github.com/datarhan/civicpulse)'`.
- Spanish numbers: `.`=thousands, `,`=decimals — reuse `parseSpanishAmount` from `src/scraper/budget-execution.ts`.
- **Honest nulls:** any ficha field whose pattern doesn't match is OMITTED, never guessed. An obra that doesn't geo-resolve carries no `lat/lng` and does not paint on the map.
- **`técnico municipal responsable` is NEVER published** (libel-adjacent) — don't parse it into the public row.
- Snapshot `{ generatedAt, source, obras }`; idempotent.
- Deterministic, NO LLM, NO verifier corpus (Wave 4.1). No libel-material surface (findings/promises/declaraciones/verifier) touched.
- Geo uses the deterministic name→gazetteer path only: `buildGazetteer()` + `matchNameToGazetteer()` from `src/scraper/place-resolver.ts` (the LLM is never involved).
- New public data → add a `/datos` catalog row + a `scrape-all.sh` best-effort entry.
- Pre-commit runs lint + prettier `format:check` on `src scripts bot`; run `npx prettier --write` on new files first; never `--no-verify`.

---

### Task 1: Feasibility fixtures — listing HTML + 2 ficha PDF texts

**Files:**
- Create: `tests/fixtures/obras-listing_2026-07.html`
- Create: `tests/fixtures/obra-ficha-porta-del-barranc.txt`
- Create: `tests/fixtures/obra-ficha-rotondas-cv.txt`

- [ ] **Step 1: Download the listing + pdf-parse 2 fichas**

```bash
cd /Users/sergeilutchenko/Documents/CivicPulse
UA='Mozilla/5.0 (compatible; CivicPulse/0.1; +https://github.com/datarhan/civicpulse)'
BASE='https://www.ribarroja.es/portal_de_transparencia/5_transparencia_en_materias_de_urbanismo__obras_publicas_y_medioambiente/obras_de_infraestructuras_en_curso/contenidos/2467622/1909893'
curl -s -A "$UA" "$BASE" -o tests/fixtures/obras-listing_2026-07.html
grep -c "Ficha obra" tests/fixtures/obras-listing_2026-07.html   # expect >= 7
# extract the ficha PDF urls, pdf-parse #1 (Porta del Barranc) and #7 (rotondas)
node -e "
const fs=require('fs'); const h=fs.readFileSync('tests/fixtures/obras-listing_2026-07.html','utf8');
const m=[...h.matchAll(/href=\"([^\"]+\.pdf[^\"]*)\"[^>]*>([^<]*Ficha[^<]*)</gi)].map(x=>({u:x[1].startsWith('http')?x[1]:'https://www.ribarroja.es'+x[1],t:x[2].trim()}));
console.log(JSON.stringify(m.map(x=>x.t)));
fs.writeFileSync('/tmp/obras-urls.json', JSON.stringify(m));
"
node -e "
const fs=require('fs'),p=require('pdf-parse'),https=require('https');
const rows=JSON.parse(fs.readFileSync('/tmp/obras-urls.json','utf8'));
const pick=[[rows[0],'tests/fixtures/obra-ficha-porta-del-barranc.txt'],[rows[6],'tests/fixtures/obra-ficha-rotondas-cv.txt']];
(async()=>{for(const [row,out] of pick){
  const buf=await new Promise((res,rej)=>{https.get(row.u,{headers:{'User-Agent':'$UA'}},r=>{const c=[];r.on('data',d=>c.push(d));r.on('end',()=>res(Buffer.concat(c)))}).on('error',rej)});
  const d=await p(buf); fs.writeFileSync(out,d.text); console.log(out, d.text.length,'chars');
}})();
"
```

Expected: grep ≥ 7; both `.txt` files written (> 800 chars each). Porta del Barranc text contains `925.455,74` and `LICUAS`; rotondas contains `1.338.720,71`.

- [ ] **Step 2: Commit**

```bash
git add tests/fixtures/obras-listing_2026-07.html tests/fixtures/obra-ficha-porta-del-barranc.txt tests/fixtures/obra-ficha-rotondas-cv.txt
git commit -m "test: obras-en-curso listing + ficha fixtures — RED contract"
```

---

### Task 2: Listing parser — `parseObrasList` (TDD)

**Files:**
- Create: `src/scraper/obras.ts`
- Test: `tests/parse-obras.test.ts`

**Interfaces:**
- Produces: `interface ObraListItem { nombre: string; fichaUrl: string }`; `parseObrasList(html: string): ObraListItem[]`.

- [ ] **Step 1: Write the failing test**

Create `tests/parse-obras.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseObrasList } from '../src/scraper/obras'

const html = readFileSync(join(__dirname, 'fixtures', 'obras-listing_2026-07.html'), 'utf8')

describe('parseObrasList', () => {
  const rows = parseObrasList(html)
  it('extracts the 7 obra fichas with clean names + absolute pdf urls', () => {
    expect(rows.length).toBe(7)
    for (const r of rows) {
      expect(r.fichaUrl).toMatch(/^https?:\/\/.*\.pdf/i)
      expect(r.nombre).not.toMatch(/ficha|^\d+_/i) // "NN_Ficha obra " prefix stripped
      expect(r.nombre.length).toBeGreaterThan(3)
    }
    expect(rows[0].nombre).toBe('Porta del Barranc')
    expect(rows.some((r) => r.nombre.includes('Cementerio'))).toBe(true)
    expect(rows.some((r) => r.nombre.includes('CV-372'))).toBe(true)
  })
})
```

- [ ] **Step 2: Run — fails (module missing)**

Run: `npx vitest run tests/parse-obras.test.ts`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Implement the listing parser**

Create `src/scraper/obras.ts`:

```ts
/**
 * Pure parsers for the municipal "obras en curso" transparency listing + its
 * per-obra ficha PDFs (Item nº 69). No I/O. Honest nulls — a field whose pattern
 * doesn't match is omitted, never guessed. `técnico responsable` is deliberately
 * NOT parsed (libel-adjacent, not published).
 */
const HOST = 'https://www.ribarroja.es'

export interface ObraListItem {
  nombre: string
  fichaUrl: string
}

const decode = (s: string) =>
  s
    .replace(/<[^>]+>/g, '')
    .replace(/&aacute;/g, 'á').replace(/&eacute;/g, 'é').replace(/&iacute;/g, 'í')
    .replace(/&oacute;/g, 'ó').replace(/&uacute;/g, 'ú').replace(/&ntilde;/g, 'ñ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#\d+;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

export function parseObrasList(html: string): ObraListItem[] {
  const main = /<main[^>]*>([\s\S]*?)<\/main>/i.exec(html)?.[1] ?? html
  const out: ObraListItem[] = []
  const seen = new Set<string>()
  const re = /<a[^>]+href="([^"]+\.pdf[^"]*)"[^>]*>([\s\S]*?)<\/a>/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(main))) {
    const text = decode(m[2])
    if (!/ficha/i.test(text)) continue // only the "NN_Ficha obra(s) <name>" rows
    // strip "NN_Ficha obra(s) " / "NN_Ficha obra " prefix → the obra name
    const nombre = text.replace(/^\d+[_\s]*ficha\s+obras?\s+/i, '').trim()
    if (nombre.length < 4) continue
    let url = m[1]
    if (url.startsWith('/')) url = HOST + url
    if (!/^https?:\/\//.test(url) || seen.has(url)) continue
    seen.add(url)
    out.push({ nombre, fichaUrl: url })
  }
  return out
}
```

- [ ] **Step 4: Run — passes**

Run: `npx vitest run tests/parse-obras.test.ts`
Expected: PASS. If `rows[0].nombre` isn't exactly `Porta del Barranc`, inspect the fixture's first ficha `<a>` text and adjust the prefix-strip regex — do NOT change the assertion.

- [ ] **Step 5: Commit**

```bash
npx prettier --write src/scraper/obras.ts tests/parse-obras.test.ts
git add src/scraper/obras.ts tests/parse-obras.test.ts
git commit -m "feat(obras): listing parser (TDD)"
```

---

### Task 3: Ficha parser — `parseObraFicha` (TDD)

**Files:**
- Modify: `src/scraper/obras.ts`
- Test: `tests/parse-obras.test.ts`

**Interfaces:**
- Consumes: `parseSpanishAmount` from `./budget-execution`.
- Produces:
  - `interface ObraFicha { titulo?: string; empresa?: string; plazoMeses?: number; inicio?: string; importeLicitacion?: number; importeAdjudicacion?: number }`
  - `parseObraFicha(text: string): ObraFicha`

- [ ] **Step 1: Write the failing test (append)**

Append to `tests/parse-obras.test.ts`:

```ts
import { parseObraFicha } from '../src/scraper/obras'

describe('parseObraFicha', () => {
  const porta = parseObraFicha(
    readFileSync(join(__dirname, 'fixtures', 'obra-ficha-porta-del-barranc.txt'), 'utf8'),
  )
  const rotondas = parseObraFicha(
    readFileSync(join(__dirname, 'fixtures', 'obra-ficha-rotondas-cv.txt'), 'utf8'),
  )

  it('extracts importes in template order (licitación then adjudicación)', () => {
    expect(porta.importeLicitacion).toBe(925455.74)
    expect(porta.importeAdjudicacion).toBe(668086.5)
    expect(rotondas.importeLicitacion).toBe(1338720.71)
    expect(rotondas.importeAdjudicacion).toBe(1175687.69)
  })

  it('extracts plazo, inicio (ISO), and empresa', () => {
    expect(porta.plazoMeses).toBe(6)
    expect(porta.inicio).toBe('2019-03-25')
    expect(porta.empresa).toBe('LICUAS, S.A.')
  })

  it('omits fields that are absent rather than guessing (rotondas has no inicio)', () => {
    expect(rotondas.inicio).toBeUndefined()
    expect(rotondas.plazoMeses).toBe(7)
  })
})
```

- [ ] **Step 2: Run — fails (`parseObraFicha` not exported)**

Run: `npx vitest run tests/parse-obras.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement the ficha parser (append to `src/scraper/obras.ts`)**

```ts
import { parseSpanishAmount } from './budget-execution'

export interface ObraFicha {
  titulo?: string
  empresa?: string
  plazoMeses?: number
  inicio?: string
  importeLicitacion?: number
  importeAdjudicacion?: number
}

const MESES: Record<string, string> = {
  enero: '01', febrero: '02', marzo: '03', abril: '04', mayo: '05', junio: '06',
  julio: '07', agosto: '08', septiembre: '09', setiembre: '09', octubre: '10',
  noviembre: '11', diciembre: '12',
}

export function parseObraFicha(text: string): ObraFicha {
  const out: ObraFicha = {}

  // The two euro amounts appear in template order: licitación, then adjudicación.
  const euros = [...text.matchAll(/([\d.]+,\d{2})\s*€/g)].map((m) => parseSpanishAmount(m[1]))
  if (euros.length >= 2) {
    const [lic, adj] = euros
    // sanity gate: adjudicación ≤ licitación, else don't trust the pair
    if (lic > 0 && adj > 0 && adj <= lic) {
      out.importeLicitacion = lic
      out.importeAdjudicacion = adj
    }
  }

  const plazo = text.match(/(\d+)\s*meses/i)
  if (plazo) out.plazoMeses = Number(plazo[1])

  const date = text.match(/(\d{1,2})\s+de\s+([a-záéíóú]+)\s+de\s+(20\d{2})/i)
  if (date) {
    const mm = MESES[date[2].toLowerCase()]
    if (mm) out.inicio = `${date[3]}-${mm}-${date[1].padStart(2, '0')}`
  }

  // Company: an uppercase-led token run ending in a Spanish company suffix.
  const emp = text.match(/([A-ZÁÉÍÓÚÑ][A-Za-zÁÉÍÓÚÑñ0-9.&\- ]*?,?\s*S\.[ALC]\.(?:U\.)?)/)
  if (emp) out.empresa = emp[1].replace(/\s+/g, ' ').trim()

  return out
}
```

- [ ] **Step 4: Run — passes**

Run: `npx vitest run tests/parse-obras.test.ts`
Expected: PASS (all 4 tests). If the empresa assertion fails, print the fixture line around `S.A.` and tune the company regex to capture `LICUAS, S.A.` exactly — do NOT change the asserted value.

- [ ] **Step 5: Commit**

```bash
npx prettier --write src/scraper/obras.ts tests/parse-obras.test.ts
git add src/scraper/obras.ts tests/parse-obras.test.ts
git commit -m "feat(obras): ficha PDF parser — importes/plazo/inicio/empresa (TDD)"
```

---

### Task 4: Fetcher — `obras-fetch.ts`

**Files:**
- Create: `src/scraper/obras-fetch.ts`

**Interfaces:**
- Produces: `OBRAS_URL` const; `fetchObrasHtml(): Promise<string | null>`; `fetchFichaText(url: string): Promise<string | null>` (lazy pdf-parse; null on non-200).

- [ ] **Step 1: Implement**

Create `src/scraper/obras-fetch.ts`:

```ts
/** Node-only fetcher for the obras-en-curso listing + ficha PDFs. */
const UA = 'Mozilla/5.0 (compatible; CivicPulse/0.1; +https://github.com/datarhan/civicpulse)'

export const OBRAS_URL =
  'https://www.ribarroja.es/portal_de_transparencia/5_transparencia_en_materias_de_urbanismo__obras_publicas_y_medioambiente/obras_de_infraestructuras_en_curso/contenidos/2467622/1909893'

export async function fetchObrasHtml(): Promise<string | null> {
  const res = await fetch(OBRAS_URL, { headers: { 'User-Agent': UA } })
  if (!res.ok) return null
  return res.text()
}

export async function fetchFichaText(url: string): Promise<string | null> {
  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/pdf,*/*' } })
  if (!res.ok) return null
  const buf = Buffer.from(await res.arrayBuffer())
  const mod = (await import('pdf-parse')) as unknown as {
    default: (b: Buffer) => Promise<{ text: string }>
  }
  return (await mod.default(buf)).text
}
```

- [ ] **Step 2: Smoke-check**

Run: `npx tsx -e "import('./src/scraper/obras-fetch.ts').then(async m=>{const h=await m.fetchObrasHtml();console.log('html', h?.length)})"`
Expected: prints a byte count > 5000.

- [ ] **Step 3: Commit**

```bash
npx prettier --write src/scraper/obras-fetch.ts
git add src/scraper/obras-fetch.ts
git commit -m "feat(obras): node fetcher (listing + ficha pdf)"
```

---

### Task 5: CLI + geo → `obras.json`

**Files:**
- Create: `scripts/scrape-obras.ts`
- Modify: `package.json` (script)
- Create (generated): `public/data/obras.json`

**Interfaces:**
- Consumes: `parseObrasList`, `parseObraFicha` (T2/T3), `fetchObrasHtml`, `fetchFichaText`, `OBRAS_URL` (T4), `buildGazetteer`, `matchNameToGazetteer` from `src/scraper/place-resolver`.
- Produces: `public/data/obras.json` = `{ generatedAt, source, obras: ObraEnCurso[] }` where
  `ObraEnCurso = ObraListItem & ObraFicha & { id: string; bajaPct?: number; lat?: number; lng?: number; placeName?: string; placeKind?: string }`.

- [ ] **Step 1: Write the CLI**

Create `scripts/scrape-obras.ts`:

```ts
import { mkdir, writeFile, readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseObrasList, parseObraFicha } from '../src/scraper/obras'
import { fetchObrasHtml, fetchFichaText, OBRAS_URL } from '../src/scraper/obras-fetch'
import { buildGazetteer, matchNameToGazetteer } from '../src/scraper/place-resolver'

const DATA = join(dirname(fileURLToPath(import.meta.url)), '..', 'public/data')
const OUT = join(DATA, 'obras.json')

const slug = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

async function readJson(name: string): Promise<any | null> {
  try {
    return JSON.parse(await readFile(join(DATA, name), 'utf8'))
  } catch {
    return null
  }
}

async function main() {
  const html = await fetchObrasHtml()
  if (!html) throw new Error('obras: listing fetch failed')
  const list = parseObrasList(html)

  // gazetteer for the deterministic name→point resolution. buildGazetteer's
  // GazetteerInput is { streets?, pois?, zones?, zoneAliases? } — mirror the
  // subset compute-tender-geo uses; streets + pois cover the obra names
  // (Cementerio/Torre/CEIPs = pois, CV rotondas = streets).
  const streets = await readJson('streets.json')
  const pois = await readJson('civic-poi.json')
  const candidates = buildGazetteer({
    streets: streets?.streets ?? [],
    pois: pois?.pois ?? [],
  })

  const obras = []
  for (const item of list) {
    let ficha = {}
    try {
      const text = await fetchFichaText(item.fichaUrl)
      if (text) ficha = parseObraFicha(text)
    } catch (e) {
      console.warn(`obras: ficha parse failed for ${item.nombre}: ${(e as Error).message}`)
    }
    const f = ficha as ReturnType<typeof parseObraFicha>
    const bajaPct =
      f.importeLicitacion && f.importeAdjudicacion && f.importeLicitacion > 0
        ? Math.round(((f.importeLicitacion - f.importeAdjudicacion) / f.importeLicitacion) * 1000) / 10
        : undefined
    // PlaceMatch.point is a [lat, lng] TUPLE (not {lat,lng}).
    const match = matchNameToGazetteer(item.nombre, candidates)
    obras.push({
      id: slug(item.nombre),
      ...item,
      ...f,
      bajaPct,
      lat: match?.point?.[0],
      lng: match?.point?.[1],
      placeName: match?.name,
      placeKind: match?.kind,
    })
    await new Promise((r) => setTimeout(r, 300))
  }

  await mkdir(DATA, { recursive: true })
  await writeFile(
    OUT,
    JSON.stringify({ generatedAt: new Date().toISOString(), source: OBRAS_URL, obras }, null, 2),
  )
  const located = obras.filter((o) => o.lat != null).length
  console.log(`wrote ${obras.length} obras · ${located} geo-located`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
```

- [ ] **Step 2: Add npm script**

In `package.json` `"scripts"`, next to `scrape:budget-execution`:
```json
    "scrape:obras": "npx tsx scripts/scrape-obras.ts",
```

- [ ] **Step 3: Run it live**

Run: `npm run scrape:obras`
Expected: `wrote 7 obras · N geo-located` (N ≥ 3). Verify:
`jq '.obras[0] | {nombre, empresa, importeAdjudicacion, bajaPct, lat}' public/data/obras.json` shows Porta del Barranc with LICUAS + 668086.5 + baja ~27.8 + a lat. Re-run → identical `obras` (idempotent).

**Sanity gate (report, don't hide):** if `matchNameToGazetteer` mislocates an obra (e.g. "recuperación Torre" snapping to an unrelated "Torre" street), note it — a wrong pin is worse than none. If `pois`/`neighborhoods` field names don't match `buildGazetteer`'s expected `GazetteerInput` shape, read `src/scraper/place-resolver.ts` `buildGazetteer` + how `scripts/compute-tender-geo.ts` calls it and match that exactly.

- [ ] **Step 4: Commit**

```bash
npx prettier --write scripts/scrape-obras.ts
git add scripts/scrape-obras.ts package.json public/data/obras.json
git commit -m "feat(obras): scrape CLI + geo-resolve + snapshot"
```

---

### Task 6: Hook — `useObras`

**Files:**
- Create: `src/hooks/useObras.js`

- [ ] **Step 1: Implement**

Create `src/hooks/useObras.js`:

```js
// @ts-check
import { useJsonFetch } from './useJsonFetch'

// Municipal "obras en curso" (flagship infrastructure works). Ships empty until
// the first scrape; a 404 resolves to the empty shape.
const EMPTY = { obras: [] }

export function useObras() {
  return useJsonFetch('/data/obras.json', EMPTY)
}
```

- [ ] **Step 2: Verify + commit**

```bash
npm run lint && npm run build
git add src/hooks/useObras.js
git commit -m "feat(obras): hook"
```

---

### Task 7: `/presupuesto` "Obras en curso" section + e2e/a11y

**Files:**
- Modify: `src/pages/Presupuesto.jsx`
- Create: `tests/e2e/presupuesto-obras.spec.ts`

**Interfaces:**
- Consumes: `useObras` (T6); `Card`, `Pill`, `SectionHead` from `../components/Primitives`.

- [ ] **Step 1: Add the section component + render**

Add the import near the top of `src/pages/Presupuesto.jsx`:
```jsx
import { useObras } from '../hooks/useObras'
```
Add this component (above the default export):
```jsx
function ObrasEnCursoSection() {
  const { data } = useObras()
  const obras = data?.obras ?? []
  if (obras.length === 0) return null
  const eur = (n) =>
    typeof n === 'number'
      ? new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n)
      : '—'
  return (
    <Card style={{ marginBottom: 16 }}>
      <SectionHead
        eyebrow="Urbanismo · infraestructuras"
        title={`Obras en curso (${obras.length})`}
      />
      <p style={{ fontSize: 12.5, color: 'var(--ink60)', margin: '2px 0 14px', maxWidth: '68ch' }}>
        Las obras de infraestructura más importantes declaradas por el Ayuntamiento — el reverso
        del capítulo de inversiones que arriba figura ejecutado al mínimo.
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {obras.map((o) => (
          <div
            key={o.id}
            style={{ paddingBottom: 10, borderBottom: '1px solid var(--border2)' }}
          >
            <div style={{ display: 'flex', gap: 10, justifyContent: 'space-between', alignItems: 'baseline' }}>
              <span style={{ fontWeight: 600 }}>{o.nombre}</span>
              {typeof o.bajaPct === 'number' && (
                <Pill tone={o.bajaPct >= 20 ? 'ok' : 'neutral'}>
                  baja <span className="mono">{o.bajaPct}%</span>
                </Pill>
              )}
            </div>
            <div className="mono" style={{ fontSize: 11.5, color: 'var(--ink60)', marginTop: 3 }}>
              {o.empresa ? `${o.empresa} · ` : ''}
              {o.importeAdjudicacion != null ? `${eur(o.importeAdjudicacion)} adj.` : ''}
              {o.plazoMeses ? ` · ${o.plazoMeses} meses` : ''}
              {o.inicio ? ` · inicio ${o.inicio}` : ''}
            </div>
            <a
              href={o.fichaUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mono"
              style={{ fontSize: 10.5, color: 'var(--civic)', textDecoration: 'underline' }}
            >
              Ver ficha ↗
            </a>
          </div>
        ))}
      </div>
      <p style={{ fontSize: 11, color: 'var(--ink50)', marginTop: 10, marginBottom: 0 }}>
        Fuente: Portal de Transparencia · obras de infraestructuras en curso · Ayuntamiento de
        Riba-roja de Túria.
      </p>
    </Card>
  )
}
```
Render `<ObrasEnCursoSection />` in the default-export return, immediately after `<EjecucionSection />` (the Wave-1 execution section) so it sits under the inversiones-execution story.

- [ ] **Step 2: Verify build + render**

```bash
npm run lint && npm run build
(npm run preview -- --port 4176 >/dev/null 2>&1 &) ; sleep 2
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:4176/presupuesto
pkill -f "vite preview"
```
Expected: clean; HTTP 200.

- [ ] **Step 3: e2e spec**

Create `tests/e2e/presupuesto-obras.spec.ts`:

```ts
import { test, expect } from '@playwright/test'

test.describe('Presupuesto · obras en curso', () => {
  test('renders the obras section from obras.json', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(String(e)))
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text())
    })
    await page.goto('/presupuesto', { waitUntil: 'domcontentloaded' })
    await expect(page.getByText(/Obras en curso/i).first()).toBeVisible({ timeout: 8000 })
    await expect(page.getByText('Porta del Barranc').first()).toBeVisible()
    expect(errors.filter((e) => !/favicon|ws:/i.test(e))).toEqual([])
  })
})
```

- [ ] **Step 4: Run e2e + a11y strict**

```bash
npx playwright test tests/e2e/presupuesto-obras.spec.ts --project=chromium-desktop
npx playwright test tests/e2e/a11y.spec.ts --project=chromium-desktop -g "/presupuesto"
```
Expected: both pass. The card is text + Pills + an underlined link (a11y-safe); if axe flags, fix minimally.

- [ ] **Step 5: Commit**

```bash
npx prettier --write src/pages/Presupuesto.jsx tests/e2e/presupuesto-obras.spec.ts
git add src/pages/Presupuesto.jsx tests/e2e/presupuesto-obras.spec.ts
git commit -m "feat(presupuesto): obras en curso section + e2e/a11y"
```

---

### Task 8: Landing-map "Obras en curso" layer

**Files:**
- Create: `src/components/LiveCity/layers/ObrasLayer.jsx`
- Modify: `src/components/LiveCity/StylizedMap.jsx`
- Modify: `src/components/LiveCity/controls/LayerControl.jsx` (MAP_LAYERS entry)
- Modify: `src/i18n.jsx` (`map.layer.obras` in es + ca)

**Interfaces:**
- Consumes: `useObras` (T6); react-leaflet `CircleMarker`, `Popup`, `Tooltip`.

- [ ] **Step 1: Create the layer** — mirror `MoneyLayer.jsx`

Create `src/components/LiveCity/layers/ObrasLayer.jsx`:

```jsx
// @ts-check
import { CircleMarker, Popup, Tooltip } from 'react-leaflet'

const fmtEur = (n) =>
  typeof n === 'number'
    ? new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n)
    : '—'

/**
 * "Obras en curso" pins on the landing map. One CircleMarker per obra the
 * place-resolver situated (obra name → gazetteer point at scrape time). Real
 * data only: an obra without a resolved point simply doesn't paint.
 */
export function ObrasLayer({ obras }) {
  const located = (obras ?? []).filter((o) => typeof o.lat === 'number' && typeof o.lng === 'number')
  return (
    <>
      {located.map((o) => (
        <CircleMarker
          key={o.id}
          center={[o.lat, o.lng]}
          radius={9}
          pathOptions={{ color: '#b45309', weight: 2, fillColor: '#f59e0b', fillOpacity: 0.55 }}
        >
          <Tooltip>{o.nombre}</Tooltip>
          <Popup>
            <div style={{ minWidth: 180 }}>
              <strong>{o.nombre}</strong>
              <div style={{ fontSize: 12, marginTop: 4 }}>
                {o.empresa ? `${o.empresa}` : ''}
                {o.importeAdjudicacion != null ? ` · ${fmtEur(o.importeAdjudicacion)} adj.` : ''}
                {typeof o.bajaPct === 'number' ? ` · baja ${o.bajaPct}%` : ''}
                {o.plazoMeses ? ` · ${o.plazoMeses} meses` : ''}
              </div>
              <a href={o.fichaUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11 }}>
                Ver ficha ↗
              </a>
            </div>
          </Popup>
        </CircleMarker>
      ))}
    </>
  )
}
```

- [ ] **Step 2: Register the layer chip**

In `src/components/LiveCity/controls/LayerControl.jsx`, add to the `MAP_LAYERS` array (after the `quejas`/`flood` entries):
```js
  { key: 'obras', labelKey: 'map.layer.obras', glyph: '⚒' },
```
In `src/i18n.jsx`, add next to the other `map.layer.*` keys — es catalogue:
```js
    'map.layer.obras': 'Obras en curso',
```
ca catalogue:
```js
    'map.layer.obras': 'Obres en curs',
```
(Find the existing `'map.layer.money'` lines in each catalogue and add the `obras` key beside them.)

- [ ] **Step 3: Wire into `StylizedMap`**

In `src/components/LiveCity/StylizedMap.jsx`, mirroring the EXISTING `money` layer idiom (flat boolean state, `{layers.money && <MoneyLayer/>}`):
1. Add imports: `import { ObrasLayer } from './layers/ObrasLayer'` and `import { useObras } from '../../hooks/useObras'`.
2. Add `obras: false` to the `layers` state object: `useState({ money: false, poi: true, quejas: false, flood: false, obras: false })`.
3. Read `const { data: obrasData } = useObras()` alongside the other hooks (near `const [layers, setLayers] = useState(...)`).
4. Mount it next to the other layers inside `<MapContainer>`: `{layers.obras && <ObrasLayer obras={obrasData?.obras} />}`. (`toggleLayer` + `<LayerControl>` already handle any key generically — no change needed there.)

- [ ] **Step 4: Verify build + a11y (landing)**

```bash
npm run lint && npm run build
npx playwright test tests/e2e/a11y.spec.ts --project=chromium-desktop -g "landing|has no critical"
```
Expected: lint + build clean; the landing a11y test still passes (a hidden layer adds no DOM; toggling on adds Leaflet markers with Tooltips). If the glyph `⚒` renders oddly, any single distinct unicode is fine — keep it unique among MAP_LAYERS.

- [ ] **Step 5: Commit**

```bash
npx prettier --write src/components/LiveCity/layers/ObrasLayer.jsx src/components/LiveCity/StylizedMap.jsx src/components/LiveCity/controls/LayerControl.jsx src/i18n.jsx
git add src/components/LiveCity/layers/ObrasLayer.jsx src/components/LiveCity/StylizedMap.jsx src/components/LiveCity/controls/LayerControl.jsx src/i18n.jsx
git commit -m "feat(map): obras en curso layer + LayerControl toggle"
```

---

### Task 9: Wire into scrape-all + /datos catalog + docs

**Files:**
- Modify: `scripts/scrape-all.sh`
- Modify: `src/pages/Datos.jsx` (catalog row)
- Modify: `CLAUDE.md`

- [ ] **Step 1: scrape-all.sh** — add `scrape:obras` to the `SCRAPERS` array AFTER `scrape:streets`/`scrape:civic-poi`/`scrape:geo` (so the gazetteer exists when it runs) and to the `BEST_EFFORT` array with a rationale comment mirroring `scrape:procesos-selectivos`. Then `bash -n scripts/scrape-all.sh` → OK.

- [ ] **Step 2: /datos catalog row** — in `src/pages/Datos.jsx` `DatasetsCatalog`, add `const obras = useObras().data` (import `useObras`) and an items entry:
```jsx
    {
      name: 'Obras en curso',
      rows: obras?.obras ? `${obras.obras.length} obras` : '—',
      updated: formatDate(obras?.generatedAt),
      source: 'Portal de Transparencia · Ayto.',
      path: '/data/obras.json',
      fmt: ['json'],
    },
```

- [ ] **Step 3: CLAUDE.md** — add a command line:
```
npm run scrape:obras                 # Obras de infraestructura en curso (7 fichas · importes/baja/empresa) → obras.json → /presupuesto + map
```
and a Sources-of-truth row:
```
| Obras en curso (municipal infrastructure) | `obras.ts` → `obras.json` | Portal de Transparencia · obras-de-infraestructuras-en-curso fichas | `/presupuesto` section + landing-map layer |
```

- [ ] **Step 4: Verify + commit**

```bash
bash -n scripts/scrape-all.sh && echo OK
npm run lint && npm test 2>&1 | tail -3
npx prettier --write src/pages/Datos.jsx
git add scripts/scrape-all.sh src/pages/Datos.jsx CLAUDE.md
git commit -m "chore(obras): scrape-all + /datos catalog + docs"
```

---

## Self-review

- **Spec coverage:** listing parser (T2) · ficha parser with honest nulls + técnico-not-parsed (T3) · fetcher (T4) · CLI+geo via place-resolver (T5) · hook (T6) · /presupuesto section under the Ejecución section (T7) · landing-map layer + toggle (T8) · scrape-all best-effort + /datos + docs (T9). Verifier + PGOU + concejalía-enrichment are the spec's explicit deferrals — not tasks.
- **Placeholder scan:** none — parser code complete with real pinned values (925455.74/668086.5, LICUAS S.A., 2019-03-25, rotondas 1338720.71 + no-inicio null). The two "read the file to match the exact idiom" notes (T5 GazetteerInput shape, T8 StylizedMap layer mount) are grounded instructions with the concrete reference file named — the shapes exist and vary enough that mirroring the real call beats guessing a signature here.
- **Type consistency:** `ObraListItem`/`ObraFicha`/`parseObrasList`/`parseObraFicha`/`ObraEnCurso` used identically across T2/T3/T5; the hook + section + map layer consume the exact `obras.json` row shape the CLI writes (`nombre`, `fichaUrl`, `empresa`, `importeAdjudicacion`, `bajaPct`, `plazoMeses`, `inicio`, `lat`, `lng`, `id`).
