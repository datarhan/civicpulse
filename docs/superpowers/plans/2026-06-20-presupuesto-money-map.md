# Presupuesto "Where the Money Goes" Map — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an interactive map to `/presupuesto` that shows which urbanizations/zones received contract money and what works were done, with an honesty-first coverage meter, per-zone drill-down, DANA filter, time slider, and tabbed extras.

**Architecture:** A pure build-time matcher assigns each contract to OSM zones by scanning its `title` against a curated alias table (the only sub-municipal signal that exists — verified in the spec). `scripts/compute-tender-geo.ts` writes `public/data/tender-geo.json` (mapping + aggregates only; contract details stay sourced from `tenders.json`). The SPA reads it via `useTenderGeo`, and a `GastoDashboard` container (layout "B": map hero + reactive side panel + tabs) renders it with Leaflet, reusing the proven `QuejasHeatmap` pattern.

**Tech Stack:** TypeScript (pure parser, vitest), Node `tsx` CLI, React 18, react-leaflet + Leaflet, CartoDB Voyager tiles, Playwright e2e.

## Global Constraints

- **Honesty contract (load-bearing):** a contract is placed ONLY when its title contains a zone-specific alias; generic words never place it. Coverage = located€ / universe€ on the SAME basis (always ≤100%). Multi-zone contracts show in each zone but count once in `locatedAmount`. Per-zone sums are non-additive. No fabricated amounts. Budget chapters are never mapped.
- **Amount basis:** universe = AWARDED contracts only (`status === 'awarded'`) with `finalAmount > 0`; `amount = finalAmount`. Matches the page's existing "€16.3M adjudicado" headline. Non-awarded contracts (open/in-tender/in-progress) are excluded from the universe, the map, and the coverage meter.
- **Pure modules call no `fetch`/`fs` and no `Date.now()`/`new Date()` with no arg** — `generatedAt` is injected by the CLI. `fetch`/`fs` live only in CLI wrappers.
- **Diacritics:** reuse `stripDiacritics` from `src/scraper/normalize.ts`; never fork it.
- **i18n:** `/presupuesto` is currently 100% hard-coded Spanish (no `t()` usage). New components follow suit (Spanish hard-coded). i18n wiring is explicitly deferred — do NOT add it here.
- **Styling:** inline styles driven by CSS variables (`var(--ink)`, `var(--civic)`, `var(--border2)`, `var(--soft)`, `var(--paper)`, `.mono` class). No CSS modules.
- **Each commit** ends with the trailer `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>` (harness rule). Work happens on the existing branch `feat/presupuesto-money-map`.
- **Gates:** `npm test` (vitest), `npm run typecheck` (tsc --noEmit), `npm run lint` (eslint) must stay green.

---

## File Structure

- `src/scraper/tender-geo.ts` — **NEW**, pure: `ZONE_ALIASES`, `foldText`, `matchContractsToZones`, types. (Task 1)
- `tests/parse-tender-geo.test.ts` — **NEW**, vitest for the matcher. (Task 1)
- `scripts/compute-tender-geo.ts` — **NEW**, CLI: read tenders+geo → write `tender-geo.json`. (Task 2)
- `public/data/tender-geo.json` — **NEW** generated snapshot. (Task 2)
- `package.json` — add `compute:tender-geo` script. (Task 2)
- `scripts/scrape-all.sh` — run `compute:tender-geo` after the loop. (Task 2)
- `src/lib/tender-geo.js` — **NEW**, pure client helpers + `EMPTY_TENDER_GEO`. (Task 3)
- `tests/lib/tender-geo.test.ts` — **NEW**, vitest for helpers. (Task 3)
- `src/hooks/useTenderGeo.js` — **NEW**. (Task 4)
- `src/components/Presupuesto/GastoMap.jsx` — **NEW**. (Task 5)
- `src/components/Presupuesto/CoverageMeter.jsx`, `ZoneDrilldown.jsx` — **NEW**. (Task 6)
- `src/components/Presupuesto/TimeSlider.jsx` — **NEW**. (Task 7)
- `src/components/Presupuesto/ContractsExplorer.jsx` — **NEW**. (Task 8)
- `src/components/Presupuesto/ContractorLeaderboard.jsx` — **NEW**. (Task 9)
- `src/components/Presupuesto/SpendingTypeBreakdown.jsx` — **NEW**. (Task 10)
- `src/components/Presupuesto/GastoDashboard.jsx` — **NEW**, container. (Task 11)
- `src/pages/Presupuesto.jsx` — split header, drop `RealContracts`, new order. `src/index.css` — mobile grid. `tests/e2e/presupuesto.spec.ts` — update assertions. (Task 12)
- `CLAUDE.md`, `src/pages/Metodologia.jsx` — docs. (Task 13)

---

### Task 1: Pure matcher `src/scraper/tender-geo.ts`

**Files:**
- Create: `src/scraper/tender-geo.ts`
- Test: `tests/parse-tender-geo.test.ts`

**Interfaces:**
- Consumes: `stripDiacritics` from `src/scraper/normalize.ts`.
- Produces: `matchContractsToZones(contracts: ContractInput[], zones: ZoneInput[], opts: {generatedAt: string; tendersGeneratedAt?: string|null; geoGeneratedAt?: string|null}): TenderGeoSnapshot`; `ZONE_ALIASES`; `foldText(s: string): string`; types `ContractInput`, `ZoneInput`, `TenderGeoAssignment`, `TenderGeoZone`, `TenderGeoSnapshot`.

- [ ] **Step 1: Write the failing test** — `tests/parse-tender-geo.test.ts`

```ts
import { describe, it, expect } from 'vitest'
import { matchContractsToZones, foldText } from '../src/scraper/tender-geo'

const ZONES = [
  { slug: 'monte-alcedo', name: 'Monte Alcedo', centroid: [39.5558, -0.5425] as [number, number] },
  { slug: 'urbanitzacio-valencia-la-vella', name: 'Urbanització València la Vella', centroid: [39.5344, -0.5307] as [number, number] },
  { slug: 'urbanitzacio-la-reva', name: 'Urbanització La Reva', centroid: [39.4840, -0.5720] as [number, number] },
  { slug: 'poligon-industrial-poio-de-reva', name: 'Polígon Industrial Poio de Reva', centroid: [39.4786, -0.5717] as [number, number] },
  { slug: 'el-molinet', name: 'el Molinet', centroid: [39.5544, -0.5510] as [number, number] },
]
const OPTS = { generatedAt: '2026-06-20T00:00:00.000Z', tendersGeneratedAt: 't', geoGeneratedAt: 'g' }

describe('scraper/tender-geo — matchContractsToZones', () => {
  it('places a contract by a zone-specific alias and records the matched alias', () => {
    const snap = matchContractsToZones(
      [{ id: 'c1', title: 'Reurbanización Zona Verde Monte Alcedo', status: 'awarded', finalAmount: 100000, awardDate: '2024-05-01', contractType: 'construction', categoryTitle: 'construction' }],
      ZONES, OPTS,
    )
    const a = snap.assignments.find((x) => x.id === 'c1')!
    expect(a.zones).toEqual(['monte-alcedo'])
    expect(a.matchedAlias['monte-alcedo']).toBe('monte alcedo')
    expect(snap.zones.find((z) => z.slug === 'monte-alcedo')!.amount).toBe(100000)
  })

  it('assigns a contract naming two zones to both, but counts it once in locatedAmount', () => {
    const snap = matchContractsToZones(
      [{ id: 'c2', title: 'Centros Culturales en Urb. Monte Alcedo y Valencia La Vella', status: 'awarded', finalAmount: 200000 }],
      ZONES, OPTS,
    )
    const a = snap.assignments.find((x) => x.id === 'c2')!
    expect(a.zones.sort()).toEqual(['monte-alcedo', 'urbanitzacio-valencia-la-vella'])
    expect(snap.universe.locatedAmount).toBe(200000) // counted once
    expect(snap.zones.find((z) => z.slug === 'monte-alcedo')!.amount).toBe(200000) // in both
    expect(snap.zones.find((z) => z.slug === 'urbanitzacio-valencia-la-vella')!.amount).toBe(200000)
  })

  it('flags DANA works and never confuses La Reva with Poio de Reva', () => {
    const snap = matchContractsToZones(
      [
        { id: 'd1', title: 'Alumbrado público urbanización La Reva como consecuencia del temporal de lluvias (DANA)', status: 'awarded', finalAmount: 50000 },
        { id: 'p1', title: 'Glorieta acceso Polígon Industrial Poio de Reva', status: 'awarded', finalAmount: 40000 },
      ],
      ZONES, OPTS,
    )
    expect(snap.assignments.find((x) => x.id === 'd1')!.zones).toEqual(['urbanitzacio-la-reva'])
    expect(snap.assignments.find((x) => x.id === 'd1')!.dana).toBe(true)
    expect(snap.assignments.find((x) => x.id === 'p1')!.zones).toEqual(['poligon-industrial-poio-de-reva'])
    expect(snap.assignments.find((x) => x.id === 'p1')!.dana).toBe(false)
  })

  it('counts an awarded no-alias contract in the universe but not as located', () => {
    const snap = matchContractsToZones(
      [{ id: 'n1', title: '1 vehículo híbrido todoterreno uso gabinete alcaldía', status: 'awarded', finalAmount: 30000 }],
      ZONES, OPTS,
    )
    expect(snap.assignments.length).toBe(0)
    expect(snap.universe.totalContracts).toBe(1)
    expect(snap.universe.totalAmount).toBe(30000)
    expect(snap.universe.locatedAmount).toBe(0)
  })

  it('excludes non-awarded contracts and awarded-with-zero-final from the universe', () => {
    const snap = matchContractsToZones(
      [
        { id: 'open1', title: 'Obras en urbanización La Reva', status: 'open', finalAmount: 0 },
        { id: 'inprog1', title: 'Adecuación Senda Molinet', status: 'in_progress', finalAmount: 90000 },
        { id: 'awz', title: 'Obras Monte Alcedo', status: 'awarded', finalAmount: 0 },
      ],
      ZONES, OPTS,
    )
    expect(snap.assignments.length).toBe(0)
    expect(snap.universe.totalContracts).toBe(0)
    expect(snap.universe.totalAmount).toBe(0)
  })

  it('foldText lowercases, strips accents, and turns apostrophes into spaces', () => {
    expect(foldText("Mas d'Escoto")).toBe('mas d escoto')
    expect(foldText('València la Vella')).toBe('valencia la vella')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/parse-tender-geo.test.ts`
