# Encaje declarado · respaldo de la evidencia — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Say, on `/cargos`, what the encaje block's evidence actually rests on — today, without exception, a document the subject wrote about themselves.

**Architecture:** A new `selfDeclared` flag on `SourceCitation` (the fact belongs to the document, not to a downstream heuristic), backfilled into the curated `journalist-reports.json` through a validated script. `area-fit.ts` derives a `respaldo` axis from it, orthogonal to `FIT_VALUES`. A new suggester phase maps each biography `warning` to the axis it touches, cited by index, gated by the same curator signature the 40 rows already carry. The UI states the backing once while every item agrees and splits to per-item marks when they diverge.

**Tech Stack:** TypeScript (pure parsers in `src/scraper/`, CLIs in `scripts/`), Vitest, React 18 + inline styles driven by CSS variables, Playwright + axe.

## Global Constraints

- **Spec:** `docs/superpowers/specs/2026-08-04-encaje-respaldo-design.md`. Read it first.
- **No party-specific logic, anywhere.** The rule is identical for every councillor. `/metodologia` publishes this commitment.
- **No score, no ratio, no ranking, no per-person aggregate.** Unchanged from the 2026-08-03 spec.
- **Export every enum; never restate one in a test.** Pair each enum assertion with a coverage or ceiling assertion (`docs/DATA_INTEGRITY.md` §1).
- **Cite by index, never by id.** The model receives numbered lists and returns indices; the module maps indices back. An index outside range is a hard error, never repaired.
- **`journalist-reports.json` and `area-fit.json` are curated and guard-protected.** Writes go through their CLIs. `.claude/hooks/curated-paths.mjs` will DENY a `Write`/`Edit` and ASK on a Bash write — that is expected; run the sanctioned script.
- **Both `public/data/journalist-reports.json` AND the 21 mirrors in `public/data/journalist-reports/` must stay in sync.**
- **`/metodologia` and `/aviso-legal` are the published editorial contract** — amended in the same PR as any behaviour change (CLAUDE.md).
- **Commands:** `npm run typecheck` · `npm run lint` · `npm test` · `npm run test:e2e` · `npm run check:json` · `npm run check:relations` · `npm run check:citations` · `npm run check:guards -- --inject`.
- **LLM backend:** `LLM_BACKEND=claude-code CLAUDE_CODE_MODEL=sonnet LLM_CONCURRENCY=1`. Never metered. The repo has no dotenv: `set -a; . ./.env; set +a`.
- **Measured facts as of 2026-08-04** (re-measure, do not trust these): 40 published rows, 109 evidence references across `education` + `career-professional`, **all** self-declared; 51 warnings across 21 reports; 11 officials hold a delegation, all PSOE.

## File Structure

| File | Responsibility |
| --- | --- |
| `src/scraper/journalist/types.ts` | add `selfDeclared?: boolean` to `SourceCitation` |
| `src/scraper/journalist/validators.ts` | pass `selfDeclared` through the source rebuild (else silently dropped) |
| `scripts/backfill-self-declared.ts` | one-shot, validated, writes both aggregate + 21 mirrors |
| `src/scraper/area-fit.ts` | `RESPALDO_VALUES`, `deriveRespaldo`, warning-mapping types + prompt |
| `scripts/suggest-area-fit.ts` | second phase: warnings → axis, into the same editorial queue |
| `scripts/promote-area-fit.ts` | accept + sign a warning mapping |
| `src/components/EncajeDeclarado.jsx` | adaptive rendering, corrected copy |
| `src/hooks/useAreaFit.js` | expose respaldo + mapped warnings |
| `src/scraper/relations-check.ts` | `avisoIndex` must resolve; `selfDeclared` coverage |
| `src/pages/Metodologia.jsx`, `src/pages/AvisoLegal.jsx` | the published limit |

---

### Task 1: `selfDeclared` on the source record

**Files:**
- Modify: `src/scraper/journalist/types.ts` (`SourceCitation`)
- Modify: `src/scraper/journalist/validators.ts:210-222` (the source rebuild)
- Test: `tests/journalist-self-declared.test.ts` (create)

**Interfaces:**
- Produces: `SourceCitation.selfDeclared?: boolean`

- [ ] **Step 1: Write the failing test**

Create `tests/journalist-self-declared.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { validateReportsSnapshot } from '../src/scraper/journalist/validators'

const SNAP = JSON.parse(
  readFileSync(join(__dirname, '..', 'public', 'data', 'journalist-reports.json'), 'utf8'),
)
const clone = () => JSON.parse(JSON.stringify(SNAP))

describe('SourceCitation.selfDeclared', () => {
  it('survives validation instead of being silently dropped', () => {
    // validators.ts rebuilds each source field-by-field from an allow-list, so
    // a new field that is not added there vanishes on the way through and the
    // downstream axis silently reads `undefined` for every row.
    const s = clone()
    s.items[0].sources[0].selfDeclared = true
    const out = validateReportsSnapshot(s)
    expect(out.items[0].sources[0].selfDeclared).toBe(true)
  })

  it('keeps false distinct from absent', () => {
    // `undefined` means "nobody classified this yet" and must never render as
    // "independently corroborated". They are different facts.
    const s = clone()
    s.items[0].sources[0].selfDeclared = false
    const out = validateReportsSnapshot(s)
    expect(out.items[0].sources[0].selfDeclared).toBe(false)
    const t = clone()
    delete t.items[0].sources[0].selfDeclared
    expect(validateReportsSnapshot(t).items[0].sources[0].selfDeclared).toBeUndefined()
  })

  it('rejects a non-boolean', () => {
    const s = clone()
    s.items[0].sources[0].selfDeclared = 'yes'
    expect(() => validateReportsSnapshot(s)).toThrow()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/journalist-self-declared.test.ts`
