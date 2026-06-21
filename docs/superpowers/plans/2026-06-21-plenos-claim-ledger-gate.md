# Plenos Claim-Ledger Editorial Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop `/plenos` (and `/departamentos/:slug`) from publishing ungated machine-extracted accusations, and reorganize the public claim ledger signal-first with filters/search.

**Architecture:** One pure gate function (`classifyClaimVisibility`) is the single source of truth. It runs at build time in the chunker (so `hidden` verbatim never enters a deployed file) and again client-side as defense-in-depth. The deployed site loses the ungated monoliths via `.vercelignore`. The ledger UI gains signal-first sort + filters + a "sin datos" toggle, opt-in via a `controls` prop so the department surface stays simple.

**Tech Stack:** React 18 (inline-style components), Vite, TypeScript (allowJs, non-strict) for `src/scraper`, JS for `src/lib`/hooks/components, Vitest + happy-dom, Playwright e2e.

## Global Constraints

- Gate policy (verbatim): **hidden** = any `acusacion_publica` that is `opinativa` OR not data-grounded; **toggle** = non-accusation claims not data-grounded; **shown** = everything else. Data-grounded verdicts = `verificado`, `parcial`, `contradicho`, `promesa-repetida`.
- Fail-safe: an unknown/missing verdict or type must never resolve to `shown`.
- Single source of truth: only `src/scraper/claim-public-gate.ts` encodes the policy. No second copy.
- Do NOT break the existing export surface of `src/components/ClaimLedger.jsx`: `ClaimLedger({ filter, limit, emptyHint })` and `ClaimLedgerSection({ filter, limit, title, eyebrow, hint })` — both are consumed (`/departamentos/:slug` and `/plenos`).
- Chrome strings go through `src/i18n.jsx` (es + ca). Data content (verbatim quotes, titles) stays in source language.
- Curator CLIs (`promote-claim`, `auto-curate`, `verify:pleno-claims`) must keep reading `public/data/pleno-claims-verified.json` from the repo path — `.vercelignore` affects deploy only, never git/local.
- Tests live in `tests/**/*.test.{js,ts}` (vitest glob already includes both). Commit after every green step.

---

### Task 1: The gate function (legally material core)

**Files:**
- Create: `src/scraper/claim-public-gate.ts`
- Test: `tests/claim-public-gate.test.ts`

**Interfaces:**
- Consumes: `VerifiedClaimItem` from `src/scraper/pleno-claims-chunks.ts` (shape `{ claim, verification }`; `claim.type`, `claim.accusationSubtype?`, `verification.verdict`).
- Produces:
  - `type ClaimVisibility = 'shown' | 'toggle' | 'hidden'`
  - `DATA_GROUNDED_VERDICTS: ReadonlySet<string>`
  - `classifyClaimVisibility(item): ClaimVisibility`
  - `interface GatedItem extends VerifiedClaimItem { visibility: ClaimVisibility }`
  - `gateItemsForPublic(items: VerifiedClaimItem[]): GatedItem[]`

- [ ] **Step 1: Write the failing test**

```ts
// tests/claim-public-gate.test.ts
import { describe, it, expect } from 'vitest'
import {
  classifyClaimVisibility,
  gateItemsForPublic,
} from '../src/scraper/claim-public-gate'

const item = (type, verdict, accusationSubtype) => ({
  claim: { type, accusationSubtype, plenoId: 'p1', plenoDate: '2026-04-20', verbatim: 'x', segmentIndex: 0 },
  verification: { verdict, confidence: 1 },
})

describe('classifyClaimVisibility', () => {
  it('hides opinativa accusations regardless of verdict', () => {
    expect(classifyClaimVisibility(item('acusacion_publica', 'sin-datos', 'opinativa'))).toBe('hidden')
    expect(classifyClaimVisibility(item('acusacion_publica', 'verificado', 'opinativa'))).toBe('hidden')
  })
  it('hides factual/contra-datos accusations that are NOT data-grounded', () => {
    expect(classifyClaimVisibility(item('acusacion_publica', 'sin-datos', 'factual'))).toBe('hidden')
    expect(classifyClaimVisibility(item('acusacion_publica', 'sin-datos', 'contra-datos'))).toBe('hidden')
  })
  it('shows data-grounded factual/contra-datos accusations', () => {
    expect(classifyClaimVisibility(item('acusacion_publica', 'contradicho', 'factual'))).toBe('shown')
    expect(classifyClaimVisibility(item('acusacion_publica', 'verificado', 'contra-datos'))).toBe('shown')
  })
  it('treats a missing accusation subtype as opinativa (hidden)', () => {
    expect(classifyClaimVisibility(item('acusacion_publica', 'verificado', undefined))).toBe('hidden')
  })
  it('shows data-grounded non-accusation claims', () => {
    expect(classifyClaimVisibility(item('afirmacion_numerica', 'verificado'))).toBe('shown')
    expect(classifyClaimVisibility(item('cita_obra', 'contradicho'))).toBe('shown')
    expect(classifyClaimVisibility(item('promesa', 'promesa-repetida'))).toBe('shown')
  })
  it('puts non-grounded non-accusation claims behind the toggle', () => {
    expect(classifyClaimVisibility(item('afirmacion_numerica', 'sin-datos'))).toBe('toggle')
  })
  it('fail-safe: unknown verdict never resolves to shown', () => {
    expect(classifyClaimVisibility(item('acusacion_publica', undefined, 'factual'))).toBe('hidden')
    expect(classifyClaimVisibility(item('afirmacion_numerica', 'weird-verdict'))).toBe('toggle')
  })
})

describe('gateItemsForPublic', () => {
  it('drops hidden items and stamps visibility on survivors', () => {
    const out = gateItemsForPublic([
      item('acusacion_publica', 'sin-datos', 'opinativa'), // hidden
      item('afirmacion_numerica', 'verificado'),           // shown
      item('afirmacion_numerica', 'sin-datos'),            // toggle
    ])
    expect(out).toHaveLength(2)
    expect(out.map((x) => x.visibility)).toEqual(['shown', 'toggle'])
  })
})
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `npx vitest run tests/claim-public-gate.test.ts`
Expected: FAIL — cannot find module `../src/scraper/claim-public-gate`.

- [ ] **Step 3: Implement the gate**

```ts
// src/scraper/claim-public-gate.ts
/**
 * The editorial gate for the PUBLIC pleno claim ledger — single source
 * of truth for what the machine-extracted verifier output may surface
 * to the public. Applied at build time (chunker) so `hidden` verbatim
 * never enters a deployed file, and again client-side as defense-in-depth.
 *
 * Policy (see docs/superpowers/specs/2026-06-21-plenos-claim-ledger-editorial-gate-design.md):
 *   hidden  — any acusacion_publica that is opinativa OR not data-grounded
 *   toggle  — non-accusation claims that are not data-grounded (sin-datos)
 *   shown   — data-grounded claims of any type (incl. data-backed accusations)
 *
 * Fail-safe: anything not explicitly data-grounded is hidden (accusations)
 * or toggled (everything else) — a new type/verdict can never default to shown.
 */