Expected: FAIL — cannot resolve `../src/scraper/tender-geo`.

- [ ] **Step 3: Write minimal implementation** — `src/scraper/tender-geo.ts`

```ts
import { stripDiacritics } from './normalize'

export interface ContractInput {
  id: string
  title: string
  status?: string
  finalAmount?: number
  initialAmount?: number
  awardDate?: string | null
  startDate?: string | null
  formalizedDate?: string | null
  contractType?: string | null
  categoryTitle?: string | null
}
export interface ZoneInput {
  slug: string
  name: string
  centroid: [number, number]
}
export interface TenderGeoAssignment {
  id: string
  zones: string[]
  matchedAlias: Record<string, string>
  dana: boolean
  amount: number
  amountKind: 'final' | 'initial'
  date: string | null
  contractType: string | null
  categoryTitle: string | null
}
export interface TenderGeoZone {
  slug: string
  name: string
  centroid: [number, number]
  contractCount: number
  amount: number
  danaAmount: number
}
export interface TenderGeoSnapshot {
  generatedAt: string
  source: { tenders: string | null; geo: string | null }
  universe: {
    totalContracts: number
    totalAmount: number
    locatedContracts: number
    locatedAmount: number
    danaContracts: number
    danaAmount: number
    dateMin: string | null
    dateMax: string | null
  }
  zones: TenderGeoZone[]
  assignments: TenderGeoAssignment[]
}

const DANA_RE = /\bdana\b|temporal de lluvias|29 de octubre/

// Curator-maintained. Aliases are folded (lowercase, accent-free,
// apostrophes→spaces) substrings UNIQUE to one zone. Conservative by design:
// we under-match rather than over-match. Bare ambiguous tokens are avoided
// ("reva", "el terreno"); the P.I. l'Oliveral and Parque/urbanización
// duplicates fold into one canonical slug so money isn't double-rendered.
export const ZONE_ALIASES: Record<string, string[]> = {
  'urbanitzacio-els-pous': ['els pous'],
  'urbanitzacio-mas-de-traver': ['mas de traver'],
  'el-pou-d-escoto': ['escoto'],
  'urbanitzacio-valencia-la-vella': ['valencia la vella'],
  'santa-rosa': ['santa rosa'],
  'monte-alcedo': ['monte alcedo'],
  'urbanitzacio-entretarongers': ['entretarongers'],
  carasoles: ['carasoles'],
  'urbanitzacio-santa-monica': ['santa monica'],
  'el-molinet': ['molinet'],
  'l-oliveral': ['oliveral'],
  'urbanitzacio-la-reva': ['la reva', 'residencial la reva', 'urbanizacion reva', 'reva con cv'],
  'urbanitzacio-el-terreno': ['urbanizacion el terreno', 'urbanitzacio el terreno'],
  'vallesa-de-mandor': ['vallesa'],
  'poligono-industrial-entrevias': ['entrevias'],
  'poligon-industrial-poio-de-reva': ['poio de reva'],
  'urbanitzacio-la-llobatera': ['llobatera'],
  'clot-de-navarrete': ['navarrete'],
}

export function foldText(s: string): string {
  return stripDiacritics(s)
    .toLowerCase()
    .replace(/['´`’]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function amountOf(c: ContractInput): { amount: number; kind: 'final' | 'initial' } | null {
  // Awarded-only universe: matches the page's "€16.3M adjudicado" headline.
  // Non-awarded contracts (open/in-tender/in-progress) are excluded entirely.
  if (c.status === 'awarded' && typeof c.finalAmount === 'number' && c.finalAmount > 0)
    return { amount: c.finalAmount, kind: 'final' }
  return null
}

function dateOf(c: ContractInput): string | null {
  return c.awardDate || c.startDate || c.formalizedDate || null
}