Expected: FAIL — `expected undefined to be true` (the field is dropped by the rebuild).

- [ ] **Step 3: Add the field to the type**

In `src/scraper/journalist/types.ts`, inside `SourceCitation`, after `trust: CitationTrust`:

```ts
  /**
   * The SUBJECT wrote this document.
   *
   * Orthogonal to `trust`, which rates the PUBLISHER: a CV on the town-hall
   * portal is `official-doc` / `trust:'high'` AND entirely self-declared.
   * Conflating the two seals self-declaration as verified, which is the exact
   * error this field exists to prevent — measured 2026-08-04, all 109 evidence
   * references behind the encaje rows were self-declared and none was marked.
   *
   * A declaración de bienes/actividades is self-declared too: filing it is
   * compulsory, its contents are still the subject's own account.
   *
   * `undefined` means NOT YET CLASSIFIED and must never be read as `false`.
   */
  selfDeclared?: boolean
```

- [ ] **Step 4: Pass it through the validator rebuild**

In `src/scraper/journalist/validators.ts`, in the source rebuild (~line 219), after the `trust:` line:

```ts
    trust: o.trust as CitationTrust,
    ...(o.selfDeclared === undefined ? {} : { selfDeclared: o.selfDeclared as boolean }),
```

And in the per-source validation block (~line 144, beside the `trust` check):

```ts
  must(
    o.selfDeclared === undefined || typeof o.selfDeclared === 'boolean',
    `items[${idx}].sources[${ci}].selfDeclared must be a boolean when present`,
  )
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/journalist-self-declared.test.ts`
Expected: PASS (3 tests).

Then: `npm run typecheck && npx vitest run tests/journalist-validators.test.ts` — expected clean.

- [ ] **Step 6: Commit**

```bash
git add src/scraper/journalist/types.ts src/scraper/journalist/validators.ts tests/journalist-self-declared.test.ts
git commit -m "feat(journalist): selfDeclared en la fuente, ortogonal a trust

Un CV del portal municipal es official-doc/high y a la vez enteramente
autodeclarado: trust califica al editor, no a la afirmación. El validador
reconstruye cada fuente campo a campo desde una lista blanca, así que sin
esta línea el campo se caía en silencio y el eje río abajo habría leído
undefined en todas las filas.

undefined significa SIN CLASIFICAR y nunca debe leerse como false."
```

---

### Task 2: Backfill the 21 reports

**Files:**
- Create: `scripts/backfill-self-declared.ts`
- Modify: `package.json` (script entry)
- Modify (via the script only): `public/data/journalist-reports.json` + `public/data/journalist-reports/*.json`

**Interfaces:**
- Consumes: `SourceCitation.selfDeclared` (Task 1)
- Produces: every source cited by an `education` / `career-professional` item carries an explicit boolean.

- [ ] **Step 1: Write the classifier + its test**

Create `tests/parse-self-declared-classifier.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { classifySelfDeclared } from '../scripts/backfill-self-declared'

describe('classifySelfDeclared', () => {
  it('marks the subject-authored documents', () => {
    expect(classifySelfDeclared('CV autodeclarado (ficha oficial de transparencia) — Teresa')).toBe(true)
    expect(classifySelfDeclared('CV publicado en el portal municipal — formación (autodeclarado)')).toBe(true)
    expect(classifySelfDeclared('Declaración de actividades — toma de posesión 2023 (expte. 4533)')).toBe(true)
    expect(classifySelfDeclared('Declaración de bienes patrimoniales 2023')).toBe(true)
  })

  it('marks independent records false', () => {
    expect(classifySelfDeclared('BOP n.º 79 — proclamación de electos')).toBe(false)
    expect(classifySelfDeclared('Acta constitutiva de la corporación, 13-06-2015')).toBe(false)
    expect(classifySelfDeclared('BOE-A-2018-3760 — Real Decreto 128/2018')).toBe(false)
  })

  it('returns null when it cannot tell, rather than guessing', () => {
    // An honest miss beats a wrong flag: null routes the row to the curator
    // instead of sealing self-declaration as corroborated.
    expect(classifySelfDeclared('Nota de prensa municipal, 12-03-2024')).toBeNull()
    expect(classifySelfDeclared('')).toBeNull()
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/parse-self-declared-classifier.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the script**

Create `scripts/backfill-self-declared.ts`:

```ts
#!/usr/bin/env tsx
/**
 * One-shot backfill of `selfDeclared` across the curated journalist reports.
 *
 *   npm run backfill:self-declared -- --dry-run
 *   npm run backfill:self-declared -- --curator "Sergei Lutchenko"
 *
 * journalist-reports.json is curated and guard-protected, so this is the only
 * sanctioned path: it re-validates the WHOLE snapshot before writing and keeps
 * the 21 per-report mirrors in sync — a mirror left behind is a second copy of
 * a claim about a named person, drifting.
 *
 * The classifier returns null when it cannot tell. Those rows are REPORTED and
 * left unset rather than guessed: `undefined` routes to a curator, a wrong
 * `false` would publish self-declaration as independently corroborated.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { validateReportsSnapshot } from '../src/scraper/journalist/validators'

const AGG = resolve('public/data/journalist-reports.json')
const MIRROR_DIR = resolve('public/data/journalist-reports')

/** Documents whose CONTENT is the subject's own account of themselves. */
const SELF = [
  /\bCV\b/i,
  /curr[ií]culum/i,
  /autodeclarad/i,
  /declaraci[oó]n de actividades/i,
  /declaraci[oó]n de bienes/i,
  /declaraci[oó]n estatutaria/i,
]
/** Records produced by someone other than the subject. */
const INDEPENDENT = [/\bBOP\b/i, /\bBOE\b/i, /\bacta\b/i, /registro mercantil/i, /sentencia/i, /resoluci[oó]n/i]