import type { VerifiedClaimItem } from './pleno-claims-chunks'

export type ClaimVisibility = 'shown' | 'toggle' | 'hidden'

/** Verdicts that mean the verifier found corroborating/contradicting data. */
export const DATA_GROUNDED_VERDICTS: ReadonlySet<string> = new Set([
  'verificado',
  'parcial',
  'contradicho',
  'promesa-repetida',
])

export function classifyClaimVisibility(
  item: Pick<VerifiedClaimItem, 'claim' | 'verification'>,
): ClaimVisibility {
  const verdict = item?.verification?.verdict
  const grounded = typeof verdict === 'string' && DATA_GROUNDED_VERDICTS.has(verdict)
  if (item?.claim?.type === 'acusacion_publica') {
    const subtype = item.claim.accusationSubtype ?? 'opinativa' // safe default
    if (subtype === 'opinativa') return 'hidden'
    return grounded ? 'shown' : 'hidden'
  }
  return grounded ? 'shown' : 'toggle'
}

export interface GatedItem extends VerifiedClaimItem {
  visibility: ClaimVisibility
}

/**
 * Drop `hidden` items and stamp each survivor with its visibility.
 * The chunker calls this before writing public chunks.
 */
export function gateItemsForPublic(items: VerifiedClaimItem[]): GatedItem[] {
  const out: GatedItem[] = []
  for (const it of items ?? []) {
    const visibility = classifyClaimVisibility(it)
    if (visibility === 'hidden') continue
    out.push({ ...it, visibility })
  }
  return out
}
```

- [ ] **Step 4: Run the test, verify it passes**

Run: `npx vitest run tests/claim-public-gate.test.ts`
Expected: PASS (8+ assertions green).

- [ ] **Step 5: Typecheck + commit**

```bash
npm run typecheck
git add src/scraper/claim-public-gate.ts tests/claim-public-gate.test.ts
git commit -m "feat(plenos): add claim-public-gate — single source of truth for ledger visibility

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Wire the gate into the chunker (build-time enforcement) + regenerate data

**Files:**
- Modify: `src/scraper/pleno-claims-chunks.ts` (add `visibility?` to `VerifiedClaimItem`; add `toggleCount` to descriptor + totals)
- Modify: `scripts/chunk-pleno-claims.ts:rewriteChunksFromMonolith` (apply `gateItemsForPublic` before `groupItemsByPleno`)
- Test: `tests/pleno-claims-chunks.test.ts` (create)

**Interfaces:**
- Consumes: `gateItemsForPublic` (Task 1), `groupItemsByPleno`, `buildManifest`.
- Produces: gated `public/data/pleno-claims/*.json` (no `hidden` items; each item carries `visibility`); manifest descriptors gain `toggleCount: number`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/pleno-claims-chunks.test.ts
import { describe, it, expect } from 'vitest'
import { gateItemsForPublic } from '../src/scraper/claim-public-gate'
import { groupItemsByPleno, buildManifest } from '../src/scraper/pleno-claims-chunks'

const mk = (id, type, verdict, accusationSubtype) => ({
  claim: { id, plenoId: 'p1', plenoDate: '2026-04-20', type, accusationSubtype, topic: 'fiscal', verbatim: 'x', segmentIndex: 0 },
  verification: { verdict, confidence: 1 },
})