export function matchContractsToZones(
  contracts: ContractInput[],
  zones: ZoneInput[],
  opts: { generatedAt: string; tendersGeneratedAt?: string | null; geoGeneratedAt?: string | null },
): TenderGeoSnapshot {
  const zoneBySlug = new Map(zones.map((z) => [z.slug, z]))
  const agg = new Map<string, TenderGeoZone>()
  const assignments: TenderGeoAssignment[] = []
  let totalContracts = 0
  let totalAmount = 0
  let locatedAmount = 0
  let danaContracts = 0
  let danaAmount = 0
  let dateMin: string | null = null
  let dateMax: string | null = null

  for (const c of contracts) {
    const amt = amountOf(c)
    if (!amt) continue
    totalContracts++
    totalAmount += amt.amount

    const folded = foldText(c.title)
    const dana = DANA_RE.test(folded)
    const matched: Record<string, string> = {}
    for (const [slug, aliases] of Object.entries(ZONE_ALIASES)) {
      if (!zoneBySlug.has(slug) || aliases.length === 0) continue
      let best = ''
      for (const a of aliases) if (folded.includes(a) && a.length > best.length) best = a
      if (best) matched[slug] = best
    }
    const zoneSlugs = Object.keys(matched)
    if (zoneSlugs.length === 0) continue

    const date = dateOf(c)
    assignments.push({
      id: c.id,
      zones: zoneSlugs,
      matchedAlias: matched,
      dana,
      amount: amt.amount,
      amountKind: amt.kind,
      date,
      contractType: c.contractType ?? null,
      categoryTitle: c.categoryTitle ?? null,
    })
    locatedAmount += amt.amount
    if (dana) {
      danaContracts++
      danaAmount += amt.amount
    }
    if (date) {
      if (!dateMin || date < dateMin) dateMin = date
      if (!dateMax || date > dateMax) dateMax = date
    }
    for (const slug of zoneSlugs) {
      const z = zoneBySlug.get(slug)!
      const cur =
        agg.get(slug) ??
        { slug, name: z.name, centroid: z.centroid, contractCount: 0, amount: 0, danaAmount: 0 }
      cur.contractCount++
      cur.amount += amt.amount
      if (dana) cur.danaAmount += amt.amount
      agg.set(slug, cur)
    }
  }

  return {
    generatedAt: opts.generatedAt,
    source: { tenders: opts.tendersGeneratedAt ?? null, geo: opts.geoGeneratedAt ?? null },
    universe: {
      totalContracts,
      totalAmount,
      locatedContracts: assignments.length,
      locatedAmount,
      danaContracts,
      danaAmount,
      dateMin,
      dateMax,
    },
    zones: [...agg.values()].sort((a, b) => b.amount - a.amount),
    assignments,
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/parse-tender-geo.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Typecheck + commit**

Run: `npm run typecheck`
Expected: no errors.

```bash
git add src/scraper/tender-geo.ts tests/parse-tender-geo.test.ts
git commit -m "feat(presupuesto): pure contract→zone matcher (tender-geo)"
```

---

### Task 2: CLI `compute-tender-geo` + generated snapshot + scrape-all wiring

**Files:**
- Create: `scripts/compute-tender-geo.ts`
- Create (generated): `public/data/tender-geo.json`
- Modify: `package.json` (scripts), `scripts/scrape-all.sh`

**Interfaces:**
- Consumes: `matchContractsToZones` (Task 1); reads `public/data/tenders.json` (`{generatedAt, contracts:[…]}`) + `public/data/geo.json` (`{generatedAt, neighborhoods:[{slug,name,centroid}]}`).
- Produces: `public/data/tender-geo.json` matching `TenderGeoSnapshot`.

- [ ] **Step 1: Write the CLI** — `scripts/compute-tender-geo.ts`

```ts
/**
 * Derived step (no network): match each contract title to the OSM zones and
 * write public/data/tender-geo.json. Mirrors compute-dept-stats.ts. Never
 * mutates tenders.json or geo.json. Runs in scrape:all after both exist.
 */
import { readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { matchContractsToZones, type ZoneInput } from '../src/scraper/tender-geo'

const DATA = resolve('public/data')
const OUT = resolve(DATA, 'tender-geo.json')

async function main() {
  const tPath = resolve(DATA, 'tenders.json')
  const gPath = resolve(DATA, 'geo.json')
  if (!existsSync(tPath) || !existsSync(gPath)) {
    console.error('[compute-tender-geo] tenders.json or geo.json missing — run scrape:tenders + scrape:geo first')
    process.exit(1)
  }
  const tenders = JSON.parse(await readFile(tPath, 'utf8'))
  const geo = JSON.parse(await readFile(gPath, 'utf8'))
  const zones: ZoneInput[] = (geo.neighborhoods || []).map((n: { slug: string; name: string; centroid: [number, number] }) => ({
    slug: n.slug,
    name: n.name,
    centroid: n.centroid,
  }))
  const snap = matchContractsToZones(tenders.contracts || [], zones, {
    generatedAt: new Date().toISOString(),
    tendersGeneratedAt: tenders.generatedAt ?? null,
    geoGeneratedAt: geo.generatedAt ?? null,
  })
  await writeFile(OUT, JSON.stringify(snap, null, 2) + '\n')
  console.log(
    `[compute-tender-geo] ${snap.universe.locatedContracts}/${snap.universe.totalContracts} located · ` +
      `€${Math.round(snap.universe.locatedAmount)} across ${snap.zones.length} zones · ` +
      `DANA ${snap.universe.danaContracts} (€${Math.round(snap.universe.danaAmount)})`,
  )
}

main().catch((err) => {
  console.error('[compute-tender-geo] failed:', err)
  process.exit(1)
})
```

- [ ] **Step 2: Add the npm script** — `package.json`, in `"scripts"`, next to `compute:dept-stats`:

```json
    "compute:tender-geo": "npx tsx scripts/compute-tender-geo.ts",
```

- [ ] **Step 3: Generate the snapshot + verify it's honest**

Run: `npm run compute:tender-geo`
Expected: prints a line like `[compute-tender-geo] 60/758 located · €3xxxxxx across 1x zones · DANA 77 (€341xxxx)`.

Run: `node -e "const s=require('./public/data/tender-geo.json'); if(s.universe.locatedAmount>s.universe.totalAmount) throw new Error('coverage>100%'); console.log('OK locatedAmount<=totalAmount; zones='+s.zones.length+' assignments='+s.assignments.length)"`
Expected: `OK locatedAmount<=totalAmount; zones=… assignments=…`

- [ ] **Step 4: Wire into `scripts/scrape-all.sh`** — add a block AFTER the `compute:dept-stats` block (before the summary), mirroring it:

```bash
echo ""
echo "================================================================"
echo "[scrape-all] running: compute:tender-geo"
echo "================================================================"
if ! npm run compute:tender-geo; then
  echo "[scrape-all] FAILED: compute:tender-geo"
  failures+=("compute:tender-geo")
fi
```

- [ ] **Step 5: Commit**

```bash
git add scripts/compute-tender-geo.ts package.json scripts/scrape-all.sh public/data/tender-geo.json
git commit -m "feat(presupuesto): compute:tender-geo CLI + snapshot + scrape-all wiring"
```

---

### Task 3: Client helpers `src/lib/tender-geo.js`

**Files:**
- Create: `src/lib/tender-geo.js`
- Test: `tests/lib/tender-geo.test.ts`

**Interfaces:**
- Produces: `EMPTY_TENDER_GEO`; `zoneAmountsAt(assignments, {at, danaOnly}) → Map<slug,{amount,count}>`; `topContractors(contracts, n) → [{assignee,amount,count}]`; `filterContracts(contracts, opts, assignmentsById) → contracts[]`.

- [ ] **Step 1: Write the failing test** — `tests/lib/tender-geo.test.ts`

```ts
import { describe, it, expect } from 'vitest'
import { zoneAmountsAt, topContractors, filterContracts } from '../../src/lib/tender-geo'

const ASSIGN = [
  { id: 'a', zones: ['z1'], dana: false, amount: 100, date: '2024-01-01' },
  { id: 'b', zones: ['z1', 'z2'], dana: true, amount: 200, date: '2025-06-01' },
  { id: 'c', zones: ['z2'], dana: false, amount: 50, date: null },
]

describe('lib/tender-geo', () => {
  it('zoneAmountsAt accumulates cumulatively up to a timestamp', () => {
    const m = zoneAmountsAt(ASSIGN, { at: new Date('2024-12-31').getTime() })
    expect(m.get('z1')).toEqual({ amount: 100, count: 1 }) // b is after the cutoff
    expect(m.has('z2')).toBe(false)
  })
  it('zoneAmountsAt filters to DANA only', () => {
    const m = zoneAmountsAt(ASSIGN, { danaOnly: true })
    expect(m.get('z1')).toEqual({ amount: 200, count: 1 })
    expect(m.get('z2')).toEqual({ amount: 200, count: 1 })
  })
  it('topContractors ranks awarded final amounts and ignores non-awarded', () => {
    const top = topContractors(
      [
        { assignee: 'ACME', status: 'awarded', finalAmount: 100 },
        { assignee: 'ACME', status: 'awarded', finalAmount: 40 },
        { assignee: 'ACME', status: 'open', finalAmount: 0, initialAmount: 999 },
        { assignee: 'BETA', status: 'awarded', finalAmount: 90 },
      ],
      10,
    )
    expect(top[0]).toEqual({ assignee: 'ACME', amount: 140, count: 2 })
    expect(top[1].assignee).toBe('BETA')
  })
  it('filterContracts narrows by text, zone, and dana', () => {
    const contracts = [
      { id: 'a', title: 'Obra en Molinet', assignee: 'ACME', awardDate: '2024-01-01', categoryTitle: 'construction', contractType: 'construction' },
      { id: 'c', title: 'Servicio limpieza', assignee: 'BETA', awardDate: '2024-01-01', categoryTitle: 'other', contractType: 'services' },
    ]
    const byId = new Map(ASSIGN.map((x) => [x.id, x]))
    expect(filterContracts(contracts, { text: 'molinet' }, byId).map((c) => c.id)).toEqual(['a'])
    expect(filterContracts(contracts, { zoneSlug: 'z2' }, byId).map((c) => c.id)).toEqual(['c'])
    expect(filterContracts(contracts, { dana: true }, byId).map((c) => c.id)).toEqual([])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/lib/tender-geo.test.ts`
Expected: FAIL — cannot resolve module.

- [ ] **Step 3: Write the implementation** — `src/lib/tender-geo.js`

```js
// @ts-check
/**
 * Pure client helpers over a tender-geo snapshot. No React, no fetch — shared
 * by the dashboard components and unit-tested in isolation.
 */

export const EMPTY_TENDER_GEO = {
  generatedAt: null,
  source: { tenders: null, geo: null },
  universe: {
    totalContracts: 0,
    totalAmount: 0,
    locatedContracts: 0,
    locatedAmount: 0,
    danaContracts: 0,
    danaAmount: 0,
    dateMin: null,
    dateMax: null,
  },
  zones: [],
  assignments: [],
}

/**
 * Per-zone {amount,count} for assignments dated on/before `at` (cumulative),
 * optionally restricted to DANA. Assignments with no date are always included.
 * @param {any[]} assignments
 * @param {{at?: number, danaOnly?: boolean}} [opts]
 * @returns {Map<string,{amount:number,count:number}>}
 */
export function zoneAmountsAt(assignments, { at = Infinity, danaOnly = false } = {}) {
  const m = new Map()
  for (const a of assignments || []) {
    if (danaOnly && !a.dana) continue
    if (a.date && new Date(a.date).getTime() > at) continue
    for (const slug of a.zones) {
      const cur = m.get(slug) || { amount: 0, count: 0 }
      cur.amount += a.amount
      cur.count += 1
      m.set(slug, cur)
    }
  }
  return m
}

/**
 * @param {any[]} contracts
 * @param {number} [n]
 * @returns {{assignee:string,amount:number,count:number}[]}
 */
export function topContractors(contracts, n = 15) {
  const m = new Map()
  for (const c of contracts || []) {
    // Awarded money only — "who received the awarded money".
    if (c.status !== 'awarded' || !(c.finalAmount > 0)) continue
    const name = c.assignee
    if (!name) continue
    const cur = m.get(name) || { assignee: name, amount: 0, count: 0 }
    cur.amount += c.finalAmount
    cur.count += 1
    m.set(name, cur)
  }
  return [...m.values()].sort((a, b) => b.amount - a.amount).slice(0, n)
}

/**
 * @param {any[]} contracts
 * @param {{text?:string,zoneSlug?:string,category?:string,year?:string,dana?:boolean,type?:string}} [opts]
 * @param {Map<string,any>} [assignmentsById]
 * @returns {any[]}
 */
export function filterContracts(contracts, opts = {}, assignmentsById = new Map()) {
  const { text = '', zoneSlug = '', category = '', year = '', dana = false, type = '' } = opts
  const q = text.trim().toLowerCase()
  return (contracts || []).filter((c) => {
    if (q && !c.title.toLowerCase().includes(q) && !(c.assignee || '').toLowerCase().includes(q)) return false
    if (category && c.categoryTitle !== category) return false
    if (type && c.contractType !== type) return false
    if (year) {
      const d = c.awardDate || c.startDate
      if (!d || !String(d).startsWith(year)) return false
    }
    const a = assignmentsById.get(c.id)
    if (zoneSlug && !(a && a.zones.includes(zoneSlug))) return false
    if (dana && !(a && a.dana)) return false
    return true
  })
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/lib/tender-geo.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/tender-geo.js tests/lib/tender-geo.test.ts
git commit -m "feat(presupuesto): pure client helpers for tender-geo"
```

---

### Task 4: Hook `src/hooks/useTenderGeo.js`

**Files:**
- Create: `src/hooks/useTenderGeo.js`

**Interfaces:**
- Consumes: `useJsonFetch` (`src/hooks/useJsonFetch.js`), `EMPTY_TENDER_GEO` (Task 3).
- Produces: `useTenderGeo() → {loading, error, data}` where `data` is a `TenderGeoSnapshot` (or `EMPTY_TENDER_GEO` on 404 before the first build).

- [ ] **Step 1: Write the hook** — `src/hooks/useTenderGeo.js`

```js
// @ts-check
import { useJsonFetch } from './useJsonFetch'
import { EMPTY_TENDER_GEO } from '../lib/tender-geo'

/** tender-geo.json may not exist before the first compute run → 404 → fallback. */
export function useTenderGeo() {
  return useJsonFetch('/data/tender-geo.json', EMPTY_TENDER_GEO)
}
```

- [ ] **Step 2: Verify it typechecks + commit**

Run: `npm run typecheck`
Expected: no errors.

```bash
git add src/hooks/useTenderGeo.js
git commit -m "feat(presupuesto): useTenderGeo hook"
```

---

### Task 5: `GastoMap.jsx`

**Files:**
- Create: `src/components/Presupuesto/GastoMap.jsx`

**Interfaces:**
- Consumes: `useGeo` (`src/hooks/useGeo.js` → `data.boundary.polygon`), `zoneAmountsAt` (Task 3), react-leaflet.
- Produces: `default GastoMap({ snapshot, sliderTime, danaOnly, selectedZone, onSelectZone })`.

- [ ] **Step 1: Write the component** — `src/components/Presupuesto/GastoMap.jsx`

```jsx
import { useEffect, useMemo } from 'react'
import { Circle, MapContainer, Polyline, TileLayer, Tooltip, useMap } from 'react-leaflet'
import { useGeo } from '../../hooks/useGeo'
import { zoneAmountsAt } from '../../lib/tender-geo'

const RIBA_CENTER = [39.52, -0.55]
const fmtEur = (n) =>
  new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0, notation: 'compact' }).format(n)

function ResizeOnMount() {
  const map = useMap()
  useEffect(() => {
    const id = setTimeout(() => map.invalidateSize(), 120)
    return () => clearTimeout(id)
  }, [map])
  return null
}

function Boundary() {
  const { data: geo } = useGeo()
  if (!geo?.boundary?.polygon) return null
  return (
    <Polyline
      positions={geo.boundary.polygon}
      pathOptions={{ color: '#C85A3A', weight: 2, opacity: 0.5, dashArray: '6 4', fill: false }}
    />
  )
}

export default function GastoMap({ snapshot, sliderTime, danaOnly, selectedZone, onSelectZone }) {
  const amounts = useMemo(
    () => zoneAmountsAt(snapshot?.assignments, { at: sliderTime, danaOnly }),
    [snapshot, sliderTime, danaOnly],
  )
  const zones = (snapshot?.zones || [])
    .map((z) => ({ ...z, live: amounts.get(z.slug) || { amount: 0, count: 0 } }))
    .filter((z) => z.live.amount > 0)

  if (zones.length === 0) {
    return (
      <div role="region" aria-label="Mapa del gasto municipal por zona" style={{ height: 360, display: 'grid', placeItems: 'center', color: 'var(--ink50)', fontSize: 13, border: '1px solid var(--border2)', borderRadius: 10 }}>
        Aún no hay obras situables en el periodo seleccionado.
      </div>
    )
  }

  return (
    <div role="region" aria-label="Mapa interactivo del gasto municipal por zona" style={{ height: 360, borderRadius: 10, overflow: 'hidden', border: '1px solid var(--border2)' }}>
      <MapContainer center={RIBA_CENTER} zoom={12} minZoom={11} maxZoom={16} scrollWheelZoom={false} attributionControl={false} style={{ width: '100%', height: '100%' }}>
        <ResizeOnMount />
        <TileLayer url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png" subdomains={['a', 'b', 'c', 'd']} />
        <Boundary />
        {zones.map((z) => {
          const danaHeavy = danaOnly || (z.danaAmount > 0 && z.danaAmount >= z.amount * 0.5)
          const color = danaHeavy ? '#E08600' : '#2463EB'
          const radius = 150 + Math.sqrt(z.live.amount) / 6
          const sel = selectedZone === z.slug
          return (
            <Circle
              key={z.slug}
              center={z.centroid}
              radius={radius}
              pathOptions={{ color, fillColor: color, fillOpacity: sel ? 0.55 : 0.32, weight: sel ? 3 : 1.5, opacity: 0.85 }}
              eventHandlers={{ click: () => onSelectZone(z.slug) }}
            >
              <Tooltip direction="top">
                <div style={{ fontFamily: 'Outfit, sans-serif', fontSize: 12 }}>
                  <strong>{z.name}</strong>
                  <br />
                  {fmtEur(z.live.amount)} · {z.live.count} obra{z.live.count === 1 ? '' : 's'}
                </div>
              </Tooltip>
            </Circle>
          )
        })}
      </MapContainer>
    </div>
  )
}
```

- [ ] **Step 2: Verify build + lint, then commit**

Run: `npm run lint -- src/components/Presupuesto/GastoMap.jsx`
Expected: no errors. (Leaflet renders only in a real browser; it's exercised by the e2e gate in Task 12, not happy-dom.)

```bash
git add src/components/Presupuesto/GastoMap.jsx
git commit -m "feat(presupuesto): GastoMap leaflet circles by € and DANA"
```

---

### Task 6: `CoverageMeter.jsx` + `ZoneDrilldown.jsx`

**Files:**
- Create: `src/components/Presupuesto/CoverageMeter.jsx`, `src/components/Presupuesto/ZoneDrilldown.jsx`

**Interfaces:**
- `CoverageMeter({ universe, zones, onSelectZone })`.
- `ZoneDrilldown({ snapshot, zoneSlug, contractsById, danaOnly, onClear })`.
- Consumes: `Pill` (`src/components/Primitives`), `STATUS_LABEL`/`STATUS_TONE` (`src/hooks/useTenders`), `fmtDateShort` (`src/lib/formatters`).

- [ ] **Step 1: Write `CoverageMeter.jsx`**

```jsx
const fmtEur = (n) =>
  new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0, notation: 'compact' }).format(n)

export default function CoverageMeter({ universe, zones, onSelectZone }) {
  const total = universe?.totalAmount || 0
  const located = universe?.locatedAmount || 0
  const pct = total > 0 ? (located / total) * 100 : 0
  const top = (zones || []).slice(0, 5)
  const maxAmt = top.length ? top[0].amount : 1
  return (
    <div>
      <div style={{ fontSize: 12.5, lineHeight: 1.4 }}>
        De <strong>{fmtEur(total)}</strong> adjudicados en contratos, <strong>{fmtEur(located)}</strong> ({pct.toFixed(0)}%) se pueden situar en el mapa.
      </div>
      <div style={{ height: 14, borderRadius: 7, overflow: 'hidden', display: 'flex', border: '1px solid var(--border2)', margin: '8px 0 6px' }}>
        <div style={{ width: pct + '%', background: 'var(--civic)' }} />
        <div style={{ flex: 1, background: 'var(--soft)' }} />
      </div>
      <div style={{ fontSize: 11, color: 'var(--ink50)', fontStyle: 'italic', lineHeight: 1.4 }}>
        El resto son contratos adjudicados cuyo título no nombra una zona (servicios, suministros y obras sin lugar citado): no se inventa una ubicación. Un contrato que cita dos zonas suma en ambas, pero cuenta una sola vez aquí.
      </div>
      <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 5 }}>
        {top.map((z) => (
          <button key={z.slug} onClick={() => onSelectZone(z.slug)} style={{ all: 'unset', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
            <span style={{ flex: 1 }}>{z.name}</span>
            <span style={{ height: 6, width: Math.max(6, (z.amount / maxAmt) * 80), background: 'var(--civic)', borderRadius: 3 }} />
            <span className="mono" style={{ fontWeight: 700, fontSize: 11 }}>{fmtEur(z.amount)}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Write `ZoneDrilldown.jsx`**

```jsx
import { Pill } from '../Primitives'
import { STATUS_LABEL, STATUS_TONE } from '../../hooks/useTenders'
import { fmtDateShort } from '../../lib/formatters'

const fmtEur = (n) =>
  new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n)

export default function ZoneDrilldown({ snapshot, zoneSlug, contractsById, danaOnly, onClear }) {
  const zone = (snapshot?.zones || []).find((z) => z.slug === zoneSlug)
  if (!zone) return null
  const works = (snapshot?.assignments || [])
    .filter((a) => a.zones.includes(zoneSlug) && (!danaOnly || a.dana))
    .map((a) => ({ a, c: contractsById.get(a.id) }))
    .filter((w) => w.c)
    .sort((x, y) => (y.a.date || '').localeCompare(x.a.date || ''))
  const total = works.reduce((s, w) => s + w.a.amount, 0)
  return (
    <div>
      <button onClick={onClear} style={{ all: 'unset', cursor: 'pointer', fontSize: 11, color: 'var(--civic)' }}>← todas las zonas</button>
      <div style={{ fontSize: 16, fontWeight: 700, marginTop: 4 }}>{zone.name}</div>
      <div className="mono" style={{ fontSize: 13, fontWeight: 700 }}>{fmtEur(total)} · {works.length} obra{works.length === 1 ? '' : 's'}</div>
      <div style={{ marginTop: 8, maxHeight: 320, overflowY: 'auto' }}>
        {works.map(({ a, c }) => (
          <div key={a.id} style={{ padding: '8px 0', borderBottom: '1px solid var(--border2)' }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
              <div style={{ flex: 1, fontSize: 12.5, fontWeight: 500, lineHeight: 1.3 }}>
                {c.permalink ? (
                  <a href={c.permalink} target="_blank" rel="noreferrer" style={{ color: 'inherit', textDecoration: 'none' }}>{c.title}</a>
                ) : (
                  c.title
                )}
                {a.dana && (
                  <span style={{ marginLeft: 6, fontSize: 9, fontWeight: 700, color: '#A85F00', background: 'rgba(224,134,0,.16)', padding: '1px 5px', borderRadius: 3 }}>DANA</span>
                )}
              </div>
              <span className="mono" style={{ fontSize: 12, fontWeight: 700 }}>{fmtEur(a.amount)}</span>
            </div>
            <div style={{ fontSize: 10.5, color: 'var(--ink50)', marginTop: 2, display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
              <span>{fmtDateShort(a.date) || 'sin fecha'}</span>
              <Pill tone={STATUS_TONE[c.status] || 'ghost'} size="xs">{STATUS_LABEL[c.status] || c.status}</Pill>
              {a.amountKind === 'initial' && <span>importe de licitación</span>}
              <span>· situado por «{a.matchedAlias[zoneSlug]}»</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Lint + commit**

Run: `npm run lint -- src/components/Presupuesto/CoverageMeter.jsx src/components/Presupuesto/ZoneDrilldown.jsx`
Expected: no errors.

```bash
git add src/components/Presupuesto/CoverageMeter.jsx src/components/Presupuesto/ZoneDrilldown.jsx
git commit -m "feat(presupuesto): coverage meter + per-zone drill-down"
```

---

### Task 7: `TimeSlider.jsx`

**Files:**
- Create: `src/components/Presupuesto/TimeSlider.jsx`

**Interfaces:**
- `TimeSlider({ min, max, value, onChange })` — `min/max/value` are epoch ms; `onChange(ms)`.
- Consumes: `fmtDateShort` (`src/lib/formatters`).

- [ ] **Step 1: Write the component**

```jsx
import { useEffect, useRef, useState } from 'react'
import { fmtDateShort } from '../../lib/formatters'

export default function TimeSlider({ min, max, value, onChange }) {
  const [playing, setPlaying] = useState(false)
  const raf = useRef(0)
  const acc = useRef(value)

  useEffect(() => {
    if (!playing) return undefined
    const reduce = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduce) {
      onChange(max)
      setPlaying(false)
      return undefined
    }
    acc.current = value
    const step = (max - min) / 120
    const tick = () => {
      acc.current = Math.min(max, acc.current + step)
      onChange(acc.current)
      if (acc.current >= max) {
        setPlaying(false)
        return
      }
      raf.current = requestAnimationFrame(tick)
    }
    raf.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing])

  if (!min || !max || min >= max) return null
  const label = fmtDateShort(new Date(value).toISOString())
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8 }}>
      <button
        onClick={() => {
          if (value >= max) onChange(min)
          setPlaying((p) => !p)
        }}
        aria-label={playing ? 'Pausar línea de tiempo' : 'Reproducir línea de tiempo'}
        style={{ all: 'unset', cursor: 'pointer', fontSize: 16 }}
      >
        {playing ? '⏸' : '▶'}
      </button>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        step={Math.max(1, (max - min) / 200)}
        onChange={(e) => {
          setPlaying(false)
          onChange(Number(e.target.value))
        }}
        aria-label="Línea de tiempo del gasto situado"
        aria-valuetext={label}
        style={{ flex: 1 }}
      />
      <span className="mono" style={{ fontSize: 11, width: 92, textAlign: 'right' }}>{label}</span>
    </div>
  )
}
```

- [ ] **Step 2: Lint + commit**

Run: `npm run lint -- src/components/Presupuesto/TimeSlider.jsx`
Expected: no errors.

```bash
git add src/components/Presupuesto/TimeSlider.jsx
git commit -m "feat(presupuesto): cumulative time slider with play/pause"
```

---

### Task 8: `ContractsExplorer.jsx`

**Files:**
- Create: `src/components/Presupuesto/ContractsExplorer.jsx`

**Interfaces:**
- `ContractsExplorer({ contracts, snapshot })`.
- Consumes: `Pill`, `STATUS_LABEL`/`STATUS_TONE`, `fmtDateShort`, `filterContracts` (Task 3).

- [ ] **Step 1: Write the component**

```jsx
import { useMemo, useState } from 'react'
import { Pill } from '../Primitives'
import { STATUS_LABEL, STATUS_TONE } from '../../hooks/useTenders'
import { fmtDateShort } from '../../lib/formatters'
import { filterContracts } from '../../lib/tender-geo'

const fmtEur = (n) =>
  new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n)

const INP = { fontSize: 12, padding: '5px 8px', border: '1px solid var(--border2)', borderRadius: 6, background: 'var(--paper)', color: 'var(--ink)' }

export default function ContractsExplorer({ contracts, snapshot }) {
  const [text, setText] = useState('')
  const [zoneSlug, setZone] = useState('')
  const [type, setType] = useState('')
  const [dana, setDana] = useState(false)
  const assignmentsById = useMemo(
    () => new Map((snapshot?.assignments || []).map((a) => [a.id, a])),
    [snapshot],
  )
  const rows = useMemo(
    () => filterContracts(contracts, { text, zoneSlug, type, dana }, assignmentsById).slice(0, 60),
    [contracts, text, zoneSlug, type, dana, assignmentsById],
  )
  const zones = snapshot?.zones || []
  return (
    <div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
        <input placeholder="Buscar contrato o empresa…" value={text} onChange={(e) => setText(e.target.value)} style={{ ...INP, flex: 1, minWidth: 160 }} />
        <select value={zoneSlug} onChange={(e) => setZone(e.target.value)} style={INP} aria-label="Filtrar por zona">
          <option value="">Todas las zonas</option>
          {zones.map((z) => (
            <option key={z.slug} value={z.slug}>{z.name}</option>
          ))}
        </select>
        <select value={type} onChange={(e) => setType(e.target.value)} style={INP} aria-label="Filtrar por tipo">
          <option value="">Todo tipo</option>
          <option value="construction">Obras</option>
          <option value="services">Servicios</option>
          <option value="supplies">Suministros</option>
        </select>
        <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}>
          <input type="checkbox" checked={dana} onChange={(e) => setDana(e.target.checked)} /> DANA
        </label>
      </div>
      <div style={{ fontSize: 11, color: 'var(--ink50)', marginBottom: 6 }}>{rows.length} resultado{rows.length === 1 ? '' : 's'} (máx. 60)</div>
      {rows.map((c) => (
        <div key={c.id} style={{ display: 'grid', gridTemplateColumns: '1fr 100px 90px', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--border2)', alignItems: 'center', fontSize: 12.5 }}>
          <div style={{ minWidth: 0 }}>
            {c.permalink ? (
              <a href={c.permalink} target="_blank" rel="noreferrer" style={{ color: 'inherit', textDecoration: 'none' }}>{c.title.length > 100 ? c.title.slice(0, 100) + '…' : c.title}</a>
            ) : (
              c.title
            )}
            <div style={{ fontSize: 10.5, color: 'var(--ink50)' }}>{c.assignee || '—'} · {fmtDateShort(c.awardDate) || '—'}</div>
          </div>
          <span className="mono" style={{ textAlign: 'right', fontWeight: 700 }}>{fmtEur(c.finalAmount > 0 ? c.finalAmount : c.initialAmount)}</span>
          <span style={{ textAlign: 'right' }}>
            <Pill tone={STATUS_TONE[c.status] || 'ghost'} size="xs">{STATUS_LABEL[c.status] || c.status}</Pill>
          </span>
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 2: Lint + commit**

Run: `npm run lint -- src/components/Presupuesto/ContractsExplorer.jsx`
Expected: no errors.

```bash
git add src/components/Presupuesto/ContractsExplorer.jsx
git commit -m "feat(presupuesto): searchable contracts explorer"
```

---

### Task 9: `ContractorLeaderboard.jsx`

**Files:**
- Create: `src/components/Presupuesto/ContractorLeaderboard.jsx`

**Interfaces:**
- `ContractorLeaderboard({ contracts })`.
- Consumes: `topContractors` (Task 3).

- [ ] **Step 1: Write the component**

```jsx
import { useMemo, useState } from 'react'
import { topContractors } from '../../lib/tender-geo'

const fmtEur = (n) =>
  new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n)

export default function ContractorLeaderboard({ contracts }) {
  const [open, setOpen] = useState(null)
  const top = useMemo(() => topContractors(contracts, 15), [contracts])
  const byAssignee = useMemo(() => {
    const m = new Map()
    for (const c of contracts || []) {
      if (!c.assignee) continue
      const arr = m.get(c.assignee) || []
      arr.push(c)
      m.set(c.assignee, arr)
    }
    return m
  }, [contracts])
  const max = top.length ? top[0].amount : 1
  return (
    <div>
      {top.map((t) => (
        <div key={t.assignee} style={{ borderBottom: '1px solid var(--border2)', padding: '8px 0' }}>
          <button onClick={() => setOpen(open === t.assignee ? null : t.assignee)} style={{ all: 'unset', cursor: 'pointer', display: 'flex', gap: 8, alignItems: 'center', width: '100%' }}>
            <span style={{ flex: 1, fontSize: 12.5, fontWeight: 500 }}>{t.assignee}</span>
            <span style={{ height: 6, width: Math.max(6, (t.amount / max) * 120), background: 'var(--civic)', borderRadius: 3 }} />
            <span className="mono" style={{ fontWeight: 700, fontSize: 12 }}>{fmtEur(t.amount)}</span>
            <span style={{ fontSize: 10.5, color: 'var(--ink50)', width: 70, textAlign: 'right' }}>{t.count} contrato{t.count === 1 ? '' : 's'}</span>
          </button>
          {open === t.assignee && (
            <div style={{ paddingLeft: 8, marginTop: 4 }}>
              {(byAssignee.get(t.assignee) || []).slice(0, 20).map((c) => (
                <div key={c.id} style={{ fontSize: 11.5, color: 'var(--ink60)', padding: '3px 0' }}>
                  {c.title.length > 90 ? c.title.slice(0, 90) + '…' : c.title} — <span className="mono">{fmtEur(c.finalAmount > 0 ? c.finalAmount : c.initialAmount)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 2: Lint + commit**

Run: `npm run lint -- src/components/Presupuesto/ContractorLeaderboard.jsx`
Expected: no errors.

```bash
git add src/components/Presupuesto/ContractorLeaderboard.jsx
git commit -m "feat(presupuesto): contractor leaderboard (who gets the money)"
```

---

### Task 10: `SpendingTypeBreakdown.jsx`

**Files:**
- Create: `src/components/Presupuesto/SpendingTypeBreakdown.jsx`

**Interfaces:**
- `SpendingTypeBreakdown({ contracts, snapshot })`. (Inline bars — `Charts.jsx` has no `Donut`.)

- [ ] **Step 1: Write the component**

```jsx
import { useMemo } from 'react'

const fmtEur = (n) =>
  new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0, notation: 'compact' }).format(n)

const TYPE_LABEL = {
  construction: 'Obras',
  services: 'Servicios',
  supplies: 'Suministros',
  public_services_management: 'Gestión de servicios',
  patrimonial: 'Patrimonial',
  other: 'Otros',
}
const TYPE_COLOR = {
  construction: '#2463EB',
  services: '#0EA5A4',
  supplies: '#D97706',
  public_services_management: '#7C3AED',
  patrimonial: '#64748B',
  other: '#94A3B8',
}

export default function SpendingTypeBreakdown({ contracts, snapshot }) {
  const { rows, total, danaPct } = useMemo(() => {
    const m = new Map()
    let sum = 0
    for (const c of contracts || []) {
      const amt = c.status === 'awarded' && c.finalAmount > 0 ? c.finalAmount : 0
      if (amt <= 0) continue
      const k = c.contractType || 'other'
      m.set(k, (m.get(k) || 0) + amt)
      sum += amt
    }
    const r = [...m.entries()].map(([k, v]) => ({ k, v })).sort((a, b) => b.v - a.v)
    const dpct = sum > 0 ? ((snapshot?.universe?.danaAmount || 0) / sum) * 100 : 0
    return { rows: r, total: sum, danaPct: dpct }
  }, [contracts, snapshot])
  if (total <= 0) return null
  return (
    <div>
      <div style={{ display: 'flex', height: 16, borderRadius: 8, overflow: 'hidden', marginBottom: 10 }}>
        {rows.map((r) => (
          <div key={r.k} title={`${TYPE_LABEL[r.k] || r.k}: ${fmtEur(r.v)}`} style={{ width: (r.v / total) * 100 + '%', background: TYPE_COLOR[r.k] || '#94A3B8' }} />
        ))}
      </div>
      {rows.map((r) => (
        <div key={r.k} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, padding: '3px 0' }}>
          <span style={{ width: 10, height: 10, borderRadius: 2, background: TYPE_COLOR[r.k] || '#94A3B8' }} />
          <span style={{ flex: 1 }}>{TYPE_LABEL[r.k] || r.k}</span>
          <span className="mono" style={{ fontWeight: 700 }}>{fmtEur(r.v)}</span>
          <span className="mono" style={{ width: 44, textAlign: 'right', color: 'var(--ink50)', fontSize: 11 }}>{((r.v / total) * 100).toFixed(0)}%</span>
        </div>
      ))}
      <div style={{ fontSize: 11, color: 'var(--ink50)', marginTop: 8 }}>Recuperación DANA ≈ {danaPct.toFixed(0)}% del importe contratado situable.</div>
    </div>
  )
}
```

- [ ] **Step 2: Lint + commit**

Run: `npm run lint -- src/components/Presupuesto/SpendingTypeBreakdown.jsx`
Expected: no errors.

```bash
git add src/components/Presupuesto/SpendingTypeBreakdown.jsx
git commit -m "feat(presupuesto): spending-type breakdown bars"
```

---

### Task 11: `GastoDashboard.jsx` container

**Files:**
- Create: `src/components/Presupuesto/GastoDashboard.jsx`

**Interfaces:**
- `default GastoDashboard()` — self-contained; calls `useTenderGeo` + `useTenders`.
- Consumes: all Task 5–10 components, `Card`/`SectionHead`/`Pill` (`src/components/Primitives`).

- [ ] **Step 1: Write the container**

```jsx
import { useEffect, useMemo, useState } from 'react'
import { Card, SectionHead, Pill } from '../Primitives'
import { useTenders } from '../../hooks/useTenders'
import { useTenderGeo } from '../../hooks/useTenderGeo'
import GastoMap from './GastoMap'
import CoverageMeter from './CoverageMeter'
import ZoneDrilldown from './ZoneDrilldown'
import TimeSlider from './TimeSlider'
import ContractsExplorer from './ContractsExplorer'
import ContractorLeaderboard from './ContractorLeaderboard'
import SpendingTypeBreakdown from './SpendingTypeBreakdown'

const TABS = [
  { id: 'explorar', label: '🔎 Explorar contratos' },
  { id: 'contratistas', label: '🏗️ ¿Quién recibe el dinero?' },
  { id: 'tipos', label: '📊 Tipos de gasto' },
]

export default function GastoDashboard() {
  const { data: tg } = useTenderGeo()
  const { data: tenders } = useTenders()
  const contracts = useMemo(() => tenders?.contracts || [], [tenders])
  const contractsById = useMemo(() => new Map(contracts.map((c) => [c.id, c])), [contracts])

  const dateMax = tg?.universe?.dateMax ? new Date(tg.universe.dateMax).getTime() : 0
  const dateMin = tg?.universe?.dateMin ? new Date(tg.universe.dateMin).getTime() : 0

  const [selectedZone, setSelectedZone] = useState(null)
  const [sliderTime, setSliderTime] = useState(0)
  const [danaOnly, setDanaOnly] = useState(false)
  const [tab, setTab] = useState('explorar')

  // Pin the slider to the latest date once the snapshot loads.
  useEffect(() => {
    if (dateMax) setSliderTime(dateMax)
  }, [dateMax])

  if (!tg || (tg.zones || []).length === 0) return null

  return (
    <Card>
      <SectionHead eyebrow="Mapa del gasto · obras situables" title="¿A dónde va el dinero en obras?" />
      <div style={{ fontSize: 11, color: 'var(--ink50)', marginBottom: 10 }}>
        Solo se sitúan los contratos cuyo título nombra una zona. Tamaño del círculo = € · azul obra general · ámbar DANA.
      </div>
      <div style={{ marginBottom: 10 }}>
        <button onClick={() => setDanaOnly((v) => !v)} aria-pressed={danaOnly} style={{ all: 'unset', cursor: 'pointer' }}>
          <Pill tone={danaOnly ? 'warn' : 'ghost'} size="xs">{danaOnly ? '● Solo DANA' : '○ Solo DANA'}</Pill>
        </button>
      </div>

      <div className="cp-gasto-grid" style={{ display: 'grid', gridTemplateColumns: '1.7fr 1fr', gap: 14 }}>
        <div>
          <GastoMap snapshot={tg} sliderTime={sliderTime} danaOnly={danaOnly} selectedZone={selectedZone} onSelectZone={setSelectedZone} />
          <TimeSlider min={dateMin} max={dateMax} value={sliderTime || dateMax} onChange={setSliderTime} />
        </div>
        <div>
          {selectedZone ? (
            <ZoneDrilldown snapshot={tg} zoneSlug={selectedZone} contractsById={contractsById} danaOnly={danaOnly} onClear={() => setSelectedZone(null)} />
          ) : (
            <CoverageMeter universe={tg.universe} zones={tg.zones} onSelectZone={setSelectedZone} />
          )}
        </div>
      </div>

      <div style={{ marginTop: 16 }}>
        <div role="tablist" aria-label="Vistas del gasto" style={{ display: 'flex', gap: 6, borderBottom: '1px solid var(--border2)', flexWrap: 'wrap' }}>
          {TABS.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              style={{ all: 'unset', cursor: 'pointer', fontSize: 12.5, padding: '8px 12px', borderBottom: tab === t.id ? '2px solid var(--civic)' : '2px solid transparent', color: tab === t.id ? 'var(--civic)' : 'var(--ink60)', fontWeight: tab === t.id ? 700 : 500 }}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div role="tabpanel" style={{ paddingTop: 12 }}>
          {tab === 'explorar' && <ContractsExplorer contracts={contracts} snapshot={tg} />}
          {tab === 'contratistas' && <ContractorLeaderboard contracts={contracts} />}
          {tab === 'tipos' && <SpendingTypeBreakdown contracts={contracts} snapshot={tg} />}
        </div>
      </div>
    </Card>
  )
}
```

- [ ] **Step 2: Lint + typecheck + commit**

Run: `npm run lint -- src/components/Presupuesto/GastoDashboard.jsx && npm run typecheck`
Expected: no errors.

```bash
git add src/components/Presupuesto/GastoDashboard.jsx
git commit -m "feat(presupuesto): GastoDashboard container (map + panel + tabs)"
```

---

### Task 12: Integrate into the page + mobile CSS + e2e

**Files:**
- Modify: `src/pages/Presupuesto.jsx`, `src/index.css`, `tests/e2e/presupuesto.spec.ts`

**Interfaces:**
- Consumes: `GastoDashboard` (Task 11). Splits `RealBudgetHeader` into `RealBudgetHeader` (title+KPIs) + `BudgetCharts` (the 3 chart grids); removes `RealContracts` (the Explorar tab supersedes it). New order: header → dashboard → charts → subsidies.

- [ ] **Step 1: In `src/pages/Presupuesto.jsx`, add the import** at the top, after the existing imports:

```jsx
import GastoDashboard from '../components/Presupuesto/GastoDashboard'
```

- [ ] **Step 2: Split `RealBudgetHeader`.** In `RealBudgetHeader`, DELETE the JSX block that renders the three chart grids — it is the `<div>` that starts with `gridTemplateColumns: '1fr 1fr'` (the "En qué se gasta…/Para qué se gasta…" pair) through the end of the `revenueByEconomicChapter` grid (the block currently at lines ~400–464, ending just before the final `</>`). The component now ends right after the 4-KPI grid `</div>` + `</>`. Then add this NEW component immediately below `RealBudgetHeader`:

```jsx
function BudgetCharts() {
  const { loading, error, data } = useBudget()
  if (loading || error || !data) return null
  const s = data.snapshot
  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
        <Card>
          <SectionHead eyebrow={`Gastos ${s.year} · clasificación económica`} title="En qué se gasta el dinero público" />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 9, marginTop: 10 }}>
            {[...s.expenseByEconomicChapter]
              .filter((c) => c.amount > 0)
              .sort((a, b) => b.amount - a.amount)
              .map((c) => (
                <ChapterRow key={c.code} label={`Cap.${c.code} · ${c.label}`} amount={c.amount} total={s.totalExpense} color={EXPENSE_COLORS[parseInt(c.code, 10) - 1] || '#64748B'} />
              ))}
          </div>
        </Card>
        <Card>
          <SectionHead eyebrow={`Gastos ${s.year} · clasificación por programas`} title="Para qué se gasta el dinero público" />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 9, marginTop: 10 }}>
            {[...s.expenseByProgram]
              .filter((g) => g.amount > 0)
              .sort((a, b) => b.amount - a.amount)
              .map((g) => (
                <ChapterRow key={g.label} label={g.label} amount={g.amount} total={s.totalExpense} color={PROGRAM_COLORS[s.expenseByProgram.indexOf(g)] || '#64748B'} />
              ))}
          </div>
        </Card>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 16, marginBottom: 28 }}>
        <Card>
          <SectionHead eyebrow={`Ingresos ${s.year} · clasificación económica`} title="De dónde vienen los ingresos municipales" />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 9, marginTop: 10 }}>
            {[...s.revenueByEconomicChapter]
              .filter((c) => c.amount > 0)
              .sort((a, b) => b.amount - a.amount)
              .map((c) => (
                <ChapterRow key={c.code} label={`Cap.${c.code} · ${c.label}`} amount={c.amount} total={s.totalRevenue} color={EXPENSE_COLORS[parseInt(c.code, 10) - 1] || '#64748B'} />
              ))}
          </div>
        </Card>
      </div>
    </>
  )
}
```

- [ ] **Step 3: Delete the `RealContracts` function entirely** (lines ~49–162, the `function RealContracts() { … }` block) and its now-unused imports. Update the import lines so the file no longer references removed symbols: `useCorrelationMaps` is only used by `RealContracts`, so remove `import { useCorrelationMaps } from '../hooks/useTenderQuejaCorrelations'`. Keep `useTenders` import ONLY if still used — after removing `RealContracts` it is not, so also remove `import { useTenders, STATUS_LABEL, STATUS_TONE, formatDate } from '../hooks/useTenders'`. Keep `useBudget`, `useBdns`, `formatEuros`, `EXPENSE_COLORS`, `PROGRAM_COLORS`, `Card`, `Pill`, `SectionHead`, `DataAsOf`, `fmtDateLong`/`fmtDateShort` as still used by the remaining components.

- [ ] **Step 4: Replace the default export** at the bottom of the file with the new order:

```jsx
export default function Presupuesto() {
  return (
    <div className="cp-page" style={{ padding: '24px 24px 48px', maxWidth: 1400, margin: '0 auto' }}>
      <RealBudgetHeader />
      <div style={{ marginBottom: 16 }}>
        <GastoDashboard />
      </div>
      <BudgetCharts />
      <div style={{ marginBottom: 16 }}>
        <RealSubsidies />
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Add the mobile collapse rule** to `src/index.css` (anywhere among the component rules):

```css
@media (max-width: 768px) {
  .cp-gasto-grid {
    grid-template-columns: 1fr !important;
  }
}
```

- [ ] **Step 6: Update the e2e spec** — `tests/e2e/presupuesto.spec.ts` (replace the assertion that referenced the removed "Últimos contratos adjudicados" list; add map-dashboard assertions):

```ts
import { test, expect } from '@playwright/test'

test.describe('Presupuesto (/presupuesto)', () => {
  test('renders money map dashboard + spend charts + subsidies', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(String(e)))
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text())
    })

    await page.goto('/presupuesto', { waitUntil: 'domcontentloaded' })

    // New money-map dashboard (src/components/Presupuesto/GastoDashboard.jsx)
    await expect(page.getByText('¿A dónde va el dinero en obras?').first()).toBeVisible({ timeout: 8000 })
    await expect(page.getByRole('tab', { name: /Explorar contratos/ })).toBeVisible()

    // Existing budget context + subsidies still present
    await expect(page.getByText('En qué se gasta el dinero público').first()).toBeVisible()
    await expect(page.getByText('De dónde vienen los ingresos municipales').first()).toBeVisible()
    await expect(page.getByText('Subvenciones · Base Nacional').first()).toBeVisible()
    await expect(page.getByText(/€/).first()).toBeVisible()

    expect(errors.filter((e) => !/favicon|ws:/i.test(e))).toEqual([])
  })

  test('clicking a tab switches the panel', async ({ page }) => {
    await page.goto('/presupuesto', { waitUntil: 'domcontentloaded' })
    await page.getByRole('tab', { name: /Quién recibe el dinero/ }).click()
    // Leaderboard rows render contractor names; the explorer search box is gone.
    await expect(page.getByPlaceholder('Buscar contrato o empresa…')).toHaveCount(0)
  })
})
```

- [ ] **Step 7: Run the full gates**

Run: `npm run typecheck && npm run lint && npm test`
Expected: all green (vitest includes the new Task 1 + Task 3 suites).

Run: `npm run test:e2e -- presupuesto a11y`
Expected: the two presupuesto specs PASS and the axe a11y spec stays green for `/presupuesto`. If axe flags the new map, fix by confirming the `role="region"` + `aria-label` wrapper (Task 5) and the slider/tab ARIA are present.

- [ ] **Step 8: Manual smoke (dev server)**

Run: `npm run dev` then open `http://localhost:5173/presupuesto`. Confirm: circles render sized by €, clicking a zone opens the drill-down, the coverage meter shows <100%, the DANA toggle recolors/refilters, the slider scrubs cumulatively, and the three tabs switch. Stop the server when done.

- [ ] **Step 9: Commit**

```bash
git add src/pages/Presupuesto.jsx src/index.css tests/e2e/presupuesto.spec.ts
git commit -m "feat(presupuesto): wire money-map dashboard into the page (drop top-8 list)"
```

---

### Task 13: Documentation (CLAUDE.md + Metodología)

**Files:**
- Modify: `CLAUDE.md`, `src/pages/Metodologia.jsx`

**Interfaces:** none (docs only).

- [ ] **Step 1: Add a scraper-map row to `CLAUDE.md`.** In the "Real data pipeline" pipeline diagram (the ``` block listing `scripts/scrape-*.ts → src/scraper/*.ts → public/data/*.json`), add under the autonomous list:

```
scripts/compute-tender-geo.ts         →  src/scraper/tender-geo.ts        →  public/data/tender-geo.json
```

And in the Commands section near `compute:dept-stats`, add:

```
npm run compute:tender-geo          # match contract titles → OSM zones · writes tender-geo.json · runs in scrape:all
```

- [ ] **Step 2: Add a hook bullet to `CLAUDE.md`** in the Hooks list:

```
- `useTenderGeo` + `src/lib/tender-geo.js` (`zoneAmountsAt` / `topContractors` / `filterContracts`)
```

- [ ] **Step 3: Add the honesty section to `src/pages/Metodologia.jsx`.** Open the file; confirm `Card` and `SectionHead` are imported from `'../components/Primitives'` (add to the existing import if missing). Insert this self-contained block just before the closing tag of the page's main content wrapper (the outermost `</div>` of the returned layout):

```jsx
        <Card>
          <SectionHead eyebrow="Transparencia · /presupuesto" title="Mapa del gasto: qué situamos y qué no" />
          <p style={{ fontSize: 13, lineHeight: 1.55, color: 'var(--ink70)', marginTop: 8 }}>
            Situamos en el mapa únicamente los contratos cuyo título nombra una zona concreta
            (urbanización, polígono o paraje). No existe un campo de «lugar de ejecución» en la
            fuente (Gobierto/PLACSP), así que el título es la única señal disponible. El medidor de
            cobertura muestra qué parte del importe adjudicado se puede situar y qué parte no: el
            gasto sin ubicación (servicios, suministros y obras sin lugar citado) nunca se reparte por zonas. Un
            contrato que cita dos zonas aparece en ambas, pero cuenta una sola vez en el total situado.
          </p>
        </Card>
```

- [ ] **Step 4: Verify the page still builds + commit**

Run: `npm run lint -- src/pages/Metodologia.jsx`
Expected: no errors.

```bash
git add CLAUDE.md src/pages/Metodologia.jsx
git commit -m "docs(presupuesto): document the money-map honesty contract"
```

---

## Notes & deliberate deviations from the spec

- **i18n deferred** (spec §9): `/presupuesto` is 100% hard-coded Spanish today; new components match that. Wiring i18n for the whole page is a separate, page-wide change.
- **Map prominence, not absolute hero**: `RealBudgetHeader` keeps the page title + KPIs above the map (the map sits directly below the KPI strip). Splitting the title off entirely was judged unnecessary churn.
- **Component testing**: Leaflet does not render under happy-dom, so map/panel behaviour is gated by Playwright e2e (Task 12), not vitest. The pure logic (matcher + helpers) carries the unit-test burden (Tasks 1, 3).
- **Fixtures inlined**: the matcher test inlines its data (mirrors `tests/department-stats.test.ts`) rather than adding `tests/fixtures/tenders_geo_sample.json`.