export function classifySelfDeclared(title: string): boolean | null {
  const t = String(title ?? '')
  if (!t.trim()) return null
  if (SELF.some((r) => r.test(t))) return true
  if (INDEPENDENT.some((r) => r.test(t))) return false
  return null
}

function arg(name: string): string | null {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? (process.argv[i + 1] ?? null) : null
}

function main() {
  const dryRun = process.argv.includes('--dry-run')
  const curator = arg('curator')
  if (!dryRun && !curator) {
    console.error('--curator es obligatorio: esto toca afirmaciones sobre personas con nombre')
    process.exit(1)
  }

  const snap = JSON.parse(readFileSync(AGG, 'utf8'))
  let set = 0
  let already = 0
  const unclassified: string[] = []

  for (const rep of snap.items ?? []) {
    for (const src of rep.sources ?? []) {
      if (src.selfDeclared !== undefined) {
        already += 1
        continue
      }
      const verdict = classifySelfDeclared(src.title)
      if (verdict === null) {
        unclassified.push(`${rep.id} / ${src.id}  «${String(src.title).slice(0, 70)}»`)
        continue
      }
      src.selfDeclared = verdict
      set += 1
    }
  }

  console.log(`[backfill] ${set} marcada(s) · ${already} ya tenía(n) valor · ${unclassified.length} sin clasificar`)
  for (const u of unclassified) console.log(`           ? ${u}`)

  if (dryRun) {
    console.log('[backfill] dry-run — no se escribe nada')
    return
  }

  snap.curatorNotes = [
    snap.curatorNotes,
    `${new Date().toISOString().slice(0, 10)} · ${curator}: marcado \`selfDeclared\` en las fuentes ` +
      `por tipo de documento (CV, currículum y declaraciones = autodeclarado; BOP, BOE y actas = no). ` +
      `${unclassified.length} fuente(s) quedaron sin clasificar a propósito.`,
  ]
    .filter(Boolean)
    .join('\n')

  validateReportsSnapshot(snap)
  writeFileSync(AGG, JSON.stringify(snap, null, 2) + '\n')

  // Mirrors — a stale mirror is a second, drifting copy of the same claim.
  let mirrors = 0
  for (const rep of snap.items ?? []) {
    const path = join(MIRROR_DIR, `${rep.assignmentId}.json`)
    if (!existsSync(path)) continue
    writeFileSync(path, JSON.stringify(rep, null, 2) + '\n')
    mirrors += 1
  }
  console.log(`[backfill] escrito el agregado + ${mirrors} espejo(s)`)
}

if (process.argv[1]?.includes('backfill-self-declared')) main()
```

Add to `package.json` scripts:

```json
"backfill:self-declared": "npx tsx scripts/backfill-self-declared.ts"
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/parse-self-declared-classifier.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Dry-run, read the unclassified list, then write**

```bash
npm run backfill:self-declared -- --dry-run
```

Read every `?` line. If any names a document that IS the subject's own account and the classifier missed it, add the pattern to `SELF` and re-run the dry-run. Do not hand-edit the JSON. Then:

```bash
npm run backfill:self-declared -- --curator "Sergei Lutchenko"
```

- [ ] **Step 6: Verify coverage of the references that matter**

```bash
node -e "
const d=require('./public/data/journalist-reports.json');
let total=0,unset=0;
for(const r of d.items||[]){
  const by=Object.fromEntries((r.sources||[]).map(s=>[s.id,s]));
  for(const k of ['education','career-professional'])
    for(const it of r.sections.find(s=>s.kind===k)?.payload.items||[])
      for(const id of it.sourceIds||[]){ total++; if(by[id]?.selfDeclared===undefined) unset++; }
}
console.log('referencias:',total,'| sin clasificar:',unset);
if(unset>0) process.exit(1);
"
```
Expected: `sin clasificar: 0`. If not, extend the patterns and re-run — the axis must never read `undefined`.

- [ ] **Step 7: Commit**

```bash
npm run check:json && npm run check:citations -- --offline
git add public/data/journalist-reports.json public/data/journalist-reports scripts/backfill-self-declared.ts tests/parse-self-declared-classifier.test.ts package.json
git commit -m "data(journalist): marca selfDeclared en las fuentes citadas

Por tipo de documento: CV, currículum y declaraciones (de actividades,
de bienes, estatutaria) son el relato del propio sujeto; BOP, BOE y
actas no. El clasificador devuelve null cuando no puede decidirlo y esas
fuentes quedan SIN marcar: un false equivocado publicaría lo
autodeclarado como corroborado, y un hueco honesto va al curador.

Se escriben el agregado y los 21 espejos: un espejo rezagado es una
segunda copia, a la deriva, de una afirmación sobre una persona."
```

---

### Task 3: The `respaldo` axis