describe('chunker applies the public gate', () => {
  it('excludes hidden items and keeps visibility on survivors', () => {
    const gated = gateItemsForPublic([
      mk('a', 'acusacion_publica', 'sin-datos', 'opinativa'), // hidden
      mk('b', 'afirmacion_numerica', 'verificado'),           // shown
      mk('c', 'afirmacion_numerica', 'sin-datos'),            // toggle
    ])
    const { manifest, chunks } = buildManifest(groupItemsByPleno(gated), '2026-06-21T00:00:00.000Z')
    const items = chunks.get('p1').items
    expect(items.map((i) => i.claim.id).sort()).toEqual(['b', 'c'])
    expect(items.every((i) => i.visibility)).toBe(true)
    expect(manifest.plenos[0].toggleCount).toBe(1)
    expect(manifest.totals.items).toBe(2)
  })
})
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `npx vitest run tests/pleno-claims-chunks.test.ts`
Expected: FAIL — `manifest.plenos[0].toggleCount` is `undefined`.

- [ ] **Step 3: Add `visibility` to the item type + `toggleCount` to the manifest**

In `src/scraper/pleno-claims-chunks.ts`, add `visibility` to the `VerifiedClaimItem` interface (after the `verification` field):

```ts
export interface VerifiedClaimItem {
  claim: PlenoClaim
  verification: {
    verdict: string
    confidence: number
    summary?: string
    evidence?: unknown[]
    [k: string]: unknown
  }
  /** Public-ledger visibility, stamped by the build-time gate. */
  visibility?: 'shown' | 'toggle' | 'hidden'
}
```

In the manifest `plenos[]` descriptor type, add `toggleCount` after `itemCount`:

```ts
    itemCount: number
    /** Count of `toggle` (sin-datos non-accusation) items in this chunk. */
    toggleCount: number
```

In `buildChunkAndDescriptor`, count toggles and emit the field. Replace the `for (const it of items)` loop body's start and the returned descriptor:

```ts
  let toggleCount = 0
  for (const it of items) {
    const v = it.verification?.verdict
    if (typeof v === 'string') byVerdict[v] = (byVerdict[v] ?? 0) + 1
    byType[it.claim.type] = (byType[it.claim.type] ?? 0) + 1
    byTopic[it.claim.topic] = (byTopic[it.claim.topic] ?? 0) + 1
    if (it.visibility === 'toggle') toggleCount += 1
  }
```

and in the returned `descriptor` object add `toggleCount,` right after `itemCount: items.length,`.

- [ ] **Step 4: Apply the gate in the chunk CLI**

In `scripts/chunk-pleno-claims.ts`, add the import near the other scraper import:

```ts
import { gateItemsForPublic } from '../src/scraper/claim-public-gate'
```

Then in `rewriteChunksFromMonolith`, replace:

```ts
  const items = monolith.items ?? []
  const grouped = groupItemsByPleno(items)
```

with:

```ts
  const items = gateItemsForPublic(monolith.items ?? [])
  const grouped = groupItemsByPleno(items)
```

- [ ] **Step 5: Run the test, verify it passes**

Run: `npx vitest run tests/pleno-claims-chunks.test.ts`
Expected: PASS.

- [ ] **Step 6: Regenerate the committed chunk data through the gate**

Run: `npm run chunk-pleno-claims`
Then verify hidden items are gone from the shipped chunks:

```bash
node -e 'const fs=require("fs");const m=JSON.parse(fs.readFileSync("public/data/pleno-claims/index.json","utf8"));let items=[];for(const p of m.plenos){items=items.concat(JSON.parse(fs.readFileSync("public/data/"+p.chunkPath,"utf8")).items)}const bad=items.filter(x=>x.claim.type==="acusacion_publica"&&((x.claim.accusationSubtype??"opinativa")==="opinativa"||x.verification.verdict==="sin-datos"));console.log("total shipped:",items.length,"| hidden accusations still present:",bad.length);if(bad.length)process.exit(1)'
```
Expected: `hidden accusations still present: 0`.

- [ ] **Step 7: Typecheck + commit (code + regenerated data)**

```bash
npm run typecheck
git add src/scraper/pleno-claims-chunks.ts scripts/chunk-pleno-claims.ts tests/pleno-claims-chunks.test.ts public/data/pleno-claims
git commit -m "feat(plenos): gate claim chunks at build time — hidden verbatim never ships

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Exclude the ungated monoliths from deploy + repoint lab-health

**Files:**
- Create: `.vercelignore`
- Modify: `src/hooks/useLabHealth.js:58-65` (swap the two monolith entries for the chunk manifest)
- Test: `tests/lab-health-sources.test.js` (create)

**Interfaces:**
- Consumes: nothing new.
- Produces: `LAB_SOURCES` no longer references the two monoliths; references `/data/pleno-claims/index.json` instead. `countOf` understands the manifest shape.

- [ ] **Step 1: Write the failing test**

```js
// tests/lab-health-sources.test.js
import { describe, it, expect } from 'vitest'
import { LAB_SOURCES } from '../src/hooks/useLabHealth'

