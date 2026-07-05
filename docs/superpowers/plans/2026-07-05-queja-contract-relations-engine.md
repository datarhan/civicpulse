# Queja↔Contract Relations Engine (D1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a deterministic, explainable engine that scores relations between citizen complaints and municipal contracts, revive the queja→money card, and retire the dormant old correlator.

**Architecture:** A pure core (`src/scraper/queja-contract-relations.ts`, no I/O) exposes four deterministic signals (place, department/theme, temporal-modifier, expediente), a `scoreRelation` combiner that assigns Tier A (publishable) / Tier B (`requiresHumanApproval`) / none under strict honesty gates, and a `buildRelations` entry point. A CLI reads the real JSON snapshots (current bot schema + tender-geo) and writes `public/data/queja-contract-relations.json`. A hook + the existing `/quejas/:id` card render Tier A links only. LLM rerank + reverse/overlap views are later deliverables.

**Tech Stack:** TypeScript (scraper/core), Vitest, plain-JS React hook, existing helpers (`canonicalizeDepartment`, `queja-to-cpv`, place-resolver normalization).

## Global Constraints

- Deterministic only in D1 — **no LLM, no network** in the core or the nightly CLI.
- Neutral framing: `relationLabel` is a fixed enum — `"mismo expediente"`, `"misma zona y materia"`, `"misma zona"`, `"misma materia"`. No causal words anywhere.
- Honesty gates (unit-tested): never emit on `temporal` alone; `department`/theme alone is **never** Tier A; LOREG freeze → empty output.
- `requiresHumanApproval: false` **only** for Tier A. Tier B always `true`.
- Slug normalization reuses the place-resolver's fold (diacritics + ca/es), never a fork.
- Reuse `tenderMatchesQuejaCpv` / `QUEJA_CATEGORY_TO_CPV` / `cpvDivision` from `src/llm/queja-to-cpv.ts` (keep that file).
- TDD: RED→GREEN per step; `tsc --noEmit`, eslint, prettier stay green; frequent commits.

---

## File Structure

- Create `src/scraper/queja-contract-relations.ts` — pure core (types, signals, `scoreRelation`, `buildRelations`).
- Create `tests/parse-queja-contract-relations.test.ts` — unit tests for the core.
- Create `scripts/scrape-queja-contract-relations.ts` — CLI (I/O + normalization + write).
- Create `src/hooks/useQuejaContractRelations.js` — fetch + index helpers.
- Modify `src/pages/QuejaDetail.jsx` — repoint `CorrelationsCard` to the new hook + shape.
- Modify `src/pages/Metodologia.jsx` — add "Relación quejas ↔ contratos" section.
- Modify `package.json` — add `scrape:queja-contract-relations`.
- Modify `scripts/scrape-all.sh` — add best-effort invocation.
- Delete `src/scraper/tender-queja-correlator.ts`, `scripts/scrape-tender-queja-correlations.ts`, `tests/llm/tender-queja-correlator.test.ts`, `src/hooks/useTenderQuejaCorrelations.js`, `public/data/tender-queja-correlations.json`.

---

## Task 1: Core scaffold, types, and the `place` signal

**Files:**
- Create: `src/scraper/queja-contract-relations.ts`
- Test: `tests/parse-queja-contract-relations.test.ts`

**Interfaces:**
- Produces: `RelQueja`, `RelContract`, `RelContext`, `RelationLabel`, `PlaceSignal`, and `placeSignal(q: RelQueja, c: RelContract): PlaceSignal | null`.

```ts
export type RelationLabel =
  | 'mismo expediente' | 'misma zona y materia' | 'misma zona' | 'misma materia'
export interface RelQueja {
  id: string; serviceCode: string; department: string | null
  placeSlug: string | null; description: string; createdAt: string
}
export interface RelContract {
  id: string; permalink: string; title: string; department: string | null
  cpvs: string[]; places: string[]; zones: string[]
  awardDate: string | null; amount: number | null; assignee: string | null
  expediente: string | null
}
export interface PlaceSignal { granularity: 'exact' | 'barrio'; slug: string }
```

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest'
import { placeSignal } from '../src/scraper/queja-contract-relations'
import type { RelQueja, RelContract } from '../src/scraper/queja-contract-relations'