**Files:**
- Modify: `src/scraper/area-fit.ts`
- Modify: `tests/parse-area-fit.test.ts`

**Interfaces:**
- Consumes: `SourceCitation.selfDeclared` (Task 1)
- Produces: `RESPALDO_VALUES`, `type RespaldoValue`, `deriveRespaldo(evidence, sourcesById): RespaldoValue`, `FitAssessment.respaldo?: RespaldoValue`

- [ ] **Step 1: Write the failing tests**

Append to `tests/parse-area-fit.test.ts`:

```ts
import { RESPALDO_VALUES, deriveRespaldo } from '../src/scraper/area-fit'

describe('area-fit — respaldo (de qué se sostiene la evidencia)', () => {
  const SRC = {
    'src-cv': { id: 'src-cv', selfDeclared: true },
    'src-bop': { id: 'src-bop', selfDeclared: false },
    'src-unset': { id: 'src-unset' },
  }

  it('is a separate axis from FIT_VALUES, never merged into it', () => {
    for (const v of RESPALDO_VALUES) expect(FIT_VALUES).not.toContain(v)
  })

  it('reads autodeclarada when every cited source is the subject’s own account', () => {
    expect(deriveRespaldo([{ label: 'x', sourceIds: ['src-cv'] }], SRC)).toBe('autodeclarada')
  })

  it('reads corroborada as soon as one independent source backs it', () => {
    expect(
      deriveRespaldo([{ label: 'x', sourceIds: ['src-cv'] }, { label: 'y', sourceIds: ['src-bop'] }], SRC),
    ).toBe('corroborada')
  })

  it('refuses to read an unclassified source as corroboration', () => {
    // `undefined` means nobody classified it. Treating it as independent is
    // how self-declaration gets published as verified.
    expect(deriveRespaldo([{ label: 'x', sourceIds: ['src-unset'] }], SRC)).toBe('sin-clasificar')
  })

  it('has no evidence at all → sin-clasificar, not autodeclarada', () => {
    expect(deriveRespaldo([], SRC)).toBe('sin-clasificar')
  })
})

describe('area-fit — the published snapshot’s backing is MEASURED, not assumed', () => {
  it('every published assessment carries a respaldo', () => {
    const snap = JSON.parse(
      readFileSync(join(__dirname, '..', 'public', 'data', 'area-fit.json'), 'utf8'),
    ) as { rows: Array<Record<string, { respaldo?: string }>> }
    const values = snap.rows.flatMap((r) => [r.formacion?.respaldo, r.experiencia?.respaldo])
    // Assert the classifier RAN. "0 corroboradas" must be a measured result,
    // not a field nobody populated — the two look identical from the outside.
    expect(values.length).toBeGreaterThan(0)
    expect(values.filter((v) => v === undefined)).toEqual([])
    expect(values.filter((v) => v === 'sin-clasificar')).toEqual([])
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/parse-area-fit.test.ts`
Expected: FAIL — `RESPALDO_VALUES` is not exported.

- [ ] **Step 3: Implement in `src/scraper/area-fit.ts`**

```ts
/**
 * What an assessment's evidence RESTS ON — a separate question from whether it
 * relates to the área, and deliberately a separate value.
 *
 * Measured 2026-08-04: all 109 evidence references behind the 40 published rows
 * were self-declared, so this axis reads `autodeclarada` everywhere today. That
 * is the finding, not a bug — and it is why the UI states it once instead of
 * printing an identical badge 80 times.
 *
 * `sin-clasificar` is NOT a synonym for autodeclarada. It means no one has said
 * what backs this, and it must never render as corroboration.
 */
export const RESPALDO_VALUES = [
  'autodeclarada',
  'corroborada',
  'discrepancia-documentada',
  'sin-clasificar',
] as const
export type RespaldoValue = (typeof RESPALDO_VALUES)[number]

export interface SourceLike {
  id: string
  selfDeclared?: boolean
}

export function deriveRespaldo(
  evidence: readonly FitEvidenceItem[],
  sourcesById: Record<string, SourceLike>,
): RespaldoValue {
  const ids = evidence.flatMap((e) => e.sourceIds ?? [])
  if (!ids.length) return 'sin-clasificar'
  const flags = ids.map((id) => sourcesById[id]?.selfDeclared)
  if (flags.some((f) => f === undefined)) return 'sin-clasificar'
  return flags.some((f) => f === false) ? 'corroborada' : 'autodeclarada'
}
```

Add `respaldo?: RespaldoValue` to `FitAssessment`, and in `validateAssessment` (inside `validateAreaFitSnapshot`):

```ts
  must(
    a.respaldo === undefined || (RESPALDO_VALUES as readonly string[]).includes(a.respaldo),
    `${where}.respaldo must be one of ${RESPALDO_VALUES.join(' | ')}`,
  )
  must(
    a.respaldo !== 'sin-clasificar',
    `${where}: refusing to publish an assessment whose backing was never classified — ` +
      'run `npm run backfill:self-declared` first',
  )
```

- [ ] **Step 4: Wire it where rows are built**

`rowFromResponse` and `rowWithoutModel` take a new third parameter `sourcesById: Record<string, SourceLike>` and set `respaldo: deriveRespaldo(assessment.evidence, sourcesById)` on each assessment. `buildFitTasks` gains a `sourcesById` field on `FitTask`, populated from the report's `sources` array.

- [ ] **Step 5: Run tests**