describe('lab-health source registry', () => {
  it('does not list the ungated monoliths (excluded from deploy)', () => {
    const paths = LAB_SOURCES.map((s) => s.path)
    expect(paths).not.toContain('/data/pleno-claims-verified.json')
    expect(paths).not.toContain('/data/pleno-claims-suggestions.json')
  })
  it('tracks the chunk manifest instead', () => {
    const paths = LAB_SOURCES.map((s) => s.path)
    expect(paths).toContain('/data/pleno-claims/index.json')
  })
})
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `npx vitest run tests/lab-health-sources.test.js`
Expected: FAIL — manifest not present, monoliths still listed.

- [ ] **Step 3: Repoint the registry + teach `countOf` the manifest shape**

In `src/hooks/useLabHealth.js`, replace the two monolith entries (the `pleno-claims-suggestions.json` and `pleno-claims-verified.json` objects under `// — Pleno editorial`) with a single manifest entry:

```js
  {
    path: '/data/pleno-claims/index.json',
    label: 'Pleno claims · verificados (chunks)',
    group: 'pleno',
  },
```

In `countOf`, add a manifest branch before the final `return null`:

```js
  if (blob.totals && typeof blob.totals.items === 'number') return blob.totals.items
```

- [ ] **Step 4: Run the test, verify it passes**

Run: `npx vitest run tests/lab-health-sources.test.js`
Expected: PASS.

- [ ] **Step 5: Create `.vercelignore`**

```
# Curator/CLI-only artifacts — the SPA reads the gated chunks under
# public/data/pleno-claims/, never these monoliths. Keeping them out of
# the deploy ensures ungated (opinativa / sin-datos) accusation verbatim
# is never fetchable from the live site. They remain in git for the
# promote-claim / auto-curate / verify CLIs on the curator's machine.
public/data/pleno-claims-verified.json
public/data/pleno-claims-suggestions.json
```

- [ ] **Step 6: Commit**

```bash
npm run typecheck
git add .vercelignore src/hooks/useLabHealth.js tests/lab-health-sources.test.js
git commit -m "feat(plenos): exclude ungated claim monoliths from deploy; lab-health tracks chunks

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Client ledger logic (pure, tested)

**Files:**
- Create: `src/lib/claim-ledger.js`
- Test: `tests/claim-ledger.test.js`

**Interfaces:**
- Consumes: `classifyClaimVisibility` (Task 1).
- Produces:
  - `gateForDisplay(items): item[]` — defense-in-depth, drops `hidden`, ensures `.visibility`.
  - `sortSignalFirst(items): item[]` — contradicho→verificado→parcial→promesa-repetida, then newest plenoDate.
  - `filterClaims(items, { verdict, type, pleno, grupo, query, showSinDatos }): item[]`.
  - `facetCounts(items): { verdict: Record, type: Record }`.

- [ ] **Step 1: Write the failing test**

```js
// tests/claim-ledger.test.js
import { describe, it, expect } from 'vitest'
import { gateForDisplay, sortSignalFirst, filterClaims, facetCounts } from '../src/lib/claim-ledger'

const mk = (verdict, opts = {}) => ({
  visibility: opts.visibility,
  claim: {
    type: opts.type ?? 'afirmacion_numerica',
    accusationSubtype: opts.accusationSubtype,
    plenoId: opts.plenoId ?? 'p1',
    plenoDate: opts.plenoDate ?? '2026-04-20',
    speakerGroup: opts.grupo ?? 'PP',
    verbatim: opts.verbatim ?? 'algo',
  },
  verification: { verdict },
})

describe('gateForDisplay', () => {
  it('drops hidden even if upstream mislabeled it shown', () => {
    const out = gateForDisplay([
      { ...mk('sin-datos', { type: 'acusacion_publica', accusationSubtype: 'opinativa' }), visibility: 'shown' },
      mk('verificado'),
    ])
    expect(out).toHaveLength(1)
    expect(out[0].verification.verdict).toBe('verificado')
  })
})

describe('sortSignalFirst', () => {
  it('orders contradicho, verificado, parcial, then newest date', () => {
    const out = sortSignalFirst([
      mk('parcial'),
      mk('verificado', { plenoDate: '2026-01-01' }),
      mk('verificado', { plenoDate: '2026-05-01' }),
      mk('contradicho'),
    ])
    expect(out.map((x) => x.verification.verdict)).toEqual(['contradicho', 'verificado', 'verificado', 'parcial'])
    expect(out[1].claim.plenoDate).toBe('2026-05-01') // newest verificado first
  })
})

describe('filterClaims', () => {
  const items = [
    mk('verificado', { type: 'cita_obra', plenoId: 'pA', grupo: 'PP', verbatim: 'puente nuevo', visibility: 'shown' }),
    mk('sin-datos', { type: 'afirmacion_numerica', plenoId: 'pB', grupo: 'PSOE', verbatim: 'sin match', visibility: 'toggle' }),
  ]
  it('hides toggle (sin-datos) items unless showSinDatos', () => {
    expect(filterClaims(items, {})).toHaveLength(1)
    expect(filterClaims(items, { showSinDatos: true })).toHaveLength(2)
  })
  it('filters by verdict/type/pleno/grupo', () => {
    expect(filterClaims(items, { verdict: 'verificado' })).toHaveLength(1)
    expect(filterClaims(items, { type: 'cita_obra' })).toHaveLength(1)
    expect(filterClaims(items, { pleno: 'pA' })).toHaveLength(1)
    expect(filterClaims(items, { grupo: 'PSOE', showSinDatos: true })).toHaveLength(1)
  })
  it('searches verbatim (only over the passed set)', () => {
    expect(filterClaims(items, { query: 'puente' })).toHaveLength(1)
    expect(filterClaims(items, { query: 'inexistente' })).toHaveLength(0)
  })
})