const q = (o: Partial<RelQueja> = {}): RelQueja => ({
  id: 'Q-1', serviceCode: 'via_publica', department: 'movilidad',
  placeSlug: 'valencia-la-vella', description: '', createdAt: '2025-01-01', ...o,
})
const c = (o: Partial<RelContract> = {}): RelContract => ({
  id: 'c1', permalink: 'p', title: 't', department: 'movilidad', cpvs: [],
  places: [], zones: [], awardDate: '2025-03-01', amount: 1, assignee: null,
  expediente: null, ...o,
})

describe('placeSignal', () => {
  it('matches an exact situated place (diacritics/ca-es folded)', () => {
    expect(placeSignal(q({ placeSlug: 'valencia-la-vella' }), c({ places: ['valència-la-vella'] })))
      .toEqual({ granularity: 'exact', slug: 'valencia-la-vella' })
  })
  it('matches a barrio (zone) when the exact place does not', () => {
    expect(placeSignal(q({ placeSlug: 'barri-masia' }), c({ places: ['x'], zones: ['barri-masia'] })))
      .toEqual({ granularity: 'barrio', slug: 'barri-masia' })
  })
  it('returns null when the queja has no place', () => {
    expect(placeSignal(q({ placeSlug: null }), c({ places: ['valencia-la-vella'] }))).toBeNull()
  })
  it('returns null when nothing co-locates', () => {
    expect(placeSignal(q({ placeSlug: 'a' }), c({ places: ['b'], zones: ['c'] }))).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/parse-queja-contract-relations.test.ts`
Expected: FAIL — `placeSignal is not a function` / module not found.

- [ ] **Step 3: Write minimal implementation**

Create the module with the types above plus a normalizer that reuses the repo fold. Use the same normalization the place-resolver uses (import its exported folder if available; otherwise a local `foldSlug` that lowercases, strips diacritics via `normalize('NFD').replace(/\p{Diacritic}/gu,'')`, and collapses separators to `-`). Implementation:

```ts
function foldSlug(s: string | null | undefined): string {
  return (s ?? '').normalize('NFD').replace(/\p{Diacritic}/gu, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}
export function placeSignal(q: RelQueja, c: RelContract): PlaceSignal | null {
  const qs = foldSlug(q.placeSlug)
  if (!qs) return null
  if (c.places.some((p) => foldSlug(p) === qs)) return { granularity: 'exact', slug: qs }
  if (c.zones.some((z) => foldSlug(z) === qs)) return { granularity: 'barrio', slug: qs }
  return null
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/parse-queja-contract-relations.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/scraper/queja-contract-relations.ts tests/parse-queja-contract-relations.test.ts
git commit -m "feat(relations): core types + place co-location signal (TDD)"
```

---

## Task 2: `department`/theme signal, `temporal` modifier, `expediente` signal

**Files:**
- Modify: `src/scraper/queja-contract-relations.ts`
- Test: `tests/parse-queja-contract-relations.test.ts`

**Interfaces:**
- Consumes: `RelQueja`, `RelContract` (Task 1).
- Produces:
  - `departmentSignal(q, c): { slug: string } | null` — canonical dept equality OR `tenderMatchesQuejaCpv(serviceCode, cpvs)`.
  - `temporalModifier(q, c): { monthsAfter: number } | null` — award in `[q−3mo, q+18mo]`, else null.
  - `expedienteSignal(q, c): { value: string } | null` — normalized expediente equality (already resolved onto `RelContract.expediente` by the CLL; here just compares to a non-null contract expediente when the queja department matches).

- [ ] **Step 1: Write the failing test**

```ts
import { departmentSignal, temporalModifier, expedienteSignal } from '../src/scraper/queja-contract-relations'

describe('departmentSignal', () => {
  it('matches on canonical department equality', () => {
    expect(departmentSignal(q({ department: 'urbanismo' }), c({ department: 'urbanismo' }))).toEqual({ slug: 'urbanismo' })
  })
  it('matches on CPV theme even when departments differ/null', () => {
    // via_publica → paving CPV 45233; contract carries it
    expect(departmentSignal(q({ serviceCode: 'via_publica', department: null }), c({ department: null, cpvs: ['45233222'] })))
      .toEqual({ slug: 'movilidad' })
  })
  it('returns null when neither dept nor theme align', () => {
    expect(departmentSignal(q({ serviceCode: 'cultura', department: 'cultura' }), c({ department: 'medio-ambiente', cpvs: ['90000000'] }))).toBeNull()
  })
})

describe('temporalModifier', () => {
  it('fires for an award within +18 months after the queja', () => {
    expect(temporalModifier(q({ createdAt: '2025-01-01' }), c({ awardDate: '2025-05-01' }))?.monthsAfter).toBeCloseTo(4, 0)
  })
  it('is null for an award long before the queja', () => {
    expect(temporalModifier(q({ createdAt: '2025-01-01' }), c({ awardDate: '2020-01-01' }))).toBeNull()
  })
})

describe('expedienteSignal', () => {
  it('matches normalized expediente when department aligns', () => {
    expect(expedienteSignal(q({ department: 'urbanismo' }), c({ department: 'urbanismo', expediente: '251/2023 BSDA' }))).toEqual({ value: '251/2023BSDA' })
  })
  it('is null when the contract has no expediente', () => {
    expect(expedienteSignal(q(), c({ expediente: null }))).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/parse-queja-contract-relations.test.ts`
Expected: FAIL — the three functions are undefined.

- [ ] **Step 3: Write minimal implementation**

Append to the module (import the CPV helpers at the top):

```ts
import { tenderMatchesQuejaCpv, cpvDivision, QUEJA_CATEGORY_TO_CPV } from '../llm/queja-to-cpv'

// serviceCode → canonical department for the theme label. Keep tiny + explicit.
const SERVICE_TO_DEPT: Record<string, string> = {
  via_publica: 'movilidad', trafico: 'movilidad', limpieza: 'medio-ambiente',
  residuos: 'medio-ambiente', zonas_verdes: 'medio-ambiente', alumbrado: 'urbanismo',
  agua_saneamiento: 'urbanismo', urbanismo: 'urbanismo',
}
export function departmentSignal(q: RelQueja, c: RelContract): { slug: string } | null {
  if (q.department && c.department && q.department === c.department) return { slug: q.department }
  if (tenderMatchesQuejaCpv(q.serviceCode as never, c.cpvs)) {
    return { slug: q.department ?? SERVICE_TO_DEPT[q.serviceCode] ?? c.department ?? q.serviceCode }
  }
  return null
}
export function temporalModifier(q: RelQueja, c: RelContract): { monthsAfter: number } | null {
  if (!c.awardDate) return null
  const t0 = new Date(q.createdAt).getTime(), t1 = new Date(c.awardDate).getTime()
  if (Number.isNaN(t0) || Number.isNaN(t1)) return null
  const months = (t1 - t0) / (1000 * 60 * 60 * 24 * 30)
  return months >= -3 && months <= 18 ? { monthsAfter: months } : null
}
function normExp(s: string): string { return s.replace(/\s+/g, '').toUpperCase() }
export function expedienteSignal(q: RelQueja, c: RelContract): { value: string } | null {
  if (!c.expediente) return null
  // Department alignment guards against coincidental expediente collisions.
  if (q.department && c.department && q.department !== c.department) return null
  return { value: normExp(c.expediente) }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/parse-queja-contract-relations.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(relations): department/theme, temporal, expediente signals (TDD)"
```

---

## Task 3: `scoreRelation` combiner (tiering + neutral label + honesty gates)

**Files:**
- Modify: `src/scraper/queja-contract-relations.ts`
- Test: `tests/parse-queja-contract-relations.test.ts`

**Interfaces:**
- Consumes: all four signals (Tasks 1–2).
- Produces: `RelationLink` + `scoreRelation(q, c): RelationLink | null`.

```ts
export interface RelationLink {
  quejaId: string; tenderPermalink: string; tenderId: string
  tier: 'A' | 'B'; score: number; via: 'deterministic'
  relationLabel: RelationLabel
  signals: { expediente?: { value: string }; place?: PlaceSignal
    department?: { slug: string }; temporal?: { monthsAfter: number } }
  requiresHumanApproval: boolean
}
```

- [ ] **Step 1: Write the failing test**

```ts
import { scoreRelation } from '../src/scraper/queja-contract-relations'

describe('scoreRelation — tiering + gates', () => {
  it('Tier A: shared expediente → publishable, neutral label', () => {
    const r = scoreRelation(q({ department: 'urbanismo' }), c({ department: 'urbanismo', expediente: '251/2023' }))!
    expect(r.tier).toBe('A'); expect(r.requiresHumanApproval).toBe(false)
    expect(r.relationLabel).toBe('mismo expediente')
  })
  it('Tier A: place + department → publishable "misma zona y materia"', () => {
    const r = scoreRelation(q({ placeSlug: 'valencia-la-vella', department: 'movilidad' }),
      c({ places: ['valencia-la-vella'], department: 'movilidad' }))!
    expect(r.tier).toBe('A'); expect(r.relationLabel).toBe('misma zona y materia')
  })
  it('Tier B: department/theme only → requiresHumanApproval', () => {
    const r = scoreRelation(q({ placeSlug: null, department: 'urbanismo' }), c({ department: 'urbanismo' }))!
    expect(r.tier).toBe('B'); expect(r.requiresHumanApproval).toBe(true)
    expect(r.relationLabel).toBe('misma materia')
  })
  it('GATE: department/theme alone never becomes Tier A', () => {
    const r = scoreRelation(q({ placeSlug: null }), c({ department: q().department }))
    expect(r?.tier).not.toBe('A')
  })
  it('GATE: temporal alone → no link', () => {
    expect(scoreRelation(q({ placeSlug: null, department: null, serviceCode: 'x' }),
      c({ department: 'z', cpvs: [], places: [], zones: [], awardDate: '2025-02-01' }))).toBeNull()
  })
  it('place only (no dept) → Tier B "misma zona"', () => {
    const r = scoreRelation(q({ placeSlug: 'valencia-la-vella', department: null, serviceCode: 'x' }),
      c({ places: ['valencia-la-vella'], department: 'z', cpvs: [] }))!
    expect(r.tier).toBe('B'); expect(r.relationLabel).toBe('misma zona')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/parse-queja-contract-relations.test.ts`
Expected: FAIL — `scoreRelation` undefined.

- [ ] **Step 3: Write minimal implementation**

```ts
export function scoreRelation(q: RelQueja, c: RelContract): RelationLink | null {
  const exp = expedienteSignal(q, c)
  const place = placeSignal(q, c)
  const dept = departmentSignal(q, c)
  const temporal = temporalModifier(q, c) ?? undefined
  const base = { quejaId: q.id, tenderPermalink: c.permalink, tenderId: c.id,
    via: 'deterministic' as const,
    signals: { ...(exp ? { expediente: exp } : {}), ...(place ? { place } : {}),
      ...(dept ? { department: dept } : {}), ...(temporal ? { temporal } : {}) } }
  if (exp) return { ...base, tier: 'A', score: 0.95, relationLabel: 'mismo expediente', requiresHumanApproval: false }
  if (place && dept) return { ...base, tier: 'A', score: 0.85, relationLabel: 'misma zona y materia', requiresHumanApproval: false }
  if (place) return { ...base, tier: 'B', score: 0.6, relationLabel: 'misma zona', requiresHumanApproval: true }
  if (dept) return { ...base, tier: 'B', score: 0.55, relationLabel: 'misma materia', requiresHumanApproval: true }
  return null // temporal alone (or nothing) never links
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/parse-queja-contract-relations.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(relations): scoreRelation tiering + honesty gates (TDD)"
```

---

## Task 4: `buildRelations` entry point (iterate, freeze gate, stats)

**Files:**
- Modify: `src/scraper/queja-contract-relations.ts`
- Test: `tests/parse-queja-contract-relations.test.ts`

**Interfaces:**
- Produces: `RelationsResult` + `buildRelations(quejas, contracts, ctx?): RelationsResult`.

```ts
export interface RelationsResult {
  links: RelationLink[]
  stats: { frozen: boolean; quejasScanned: number; contractsScanned: number
    tierA: number; tierB: number; reason: string | null }
}
export interface RelContext { now?: Date; frozen?: boolean }
```

- [ ] **Step 1: Write the failing test**

```ts
import { buildRelations } from '../src/scraper/queja-contract-relations'

describe('buildRelations', () => {
  it('emits one link per matching pair and counts tiers', () => {
    const res = buildRelations(
      [q({ id: 'Q-1', placeSlug: 'valencia-la-vella', department: 'movilidad' })],
      [c({ id: 'c1', places: ['valencia-la-vella'], department: 'movilidad' }),
       c({ id: 'c2', places: ['elsewhere'], department: 'cultura', cpvs: ['92000000'] })])
    expect(res.links).toHaveLength(1)
    expect(res.stats).toMatchObject({ quejasScanned: 1, contractsScanned: 2, tierA: 1, tierB: 0 })
  })
  it('returns empty under LOREG freeze', () => {
    const res = buildRelations([q()], [c({ places: ['valencia-la-vella'] })], { frozen: true })
    expect(res.links).toEqual([]); expect(res.stats.frozen).toBe(true); expect(res.stats.reason).toBe('frozen')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/parse-queja-contract-relations.test.ts`
Expected: FAIL — `buildRelations` undefined.

- [ ] **Step 3: Write minimal implementation**

```ts
export function buildRelations(quejas: RelQueja[], contracts: RelContract[], ctx: RelContext = {}): RelationsResult {
  const stats = { frozen: false, quejasScanned: 0, contractsScanned: contracts.length, tierA: 0, tierB: 0, reason: null as string | null }
  if (ctx.frozen) return { links: [], stats: { ...stats, frozen: true, reason: 'frozen' } }
  const links: RelationLink[] = []
  for (const q of quejas) {
    stats.quejasScanned += 1
    for (const c of contracts) {
      const link = scoreRelation(q, c)
      if (!link) continue
      links.push(link)
      if (link.tier === 'A') stats.tierA += 1; else stats.tierB += 1
    }
  }
  return { links, stats }
}
```

- [ ] **Step 4: Run test to verify it passes + full suite + typecheck**

Run: `npx vitest run tests/parse-queja-contract-relations.test.ts && npm run typecheck`
Expected: PASS, tsc clean.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(relations): buildRelations entry point + freeze gate (TDD)"
```

---

## Task 5: CLI — read real snapshots (current schema), write output, wire nightly

**Files:**
- Create: `scripts/scrape-queja-contract-relations.ts`
- Modify: `package.json` (scripts), `scripts/scrape-all.sh`
- Test: `tests/parse-queja-contract-relations.test.ts` (add a normalization-adapter unit test)

**Interfaces:**
- Consumes: `buildRelations`, `RelQueja`, `RelContract`.
- Produces: `normalizeQueja(raw): RelQueja | null` and `buildRelContracts(tenders, tenderGeo): RelContract[]` (exported from the CLI for the adapter test), and `public/data/queja-contract-relations.json`.

The queja adapter MUST read the **current** snapshot fields (regression vs the stale adapter bug): `service_request_id`, `service_code`, `concejalia_area` (→ `canonicalizeDepartment`), `address_string`, `description`, `requested_datetime`.

- [ ] **Step 1: Write the failing adapter test**

```ts
import { normalizeQueja } from '../scripts/scrape-queja-contract-relations'

describe('normalizeQueja (current bot snapshot schema)', () => {
  it('maps service_code/address_string/requested_datetime/concejalia_area', () => {
    const r = normalizeQueja({
      service_request_id: 'Q-KJY6XSVG', service_code: 'urbanismo',
      concejalia_area: 'Urbanismo', address_string: 'urbanitzacio-valencia-la-vella',
      description: 'x', requested_datetime: '2026-07-02 10:48:16',
    })!
    expect(r).toMatchObject({ id: 'Q-KJY6XSVG', serviceCode: 'urbanismo',
      department: 'urbanismo', placeSlug: 'urbanitzacio-valencia-la-vella' })
    expect(r.createdAt).toMatch(/^2026-07-02/)
  })
  it('drops rows without an id or timestamp', () => {
    expect(normalizeQueja({ service_code: 'x' })).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/parse-queja-contract-relations.test.ts`
Expected: FAIL — cannot import `normalizeQueja`.

- [ ] **Step 3: Write the CLI**

Create `scripts/scrape-queja-contract-relations.ts`. Export `normalizeQueja` + `buildRelContracts`; `main()` reads `public/data/{quejas,tenders,tender-geo,promises}.json`, builds inputs, calls `buildRelations` with `frozen: isFrozen(promisesSnap)`, writes the output payload `{ generatedAt, source, stats, links }` via `JSON.stringify(payload, null, 2) + '\n'`. Key adapter bodies:

```ts
export function normalizeQueja(raw: any): RelQueja | null {
  const id = raw?.service_request_id, createdAt = raw?.requested_datetime
  if (!id || !createdAt) return null
  return { id: String(id), serviceCode: String(raw.service_code ?? ''),
    department: canonicalizeDepartment(raw.concejalia_area ?? raw.service_name ?? null),
    placeSlug: raw.address_string ? String(raw.address_string) : null,
    description: String(raw.description ?? ''),
    createdAt: new Date(String(createdAt).replace(' ', 'T')).toISOString() }
}
export function buildRelContracts(contracts: any[], geo: any): RelContract[] {
  const byId = new Map<string, { places: string[]; zones: string[] }>()
  for (const a of geo?.assignments ?? []) {
    const e = byId.get(String(a.id)) ?? { places: [], zones: [] }
    if (a.place) e.places.push(String(a.place))
    for (const z of a.zones ?? []) e.zones.push(String(z))
    byId.set(String(a.id), e)
  }
  return contracts.filter((c) => c.status === 'awarded').map((c) => ({
    id: String(c.id), permalink: String(c.permalink ?? ''), title: String(c.title ?? ''),
    department: canonicalizeDepartment(c.categoryTitle ?? null),
    cpvs: Array.isArray(c.cpvs) ? c.cpvs.map(String) : [],
    places: byId.get(String(c.id))?.places ?? [], zones: byId.get(String(c.id))?.zones ?? [],
    awardDate: c.awardDate ?? null, amount: typeof c.finalAmount === 'number' ? c.finalAmount : null,
    assignee: c.assignee ?? null, expediente: c.expediente ?? null,
  }))
}
```

Add to `package.json` scripts: `"scrape:queja-contract-relations": "npx tsx scripts/scrape-queja-contract-relations.ts",`.

- [ ] **Step 4: Run adapter test + generate the real file**

Run: `npx vitest run tests/parse-queja-contract-relations.test.ts && npm run scrape:queja-contract-relations`
Expected: tests PASS; CLI prints stats and writes `public/data/queja-contract-relations.json` (may be `links: []` today — honest).

- [ ] **Step 5: Wire nightly (best-effort) + commit**

In `scripts/scrape-all.sh`, add `run_scraper` for `scrape:queja-contract-relations` in the **best-effort** class (after `compute:tender-geo`). Then:

```bash
git add -A && git commit -m "feat(relations): CLI reads current snapshots + tender-geo, nightly best-effort (TDD)"
```

---

## Task 6: Hook + revive the `/quejas/:id` card + `/metodologia`; retire the old correlator

**Files:**
- Create: `src/hooks/useQuejaContractRelations.js`
- Modify: `src/pages/QuejaDetail.jsx`, `src/pages/Metodologia.jsx`
- Delete: `src/scraper/tender-queja-correlator.ts`, `scripts/scrape-tender-queja-correlations.ts`, `tests/llm/tender-queja-correlator.test.ts`, `src/hooks/useTenderQuejaCorrelations.js`, `public/data/tender-queja-correlations.json`
- Modify: `package.json` (remove `scrape:tender-queja-correlations`)

**Interfaces:**
- Consumes: `public/data/queja-contract-relations.json` (Task 5).
- Produces: `useQuejaContractRelations()`, `relationsForQueja(data, quejaId)` returning only renderable links (`!requiresHumanApproval`).

- [ ] **Step 1: Create the hook**

```js
// @ts-check
import { useJsonFetch } from './useJsonFetch'
const EMPTY = { links: [], stats: {} }
export function useQuejaContractRelations() {
  return useJsonFetch('/data/queja-contract-relations.json', EMPTY)
}
/** Renderable = Tier A / already-approved (requiresHumanApproval === false). */
export function relationsForQueja(data, quejaId) {
  return (data?.links || []).filter((l) => l.quejaId === quejaId && !l.requiresHumanApproval)
}
export function relationsForTender(data, permalink) {
  return (data?.links || []).filter((l) => l.tenderPermalink === permalink && !l.requiresHumanApproval)
}
```

- [ ] **Step 2: Repoint `CorrelationsCard` in `QuejaDetail.jsx`**

Replace the import (`useTenderQuejaCorrelations`/`correlationsForQueja` → `useQuejaContractRelations`/`relationsForQueja`) and the field reads: render `l.relationLabel` as a neutral chip, keep the "podría · no causal" disclaimer, drop `confidence`, show a signals explainer (e.g. `l.signals.place?.slug`, `l.signals.department?.slug`). The card already hides itself when the list is empty — preserve that.

- [ ] **Step 3: Delete the old files + remove the package script**

```bash
git rm src/scraper/tender-queja-correlator.ts scripts/scrape-tender-queja-correlations.ts \
  tests/llm/tender-queja-correlator.test.ts src/hooks/useTenderQuejaCorrelations.js \
  public/data/tender-queja-correlations.json
```
Remove the `"scrape:tender-queja-correlations": ...` line from `package.json`.

- [ ] **Step 4: Add the `/metodologia` section**

In `Metodologia.jsx`, add a "Relación quejas ↔ contratos" block documenting: the four signals, Tier A (publishable facts) vs Tier B (`requiresHumanApproval`, curator-gated), the strictly-neutral framing (no causal claims), and that geo uses published place granularity only.

- [ ] **Step 5: Verify everything green + commit**

Run: `npx vitest run && npm run typecheck && npm run lint`
Expected: full suite PASS (old correlator test removed), tsc + eslint clean.

```bash
git add -A && git commit -m "feat(relations): revive /quejas card on new engine, retire old correlator, /metodologia"
```

---

## Self-Review

- **Spec coverage:** signals (T1–T2), tiering + gates (T3), entry point + freeze (T4), CLI + current-schema adapter + nightly (T5), hook + View 1 + `/metodologia` + retirement (T6). LLM rerank, `promote-relation`, Views 2–3 are explicitly out of D1 (spec §10). ✓
- **Placeholder scan:** none — every code step has real code. ✓
- **Type consistency:** `RelQueja`/`RelContract`/`RelationLink`/`RelationsResult` names + `placeSignal`/`departmentSignal`/`temporalModifier`/`expedienteSignal`/`scoreRelation`/`buildRelations`/`normalizeQueja`/`buildRelContracts` used consistently across tasks. ✓
- **Risk note:** `tenderMatchesQuejaCpv` expects a `QuejaCategory`; `serviceCode` is cast — if a `service_code` isn't a known category the theme check simply returns false (safe). Verify the enum during T2.