Run: `npx vitest run tests/parse-area-fit.test.ts`
Expected: the `deriveRespaldo` tests PASS; the published-snapshot test FAILS (rows have no `respaldo` yet). That failure is expected and is fixed in Task 5 by re-promoting.

- [ ] **Step 6: Commit**

```bash
npm run typecheck
git add src/scraper/area-fit.ts tests/parse-area-fit.test.ts
git commit -m "feat(encaje): eje de respaldo, separado del de relación

«¿guarda relación con el área?» y «¿de qué se sostiene?» son dos
preguntas; fundirlas repetiría el error del porcentaje. Una fuente sin
clasificar NO es autodeclarada: es sin-clasificar, y el validador se
niega a publicarla, porque leer undefined como corroboración es
exactamente cómo lo autodeclarado se publica como verificado."
```

---

### Task 4: Warnings → axis (model proposes, curator signs)

**Files:**
- Modify: `src/scraper/area-fit.ts` (types, prompt, resolver)
- Modify: `scripts/suggest-area-fit.ts` (second phase)
- Modify: `scripts/promote-area-fit.ts` (`--aviso` flags)
- Modify: `tests/parse-area-fit.test.ts`

**Interfaces:**
- Produces: `AVISO_EJES`, `resolveAvisoMapping(raw, warnings): AvisoMapping`, `AreaFitSnapshot.avisos?: AvisoMapping[]`

- [ ] **Step 1: Write the failing tests**

```ts
import { AVISO_EJES, resolveAvisoMapping } from '../src/scraper/area-fit'

describe('area-fit — avisos mapped to an axis', () => {
  const WARNINGS = [
    'Los datos de formación proceden del CV autodeclarado de la propia concejala.',
    'Su CV y su declaración estatutaria difieren en el inicio de su plaza docente (2006 frente a 09/2008); se publica sin resolver.',
    'Las delegaciones han variado durante el mandato: el decreto de 07-2023 recogía Participación…',
  ]

  it('exports the axis enum rather than letting callers restate it', () => {
    expect(AVISO_EJES).toContain('formacion')
    expect(AVISO_EJES).toContain('experiencia')
    expect(AVISO_EJES).toContain('area')
    expect(AVISO_EJES).toContain('ninguno')
  })

  it('carries the warning verbatim, resolved from its index', () => {
    const m = resolveAvisoMapping({ avisoIndex: 1, eje: 'experiencia', tipo: 'sin-resolver' }, WARNINGS)
    expect(m.eje).toBe('experiencia')
    expect(m.verbatim).toBe(WARNINGS[1])
  })

  it('rejects an index outside the report’s warnings rather than repairing it', () => {
    expect(() => resolveAvisoMapping({ avisoIndex: 9, eje: 'experiencia' }, WARNINGS)).toThrow(
      AreaFitValidationError,
    )
  })

  it('rejects an axis outside the enum', () => {
    expect(() => resolveAvisoMapping({ avisoIndex: 0, eje: 'sospecha' }, WARNINGS)).toThrow(
      AreaFitValidationError,
    )
  })

  it('keeps eje=area away from the chips — it flags the ROW', () => {
    const m = resolveAvisoMapping({ avisoIndex: 2, eje: 'area', tipo: 'delegacion-cambiada' }, WARNINGS)
    expect(m.eje).toBe('area')
    expect(m.decoratesChip).toBe(false)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/parse-area-fit.test.ts -t avisos`
Expected: FAIL — `AVISO_EJES` not exported.

- [ ] **Step 3: Implement in `src/scraper/area-fit.ts`**

```ts
/**
 * Which axis a biography warning bears on.
 *
 * `area` is not a decoration: it means the delegation changed mid-mandate, so a
 * row may be judging an área the person no longer holds. That is a correctness
 * problem with the row, not a note about the person, and it renders as such.
 */
export const AVISO_EJES = ['formacion', 'experiencia', 'area', 'ninguno'] as const
export type AvisoEje = (typeof AVISO_EJES)[number]

export interface AvisoMapping {
  officialSlug: string
  /** The report the index is relative to — check:relations resolves through it. */
  reportId: string
  avisoIndex: number
  eje: AvisoEje
  tipo?: string
  /** Resolved here from the index — the model never emits prose we publish. */
  verbatim: string
  decoratesChip: boolean
  curatedBy?: string
  curatedAt?: string
}

export function resolveAvisoMapping(
  raw: { avisoIndex: number; eje: string; tipo?: string },
  warnings: readonly string[],
  ctx: { officialSlug: string; reportId: string } = { officialSlug: '', reportId: '' },
): AvisoMapping {
  must(raw && typeof raw === 'object', 'aviso mapping must be an object')
  must(
    (AVISO_EJES as readonly string[]).includes(raw.eje),
    `eje must be one of ${AVISO_EJES.join(' | ')}, got ${raw.eje}`,
  )
  must(
    Number.isInteger(raw.avisoIndex) && raw.avisoIndex >= 0 && raw.avisoIndex < warnings.length,
    `avisoIndex ${raw.avisoIndex} is outside the report's ${warnings.length} warning(s) — ` +
      'refusing to repair it; a drifted index attaches a warning to the wrong claim',
  )
  return {
    officialSlug: ctx.officialSlug,
    reportId: ctx.reportId,
    avisoIndex: raw.avisoIndex,
    eje: raw.eje as AvisoEje,
    ...(raw.tipo ? { tipo: raw.tipo } : {}),
    verbatim: warnings[raw.avisoIndex],
    decoratesChip: raw.eje === 'formacion' || raw.eje === 'experiencia',
  }
}