describe('facetCounts', () => {
  it('counts verdicts and types', () => {
    const c = facetCounts([mk('verificado'), mk('verificado'), mk('contradicho', { type: 'cita_obra' })])
    expect(c.verdict.verificado).toBe(2)
    expect(c.type.cita_obra).toBe(1)
  })
})
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `npx vitest run tests/claim-ledger.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the lib**

```js
// src/lib/claim-ledger.js
// @ts-check
/**
 * Pure client-side helpers for the public pleno claim ledger:
 * defense-in-depth gating, signal-first sort, faceted filtering, search.
 * Policy lives in ../scraper/claim-public-gate (single source of truth).
 */
import { classifyClaimVisibility } from '../scraper/claim-public-gate'

const VERDICT_RANK = { contradicho: 0, verificado: 1, parcial: 2, 'promesa-repetida': 3 }

/** Drop `hidden` items (recomputed), guaranteeing each survivor has `.visibility`. */
export function gateForDisplay(items) {
  const out = []
  for (const it of items ?? []) {
    const visibility = classifyClaimVisibility(it)
    if (visibility === 'hidden') continue
    out.push(it.visibility ? it : { ...it, visibility })
  }
  return out
}

/** contradicho → verificado → parcial → promesa-repetida, then newest pleno first. */
export function sortSignalFirst(items) {
  return [...(items ?? [])].sort((a, b) => {
    const ra = VERDICT_RANK[a?.verification?.verdict] ?? 99
    const rb = VERDICT_RANK[b?.verification?.verdict] ?? 99
    if (ra !== rb) return ra - rb
    return String(b?.claim?.plenoDate ?? '').localeCompare(String(a?.claim?.plenoDate ?? ''))
  })
}

export function facetCounts(items) {
  const verdict = {}
  const type = {}
  for (const it of items ?? []) {
    const v = it?.verification?.verdict
    if (v) verdict[v] = (verdict[v] ?? 0) + 1
    const t = it?.claim?.type
    if (t) type[t] = (type[t] ?? 0) + 1
  }
  return { verdict, type }
}

/**
 * Filter the (already-gated) set. `query` matches claim.verbatim only and
 * runs over the passed items, so it can never resurface a hidden claim.
 * `showSinDatos=false` drops `toggle` items.
 */
export function filterClaims(items, opts = {}) {
  const { verdict, type, pleno, grupo, query, showSinDatos = false } = opts
  const q = (query ?? '').trim().toLowerCase()
  return (items ?? []).filter((it) => {
    if (!showSinDatos && it.visibility === 'toggle') return false
    if (verdict && it?.verification?.verdict !== verdict) return false
    if (type && it?.claim?.type !== type) return false
    if (pleno && it?.claim?.plenoId !== pleno) return false
    if (grupo && it?.claim?.speakerGroup !== grupo) return false
    if (q && !String(it?.claim?.verbatim ?? '').toLowerCase().includes(q)) return false
    return true
  })
}
```

- [ ] **Step 4: Run the test, verify it passes**

Run: `npx vitest run tests/claim-ledger.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/claim-ledger.js tests/claim-ledger.test.js
git commit -m "feat(plenos): pure claim-ledger lib — gate/sort/filter/search

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Rewrite `ClaimLedger.jsx` (gate everywhere; controls on /plenos) + i18n

**Files:**
- Modify: `src/components/ClaimLedger.jsx` (full rewrite, keep exports)
- Modify: `src/pages/Plenos.jsx:676-681` (pass `controls`)
- Modify: `src/i18n.jsx` (add ledger chrome keys, es + ca)

**Interfaces:**
- Consumes: `gateForDisplay`, `sortSignalFirst`, `filterClaims`, `facetCounts` (Task 4); `usePlenoClaims` + label/tone maps (unchanged).
- Produces: `ClaimLedger({ filter, limit, emptyHint, controls })` and `ClaimLedgerSection({ filter, limit, title, eyebrow, hint, controls })`. `controls` defaults to `false` (department surface unchanged in shape; now gated + signal-sorted). When `controls` is true, render verdict chips + type/pleno/grupo selects + search + "mostrar sin datos" toggle + "Cargar más".

- [ ] **Step 1: Add i18n keys**

In `src/i18n.jsx`, add to the `es` block (near other `plenos.*` keys ~line 104) and the `ca` block (~line 243):

```js
// es
'ledger.search': 'Buscar en las declaraciones…',
'ledger.showSinDatos': 'mostrar sin datos',
'ledger.loadMore': 'Cargar más',
'ledger.allTypes': 'Todos los tipos',
'ledger.allPlenos': 'Todos los plenos',
'ledger.allGroups': 'Todos los grupos',
'ledger.empty': 'Sin declaraciones contrastables todavía para este filtro.',
'ledger.methodology': 'Cómo se filtran estas declaraciones',
```

