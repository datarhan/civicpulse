# Brandbook v3 · Wave 1 (token layer) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move CivicPulse's brand colour off the Partido Popular's exact hex, collapse the ink scale from five near-identical tiers to three real ones, and lock both behind a guard that computes rather than restates.

**Architecture:** Guard-first. A new Vitest guard parses `src/index.css` and imports `PARTY_COLORS`, so it can never drift from what ships. It goes red immediately; six subsequent tasks turn named assertions green in a fixed order. The ordering constraint that governs everything: **usages are rewritten before the tokens they name are deleted** — an undefined custom property invalidates the whole `color` declaration and silently falls back to the parent's colour, which is the exact bug `src/index.css:39-43` already documents.

**Tech Stack:** Vite + React 18, CSS custom properties, Vitest, Playwright + axe-core.

## Global Constraints

- **Spec:** `docs/superpowers/specs/2026-08-13-brandbook-v3-wave1-tokens-design.md`. Read it before Task 1.
- **Never restate a value a test can read.** `docs/DATA_INTEGRITY.md` rule #1. The guard parses `src/index.css` and imports `PARTY_COLORS` from `src/lib/party-colors.js`. Hand-copying either into the test is the defect the guard exists to prevent.
- **Never fork a shared primitive.** Contrast maths lives in `src/lib/contrast.js`. Task 1 extends it; nothing computes luminance or alpha compositing anywhere else.
- **A check must prove it did work.** Every scan asserts on the count of things it examined, not only on the verdict.
- **Comments in Spanish, in the house register**, matching `tests/contraste-nota.test.js`: say what broke and why the assertion exists, not what the code does.
- **AA floor is 4.5:1** for text. `--ink50` never goes below `.62` (at `.52` it measures 3.84:1). The measured safe band for these shared tokens is `.60–.82`.
- **Party colours are never reinterpreted by theme.** They are third-party marks; identical in light and dark.
- `npm run typecheck` and `npm run lint` must stay clean. Prettier owns formatting (a pre-commit hook runs it).
- Commit after every task. Never `git add -A`; name the paths.

## File Structure

| File | Responsibility | Task |
| ---- | -------------- | ---- |
| `src/lib/contrast.js` | **Modify.** Add alpha compositing to the shared contrast primitive | 1 |
| `tests/lib/contrast.test.js` | **Modify.** Cover the new functions; delete the local `blendOverPaper` fork | 1 |
| `tests/brand-tokens.test.js` | **Create.** The guard: 6 assertions, parses + imports, never restates | 2 |
| `src/index.css` | **Modify.** Civic family, `--civic-on`, ink merge, delete retired tiers | 3, 4 |
| ~90 files under `src/` | **Modify.** Mechanical `--inkNN` rewrite | 4 |
| `src/variants/direction-d/tokens.jsx` | **Modify.** Landing palette: civic + ink alignment | 5 |
| `src/variants/direction-d/SectionHeader.jsx` | **Modify.** `SECTION_TONES.promesas` | 5 |
| `src/variants/direction-d/blocks/Masthead.jsx` | **Modify.** Shadow tint | 5 |
| `src/variants/direction-d/blocks/FeedBlocks.jsx` | **Modify.** Survey chip wash | 5 |
| 8 files under `src/components/LiveCity/` | **Modify.** Map chrome, popups, controls | 6 |
| `src/components/QuejasHeatmap.jsx` | **Modify.** Pending-count colour | 6 |
| `src/pages/Promesas.jsx` | **Modify.** Suggestion box tint (retone only) | 6 |
| `index.html` | **Modify.** `theme-color` | 6 |

---

### Task 1: Alpha compositing in the shared contrast primitive

The ink tiers are `rgba(11,15,25,.62)`. `src/lib/contrast.js` only handles opaque colours, so the guard in Task 2 cannot measure them without compositing. There is already a private fork of that maths — `blendOverPaper` at `tests/lib/contrast.test.js:89` — which is what the repo rule against forking primitives exists to stop. This task adds it to the shared module and retires the fork.

**Files:**
- Modify: `src/lib/contrast.js` (append after `contrastRatio`, before `readableInk`)
- Test: `tests/lib/contrast.test.js` (add a `describe`; delete the `blendOverPaper` function and repoint its caller)

**Interfaces:**
- Consumes: existing `parseHex`, `contrastRatio` from `src/lib/contrast.js`
- Produces:
  - `parseRgba(value: string) => { rgb: [number,number,number], a: number }` — throws on a non-`rgb()/rgba()` string
  - `flatten(value: string, backgroundHex: string) => string` — opaque `#rrggbb`
  - `contrastRatioOver(value: string, backgroundHex: string) => number` — accepts hex *or* rgba as `value`

- [ ] **Step 1: Write the failing test**

Add to `tests/lib/contrast.test.js`, after the `describe('contrastRatio', …)` block:

```js
describe('flatten / contrastRatioOver — la escala de tinta es rgba, no hex', () => {
  // Los tiers de --ink son rgba con alfa. Medir su contraste exige componerlos
  // sobre el fondo real primero; sin esto, el guard de marca no puede afirmar
  // nada sobre --ink70 ni --ink50. La maths ya existía duplicada en este mismo
  // fichero (`blendOverPaper`), que es la copia local que este repo prohíbe.
  it('compone un rgba sobre un fondo opaco', () => {
    expect(flatten('rgba(11,15,25,1)', '#FFFFFF')).toBe('#0b0f19')
    expect(flatten('rgba(11,15,25,0)', '#FFFFFF')).toBe('#ffffff')
    expect(flatten('rgba(0,0,0,.5)', '#FFFFFF')).toBe('#808080')
  })

  it('acepta las dos formas que escribe el CSS de este repo', () => {
    expect(parseRgba('rgba(11, 15, 25, 0.62)').a).toBeCloseTo(0.62, 5)
    expect(parseRgba('rgba(241,245,249,.78)').rgb).toEqual([241, 245, 249])
    expect(parseRgba('rgb(11,15,25)').a).toBe(1)
  })

  it('se niega a adivinar sobre algo que no es un color rgba', () => {
    // Control: si devolviese un valor por defecto, un token mal escrito
    // pasaría el guard con un contraste inventado en vez de romperlo.
    expect(() => parseRgba('#0b0f19')).toThrow(/no es un color rgba/)
    expect(() => parseRgba('var(--ink)')).toThrow(/no es un color rgba/)
  })

  it('mide contraste tanto de un hex como de un rgba', () => {
    expect(contrastRatioOver('#0b0f19', '#ffffff')).toBeCloseTo(19.15, 1)
    expect(contrastRatioOver('rgba(11,15,25,.62)', '#ffffff')).toBeCloseTo(5.41, 1)
    expect(contrastRatioOver('rgba(241,245,249,.62)', '#12182a')).toBeCloseTo(6.8, 1)
  })
})
```

Extend the existing import at the top of the file to include the three new names:

```js
import {
  contrastRatio,
  luminance,
  parseHex,
  parseRgba,
  flatten,
  contrastRatioOver,
  readableInk,
  meetsAA,
  INK_DARK,
  INK_LIGHT,
} from '../../src/lib/contrast'
```

- [ ] **Step 2: Run it and confirm it fails**

```bash
npx vitest run tests/lib/contrast.test.js
```

Expected: FAIL — `flatten is not a function` (the import resolves to `undefined`).

- [ ] **Step 3: Implement**

In `src/lib/contrast.js`, insert between `contrastRatio` (ends line 50) and the `readableInk` doc comment:

```js
/**
 * @param {string} value `rgb(r,g,b)` or `rgba(r,g,b,a)`, spaces or commas
 * @returns {{ rgb: [number,number,number], a: number }}
 */
export function parseRgba(value) {
  const m = String(value)
    .trim()
    .match(/^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,/\s]+([\d.]+))?\s*\)$/i)
  if (!m) throw new Error(`no es un color rgba(): ${value}`)
  return {
    rgb: [Number(m[1]), Number(m[2]), Number(m[3])],
    a: m[4] === undefined ? 1 : Number(m[4]),
  }
}

/**
 * Composite a translucent colour over an opaque background.
 *
 * The ink scale is alpha, not hex, so nothing can be said about its contrast
 * until it is flattened onto the surface it actually sits on — and the answer
 * differs per surface (--paper, --surf, --soft).
 *
 * @param {string} value rgba colour
 * @param {string} backgroundHex opaque background
 * @returns {string} opaque `#rrggbb`
 */
export function flatten(value, backgroundHex) {
  const { rgb, a } = parseRgba(value)
  const bg = parseHex(backgroundHex)
  return (
    '#' +
    rgb
      .map((c, i) => Math.round(a * c + (1 - a) * bg[i]))
      .map((c) => c.toString(16).padStart(2, '0'))
      .join('')
  )
}

/**
 * Contrast of a possibly-translucent colour against an opaque background.
 * @param {string} value hex or rgba
 * @param {string} backgroundHex
 * @returns {number}
 */
export function contrastRatioOver(value, backgroundHex) {
  const v = String(value).trim()
  return contrastRatio(v.startsWith('#') ? v : flatten(v, backgroundHex), backgroundHex)
}
```

- [ ] **Step 4: Retire the fork**

Delete the `blendOverPaper` function at the bottom of `tests/lib/contrast.test.js` (line ~89) and change its one caller inside `describe('landing palette meets AA where it is used as text')`:

```js
      const effective = flatten(tone.wash, PAPER)
```

- [ ] **Step 5: Run the tests**

```bash
npx vitest run tests/lib/contrast.test.js && npm run typecheck && npm run lint
```

Expected: PASS, all green. The landing-palette block must still pass — it now runs through the shared primitive.

- [ ] **Step 6: Commit**

```bash
git add src/lib/contrast.js tests/lib/contrast.test.js
git commit -m "feat(contrast): componer alfa en la primitiva compartida