export const AVISO_PROMPT_VERSION = 'area-fit-aviso-v1'

export function buildAvisoSystemPrompt(): string {
  return `Eres analista documental de un observatorio municipal español.

Se te da la lista numerada de ADVERTENCIAS que acompaña a una biografía y debes
decir, para cada una, sobre qué eje recae:

- "formacion"   — pone en cuestión, matiza o corrobora la FORMACIÓN declarada.
- "experiencia" — lo mismo para la TRAYECTORIA PROFESIONAL declarada.
- "area"        — dice que las áreas o delegaciones han cambiado.
- "ninguno"     — cualquier otra cosa (compatibilidad de actividades privadas,
                  cobertura de prensa, incidencias de archivo, patrimonio).

Reglas:
- Cita por ÍNDICE, exactamente como están numeradas. Nunca inventes un índice.
- Una advertencia que sólo dice que un dato es autodeclarado es "ninguno": eso
  ya se refleja por otra vía y repetirlo es ruido.
- No juzgas a la persona. No añades prosa sobre ella.
- Ante la duda, "ninguno".

Devuelve SÓLO JSON.`
}

export function buildAvisoUserPrompt(warnings: readonly string[]): string {
  return `ADVERTENCIAS:
${warnings.map((w, i) => `  [${i}] ${w}`).join('\n')}

Devuelve {"avisos":[{"avisoIndex":n,"eje":"…","tipo":"…"}]} con una entrada por advertencia.`
}
```

- [ ] **Step 4: Add the suggester phase**

In `scripts/suggest-area-fit.ts`, after the per-área loop, add a phase over each official's report `warnings`, with the Zod schema:

```ts
const AvisoSchema = z.object({
  avisos: z.array(
    z.object({
      avisoIndex: z.number().int().nonnegative(),
      eje: z.enum(['formacion', 'experiencia', 'area', 'ninguno']),
      tipo: z.string().optional(),
    }),
  ),
})
```

Call `callLLM` with `buildAvisoSystemPrompt()` / `buildAvisoUserPrompt(warnings)` and `promptVersion: AVISO_PROMPT_VERSION`; run each result through `resolveAvisoMapping`, drop `eje === 'ninguno'`, stamp `requiresHumanApproval: true`, and write them into the queue under a new `avisos` array. A null response is reported per official (`run.record('backend-null')`), never silently treated as "no warnings apply".

- [ ] **Step 5: Add the promote path**

In `scripts/promote-area-fit.ts`, before the existing `--official`/`--area` handling, add:

```ts
  // Signing a warning mapping. Kept on the same CLI as the rows because it is
  // the same act — attaching a published statement to a named person — and it
  // must re-validate the same whole snapshot.
  if (process.argv.includes('--aviso')) {
    const slug = arg('official')
    const idxRaw = arg('aviso-index')
    if (!slug || idxRaw === null) {
      console.error(
        'uso: npm run promote-area-fit -- --aviso --official <slug> --aviso-index <n> --curator "<nombre>"',
      )
      process.exit(1)
    }
    const idx = Number(idxRaw)
    const snap = loadPublished()
    snap.avisos = snap.avisos ?? []

    if (process.argv.includes('--reject')) {
      console.log(`✗ rechazado (no se publica)  ${slug} · aviso ${idx}`)
      return
    }
    if (process.argv.includes('--retract')) {
      const before = snap.avisos.length
      snap.avisos = snap.avisos.filter((a) => !(a.officialSlug === slug && a.avisoIndex === idx))
      if (snap.avisos.length === before) {
        console.error(`no hay aviso publicado para ${slug} · ${idx}`)
        process.exit(1)
      }
      snap.generatedAt = new Date().toISOString()
      write(snap)
      console.log(`↩ retirado  ${slug} · aviso ${idx}`)
      return
    }

    const curator = arg('curator')
    if (!curator) {
      console.error('--curator es obligatorio: esto nombra a una persona, así que lleva firma')
      process.exit(1)
    }
    const draft = (loadQueueAvisos() ?? []).find(
      (a) => a.officialSlug === slug && a.avisoIndex === idx,
    )
    if (!draft) {
      console.error(`no hay borrador de aviso en cola para ${slug} · ${idx}`)
      process.exit(1)
    }
    const { requiresHumanApproval: _drop, ...rest } = draft
    snap.avisos = snap.avisos.filter((a) => !(a.officialSlug === slug && a.avisoIndex === idx))
    snap.avisos.push({
      ...rest,
      curatedBy: curator,
      curatedAt: new Date().toISOString().slice(0, 10),
    })
    snap.generatedAt = new Date().toISOString()
    write(snap)
    console.log(`✓ publicado  ${slug} · aviso ${idx} → eje ${draft.eje}\n      « ${draft.verbatim} »`)
    return
  }
```

Add the queue reader beside `loadQueue`:

```ts
function loadQueueAvisos(): Array<AvisoMapping & { requiresHumanApproval?: true }> {
  if (!existsSync(QUEUE)) return []
  return JSON.parse(readFileSync(QUEUE, 'utf8')).avisos || []
}
```

And extend `validateAreaFitSnapshot` to check `avisos[]`: `eje` in `AVISO_EJES`, `verbatim` non-empty, `curatedBy` present, and no `requiresHumanApproval` on a published mapping.

- [ ] **Step 6: Run tests**

Run: `npx vitest run tests/parse-area-fit.test.ts && npm run typecheck`
Expected: the aviso tests PASS.

- [ ] **Step 7: Commit**

```bash
git add src/scraper/area-fit.ts scripts/suggest-area-fit.ts scripts/promote-area-fit.ts tests/parse-area-fit.test.ts
git commit -m "feat(encaje): mapea las advertencias de la biografía a su eje