```js
// ca
'ledger.search': 'Cerca en les declaracions…',
'ledger.showSinDatos': 'mostra sense dades',
'ledger.loadMore': 'Carrega més',
'ledger.allTypes': 'Tots els tipus',
'ledger.allPlenos': 'Tots els plens',
'ledger.allGroups': 'Tots els grups',
'ledger.empty': 'Encara no hi ha declaracions contrastables per a aquest filtre.',
'ledger.methodology': 'Com es filtren aquestes declaracions',
```

- [ ] **Step 2: Rewrite `src/components/ClaimLedger.jsx`**

Keep `formatEuros`, `EvidenceRow`, `ClaimCard` as they are (lines 10-159 of the current file). Replace the `ClaimLedger` and `ClaimLedgerSection` exports (current lines 161-234) with:

```jsx
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useT } from '../i18n'
import { gateForDisplay, sortSignalFirst, filterClaims, facetCounts } from '../lib/claim-ledger'
import { VERDICT_LABEL, VERDICT_TONE, CLAIM_TYPE_LABEL } from '../hooks/usePlenoClaims'

const SIGNAL_VERDICTS = ['contradicho', 'verificado', 'parcial', 'promesa-repetida']

function VerdictChip({ verdict, count, active, onClick }) {
  const tone = VERDICT_TONE[verdict] || 'neutral'
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className="mono"
      style={{
        fontSize: 11,
        padding: '3px 9px',
        borderRadius: 999,
        cursor: 'pointer',
        border: `1px solid ${active ? `var(--${tone}-ink)` : 'var(--border2)'}`,
        background: active ? `var(--${tone}-soft)` : 'transparent',
        color: active ? `var(--${tone}-ink)` : 'var(--ink60)',
        fontWeight: active ? 700 : 500,
      }}
    >
      {VERDICT_LABEL[verdict] || verdict} · {count}
    </button>
  )
}

function LedgerControls({ items, state, set }) {
  const t = useT()
  const counts = useMemo(() => facetCounts(items), [items])
  const plenos = useMemo(() => {
    const seen = new Map()
    for (const it of items) if (it.claim?.plenoId) seen.set(it.claim.plenoId, it.claim.plenoDate)
    return [...seen.entries()].sort((a, b) => String(b[1]).localeCompare(String(a[1])))
  }, [items])
  const grupos = useMemo(
    () => [...new Set(items.map((it) => it.claim?.speakerGroup).filter(Boolean))].sort(),
    [items],
  )
  const selStyle = {
    fontSize: 12,
    padding: '4px 8px',
    borderRadius: 6,
    border: '1px solid var(--border2)',
    background: 'var(--paper)',
    color: 'var(--ink)',
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {SIGNAL_VERDICTS.filter((v) => counts.verdict[v]).map((v) => (
          <VerdictChip
            key={v}
            verdict={v}
            count={counts.verdict[v]}
            active={state.verdict === v}
            onClick={() => set({ verdict: state.verdict === v ? null : v })}
          />
        ))}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        <input
          type="search"
          aria-label={t('ledger.search')}
          placeholder={t('ledger.search')}
          value={state.query}
          onChange={(e) => set({ query: e.target.value })}
          style={{ ...selStyle, flex: '1 1 200px', minWidth: 160 }}
        />
        <select aria-label={t('ledger.allTypes')} value={state.type ?? ''} onChange={(e) => set({ type: e.target.value || null })} style={selStyle}>
          <option value="">{t('ledger.allTypes')}</option>
          {Object.keys(counts.type).map((ty) => (
            <option key={ty} value={ty}>{CLAIM_TYPE_LABEL[ty] || ty}</option>
          ))}
        </select>
        <select aria-label={t('ledger.allPlenos')} value={state.pleno ?? ''} onChange={(e) => set({ pleno: e.target.value || null })} style={selStyle}>
          <option value="">{t('ledger.allPlenos')}</option>
          {plenos.map(([id, date]) => (
            <option key={id} value={id}>{date}</option>
          ))}
        </select>
        <select aria-label={t('ledger.allGroups')} value={state.grupo ?? ''} onChange={(e) => set({ grupo: e.target.value || null })} style={selStyle}>
          <option value="">{t('ledger.allGroups')}</option>
          {grupos.map((g) => (
            <option key={g} value={g}>{g}</option>
          ))}
        </select>
        <label className="mono" style={{ fontSize: 11, color: 'var(--ink60)', display: 'inline-flex', gap: 6, alignItems: 'center', cursor: 'pointer' }}>
          <input type="checkbox" checked={state.showSinDatos} onChange={(e) => set({ showSinDatos: e.target.checked })} />
          {t('ledger.showSinDatos')}
        </label>
      </div>
    </div>
  )
}

export function ClaimLedger({ filter, limit = 20, emptyHint, controls = false }) {
  const t = useT()
  const { loading, data } = usePlenoClaims()
  const [state, setState] = useState({
    verdict: null, type: null, pleno: null, grupo: null, query: '', showSinDatos: false,
  })
  const [shown, setShown] = useState(limit)
  const set = (patch) => {
    setState((s) => ({ ...s, ...patch }))
    setShown(limit)
  }

  // Gate (defense-in-depth) → apply external topic filter → signal-sort.
  const base = useMemo(() => {
    const gated = gateForDisplay(data?.items ?? [])
    const scoped = filter ? gated.filter(filter) : gated
    return sortSignalFirst(scoped)
  }, [data, filter])

  const visible = useMemo(() => {
    if (controls) return filterClaims(base, state)
    // Department surface: no controls — show data-grounded + sin-datos (toggle), gated + sorted.
    return filterClaims(base, { showSinDatos: true })
  }, [base, controls, state])

  if (loading) {
    return <div style={{ padding: 12, fontSize: 12, color: 'var(--ink50)' }}>Cargando verificaciones…</div>
  }
  if (base.length === 0) {
    return (
      <div style={{ padding: 14, background: 'var(--soft)', borderRadius: 8, fontSize: 12, color: 'var(--ink60)', lineHeight: 1.5 }}>
        {emptyHint || 'Todavía no hay declaraciones contrastadas con los datos municipales para mostrar aquí.'}
      </div>
    )
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {controls && <LedgerControls items={base} state={state} set={set} />}
      {visible.length === 0 && (
        <div style={{ padding: 12, fontSize: 12, color: 'var(--ink60)' }}>{t('ledger.empty')}</div>
      )}
      {visible.slice(0, shown).map((it) => (
        <ClaimCard key={it.claim.id} item={it} />
      ))}
      {visible.length > shown && (
        <button
          type="button"
          onClick={() => setShown((n) => n + 25)}
          className="mono"
          style={{ alignSelf: 'flex-start', fontSize: 12, padding: '6px 12px', borderRadius: 6, border: '1px solid var(--border2)', background: 'transparent', color: 'var(--civic)', cursor: 'pointer' }}
        >
          {t('ledger.loadMore')} ({visible.length - shown})
        </button>
      )}
    </div>
  )
}

export function ClaimLedgerSection({ filter, limit, title, eyebrow, hint, controls }) {
  return (
    <section style={{ marginTop: 28 }}>
      <SectionHead
        eyebrow={eyebrow || 'Verificación automática de declaraciones'}
        title={title || 'Declaraciones hechas en el pleno · contraste con los datos'}
      />
      {hint && (
        <p style={{ fontSize: 12, color: 'var(--ink60)', marginTop: 4, marginBottom: 10, lineHeight: 1.5, maxWidth: 720 }}>
          {hint}{' '}
          <Link to="/metodologia#verificacion-declaraciones" style={{ color: 'var(--civic)' }}>
            Cómo se filtran estas declaraciones →
          </Link>
        </p>
      )}
      <ClaimLedger filter={filter} limit={limit} controls={controls} />
    </section>
  )
}
```