La escala de tinta es rgba y contrast.js solo sabía de colores opacos, así
que nada podía medir --ink70 ni --ink50. La maths ya estaba duplicada en
tests/lib/contrast.test.js como blendOverPaper: esa copia local se retira y
su llamada pasa a la compartida."
```

---

### Task 2: The guard, red

Six assertions. It parses `src/index.css` and imports `PARTY_COLORS`; it restates neither. On a clean checkout it must fail assertions 1, 3 and 4.

**Files:**
- Create: `tests/brand-tokens.test.js`

**Interfaces:**
- Consumes: `contrastRatioOver`, `parseRgba` from `src/lib/contrast.js` (Task 1); `PARTY_COLORS` from `src/lib/party-colors.js`
- Produces: nothing importable — this is a leaf gate

- [ ] **Step 1: Write the guard**

Create `tests/brand-tokens.test.js`:

```js
/**
 * El azul de marca era, hexadecimal a hexadecimal, el azul del Partido Popular:
 * `--civic: #2463eb` y `PARTY_COLORS.PP: '#2463EB'`. En /promesas la pastilla de
 * atribución del PP se pintaba con el color del logo del sitio, y el bloque de
 * propuesta automática dibujaba una inferencia de máquina sobre una promesa en
 * el hexadecimal exacto del partido.
 *
 * Y la escala de tinta tenía cinco tiers de texto con cuatro valores dentro de
 * trece centésimas: .82 / .73 / .64 / .62 / .60. Tres de ellos indistinguibles.
 *
 * Este guard no repite ninguna de esas cifras: analiza src/index.css e importa
 * PARTY_COLORS. Un guard que copiase la escala a mano se quedaría verde
 * mientras producción diverge, que es exactamente el defecto que vigila.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { PARTY_COLORS } from '../src/lib/party-colors.js'
import { contrastRatioOver, parseRgba } from '../src/lib/contrast.js'

const ROOT = join(__dirname, '..')
const CSS = readFileSync(join(ROOT, 'src/index.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')

/** Los sitios que AÚN pintan un hex de partido, con motivo y ola. Codifican un
 *  dato (serie de gráfico, pin, polígono), no la marca; su retono es §07, ola 3.
 *  Se declaran uno a uno: «omitido con motivo» se informa aparte, nunca se
 *  pliega sobre «limpio». */
const DIFERIDOS = {
  'src/hooks/useBudget.js': { n: 2, motivo: 'EXPENSE_COLORS / PROGRAM_COLORS', ola: 3 },
  'src/components/Presupuesto/SpendingTypeBreakdown.jsx': { n: 1, motivo: 'serie construction', ola: 3 },
  'src/components/Presupuesto/GastoMap.jsx': { n: 1, motivo: 'pin DANA vs normal', ola: 3 },
  'src/components/LiveCity/layers/MoneyLayer.jsx': { n: 1, motivo: 'pin DANA vs normal', ola: 3 },
  'src/components/empleo/EmpleoMap.jsx': { n: 1, motivo: 'polígono de empleo', ola: 3 },
  'public/og.svg': { n: 2, motivo: 'la tarjeta se reescribe entera', ola: 2 },
}

function bloque(selector) {
  const m = CSS.match(new RegExp(selector + '\\s*\\{([\\s\\S]*?)\\n\\}', 'm'))
  if (!m) throw new Error(`no se encontró el bloque ${selector} en src/index.css`)
  return m[1]
}
function tokens(texto) {
  const out = {}
  for (const m of texto.matchAll(/--([\w-]+):\s*([^;]+);/g)) out['--' + m[1]] = m[2].trim()
  return out
}
const CLARO = tokens(bloque(':root'))
const OSCURO = tokens(bloque('html\\.dark'))

/** Alfa de un token de tinta. Un hex opaco es 1. */
function alfa(valor) {
  return valor.startsWith('#') ? 1 : parseRgba(valor).a
}
/** Los tiers que pintan TEXTO, derivados del valor: por debajo de .5 un token
 *  de tinta es borde o wash, no texto. No hay lista escrita a mano. */
function tiersDeTexto(t) {
  return Object.entries(t)
    .filter(([k]) => /^--ink\d*$/.test(k))
    .map(([k, v]) => [k, alfa(v)])
    .filter(([, a]) => a >= 0.5)
    .sort((x, y) => y[1] - x[1])
}

const EXT = new Set(['.js', '.jsx', '.ts', '.tsx', '.css', '.html', '.svg'])
function ficheros(dir, acc = []) {
  for (const e of readdirSync(dir)) {
    if (e === 'node_modules' || e === 'dist' || e.startsWith('.')) continue
    const p = join(dir, e)
    if (statSync(p).isDirectory()) ficheros(p, acc)
    else if (EXT.has(p.slice(p.lastIndexOf('.')))) acc.push(p)
  }
  return acc
}
const ESCANEADOS = [
  ...ficheros(join(ROOT, 'src')),
  ...ficheros(join(ROOT, 'public')),
  join(ROOT, 'index.html'),
].filter((p) => !p.endsWith(join('src', 'lib', 'party-colors.js')))

/** Todas las formas en que este repo escribe un color: `#rrggbb` y `rgba(r,g,b,…)`. */
function patronesDe(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))
  return [
    new RegExp(hex.replace('#', '#'), 'gi'),
    new RegExp(`rgba?\\(\\s*${r}\\s*,\\s*${g}\\s*,\\s*${b}\\s*[,)]`, 'gi'),
  ]
}