El modelo dice sobre qué recae cada advertencia citando por ÍNDICE sobre
la lista del informe, así que no puede inventarse una; el texto que se
publica lo resuelve el módulo desde ese índice. Firma un curador.

eje=area no decora ningún chip: significa que la delegación cambió
durante el mandato y la fila puede estar juzgando un área que ya no
lleva. Es corrección de la fila, no una nota sobre la persona."
```

---

### Task 5: Regenerate, re-promote, and render

**Files:**
- Modify: `src/hooks/useAreaFit.js`
- Modify: `src/components/EncajeDeclarado.jsx`
- Modify: `src/i18n.jsx`
- Regenerate: `editorial/area-fit-queue.json`, `public/data/area-fit.json`

- [ ] **Step 1: Regenerate the queue and re-promote the 40 rows**

```bash
set -a; . ./.env; set +a
LLM_BACKEND=claude-code CLAUDE_CODE_MODEL=sonnet LLM_CONCURRENCY=1 npm run suggest:area-fit
```
The 40 área calls hit the LLM cache (same `promptVersion` + input) and return instantly; only the new aviso phase makes calls. Then re-promote all 40 so each row gains its `respaldo`. Reuse the command list:

```bash
npm run promote-area-fit -- --list
```

Re-run each `--official … --area … --curator "Sergei Lutchenko"` line. Then sign the aviso mappings the queue proposes, rejecting any that read as a note about the person rather than about the evidence.

- [ ] **Step 2: Verify the published snapshot**

```bash
node -e "
const s=require('./public/data/area-fit.json');
const v=s.rows.flatMap(r=>[r.formacion.respaldo,r.experiencia.respaldo]);
const c={}; v.forEach(x=>c[x]=(c[x]||0)+1);
console.log('respaldo:',JSON.stringify(c),'| avisos firmados:',(s.avisos||[]).length);
if(v.includes(undefined)||v.includes('sin-clasificar')) process.exit(1);
"
npx vitest run tests/parse-area-fit.test.ts
```
Expected: no `undefined`, no `sin-clasificar`; the Task-3 snapshot test now PASSES.

- [ ] **Step 3: Expose it from the hook**

In `src/hooks/useAreaFit.js` add:

```js
/**
 * The single backing value for a card, or null when its items disagree.
 *
 * Returns null on divergence so the UI knows to fall back to per-item marks —
 * a badge repeated identically on every row distinguishes nothing, which is how
 * the cargoPublicoPrevio chip died.
 */
export function sharedRespaldo(rows) {
  const values = (rows || []).flatMap((r) => [r?.formacion?.respaldo, r?.experiencia?.respaldo]).filter(Boolean)
  if (!values.length) return null
  return values.every((v) => v === values[0]) ? values[0] : null
}

/** Signed warning mappings for one official, by axis. */
export function avisosForSlug(data, slug, eje) {
  return (data?.avisos || []).filter((a) => a.officialSlug === slug && (!eje || a.eje === eje))
}
```

- [ ] **Step 4: Render adaptively**

In `EncajeCard` (`src/components/EncajeDeclarado.jsx`): compute `const shared = sharedRespaldo(rows)`. When `shared` is non-null render ONE line under the chips —
`t('encaje.respaldo.' + shared)` — and no per-item marks. When it is null, render a small marker beside each chip instead. Replace the current `encaje.card.source` string. Any `eje: 'area'` aviso renders as a row-level warning above the chips, not as a chip decoration.

New i18n keys (es + ca):

```
'encaje.respaldo.autodeclarada':
  'Todo lo anterior lo declara la propia persona; ninguna fuente independiente lo corrobora.'
'encaje.respaldo.corroborada': 'Corroborado por una fuente independiente.'
'encaje.respaldo.discrepancia-documentada': 'Hay una discrepancia documentada sin resolver.'
'encaje.aviso.area': 'Sus áreas delegadas han cambiado durante el mandato; esta ficha puede referirse a un área que ya no lleva.'
```

- [ ] **Step 5: Verify in the browser**

```bash
VITE_ENABLE_PERIODISTAS=true npm run build
npx vite preview --host 127.0.0.1 --port 4173 --strictPort
```
Check `/cargos` (one shared line per card, no repeated badge), `/cargos/teresa-pozuelo-martin`, and a card whose official has an `eje: 'area'` aviso.

- [ ] **Step 6: Commit**

```bash
npm run typecheck && npm run lint && npx prettier --write src public/data/area-fit.json
git add -A
git commit -m "feat(encaje): dice de qué se sostiene, una vez y no ochenta

Mientras todas las evaluaciones de una tarjeta coinciden —hoy las 40
filas y sus 109 referencias son autodeclaradas— el bloque lo dice una
sola vez. En cuanto divergen, pasa a marcas por elemento. Un distintivo
repetido idéntico 80 veces no distingue nada.