Then update the imports at the top of `ClaimLedger.jsx` — ensure `usePlenoClaims`, `CLAIM_TYPE_LABEL`, `CLAIM_TYPE_TONE`, `VERDICT_LABEL`, `VERDICT_TONE` remain imported (they are, lines 2-8), and remove the now-unused `SectionHead`? No — `SectionHead` is still used by `ClaimLedgerSection`; keep it. The new code adds `useMemo, useState`, `Link`, `useT`, and the `claim-ledger` lib imports — add them to the import block.

- [ ] **Step 3: Turn on controls for the /plenos ledger**

In `src/pages/Plenos.jsx`, the `<ClaimLedgerSection .../>` (currently lines 676-681): add `controls` and drop the now-misleading hardcoded `limit={30}` (let it default to 20 with "Cargar más"). Also shorten the hint's last sentence — the methodology link now carries the "how it's filtered" explanation:

```jsx
      <ClaimLedgerSection
        controls
        eyebrow="Verificación automática de declaraciones"
        title="Declaraciones hechas en el pleno · contraste con los datos"
        hint="Los concejales hacen afirmaciones en las intervenciones: cifras presupuestarias, obras en marcha, convenios cerrados, promesas. Cada declaración se cruza con los datos municipales (contratos, subvenciones BDNS, presupuesto, promesas) y recibe un veredicto. Solo se muestran declaraciones contrastables con datos; la atribución se queda a nivel de grupo, nunca a personas."
      />
```

- [ ] **Step 4: Run unit tests + dev smoke check**

Run: `npx vitest run`
Expected: full suite green (new + existing).

Run a quick manual check that the dev page renders and contradicho leads:
```bash
node -e 'const fs=require("fs");const m=JSON.parse(fs.readFileSync("public/data/pleno-claims/index.json","utf8"));console.log("verdicts shipped:",JSON.stringify(m.totals.byVerdict))'
```
Expected: shows `contradicho`, `verificado`, `parcial` (+ `sin-datos` for the toggle set).

- [ ] **Step 5: Commit**