const hallazgos = []
let hexCandidatos = 0
for (const p of ESCANEADOS) {
  const txt = readFileSync(p, 'utf8')
  hexCandidatos += (txt.match(/#[0-9a-f]{6}\b/gi) || []).length
  const rel = relative(ROOT, p).split(sep).join('/')
  for (const [partido, hex] of Object.entries(PARTY_COLORS)) {
    const n = patronesDe(hex).reduce((s, re) => s + (txt.match(re) || []).length, 0)
    if (n) hallazgos.push({ rel, partido, hex, n })
  }
}

describe('el color de marca no es el de ningún partido', () => {
  it('1 · ningún hex de PARTY_COLORS vive fuera de party-colors.js', () => {
    // Importa el enum: añadir un partido extiende este guard solo. Copiarlo a
    // mano es el defecto que dejó 298 contratos en `unknown` sin que un test
    // pudiera fallar.
    const noDiferidos = hallazgos.filter((h) => !DIFERIDOS[h.rel])
    expect(
      noDiferidos.map((h) => `${h.rel} — ${h.partido} ${h.hex} ×${h.n}`),
      'un hex de partido pinta cromo de marca',
    ).toEqual([])
  })

  it('2 · el conjunto diferido es exactamente el declarado', () => {
    // Falla en los DOS sentidos: si aparece un séptimo fichero, y si uno se
    // arregla sin darlo de baja. «Omitido con motivo» se informa, no se pliega.
    const real = Object.fromEntries(
      hallazgos.filter((h) => DIFERIDOS[h.rel]).map((h) => [h.rel, h.n]),
    )
    const esperado = Object.fromEntries(Object.entries(DIFERIDOS).map(([k, v]) => [k, v.n]))
    expect(real).toEqual(esperado)
  })
})

describe('la escala de tinta escala', () => {
  for (const [tema, t] of [
    ['claro', CLARO],
    ['oscuro', OSCURO],
  ]) {
    it(`3 · ${tema} declara exactamente tres tiers de texto`, () => {
      // Cinco tiers con tres valores indistinguibles no es una escala.
      expect(tiersDeTexto(t).map(([k]) => k)).toHaveLength(3)
    })

    it(`4 · ${tema} separa cada tier del siguiente al menos .10 de alfa`, () => {
      // .62 frente a .64 no puede satisfacer esto. Es la aserción que convierte
      // «la escala no escala» en una puerta y no en una frase.
      const a = tiersDeTexto(t).map(([, x]) => x)
      const saltos = a.slice(1).map((x, i) => +(a[i] - x).toFixed(4))
      expect(Math.min(...saltos), `saltos: ${saltos.join(' · ')}`).toBeGreaterThanOrEqual(0.1)
    })
  }
})

describe('todo lo que pinta texto cumple AA', () => {
  const SUPERFICIES = { claro: ['--paper', '--surf', '--soft'], oscuro: ['--paper', '--surf', '--soft'] }
  for (const [tema, t, base] of [
    ['claro', CLARO, CLARO],
    ['oscuro', { ...CLARO, ...OSCURO }, { ...CLARO, ...OSCURO }],
  ]) {
    it(`5 · ${tema}: cada tier de tinta y cada par civic llega a 4,5:1`, () => {
      // Se COMPUTA desde lo analizado. Una tabla de ratios escrita a mano
      // envejece en silencio en cuanto alguien toca un token.
      const fallos = []

      // Un token que falta se informa por su nombre. Si se dejara reventar,
      // el fallo sería un stack de parseRgba y no diría cuál falta.
      const PARES = [
        ['--civic', '--paper'],
        ['--civic-ink', '--civic-soft'],
        ['--civic-on', '--civic'],
      ]
      for (const k of [...new Set(PARES.flat())]) {
        if (!t[k] && !base[k]) fallos.push(`${tema}: falta el token ${k}`)
      }

      for (const sup of SUPERFICIES[tema]) {
        const bg = base[sup]
        for (const [k] of tiersDeTexto(t)) {
          const r = contrastRatioOver(t[k], bg)
          if (r < 4.5) fallos.push(`${tema} ${k} sobre ${sup} (${bg}): ${r.toFixed(2)}:1`)
        }
      }
      for (const [fg, bg] of PARES) {
        if (!t[fg] || !(t[bg] ?? base[bg])) continue // ya informado arriba
        const r = contrastRatioOver(t[fg], t[bg] ?? base[bg])
        if (r < 4.5) fallos.push(`${tema} ${fg} sobre ${bg}: ${r.toFixed(2)}:1`)
      }
      expect(fallos).toEqual([])
    })
  }
})

describe('el guard demuestra que miró', () => {
  it('6 · el análisis encontró tokens, ficheros y hexes de verdad', () => {
    // Sin esto, una regex que no case con nada imprime su propio visto bueno.
    // Es la forma `r?.findings ?? []` que ya dejó pasar dos comprobaciones aquí.
    expect(Object.keys(CLARO).length, 'tokens en :root').toBeGreaterThan(8)
    expect(Object.keys(OSCURO).length, 'tokens en html.dark').toBeGreaterThan(8)
    expect(ESCANEADOS.length, 'ficheros escaneados').toBeGreaterThan(50)
    expect(hexCandidatos, 'hexes candidatos leídos').toBeGreaterThan(20)
    expect(Object.keys(PARTY_COLORS).length, 'partidos importados').toBeGreaterThan(3)
  })
})
```

- [ ] **Step 2: Run it and confirm the RIGHT assertions fail**

```bash
npx vitest run tests/brand-tokens.test.js
```

Expected: **assertions 1, 3 (×2), 4 (×2) and 5 (×2) FAIL. Assertions 2 and 6 PASS.**

Check each failure says the right thing:

- **1** lists `src/index.css — PP #2463EB` along with the landing and map files.
- **3** reports 6 tiers, not 3 (`--ink` plus the five rgba ones at α ≥ .5).
- **4** prints gaps including `0.02`.
- **5** fails with exactly `falta el token --civic-on`, in both themes, and **nothing else**. Every pair that exists today already clears 4.5:1 — light `--civic` is 5.17, dark 5.46 — so a contrast failure here means the parser is misreading a token, not that the palette is broken.
- **6** must pass. If it fails, the parser is broken; fix that before anything else, because every other green would be worthless.

- [ ] **Step 3: Commit the red**

```bash
git add tests/brand-tokens.test.js
git commit -m "test(marca): reproducir la colisión con el hex del PP y la escala plana (RED)

Analiza src/index.css e importa PARTY_COLORS en vez de repetirlos. Falla en 1
(el hex del PP pinta cromo), 3 (cinco tiers de texto, no tres) y 4 (saltos de
.02 entre tiers). La aserción 6 es la prueba de trabajo: sin ella una regex
rota imprimiría su propio visto bueno."
```

---

### Task 3: Retone the shared tokens

Turns assertion 5 green and removes `src/index.css` from assertion 1's list. Assertions 3 and 4 stay red until Task 4 — deleting the retired tiers now would blank 416 usage sites.

**Files:**
- Modify: `src/index.css:13-15` (civic light), `:38-47` (ink light), `:92-94` (civic dark), `:104-108` (ink dark)

**Interfaces:**
- Produces: `--civic-on`, a new token every later task may use

- [ ] **Step 1: Retone the light civic family**

Replace `src/index.css:13-15`:

```css
  --civic: #0e5b62;
  --civic-soft: #e6f2f2;
  --civic-ink: #0a4449;
  --civic-on: #ffffff;
```

- [ ] **Step 2: Raise `--ink70`, leave the retired tiers in place**

In the `:root` ink block, change only the `--ink70` line to `.78`:

```css
  --ink70: rgba(11, 15, 25, 0.78); /* secundario, cuerpo largo */
```

Leave `--ink80`, `--ink60` and `--ink40` exactly as they are. They still have 416 live references; Task 4 rewrites those and then deletes these.

Replace the long comment block above the ink scale (`src/index.css:29-37` and the `--ink70` note at `:39-43`) with:

```css
  /* Tres tiers de texto, y sólo tres. La producción llegó a tener cinco con
     cuatro valores dentro de trece centésimas —.82 / .73 / .64 / .62 / .60—, de
     modo que --ink60 y --ink50 eran el mismo gris. La fusión es POR VALOR: nadie
     se mueve más de cinco centésimas, así que retira sinónimos sin reestilizar
     nada. Reasignar por rol construiría una jerarquía que hoy no existe y es
     una pasada aparte.

     --ink50 no baja de .62: a .52 daría 3,84:1 y suspendería AA. La banda segura
     medida para estos tokens compartidos es .60–.82. La aspiración de .45/.30 del
     brandbook no se persigue aquí. Lo vigila tests/brand-tokens.test.js, que lee
     estos valores en vez de repetirlos. */
```

- [ ] **Step 3: Retone the dark civic family**

Replace `src/index.css:92-94`:

```css
  --civic: #4fb3bd;
  --civic-soft: #10333a;
  --civic-ink: #8ed8e0;
  --civic-on: #0b0f19;
```

`--civic-on` is the fix for a live AA failure: in dark, `--civic` with `color:#fff` measured **3.23:1** on `.cp-skip-link` (WCAG 2.4.1) and `::selection`. axe never saw it — the skip link sits at `left:-9999px` until focused, and `::selection` is not a node axe evaluates.

- [ ] **Step 4: Raise dark `--ink70`**

```css
  --ink70: rgba(241, 245, 249, 0.78);
```

- [ ] **Step 5: Point the two hardcoded white foregrounds at the new token**

`src/index.css:166` (inside `::selection`) and `src/index.css:683` (inside `.cp-skip-link`): change `color: white;` and `color: #fff;` to:

```css
  color: var(--civic-on);
```

- [ ] **Step 6: Run the guard**

```bash
npx vitest run tests/brand-tokens.test.js
```

Expected: assertion 1 no longer lists `src/index.css` (it still lists the landing and map files — Tasks 5 and 6). Assertion 5 PASSES for both themes. Assertions 3 and 4 still FAIL — correct, Task 4 owns them.

- [ ] **Step 7: Commit**

```bash
git add src/index.css
git commit -m "fix(marca): --civic sale del hexadecimal del PP

#2463eb era, hexadecimal a hexadecimal, PARTY_COLORS.PP. Pasa a petróleo
#0e5b62, que además sube el contraste sobre papel de 5,17:1 a 7,80:1.

Añade --civic-on, la tinta legible sobre una superficie civic sólida. En
oscuro ese par daba 3,23:1 sobre el enlace de salto al contenido y suspendía
AA; axe no podía verlo porque el enlace vive en left:-9999px hasta el foco."
```

---

### Task 4: Rewrite the ink usages, then delete the retired tiers

Order is the whole point. An undefined custom property invalidates the entire declaration, so a site reading a deleted `--ink60` falls back to its parent's colour — usually full `--ink`, the opposite of the de-emphasis intended. That is not hypothetical: it is what `--ink70` did across 28 components for months.

**Files:**
- Modify: ~90 files under `src/` (mechanical), then `src/index.css` (deletion)

- [ ] **Step 1: Record the before-counts**

```bash
for t in ink80 ink70 ink60 ink50 ink40; do
  printf "  --%s : %s\n" "$t" "$(grep -rn -- "--$t" src | wc -l | tr -d ' ')"
done
```

Write the output down. Expected: `ink80` 65, `ink70` 141, `ink60` 323, `ink50` 420, `ink40` 28.

- [ ] **Step 2: Rewrite the three retired tiers**

Targets `--inkNN` only, so the landing's JS object keys (`T.ink60`) are untouched — Task 5 owns those.

```bash
grep -rl -- '--ink80\|--ink60\|--ink40' src \
  | xargs sed -i '' -e 's/--ink80/--ink70/g' -e 's/--ink60/--ink50/g' -e 's/--ink40/--ink50/g'
```

- [ ] **Step 3: Prove the rewrite is total**

```bash
grep -rn -- '--ink80\|--ink60\|--ink40' src | grep -v 'index.css' | wc -l
```

Expected: `0`. Anything else means a file was missed; fix before continuing.

Then confirm the sums moved as predicted — `--ink70` should now be 65 + 141 = 206, and `--ink50` should be 420 + 323 + 28 = 771:

```bash
for t in ink70 ink50; do printf "  --%s : %s\n" "$t" "$(grep -rn -- "--$t" src | wc -l | tr -d ' ')"; done
```

- [ ] **Step 4: Delete the retired tokens**

Remove these three lines from `:root` and the matching three from `html.dark` in `src/index.css`:

```css
  --ink80: rgba(11, 15, 25, 0.82);
  --ink60: rgba(11, 15, 25, 0.64);
  --ink40: rgba(11, 15, 25, 0.6);
```

```css
  --ink80: rgba(241, 245, 249, 0.88);
  --ink60: rgba(241, 245, 249, 0.72);
  --ink40: rgba(241, 245, 249, 0.58);
```

- [ ] **Step 5: Run the whole suite**

```bash
npx vitest run tests/brand-tokens.test.js && npm test && npm run typecheck && npm run lint
```

Expected: assertions 3 and 4 now PASS for both themes. Assertion 1 still lists the landing and map files. The full unit suite stays green.

- [ ] **Step 6: Commit**

```bash
git add src/index.css src
git commit -m "refactor(tinta): cinco tiers de texto a tres, fusionando por valor

--ink80→--ink70, --ink60 y --ink40→--ink50. Ningún sitio se mueve más de
cinco centésimas de alfa: retira sinónimos sin reestilizar nada. Los 323 usos
de --ink60 ya se renderizaban como tono meta, porque .64 y .62 son el mismo
gris — ese era el defecto.

Las llamadas se reescriben ANTES de borrar los tokens: una custom property sin
definir invalida la declaración entera y el sitio hereda el color del padre,
que es lo que --ink70 hizo en 28 componentes durante meses."
```

---

### Task 5: The landing palette

The landing owns a separate warm-paper palette and deliberately does not follow dark mode. Only the blue moves, plus its parallel ink pair.

**Files:**
- Modify: `src/variants/direction-d/tokens.jsx:13-19`, `SectionHeader.jsx:40`, `blocks/Masthead.jsx:130`, `blocks/FeedBlocks.jsx:205`

- [ ] **Step 1: Retone the palette and align its ink pair**

`src/variants/direction-d/tokens.jsx` — replace lines 13-16 and 19:

```js
  ink80: 'rgba(11,15,25,.78)',
  ink60: 'rgba(11,15,25,.62)',
  ink50: 'rgba(11,15,25,.62)',
  ink40: 'rgba(11,15,25,.62)',
```

```js
  civic: '#0E5B62',
```

The four keys stay (54 call sites across the landing reference them by name; renaming is churn this task does not need) but they now carry only the two surviving values. `#0E5B62` on the warm paper `#FAF8F2` measures 7.35:1, so `tests/lib/contrast.test.js:72` stays green.

- [ ] **Step 2: Retone the promesas section tone**

`src/variants/direction-d/SectionHeader.jsx:40`:

```js
  promesas: { bar: '#0E5B62', wash: 'rgba(14,91,98,.08)', ink: '#0A4449' },
```

`tests/lib/contrast.test.js:76-84` measures each tone's ink against its **own wash**, not the paper. `#0A4449` over `rgba(14,91,98,.08)` on warm paper measures 9.00:1.

- [ ] **Step 3: Retone the masthead shadow and the survey chip**

`src/variants/direction-d/blocks/Masthead.jsx:130`:

```js
          boxShadow: '0 2px 6px rgba(14,91,98,.25)',
```

`src/variants/direction-d/blocks/FeedBlocks.jsx:205`:

```js
              background: it.kind === 'survey' ? 'rgba(14,91,98,.12)' : 'rgba(22,163,74,.12)',
```

- [ ] **Step 4: Run**

```bash
npx vitest run tests/brand-tokens.test.js tests/lib/contrast.test.js && npm run lint
```

Expected: assertion 1's list is now down to the map files and `index.html`. Both landing contrast blocks stay green.

- [ ] **Step 5: Commit**

```bash
git add src/variants/direction-d
git commit -m "fix(portada): la paleta del aterrizaje sale del hex del PP

Conserva su papel cálido y su regla de no seguir el modo oscuro; sólo cambia
el azul. Petróleo sobre #FAF8F2 da 7,35:1, y el tono de sección de promesas
9,00:1 contra su propio wash. Su par de tinta paralelo se alinea con la escala
compartida."
```

---

### Task 6: Map surfaces, the suggestion box, and the browser chrome

Turns assertion 1 fully green — the guard goes green in its entirety here.

**Files:**
- Modify: 8 files under `src/components/LiveCity/`, `src/components/QuejasHeatmap.jsx`, `src/pages/Promesas.jsx`, `index.html`

- [ ] **Step 1: Replace every remaining brand blue with the token**

These components already read CSS variables, so they take `var(--civic)` rather than a new literal. Exact sites:

| File | Line | Now | Becomes |
| ---- | ---- | --- | ------- |
| `LiveCity/controls/LayerControl.jsx` | 54 | `` `1px solid ${on ? '#2463EB' : '#C9C3B4'}` `` | `` `1px solid ${on ? 'var(--civic)' : '#C9C3B4'}` `` |
| `LiveCity/controls/LayerControl.jsx` | 55 | `on ? '#2463EB' : 'transparent'` | `on ? 'var(--civic)' : 'transparent'` |
| `LiveCity/controls/MoneyTimeSlider.jsx` | 106 | `` `1px solid ${obrasOnly ? '#2463EB' : '#C9C3B4'}` `` | `` `1px solid ${obrasOnly ? 'var(--civic)' : '#C9C3B4'}` `` |
| `LiveCity/controls/MoneyTimeSlider.jsx` | 107 | `obrasOnly ? 'rgba(36,99,235,.14)' : 'transparent'` | `obrasOnly ? 'rgba(14,91,98,.14)' : 'transparent'` |
| `LiveCity/controls/MoneyTimeSlider.jsx` | 157 | `accentColor: '#2463EB'` | `accentColor: 'var(--civic)'` |
| `LiveCity/layers/QuejasLayer.jsx` | 61 | `color: '#2463EB'` | `color: 'var(--civic)'` |
| `LiveCity/network/FullNetwork.jsx` | 108 | `color: '#2463EB'` | `color: 'var(--civic)'` |
| `LiveCity/popups/PlacePopup.jsx` | 49 | `color: '#2463EB'` | `color: 'var(--civic)'` |
| `LiveCity/popups/GtfsSchedulePopup.jsx` | 50, 128 | `color: '#2463EB'` | `color: 'var(--civic)'` |
| `LiveCity/popups/StationSchedulePopup.jsx` | 137, 189, 256, 291 | `color: '#2463EB'` | `color: 'var(--civic)'` |
| `LiveCity/popups/NeighborhoodPopup.jsx` | 78 | `color: '#2463EB'` | `color: 'var(--civic)'` |
| `components/QuejasHeatmap.jsx` | 99 | `color: '#2463EB'` | `color: 'var(--civic)'` |

- [ ] **Step 2: Retone the suggestion box — the retone only**

`src/pages/Promesas.jsx:264-265`:

```js
            background: 'rgba(14, 91, 98, 0.05)',
            border: '1px dashed rgba(14, 91, 98, 0.35)',
```

This block is `showSuggestion` — a machine proposal about a promise, on the page that attributes promises to parties, drawn until now in the Partido Popular's exact hex. Per brandbook §06b it should be `--intel` with a declared confidence, radius 12 and 11px type. **Do not do that here.** It is Wave 2's `MachineProposal` component, and a token change is not where it belongs.

- [ ] **Step 3: Retone the browser chrome**

`index.html:10`:

```html
    <meta name="theme-color" content="#0E5B62" />
```

- [ ] **Step 4: Run the guard — this is where it goes green**

```bash
npx vitest run tests/brand-tokens.test.js
```

Expected: **all six assertions PASS.** Assertion 2 confirms the deferred set is exactly the six declared files.

Then confirm by hand that nothing but the deferred set survives:

```bash
grep -rniE "#2463eb|rgba\(36, ?99, ?235" src public index.html | grep -v party-colors.js
```

Expected: exactly 8 lines, all in the six deferred files.

- [ ] **Step 5: Full suite**

```bash
npm test && npm run typecheck && npm run lint
```

- [ ] **Step 6: Commit**

```bash
git add src/components src/pages/Promesas.jsx index.html
git commit -m "fix(mapa,promesas): el último cromo en el hex del PP pasa al token

Deja el repo sin un solo hexadecimal de partido fuera de party-colors.js,
salvo los seis sitios que codifican un dato y que el guard declara uno a uno.

Promesas.jsx recibe SÓLO el retono. Su caja de propuesta automática también
quiere --intel, cuerpo de 11 px y radio 12: eso es el componente de la ola 2 y
no se cuela en un cambio de tokens."
```

---

### Task 7: Verification

The guards prove no party hex survives and that every tier computes ≥ 4.5:1. Neither can prove the site still looks right, and 266 sites just changed hue.

**Files:** none — this task produces evidence, and a fix commit only if it finds something.

- [ ] **Step 1: The e2e gate**

```bash
npm run build && npm run test:e2e
```

Two specs matter most. `a11y.spec.ts:78-95` hides the Leaflet layer and asserts **> 20 nodes evaluated** on `/`, `/cargos` and `/presupuesto` — that is what covers the landing retone, and a zero there means the rule silently no-op'd. The strict pass covers `STRICT_ROUTES`.

Note the repo's standing flag caveat: `VITE_ENABLE_PERIODISTAS` and `VITE_ENABLE_EFICIENCIA` are set in CI but absent locally, so `/cargos`'s Biografía spec fails on a local full run. That is the flag, not this work.

- [ ] **Step 2: The browser pass**

```bash
npm run dev
```

CLAUDE.md: a front-end change is not done until it has been looked at in a browser. Open each of `/`, `/promesas`, `/presupuesto`, `/quejas`, `/empleo` in **light, dark and at 375px** — fifteen looks. For each, check that the petróleo reads as brand rather than as a semantic tone, that no element that used to be blue now disappears into a neighbouring colour, and that the landing's warm paper still looks deliberate against the new teal.

- [ ] **Step 3: The two things axe cannot see**

In dark mode, on any page:

1. Press `Tab` from the top of the document until the skip link appears. It must be legible — this is the pair that measured 3.23:1 before `--civic-on`.
2. Select a run of body text with the mouse. `::selection` uses the same pair.

- [ ] **Step 4: Record the result**

If everything holds, no commit is needed — the evidence is the point. If a look turns up a problem, fix it in its own commit naming the surface and what the eye caught that the suites could not.

- [ ] **Step 5: Report**

State plainly: which gates ran, which passed, what the fifteen looks showed, and what remains for Waves 2 and 3.

---

## Self-review

**Spec coverage.** §2.1 palette → Tasks 3, 5. §2.2 `--civic-on` → Task 3 steps 3, 5 and Task 7 step 3. §2.3 ink merge → Task 4. §2.4 dark mode → Task 3 (only `--civic`, `--civic-on` and the two tiers change; the other 24 tokens are already correct and are left alone). §2.5 non-partisanship → guard assertion 1. §3 guard, six assertions → Task 2. §4 sweep, 24 sites → Tasks 3, 5, 6, itemised to the line. §5 verification, three gates → Task 7. §6 risks → each mitigation lands in a step. §7 out of scope → stated in Task 6 step 2 where the temptation actually arises.

**Ordering.** The one hard dependency is Task 4 step 2 before step 4: usages rewritten before tokens deleted. Task 1 must precede Task 2 (the guard imports `flatten`). Tasks 5 and 6 are independent of each other and either order works.

**Type consistency.** `flatten`, `parseRgba` and `contrastRatioOver` are defined in Task 1 and used under those exact names in Tasks 1 and 2. `--civic-on` is created in Task 3 step 1 and consumed in step 5 and by guard assertion 5. `DIFERIDOS` keys are repo-relative POSIX paths, matching what `relative(ROOT, p)` produces after the `sep` join.

**Defect found and fixed during this review.** The first draft of guard assertion 5 called `contrastRatioOver(t['--civic-on'], …)` before Task 3 creates that token, so on a clean checkout it threw a `parseRgba` stack instead of failing cleanly — and the review's first instinct was to document that as an accepted quirk. A gate whose red is an opaque throw is a gate people learn to skim. Assertion 5 now checks token presence first and reports `falta el token --civic-on` by name, which is also what makes Task 2 step 2's expectations checkable line by line.

**Reader's escape hatch.** Task 4 rewrites ~90 files with `sed`. If step 3's count comes out wrong, `git checkout -- src` restores everything: no step before it has uncommitted work, because each task commits.