Sustituye «Según su CV publicado», que decía la procedencia sin decir lo
que implica."
```

---

### Task 6: Guards and the published contract

**Files:**
- Modify: `src/scraper/relations-check.ts`, `scripts/check-relations.ts`
- Modify: `src/pages/Metodologia.jsx`, `src/pages/AvisoLegal.jsx`

- [ ] **Step 1: Add the referential checks**

In `src/scraper/relations-check.ts`, two checks beside `areafit-report-sources`:

```ts
check('areafit-avisos', 'error', areaFit != null && reports != null, () => {
  let checked = 0
  const broken: string[] = []
  const warningsById = new Map((reports?.items ?? []).map((r) => [r?.id, (r?.warnings ?? []).length]))
  for (const a of areaFit?.avisos ?? []) {
    checked += 1
    const n = warningsById.get(a?.reportId)
    if (n === undefined) broken.push(`aviso cites unknown report ${a?.reportId}`)
    else if (!(a.avisoIndex >= 0 && a.avisoIndex < n))
      broken.push(`aviso index ${a?.avisoIndex} outside ${n} warning(s) of ${a?.reportId}`)
  }
  return { checked, broken }
}),

check('areafit-respaldo-classified', 'error', areaFit != null, () => {
  // A respaldo that was never classified is indistinguishable, from outside,
  // from one measured as uncorroborated. Assert the classifier RAN.
  let checked = 0
  const broken: string[] = []
  for (const r of areaFit?.rows ?? []) {
    for (const f of ['formacion', 'experiencia'] as const) {
      checked += 1
      const v = r?.[f]?.respaldo
      if (!v) broken.push(`${r?.officialSlug}/${r?.portfolio}.${f} has no respaldo`)
      else if (v === 'sin-clasificar')
        broken.push(`${r?.officialSlug}/${r?.portfolio}.${f} respaldo was never classified`)
    }
  }
  return { checked, broken }
}),
```

Extend the `areaFit` input type with `avisos?: Array<{ reportId?: string; avisoIndex?: number; eje?: string }>` and `rows[].formacion.respaldo?: string`.

- [ ] **Step 2: Ablate both, to prove they fire**

```bash
npm run check:relations   # expect 0 broken
node -e "
const fs=require('fs');const p='public/data/area-fit.json';
const b=fs.readFileSync(p,'utf8');const s=JSON.parse(b);
delete s.rows[0].formacion.respaldo;
fs.writeFileSync(p,JSON.stringify(s,null,2)+'\n');
fs.writeFileSync('/tmp/area-fit.bak',b);
"
npm run check:relations   # expect: areafit-respaldo-classified BROKEN
cp /tmp/area-fit.bak public/data/area-fit.json
npm run check:relations   # expect 0 broken again
```
Record the observed output in the commit message. A guard you have not seen fail is not a guard.

- [ ] **Step 3: Amend the published contract**

In `src/pages/Metodologia.jsx`, inside the existing `id="encaje"` card, add a paragraph stating: every evidence reference behind this block comes from a document the person wrote about themselves — CVs published by the town hall and the compulsory declarations, whose contents are still their own account; the site records which sources are self-declared (`selfDeclared`) separately from how reliable the publisher is (`trust`), because a CV on the municipal portal is a highly reliable publisher carrying an entirely unverified claim; and where the biography records an unresolved discrepancy, the block says so. State that this is measured, not assumed, and that `0 corroboradas` is a measurement.

In `src/pages/AvisoLegal.jsx`, extend the "Formación y trayectoria de cargos electos" card with one sentence: the site does not assert these facts are true, only that the person declared them and where; any official may rectify through the same channel and deadlines.

- [ ] **Step 4: Commit**

```bash
npm run typecheck && npm run lint && npm test
git add -A
git commit -m "test(encaje): el respaldo se afirma medido, no supuesto

check:relations gana dos comprobaciones: todo avisoIndex firmado ha de
existir en el informe citado, y toda evaluación publicada ha de llevar
respaldo clasificado. «0 corroboradas» y «nadie rellenó el campo» se ven
igual desde fuera, así que la guarda afirma que el clasificador CORRIÓ.

Ablación: borrar un respaldo pone areafit-respaldo-classified en BROKEN;
restaurarlo lo devuelve a 0. /metodologia y /aviso-legal lo publican."
```

---

### Task 7: Verification sweep

- [ ] **Step 1: Run everything**

```bash
npm run typecheck && npm run lint && npm test
npm run check:json && npm run check:relations && npm run check:citations
npm run check:guards -- --inject
VITE_ENABLE_PERIODISTAS=true npm run build && npm run test:e2e
```
All green. `test:e2e` includes the axe WCAG pass — any new in-prose link must be underlined, and no new text may sit under the AA contrast floor (both regressed once already on this feature).

- [ ] **Step 2: Read the pages as a reader**

```bash
npx vite preview --host 127.0.0.1 --port 4173 --strictPort &
set -a; . ./.env; set +a
env -u OPENAI_API_KEY -u ANTHROPIC_API_KEY GEMINI_BIN=/nonexistent-disabled \
    AGY_BIN=/nonexistent-disabled LLM_BACKEND=claude-code LLM_CONCURRENCY=1 \
    npm run review:surfaces -- /cargos /departamentos /metodologia /aviso-legal
```
Verify each finding against the snapshot yourself before changing anything; the reviewer can be wrong about the implication while quoting correctly.

- [ ] **Step 3: Review the rows that name people**

Run `/revisar-borrador` over the newly signed aviso mappings. A curator note is published, so it must describe the criterion, never the discarded material.

- [ ] **Step 4: Merge**

Only after every check above is green and the surface review returns no findings for human review.