```bash
npm run typecheck && npm run lint
git add src/components/ClaimLedger.jsx src/pages/Plenos.jsx src/i18n.jsx
git commit -m "feat(plenos): signal-first claim ledger with filters/search; gate department surface too

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Update `/metodologia` editorial contract

**Files:**
- Modify: `src/pages/Metodologia.jsx` (the `id="verificacion-declaraciones"` Card, after the opinativa paragraph ~line 390)

**Interfaces:** none (static content).

- [ ] **Step 1: Add the public-ledger gate paragraph**

Inside the `verificacion-declaraciones` Card, after the existing "Acusaciones opinativas" paragraph (~line 388-391), add:

```jsx
          <p style={{ marginTop: 12, fontSize: 13, lineHeight: 1.6, color: 'var(--ink70)' }}>
            <strong>Qué se publica en el registro público.</strong> La página{' '}
            <code>/plenos</code> solo muestra declaraciones <em>contrastables con datos</em>:
            verificadas, parciales, contradichas o promesas ya documentadas. Las acusaciones
            de subtipo <em>opinativa</em>, y cualquier acusación que el verificador deja{' '}
            <em>sin datos</em>, no se publican en bruto: solo pueden llegar al público si un
            curador las convierte en un <a href="/hallazgos" style={{ color: 'var(--civic)' }}>hallazgo</a>{' '}
            editorial con contexto y derecho de réplica. Las declaraciones numéricas{' '}
            <em>sin datos</em> (no acusatorias) quedan ocultas tras el conmutador
            «mostrar sin datos». Este filtro se aplica al generar los datos, no solo en
            pantalla: el material no publicable no se incluye en los ficheros descargables.
          </p>
```

- [ ] **Step 2: Verify the page renders**

Run: `npx vitest run` (no regressions) and confirm the anchor still exists:
```bash
grep -c 'verificacion-declaraciones' src/pages/Metodologia.jsx
```
Expected: `1`.

- [ ] **Step 3: Commit**

```bash
npm run lint
git add src/pages/Metodologia.jsx
git commit -m "docs(metodologia): document the public claim-ledger editorial gate

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: E2E assertions on `/plenos`

**Files:**
- Modify: `tests/e2e/plenos.spec.ts` (add a test block)

**Interfaces:** none.

- [ ] **Step 1: Add the e2e test**

Append to `tests/e2e/plenos.spec.ts`:

```ts
test('claim ledger is gated + signal-first', async ({ page }) => {
  const chunkBodies: any[] = []
  page.on('response', async (res) => {
    if (/\/data\/pleno-claims\/[^/]+\.json$/.test(res.url()) && !res.url().endsWith('index.json')) {
      try { chunkBodies.push(await res.json()) } catch { /* ignore */ }
    }
  })
  await page.goto('/plenos')
  await page.waitForLoadState('networkidle')

  // No hidden accusation verbatim shipped in any fetched chunk.
  const hidden = chunkBodies.flatMap((c) => c.items ?? []).filter(
    (it: any) =>
      it.claim?.type === 'acusacion_publica' &&
      ((it.claim?.accusationSubtype ?? 'opinativa') === 'opinativa' ||
        it.verification?.verdict === 'sin-datos'),
  )
  expect(hidden).toHaveLength(0)

  // The ungated monolith is not deployed (would be a 200 if it were).
  const mono = await page.request.get('/data/pleno-claims-verified.json')
  expect(mono.status()).toBe(404)
})
```

- [ ] **Step 2: Run e2e (plenos + a11y)**

Run: `npx playwright test tests/e2e/plenos.spec.ts tests/e2e/a11y.spec.ts --project=chromium`
Expected: PASS, including the existing `/plenos` strict a11y check.

Note: the monolith 404 assertion holds against a real deploy/preview (where `.vercelignore` applies). On a local `vite preview`/dev server that serves `public/` directly the file is still present, so if this runs against dev, change the assertion to skip with a comment. Confirm which server the e2e config targets (`playwright.config.ts` `webServer`) and keep whichever assertion matches; if dev, assert instead that no rendered `.claim-card` blockquote text matches a known opinativa verbatim.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/plenos.spec.ts
git commit -m "test(e2e): assert /plenos claim ledger ships no hidden accusations

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage:**
- Gate as one tested function → Task 1 ✓
- Build-time enforcement (chunker drops hidden, stamps visibility, manifest counts) → Task 2 ✓
- `.vercelignore` + curator monolith stays for CLIs + lab-health repoint → Task 3 ✓
- Client defense-in-depth + signal-first sort + filter/search/toggle/Cargar más → Tasks 4, 5 ✓
- Both surfaces gated (department + plenos), exports preserved → Task 5 ✓
- Remove dev-facing copy → Task 5 (new empty states, no `npm run`/`raw file` text) ✓
- i18n keys → Task 5 ✓
- /metodologia editorial contract → Task 6 ✓
- E2E: a11y stays green; no hidden verbatim in DOM/network → Task 7 ✓

**Placeholder scan:** No TBD/TODO; every code step shows full code; commands have expected output.

**Type/name consistency:** `classifyClaimVisibility`, `gateItemsForPublic`, `GatedItem`, `DATA_GROUNDED_VERDICTS` (Task 1) reused verbatim in Tasks 2/4. `gateForDisplay`/`sortSignalFirst`/`filterClaims`/`facetCounts` (Task 4) reused verbatim in Task 5. `visibility` field + `toggleCount` defined Task 2, consumed Tasks 4/5/7. `ClaimLedger`/`ClaimLedgerSection` signatures extended with `controls` (additive, back-compatible).

**Out of scope (recorded in spec, not implemented here):** verifier completion-pattern + match-floor fixes; transcription validation/QA; full page IA/tabs/per-session view.
