# Capa de competencias — Plan de implementación (PR A)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publicar un mapa curado y firmado de qué concejal tiene la competencia delegada sobre cada servicio del panel, con un detector de deriva que se pone rojo en vez de reescribir la página.

**Architecture:** Un fichero curado (`public/data/competencias.json`) validado por un módulo puro (`src/scraper/competencias.ts`), registrado en el guardián de ficheros curados, y vigilado por `check:competencias`, que recoteja cada `cargo` contra el `officials.json` vivo con cuatro desenlaces. **Sin UI**: al terminar, el fichero existe, valida y está vigilado, y ninguna página lo pinta todavía.

**Tech Stack:** TypeScript (módulos puros en `src/scraper/`, CLIs `tsx` en `scripts/`), Vitest, JSON estático en `public/data/`.

**Spec:** `docs/superpowers/specs/2026-08-23-nombres-eficiencia-y-concesion-agua-design.md`

## Global Constraints

- **Nada automático escribe este fichero.** `competencias.json` es curado: se edita a mano en un PR, igual que `dedicaciones.json`. La única escritura programática permitida es la del CLI de réplica (Task 4).
- **La frontera es competencia, no culpa.** El esquema no tiene ningún campo donde quepa un juicio sobre una persona. Si al implementar aparece la tentación de añadir uno, es que la tarea está mal entendida.
- **`eficiencia-finding.ts` no se toca en este PR.**
- **La fuente de los `cargo` es `https://www.ribarroja.es/es/ayuntamiento/corporacion_municipal`**, que es de donde `scripts/scrape-officials.ts` los lee. El decreto de delegación es corroboración opcional, no la fuente de las cadenas.
- **Todo texto de cara al lector va en castellano**, como el resto de `src/scraper/`.
- Estilo: Prettier manda en formato, ESLint en corrección. `npm run typecheck` debe quedar limpio.
- **`git add --sparse` en vez de `git add`.** El worktree `eficiencia-legibilidad` tiene un `sparse-checkout` local (escrito el 23-08-2026, con patrones de otro repositorio: `/providers/claude/plugin/`) que hace que `git add` rechace cualquier ruta fuera de él. No está aplicado al working tree —los ficheros están todos— así que sólo estorba al indexar. Si ese fichero se ha limpiado (`git sparse-checkout disable`), `git add` a secas funciona igual y `--sparse` es inofensivo.

---

### Task 1: El esquema, su validador y la puerta de congelación

**Files:**

- Create: `src/scraper/competencias.ts`
- Create: `tests/parse-competencias.test.ts`

**Interfaces:**

- Consumes: nada de tareas anteriores.
- Produces:
  - `export const CONFIANZAS: readonly ['literal','editorial']`
  - `export type Confianza = 'literal' | 'editorial'`
  - `export interface Asignacion { clave: string; cargo: string; oficial: string; nombre: string; partido: string; confianza: Confianza; razon?: string; firmadoEl: string }`
  - `export interface SinAsignar { clave: string; motivo: string }`
  - `export interface CompetenciasSnapshot { generatedAt: string; mandato: { id: string; desde: string; hasta: string | null }; fuente: { titulo: string; url: string; consultadaEl: string; decreto?: { titulo: string; url: string; expediente: string; fecha: string; cita: string } }; asignaciones: Asignacion[]; sinAsignar: SinAsignar[]; replicas: Replica[] }`
  - `export interface Replica { oficial: string; recibidaEl: string; texto: string; url?: string }`
  - `export function validarCompetencias(raw: unknown): CompetenciasSnapshot`
  - `export function nombresVisibles(frozenUntil: string | null, hoy: string): boolean`
  - `export function vigenteEn(mandato: { desde: string; hasta: string | null }, fecha: string): boolean`

- [ ] **Step 1: Escribir el test que falla**

Crear `tests/parse-competencias.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { validarCompetencias, nombresVisibles, vigenteEn } from '../src/scraper/competencias'

/**
 * El fichero publicado se valida en su propio test (Task 2). Aquí van las
 * inyecciones de fallo sobre objetos mínimos: lo que este módulo tiene que
 * NEGARSE a publicar.
 */
const base = () => ({
  generatedAt: '2026-08-23T00:00:00.000Z',
  mandato: { id: '2023-2027', desde: '2023-06-17', hasta: null },
  fuente: {
    titulo: 'Corporación municipal · Ayuntamiento de Riba-roja de Túria',
    url: 'https://www.ribarroja.es/es/ayuntamiento/corporacion_municipal',
    consultadaEl: '2026-08-23',
  },
  asignaciones: [
    {
      clave: 'a164-coste-unitario',
      cargo: 'Áreas Industriales y Cementerio',
      oficial: 'teresa-pozuelo-martin',
      nombre: 'Teresa Pozuelo Martín',
      partido: 'PSOE',
      confianza: 'literal',
      firmadoEl: '2026-08-23',
    },
  ],
  sinAsignar: [],
  replicas: [],
})

describe('competencias — el esquema válido pasa', () => {
  it('mide algo: valida un snapshot con al menos una asignación', () => {
    const v = validarCompetencias(base())
    expect(v.asignaciones.length).toBe(1)
    expect(v.asignaciones[0].confianza).toBe('literal')
  })
})

describe('competencias — inyecciones de fallo', () => {
  it('una asignación editorial sin razón no publica', () => {
    const c = base()
    c.asignaciones[0].confianza = 'editorial'
    expect(() => validarCompetencias(c)).toThrow(/razon/)
  })

  it('una razón de dos palabras no publica: tiene que explicar el salto', () => {
    const c = base()
    c.asignaciones[0].confianza = 'editorial'
    c.asignaciones[0].razon = 'es suyo'
    expect(() => validarCompetencias(c)).toThrow(/razon/)
  })

  it('una clave repetida entre asignaciones y sinAsignar no publica', () => {
    const c = base()
    c.sinAsignar.push({ clave: 'a164-coste-unitario', motivo: 'ninguna área lo nombra' })
    expect(() => validarCompetencias(c)).toThrow(/duplicada/)
  })

  it('un campo del esquema de pleno no publica: alguien copió una fila', () => {
    const c = base() as Record<string, unknown>
    ;(c.asignaciones as Record<string, unknown>[])[0].severity = 'critical'
    expect(() => validarCompetencias(c)).toThrow(/campo prohibido/)
  })

  it('un campo de juicio no publica: aquí no se valora a nadie', () => {
    const c = base() as Record<string, unknown>
    ;(c.asignaciones as Record<string, unknown>[])[0].responsable = true
    expect(() => validarCompetencias(c)).toThrow(/campo prohibido/)
  })

  it('un motivo vacío en sinAsignar no publica: un hueco se explica', () => {
    const c = base()
    c.sinAsignar.push({ clave: 'a4411-440p-coste-unitario', motivo: '' })
    expect(() => validarCompetencias(c)).toThrow(/motivo/)
  })
})

describe('competencias — congelación LOREG', () => {
  it('sin congelación, los nombres se ven', () => {
    expect(nombresVisibles(null, '2026-08-23')).toBe(true)
  })

  it('dentro de la ventana, los nombres se ocultan', () => {
    expect(nombresVisibles('2026-09-30', '2026-08-23')).toBe(false)
  })

  it('el mismo día del límite sigue congelado: la ventana incluye su último día', () => {
    expect(nombresVisibles('2026-08-23', '2026-08-23')).toBe(false)
  })

  it('pasada la fecha, vuelven', () => {
    expect(nombresVisibles('2026-08-22', '2026-08-23')).toBe(true)
  })
})

describe('competencias — vigencia del mandato', () => {
  const m = { desde: '2023-06-17', hasta: null as string | null }

  it('un hecho posterior al inicio queda dentro', () => {
    expect(vigenteEn(m, '2024-12-31')).toBe(true)
  })

  it('la entrega de 2020 queda fuera: era otra corporación', () => {
    expect(vigenteEn(m, '2020-11-01')).toBe(false)
  })

  it('con el mandato ya cerrado, lo posterior queda fuera', () => {
    expect(vigenteEn({ desde: '2019-06-15', hasta: '2023-06-16' }, '2024-01-01')).toBe(false)
  })
})
```

- [ ] **Step 2: Ejecutar el test y comprobar que falla**

Run: `npx vitest run tests/parse-competencias.test.ts`
Expected: FAIL — `Failed to resolve import "../src/scraper/competencias"`.

- [ ] **Step 3: Escribir el módulo**

Crear `src/scraper/competencias.ts`:

```ts
/**
 * Quién responde de cada servicio del panel — el validador.
 *
 * `public/data/competencias.json` es un fichero curado A MANO, de la misma
 * clase que `dedicaciones.json`: lo escribe una persona, se revisa en el PR y
 * jamás lo toca la automatización. Este módulo no lo escribe; sólo se niega a
 * publicarlo mal formado.
 *
 * ## Por qué esto se congela en vez de derivarse
 *
 * `officials.json` se raspa cada noche desde la web del ayuntamiento
 * (`nightly-scrape.yml` → `scrape:officials`). Si la página dedujera el nombre
 * en tiempo de render a partir de ese fichero, un raspado nocturno podría
 * cambiar solo qué persona VIVA aparece junto a una cifra de coste en una
 * página publicada. Eso es «nada automático reescribe lo publicado» en su
 * versión más grave. Así que el mapa se congela y se firma, y el raspado se
 * degrada a detector de deriva: `check:competencias` compara y se pone rojo.
 *
 * ## La frontera: competencia, no culpa
 *
 * Lo que se publica es «la competencia delegada sobre este servicio la tiene
 * X», que es una REPUBLICACIÓN de lo que el propio ayuntamiento publica en su
 * portal. Es orientación cívica: a quién se pregunta por esto. No es «X es
 * responsable del sobrecoste», que es una afirmación que la fuente no
 * respalda.
 *
 * Esa frontera está encodada, no sólo documentada: **el esquema no tiene
 * ningún campo donde quepa un juicio**, y el validador rechaza tanto los
 * campos del esquema de pleno (por si alguien copia una fila) como cualquier
 * campo con forma de valoración. La prosa acusatoria no tiene dónde vivir en
 * los datos.
 *
 * ## `confianza` es lo que hace honesta la tabla
 *
 * `literal` es cuando el cargo nombra el servicio con sus propias palabras
 * —«Áreas Industriales y Cementerio» → cementerio—. `editorial` es cuando el
 * enlace lo ponemos nosotros —«Servicios públicos municipales» → recogida de
 * residuos—. Son dos cosas distintas y el lector tiene derecho a distinguirlas,
 * así que una asignación editorial no publica sin su `razon`.
 */

/** Cómo de directo es el salto del cargo al servicio. */
export const CONFIANZAS = ['literal', 'editorial'] as const
export type Confianza = (typeof CONFIANZAS)[number]

/**
 * Campos que no pueden aparecer en ninguna profundidad.
 *
 * Los cuatro primeros son del esquema de hallazgos de pleno: si aparecen, es
 * que alguien copió una fila de allí y trae consigo una afirmación sobre lo
 * que alguien dijo. Los demás tienen forma de valoración, que es exactamente
 * lo que esta superficie no hace.
 */
const PROHIBIDOS = new Set([
  'severity',
  'quotes',
  'individualSpeaker',
  'speakerGroup',
  'responsable',
  'culpa',
  'valoracion',
  'puntuacion',
  'nota',
])

export interface DecretoCorroborante {
  titulo: string
  url: string
  expediente: string
  fecha: string
  /** Literal del decreto, para que la corroboración sea comprobable. */
  cita: string
}

export interface FuenteCompetencias {
  titulo: string
  /**
   * De donde salen LAS CADENAS de `cargo`: la misma página que raspa
   * `scrape-officials.ts`. Citar el decreto aquí mientras las cadenas vienen
   * de la web sería una mentira de procedencia.
   */
  url: string
  consultadaEl: string
  decreto?: DecretoCorroborante
}

export interface Asignacion {
  /** `id` de un indicador del panel: `a164-coste-unitario`, `licitador-unico`. */
  clave: string
  /** LITERAL de `portfolios` en officials.json. Es lo que recoteja el check. */
  cargo: string
  /** `slug` en officials.json. */
  oficial: string
  nombre: string
  partido: string
  confianza: Confianza
  /** Obligatoria y explicativa cuando `confianza === 'editorial'`. */
  razon?: string
  firmadoEl: string
}

/** Un servicio sin cargo identificable. Es contenido, no una lista de pendientes. */
export interface SinAsignar {
  clave: string
  motivo: string
}

/** Réplica de una persona nombrada. Se publica íntegra. */
export interface Replica {
  oficial: string
  recibidaEl: string
  texto: string
  url?: string
}

export interface CompetenciasSnapshot {
  generatedAt: string
  mandato: { id: string; desde: string; hasta: string | null }
  fuente: FuenteCompetencias
  asignaciones: Asignacion[]
  sinAsignar: SinAsignar[]
  replicas: Replica[]
}

const esTexto = (v: unknown, min = 1): v is string =>
  typeof v === 'string' && v.trim().length >= min

const esFecha = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)

/** Recorre el objeto entero buscando claves prohibidas, a cualquier profundidad. */
function buscarProhibidos(valor: unknown, ruta: string, halladas: string[]): void {
  if (Array.isArray(valor)) {
    valor.forEach((v, i) => buscarProhibidos(v, `${ruta}[${i}]`, halladas))
    return
  }
  if (!valor || typeof valor !== 'object') return
  for (const [k, v] of Object.entries(valor as Record<string, unknown>)) {
    if (PROHIBIDOS.has(k)) halladas.push(`${ruta}.${k}`)
    buscarProhibidos(v, `${ruta}.${k}`, halladas)
  }
}

export function validarCompetencias(raw: unknown): CompetenciasSnapshot {
  const errores: string[] = []
  const r = raw as Record<string, unknown>
  if (!r || typeof r !== 'object') throw new Error('competencias: el snapshot no es un objeto')

  const prohibidos: string[] = []
  buscarProhibidos(r, '$', prohibidos)
  for (const p of prohibidos) errores.push(`campo prohibido en ${p}`)

  if (typeof r.generatedAt !== 'string') errores.push('generatedAt debe ser una fecha ISO')

  const m = r.mandato as Record<string, unknown> | undefined
  if (!m || !esTexto(m.id)) errores.push('mandato.id vacío')
  else {
    if (!esFecha(m.desde)) errores.push('mandato.desde debe ser YYYY-MM-DD')
    if (m.hasta !== null && !esFecha(m.hasta)) errores.push('mandato.hasta debe ser fecha o null')
  }

  const f = r.fuente as Record<string, unknown> | undefined
  if (!f || !esTexto(f.titulo)) errores.push('fuente.titulo vacío')
  else {
    if (!esTexto(f.url) || !/^https?:\/\//.test(f.url as string))
      errores.push('fuente.url debe ser absoluta')
    if (!esFecha(f.consultadaEl)) errores.push('fuente.consultadaEl debe ser YYYY-MM-DD')
  }

  const claves = new Set<string>()
  const asignaciones = Array.isArray(r.asignaciones) ? (r.asignaciones as unknown[]) : null
  if (!asignaciones) errores.push('asignaciones debe ser un array')
  else {
    asignaciones.forEach((a, i) => {
      const x = a as Record<string, unknown>
      const donde = `asignaciones[${i}]`
      for (const campo of ['clave', 'cargo', 'oficial', 'nombre', 'partido'] as const) {
        if (!esTexto(x[campo])) errores.push(`${donde}.${campo} vacío`)
      }
      if (!CONFIANZAS.includes(x.confianza as Confianza))
        errores.push(`${donde}.confianza fuera del enum`)
      if (x.confianza === 'editorial' && !esTexto(x.razon, 20))
        errores.push(`${donde}.razon: una asignación editorial explica el salto (≥20 caracteres)`)
      if (!esFecha(x.firmadoEl)) errores.push(`${donde}.firmadoEl debe ser YYYY-MM-DD`)
      if (esTexto(x.clave)) {
        if (claves.has(x.clave as string)) errores.push(`clave duplicada: ${x.clave}`)
        claves.add(x.clave as string)
      }
    })
  }

  const sinAsignar = Array.isArray(r.sinAsignar) ? (r.sinAsignar as unknown[]) : null
  if (!sinAsignar) errores.push('sinAsignar debe ser un array')
  else {
    sinAsignar.forEach((s, i) => {
      const x = s as Record<string, unknown>
      if (!esTexto(x.clave)) errores.push(`sinAsignar[${i}].clave vacía`)
      if (!esTexto(x.motivo, 10))
        errores.push(`sinAsignar[${i}].motivo: un hueco se explica (≥10 caracteres)`)
      if (esTexto(x.clave)) {
        if (claves.has(x.clave as string)) errores.push(`clave duplicada: ${x.clave}`)
        claves.add(x.clave as string)
      }
    })
  }

  const replicas = Array.isArray(r.replicas) ? (r.replicas as unknown[]) : null
  if (!replicas) errores.push('replicas debe ser un array')
  else {
    replicas.forEach((p, i) => {
      const x = p as Record<string, unknown>
      if (!esTexto(x.oficial)) errores.push(`replicas[${i}].oficial vacío`)
      if (!esFecha(x.recibidaEl)) errores.push(`replicas[${i}].recibidaEl debe ser YYYY-MM-DD`)
      if (!esTexto(x.texto, 20)) errores.push(`replicas[${i}].texto vacío`)
    })
  }

  if (errores.length) throw new Error(`competencias inválido:\n  - ${errores.join('\n  - ')}`)
  return r as unknown as CompetenciasSnapshot
}

/**
 * ¿Se pueden pintar los nombres hoy?
 *
 * Durante la ventana electoral de la LOREG la capa de nombres desaparece de
 * las dos superficies, con el mismo interruptor que ya pone `/promesas` en
 * sólo lectura (`npm run freeze:set`). La ventana INCLUYE su último día: un
 * `frozenUntil` de hoy sigue congelado hoy.
 *
 * Función pura para que la puerta se pueda probar sin montar una página.
 */
export function nombresVisibles(frozenUntil: string | null, hoy: string): boolean {
  if (!frozenUntil) return true
  return hoy > frozenUntil
}

/**
 * ¿Estaba vigente este mandato cuando pasó lo que se cuenta?
 *
 * Las series del panel van de 2014 a 2024 y atraviesan tres corporaciones. El
 * nombre de quien HOY tiene la competencia no se extiende hacia atrás: pintarlo
 * junto a la entrega de 2016 diría que respondía de ella, y es falso. La
 * entrega sin rendir de 2020 es el caso que más importa — nombrar a quien hoy
 * lleva hacienda por un incumplimiento de otra corporación sería nombrar por
 * eliminación, la trampa del centinela.
 *
 * Fechas ISO `YYYY-MM-DD`, que ordenan lexicográficamente. `hasta: null` es un
 * mandato en curso.
 */
export function vigenteEn(
  mandato: { desde: string; hasta: string | null },
  fecha: string,
): boolean {
  if (fecha < mandato.desde) return false
  return mandato.hasta === null || fecha <= mandato.hasta
}
```

- [ ] **Step 4: Ejecutar los tests y comprobar que pasan**

Run: `npx vitest run tests/parse-competencias.test.ts`
Expected: PASS, 14 tests (1 válido + 6 inyecciones + 4 congelación + 3 vigencia).

- [ ] **Step 5: Typecheck y lint**

Run: `npm run typecheck`
Expected: sin errores.
Run: `npx eslint src/scraper/competencias.ts tests/parse-competencias.test.ts`
Expected: sin errores.

- [ ] **Step 6: Commit**

```bash
git add --sparse src/scraper/competencias.ts tests/parse-competencias.test.ts
git commit -m "feat(competencias): esquema y validador de la competencia delegada

El mapa se congela y se firma porque officials.json se raspa cada noche: si
la página dedujera el nombre en render, un cron podría cambiar solo qué
persona viva aparece junto a una cifra publicada.

La frontera va encodada, no sólo documentada — no hay campo donde quepa un
juicio, y el validador rechaza los del esquema de pleno y cualquiera con
forma de valoración.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: El fichero publicado y su registro como curado

**Files:**

- Create: `public/data/competencias.json`
- Modify: `tests/parse-competencias.test.ts` (añadir el bloque del fichero publicado)
- Modify: `.claude/hooks/curated-paths.mjs` (añadir a `CURATED`)
- Modify: `docs/DATA_SOURCES.md` (fila nueva en la tabla de ficheros curados)

**Interfaces:**

- Consumes: `validarCompetencias` de Task 1.
- Produces: `public/data/competencias.json`, con `clave` = `id` de indicador, que Task 3 recoteja y PR B pinta.

- [ ] **Step 1: Escribir el fichero publicado**

Crear `public/data/competencias.json`. Las 23 filas salen de cruzar los `id` de `public/data/indicadores.json` con los `portfolios` de `public/data/officials.json`. **Cada `razon` se revisa en el PR**: son el juicio editorial de esta tarea.

```json
{
  "generatedAt": "2026-08-23T00:00:00.000Z",
  "mandato": { "id": "2023-2027", "desde": "2023-06-17", "hasta": null },
  "fuente": {
    "titulo": "Corporación municipal · Ayuntamiento de Riba-roja de Túria",
    "url": "https://www.ribarroja.es/es/ayuntamiento/corporacion_municipal",
    "consultadaEl": "2026-08-23"
  },
  "asignaciones": [
    {
      "clave": "a164-coste-unitario",
      "cargo": "Áreas Industriales y Cementerio",
      "oficial": "teresa-pozuelo-martin",
      "nombre": "Teresa Pozuelo Martín",
      "partido": "PSOE",
      "confianza": "literal",
      "firmadoEl": "2026-08-23"
    },
    {
      "clave": "b151-150p-coste-unitario",
      "cargo": "Urbanismo",
      "oficial": "teresa-pozuelo-martin",
      "nombre": "Teresa Pozuelo Martín",
      "partido": "PSOE",
      "confianza": "literal",
      "firmadoEl": "2026-08-23"
    },
    {
      "clave": "a1532-150p-coste-unitario",
      "cargo": "Obra Pública",
      "oficial": "teresa-pozuelo-martin",
      "nombre": "Teresa Pozuelo Martín",
      "partido": "PSOE",
      "confianza": "editorial",
      "razon": "El cargo no nombra la pavimentación; se le atribuye por ser el área de obra pública, que es donde el ayuntamiento tramita el firme viario.",
      "firmadoEl": "2026-08-23"
    },
    {
      "clave": "b132-130p-coste-unitario",
      "cargo": "Seguridad y emergencias",
      "oficial": "raquel-pamblanco-paredes",
      "nombre": "Raquel Pamblanco Paredes",
      "partido": "PSOE",
      "confianza": "literal",
      "firmadoEl": "2026-08-23"
    },
    {
      "clave": "a342-340p-coste-unitario",
      "cargo": "Movilidad y Deportes",
      "oficial": "rafael-gomez-sanchez",
      "nombre": "Rafael Gómez Sánchez",
      "partido": "PSOE",
      "confianza": "literal",
      "firmadoEl": "2026-08-23"
    },
    {
      "clave": "b341-340p-coste-unitario",
      "cargo": "Movilidad y Deportes",
      "oficial": "rafael-gomez-sanchez",
      "nombre": "Rafael Gómez Sánchez",
      "partido": "PSOE",
      "confianza": "literal",
      "firmadoEl": "2026-08-23"
    },
    {
      "clave": "a4411-440p-coste-unitario",
      "cargo": "Movilidad y Deportes",
      "oficial": "rafael-gomez-sanchez",
      "nombre": "Rafael Gómez Sánchez",
      "partido": "PSOE",
      "confianza": "literal",
      "firmadoEl": "2026-08-23"
    },
    {
      "clave": "a1621-coste-unitario",
      "cargo": "Servicios públicos municipales",
      "oficial": "rafael-gomez-sanchez",
      "nombre": "Rafael Gómez Sánchez",
      "partido": "PSOE",
      "confianza": "editorial",
      "razon": "El cargo no nombra la recogida de residuos; se le atribuye por ser el área de servicios públicos municipales, que es la que agrupa los servicios urbanos de prestación continua.",
      "firmadoEl": "2026-08-23"
    },
    {
      "clave": "a163-coste-unitario",
      "cargo": "Servicios públicos municipales",
      "oficial": "rafael-gomez-sanchez",
      "nombre": "Rafael Gómez Sánchez",
      "partido": "PSOE",
      "confianza": "editorial",
      "razon": "El cargo no nombra la limpieza viaria; se le atribuye por ser el área de servicios públicos municipales, que es la que agrupa los servicios urbanos de prestación continua.",
      "firmadoEl": "2026-08-23"
    },
    {
      "clave": "a171-170p-coste-unitario",
      "cargo": "Servicios públicos municipales",
      "oficial": "rafael-gomez-sanchez",
      "nombre": "Rafael Gómez Sánchez",
      "partido": "PSOE",
      "confianza": "editorial",
      "razon": "El cargo no nombra los parques y jardines; se le atribuye por ser el área de servicios públicos municipales, que es la que agrupa el mantenimiento urbano.",
      "firmadoEl": "2026-08-23"
    },
    {
      "clave": "a165-coste-unitario",
      "cargo": "Servicios públicos municipales",
      "oficial": "rafael-gomez-sanchez",
      "nombre": "Rafael Gómez Sánchez",
      "partido": "PSOE",
      "confianza": "editorial",
      "razon": "El cargo no nombra el alumbrado; se le atribuye por ser el área de servicios públicos municipales, que es la que agrupa el mantenimiento urbano.",
      "firmadoEl": "2026-08-23"
    },
    {
      "clave": "a161-coste-unitario",
      "cargo": "Servicios públicos municipales",
      "oficial": "rafael-gomez-sanchez",
      "nombre": "Rafael Gómez Sánchez",
      "partido": "PSOE",
      "confianza": "editorial",
      "razon": "El cargo no nombra el abastecimiento de agua; se le atribuye por ser el área de servicios públicos municipales. El servicio está en concesión, así que la prestación la ejecuta el concesionario.",
      "firmadoEl": "2026-08-23"
    },
    {
      "clave": "a160-coste-unitario",
      "cargo": "Servicios públicos municipales",
      "oficial": "rafael-gomez-sanchez",
      "nombre": "Rafael Gómez Sánchez",
      "partido": "PSOE",
      "confianza": "editorial",
      "razon": "El cargo no nombra el alcantarillado; se le atribuye por ser el área de servicios públicos municipales. El servicio está en concesión, así que la prestación la ejecuta el concesionario.",
      "firmadoEl": "2026-08-23"
    },
    {
      "clave": "b323-324-320p-coste-unitario",
      "cargo": "Educación",
      "oficial": "eva-lara-catala",
      "nombre": "Eva Lara Catalá",
      "partido": "PSOE",
      "confianza": "editorial",
      "razon": "La competencia de educación es suya, pero el coste de esta ficha es el de conservar los edificios escolares, y «Actividades y Edificios públicos» está delegada en otro concejal: el reparto real cruza dos áreas.",
      "firmadoEl": "2026-08-23"
    },
    {
      "clave": "a3321-330p-coste-unitario",
      "cargo": "Arte y Cultura",
      "oficial": "jose-manuel-vila-oltra",
      "nombre": "José Manuel Vila Oltra",
      "partido": "PSOE",
      "confianza": "editorial",
      "razon": "El cargo no nombra la biblioteca; se le atribuye por ser el área de cultura, que es donde el ayuntamiento sitúa el servicio bibliotecario.",
      "firmadoEl": "2026-08-23"
    },
    {
      "clave": "licitador-unico",
      "cargo": "Compra Pública",
      "oficial": "jose-angel-hernandez-carrizosa",
      "nombre": "José Ángel Hernández Carrizosa",
      "partido": "PSOE",
      "confianza": "literal",
      "firmadoEl": "2026-08-23"
    },
    {
      "clave": "sin-publicidad-abierta",
      "cargo": "Compra Pública",
      "oficial": "jose-angel-hernandez-carrizosa",
      "nombre": "José Ángel Hernández Carrizosa",
      "partido": "PSOE",
      "confianza": "literal",
      "firmadoEl": "2026-08-23"
    },
    {
      "clave": "concentracion-proveedores",
      "cargo": "Compra Pública",
      "oficial": "jose-angel-hernandez-carrizosa",
      "nombre": "José Ángel Hernández Carrizosa",
      "partido": "PSOE",
      "confianza": "literal",
      "firmadoEl": "2026-08-23"
    },
    {
      "clave": "periodo-medio-pago",
      "cargo": "Finanzas públicas y recaudación",
      "oficial": "jose-angel-hernandez-carrizosa",
      "nombre": "José Ángel Hernández Carrizosa",
      "partido": "PSOE",
      "confianza": "literal",
      "firmadoEl": "2026-08-23"
    },
    {
      "clave": "gasto-por-habitante",
      "cargo": "Finanzas públicas y recaudación",
      "oficial": "jose-angel-hernandez-carrizosa",
      "nombre": "José Ángel Hernández Carrizosa",
      "partido": "PSOE",
      "confianza": "literal",
      "firmadoEl": "2026-08-23"
    },
    {
      "clave": "modificaciones-presupuestarias",
      "cargo": "Finanzas públicas y recaudación",
      "oficial": "jose-angel-hernandez-carrizosa",
      "nombre": "José Ángel Hernández Carrizosa",
      "partido": "PSOE",
      "confianza": "literal",
      "firmadoEl": "2026-08-23"
    },
    {
      "clave": "ejecucion-presupuestaria",
      "cargo": "Finanzas públicas y recaudación",
      "oficial": "jose-angel-hernandez-carrizosa",
      "nombre": "José Ángel Hernández Carrizosa",
      "partido": "PSOE",
      "confianza": "literal",
      "firmadoEl": "2026-08-23"
    }
  ],
  "sinAsignar": [
    {
      "clave": "denominadores-sin-remedir",
      "motivo": "Es un indicador sobre la rendición al ministerio, no sobre un servicio. El coste efectivo lo rinde la entidad local en su conjunto y ninguna área delegada lo nombra; quién cumplimenta el formulario no consta en la fuente."
    }
  ],
  "replicas": []
}
```

- [ ] **Step 2: Añadir al test el bloque del fichero publicado**

Añadir al final de `tests/parse-competencias.test.ts`:

```ts
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const RUTA = join(__dirname, '..', 'public/data/competencias.json')
const publicado = JSON.parse(readFileSync(RUTA, 'utf8'))

describe('competencias — el fichero publicado', () => {
  it('mide algo: valida y trae asignaciones de verdad', () => {
    const v = validarCompetencias(publicado)
    expect(v.asignaciones.length).toBeGreaterThan(10)
  })

  it('cada oficial existe en officials.json y el cargo es literal suyo', () => {
    const of = JSON.parse(
      readFileSync(join(__dirname, '..', 'public/data/officials.json'), 'utf8'),
    ) as { officials: Array<{ slug: string; name: string; portfolios?: string[] }> }
    const porSlug = new Map(of.officials.map((o) => [o.slug, o]))
    for (const a of validarCompetencias(publicado).asignaciones) {
      const o = porSlug.get(a.oficial)
      expect(o, `oficial desconocido: ${a.oficial}`).toBeTruthy()
      expect(o!.name).toBe(a.nombre)
      expect(o!.portfolios ?? [], `cargo no literal: ${a.cargo}`).toContain(a.cargo)
    }
  })

  it('cada clave existe en el panel: una clave con errata no se pintaría nunca', () => {
    const ind = JSON.parse(
      readFileSync(join(__dirname, '..', 'public/data/indicadores.json'), 'utf8'),
    ) as { indicadores: Array<{ id: string }>; municipales: Array<{ id: string }> }
    const ids = new Set([...ind.indicadores.map((i) => i.id), ...ind.municipales.map((m) => m.id)])
    const v = validarCompetencias(publicado)
    for (const a of v.asignaciones)
      expect(ids.has(a.clave), `clave fuera del panel: ${a.clave}`).toBe(true)
    for (const s of v.sinAsignar)
      expect(ids.has(s.clave), `clave fuera del panel: ${s.clave}`).toBe(true)
  })

  it('todo indicador del panel está o asignado o explicado: no hay silencios', () => {
    const ind = JSON.parse(
      readFileSync(join(__dirname, '..', 'public/data/indicadores.json'), 'utf8'),
    ) as { indicadores: Array<{ id: string }>; municipales: Array<{ id: string }> }
    const v = validarCompetencias(publicado)
    const cubiertas = new Set([
      ...v.asignaciones.map((a) => a.clave),
      ...v.sinAsignar.map((s) => s.clave),
    ])
    const todas = [...ind.indicadores.map((i) => i.id), ...ind.municipales.map((m) => m.id)]
    const faltan = todas.filter((id) => !cubiertas.has(id))
    expect(faltan, `sin competencia ni explicación: ${faltan.join(', ')}`).toEqual([])
  })
})
```

- [ ] **Step 3: Ejecutar los tests**

Run: `npx vitest run tests/parse-competencias.test.ts`
Expected: PASS. Si el cuarto test falla nombrando indicadores, es que el panel tiene fichas que este fichero no cubre: añadirlas a `asignaciones` o a `sinAsignar` con su motivo. **No es un fallo del test.**

- [ ] **Step 4: Registrar el fichero como curado**

En `.claude/hooks/curated-paths.mjs`, dentro del objeto `CURATED`, junto a las otras entradas de eficiencia:

```js
  'competencias.json': 'curated + cited — hand-edit via PR, never programmatically',
```

- [ ] **Step 5: Añadirlo a `docs/DATA_SOURCES.md`**

En `docs/DATA_SOURCES.md`, en la tabla de ficheros curados, justo debajo de la fila de `eficiencia-preguntas.json`:

```markdown
| `competencias.json` | `src/scraper/competencias.ts` · curated · hand-edit via PR · `check:competencias` |
```

Y, en el párrafo que acompaña a esa tabla, una frase que explique por qué está congelado —«qué concejal tiene la competencia delegada sobre cada ficha del panel; se congela porque `officials.json` se raspa cada noche y un cron no puede cambiar qué persona aparece junto a una cifra publicada»— con la fuente `https://www.ribarroja.es/es/ayuntamiento/corporacion_municipal`.

Prettier realinea el ancho de las columnas; no hace falta cuadrarlas a mano.

- [ ] **Step 6: Comprobar que el guardián y su test de sincronía siguen verdes**

Run: `npx vitest run tests/guard-curated-writes.test.js`
Expected: PASS — ese test falla si `docs/DATA_SOURCES.md` lista un curado que la tabla del guardián no vigila, así que valida los pasos 4 y 5 a la vez.

- [ ] **Step 7: Commit**

```bash
git add --sparse public/data/competencias.json tests/parse-competencias.test.ts .claude/hooks/curated-paths.mjs docs/DATA_SOURCES.md
git commit -m "feat(competencias): publicar el mapa firmado de competencias delegadas

23 filas cruzando los id del panel con los portfolios que el ayuntamiento
publica. Las editoriales llevan su razón: el lector tiene derecho a saber
cuándo el salto del cargo al servicio lo ponemos nosotros.

denominadores-sin-remedir queda sin asignar a propósito: es un indicador
sobre la rendición al ministerio, y quién cumplimenta el formulario no
consta en la fuente. Nombrarlo por eliminación es la trampa del centinela.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: `check:competencias` — el detector de deriva

**Files:**

- Create: `scripts/check-competencias.ts`
- Modify: `package.json` (script `check:competencias`)

**Interfaces:**

- Consumes: `validarCompetencias`, `type CompetenciasSnapshot` de Task 1; `public/data/competencias.json` de Task 2.
- Produces: `npm run check:competencias`, con `--json`. Sale 1 en `desaparecido` u `oficial-inexistente`.

- [ ] **Step 1: Escribir el check**

Crear `scripts/check-competencias.ts`:

```ts
#!/usr/bin/env tsx
/**
 * check:competencias — ¿sigue el ayuntamiento diciendo lo que este mapa afirma?
 *
 *   npm run check:competencias
 *   npm run check:competencias -- --json
 *
 * `competencias.json` está congelado a propósito: `officials.json` se raspa
 * cada noche y derivar el nombre en render dejaría que un cron cambie qué
 * persona viva aparece junto a una cifra publicada. El precio de congelarlo es
 * que puede quedarse viejo, y eso es lo que esto vigila.
 *
 * Cuatro desenlaces, no dos, porque colapsar «no lo encontré» dentro de
 * «coincide» es el defecto que este repositorio ya pagó con `r?.findings ?? []`
 * — una comprobación que imprime su propio visto bueno sin haber comprobado
 * nada:
 *
 *   coincide            el cargo sigue literal en los portfolios de esa persona
 *   reformulado         está, con otra redacción. Aviso: la competencia no ha
 *                       cambiado de manos, pero alguien debe re-firmar
 *   desaparecido        esa persona ya no tiene ese cargo → sale 1
 *   oficial-inexistente el slug ya no está en officials.json → sale 1
 *
 * Anti-hueco: si recorre cero asignaciones sale 1. Un «todo en orden» sobre un
 * fichero vacío es exactamente el gate que no mide nada.
 */
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { validarCompetencias } from '../src/scraper/competencias'

const MAPA = resolve('public/data/competencias.json')
const OFICIALES = resolve('public/data/officials.json')
const PANEL = resolve('public/data/indicadores.json')

type Desenlace = 'coincide' | 'reformulado' | 'desaparecido' | 'oficial-inexistente'

interface Cotejo {
  clave: string
  oficial: string
  cargo: string
  desenlace: Desenlace
  detalle?: string
}

/** Minúsculas, sin acentos y con espacios colapsados: para detectar reformulación. */
function normaliza(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

function main(): void {
  const asJson = process.argv.includes('--json')
  for (const f of [MAPA, OFICIALES, PANEL]) {
    if (!existsSync(f)) {
      process.stderr.write(`[check-competencias] falta ${f}\n`)
      process.exit(1)
    }
  }

  const mapa = validarCompetencias(JSON.parse(readFileSync(MAPA, 'utf8')))
  const oficiales = JSON.parse(readFileSync(OFICIALES, 'utf8')) as {
    officials: Array<{ slug: string; name: string; portfolios?: string[] }>
  }
  const panel = JSON.parse(readFileSync(PANEL, 'utf8')) as {
    indicadores: Array<{ id: string }>
    municipales: Array<{ id: string }>
  }

  const porSlug = new Map(oficiales.officials.map((o) => [o.slug, o]))
  const cotejos: Cotejo[] = []

  for (const a of mapa.asignaciones) {
    const o = porSlug.get(a.oficial)
    if (!o) {
      cotejos.push({
        clave: a.clave,
        oficial: a.oficial,
        cargo: a.cargo,
        desenlace: 'oficial-inexistente',
        detalle: 'el slug ya no está en officials.json',
      })
      continue
    }
    const carteras = o.portfolios ?? []
    if (carteras.includes(a.cargo)) {
      cotejos.push({ clave: a.clave, oficial: a.oficial, cargo: a.cargo, desenlace: 'coincide' })
      continue
    }
    const parecido = carteras.find((c) => normaliza(c) === normaliza(a.cargo))
    cotejos.push({
      clave: a.clave,
      oficial: a.oficial,
      cargo: a.cargo,
      desenlace: parecido ? 'reformulado' : 'desaparecido',
      detalle: parecido
        ? `ahora se escribe «${parecido}»`
        : `sus áreas hoy son: ${carteras.join(' · ') || '(ninguna)'}`,
    })
  }

  // Una clave con errata no se pintaría nunca y nadie lo notaría.
  const ids = new Set([
    ...panel.indicadores.map((i) => i.id),
    ...panel.municipales.map((m) => m.id),
  ])
  const clavesHuerfanas = [...mapa.asignaciones, ...mapa.sinAsignar]
    .map((x) => x.clave)
    .filter((c) => !ids.has(c))

  const cuenta = (d: Desenlace) => cotejos.filter((c) => c.desenlace === d).length
  const resumen = {
    recorridas: cotejos.length,
    coincide: cuenta('coincide'),
    reformulado: cuenta('reformulado'),
    desaparecido: cuenta('desaparecido'),
    'oficial-inexistente': cuenta('oficial-inexistente'),
    clavesHuerfanas,
  }

  if (asJson) {
    process.stdout.write(JSON.stringify({ resumen, cotejos }, null, 2) + '\n')
  } else {
    process.stdout.write(`competencias · ${resumen.recorridas} asignaciones recorridas\n`)
    process.stdout.write(
      `  coincide ${resumen.coincide} · reformulado ${resumen.reformulado} · ` +
        `desaparecido ${resumen.desaparecido} · oficial-inexistente ${resumen['oficial-inexistente']}\n`,
    )
    for (const c of cotejos) {
      if (c.desenlace === 'coincide') continue
      process.stdout.write(
        `  [${c.desenlace}] ${c.clave} · ${c.oficial} · «${c.cargo}» — ${c.detalle}\n`,
      )
    }
    for (const c of clavesHuerfanas) process.stdout.write(`  [clave-huerfana] ${c}\n`)
  }

  if (resumen.recorridas === 0) {
    process.stderr.write(
      '[check-competencias] cero asignaciones recorridas: no ha comprobado nada\n',
    )
    process.exit(1)
  }
  const rojo = resumen.desaparecido + resumen['oficial-inexistente'] + clavesHuerfanas.length > 0
  process.exit(rojo ? 1 : 0)
}

main()
```

- [ ] **Step 2: Registrar el script**

En `package.json`, junto a `check:eficiencia-findings`:

```json
    "check:competencias": "npx tsx scripts/check-competencias.ts",
```

- [ ] **Step 3: Ejecutarlo contra los datos reales**

Run: `npm run check:competencias`
Expected: `competencias · 22 asignaciones recorridas`, `coincide 22` y el resto a cero, sin claves huérfanas, código de salida 0. (22 y no 23: `denominadores-sin-remedir` está en `sinAsignar`, que no se recoteja porque no afirma de nadie nada.)

- [ ] **Step 4: Comprobar que de verdad se pone rojo (inyección de fallo manual)**

```bash
node -e "const f='public/data/competencias.json';const d=require('./'+f);d.asignaciones[0].cargo='Cartera Inventada';require('fs').writeFileSync(f,JSON.stringify(d,null,2))"
npm run check:competencias; echo "salida: $?"
git checkout -- public/data/competencias.json
```

Expected: imprime `[desaparecido] a164-coste-unitario …` y `salida: 1`. Luego el `git checkout` deja el fichero como estaba.
**Este paso no es opcional**: un check que no se ha visto fallar nunca es un check que no se sabe si funciona.

- [ ] **Step 5: Commit**

```bash
git add --sparse scripts/check-competencias.ts package.json
git commit -m "feat(competencias): check:competencias, deriva con cuatro desenlaces

El mapa está congelado porque officials.json se raspa cada noche; el precio
de congelarlo es que envejece, y esto es lo que lo vigila. Distingue
reformulado de desaparecido porque no son la misma noticia, y sale 1 si
recorre cero asignaciones: un visto bueno sobre un fichero vacío es el gate
que no mide nada.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Réplica nominal — formulario e ingreso

**Files:**

- Create: `.github/ISSUE_TEMPLATE/competencia-response.yml`
- Create: `scripts/apply-competencia-response.ts`
- Modify: `package.json` (script `competencia-reply`)

**Interfaces:**

- Consumes: `validarCompetencias`, `type Replica` de Task 1.
- Produces: `npm run competencia-reply -- --oficial <slug> --fecha <YYYY-MM-DD> --texto <ruta> [--url <url>]`, que añade una `Replica` y reescribe el fichero revalidado.

- [ ] **Step 1: Escribir el formulario de Issue**

Crear `.github/ISSUE_TEMPLATE/competencia-response.yml`:

```yaml
name: Derecho de réplica — competencia delegada
description: Respuesta de un cargo municipal nombrado en /eficiencia, /gestion o el reportaje de coste efectivo como titular de una competencia delegada.
title: '[replica-competencia] <slug-del-cargo>'
labels: [derecho-replica, competencias]
body:
  - type: markdown
    attributes:
      value: |
        Estas páginas publican **quién tiene delegada la competencia** sobre cada servicio del panel, republicando lo que el propio Ayuntamiento publica en su portal de transparencia. Es orientación cívica —a quién se pregunta por esto—, **no** una afirmación de que la cifra que aparece al lado sea responsabilidad personal de nadie: un coste por efectivo de policía, por ejemplo, es un precio y no un rendimiento.

        Si el reparto de áreas ha cambiado, si la atribución es incorrecta, o si quieres explicar la cifra, éste es el canal. La respuesta se publica **íntegra y verbatim** junto a la ficha, sin resumir ni parafrasear.

        Plazo de revisión: 24 h hábiles. Resolución: 72 h. Historial público en git.

  - type: input
    id: oficial
    attributes:
      label: Identificador del cargo
      description: El `slug` que aparece en el enlace de la ficha (`/cargos/<slug>`).
      placeholder: rafael-gomez-sanchez
    validations:
      required: true

  - type: input
    id: nombre
    attributes:
      label: Nombre y apellidos
      description: Tal como figura en la corporación municipal.
      placeholder: Rafael Gómez Sánchez
    validations:
      required: true

  - type: dropdown
    id: motivo
    attributes:
      label: Qué quieres corregir o añadir
      options:
        - La atribución de la competencia es incorrecta
        - El reparto de áreas ha cambiado desde la última firma
        - La atribución es correcta y quiero explicar la cifra
        - Otro
    validations:
      required: true

  - type: textarea
    id: texto
    attributes:
      label: Texto literal de la réplica (verbatim, ≥20 caracteres)
      description: |
        Se publica exactamente como lo escribas, hasta 2.000 caracteres. Si la atribución es errónea, dilo aquí: además de publicar la réplica, la corregimos o la retiramos.
      placeholder: |
        "La competencia sobre servicios públicos municipales incluye la supervisión del contrato, no la ejecución material del servicio, que corresponde al concesionario."
    validations:
      required: true

  - type: input
    id: url
    attributes:
      label: URL de la fuente (opcional)
      description: Decreto de delegación, acuerdo de pleno o nota oficial que respalde la réplica. El enlace se publica junto al texto.
      placeholder: https://www.ribarroja.es/...

  - type: markdown
    attributes:
      value: |
        **Ingreso**: al etiquetar este issue como `derecho-replica`, la réplica se incorpora a `public/data/competencias.json` mediante `npm run competencia-reply`, que revalida el snapshot entero antes de escribir. El commit queda en el historial público de git.
```

- [ ] **Step 2: Escribir el CLI de ingreso**

Crear `scripts/apply-competencia-response.ts`:

```ts
#!/usr/bin/env tsx
/**
 * competencia-reply — publicar la réplica de una persona nombrada.
 *
 *   npm run competencia-reply -- --oficial rafael-gomez-sanchez \
 *     --fecha 2026-09-01 --texto /ruta/al/texto.txt [--url https://…]
 *
 * `competencias.json` es curado y no lo escribe la automatización; ésta es la
 * única excepción, y por eso pasa por aquí en vez de por una edición directa:
 * el CLI revalida el snapshot ENTERO antes de escribir, así que una réplica no
 * puede colar un fichero inválido.
 *
 * La réplica se publica íntegra y sin editar. Este script no la resume.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { validarCompetencias, type Replica } from '../src/scraper/competencias'

const MAPA = resolve('public/data/competencias.json')

function arg(nombre: string): string | undefined {
  const i = process.argv.indexOf(`--${nombre}`)
  return i >= 0 ? process.argv[i + 1] : undefined
}

function main(): void {
  const oficial = arg('oficial')
  const fecha = arg('fecha')
  const rutaTexto = arg('texto')
  const url = arg('url')

  if (!oficial || !fecha || !rutaTexto) {
    process.stderr.write(
      'uso: competencia-reply -- --oficial <slug> --fecha <YYYY-MM-DD> --texto <ruta> [--url <url>]\n',
    )
    process.exit(1)
  }
  if (!existsSync(rutaTexto)) {
    process.stderr.write(`[competencia-reply] no existe ${rutaTexto}\n`)
    process.exit(1)
  }

  const snapshot = validarCompetencias(JSON.parse(readFileSync(MAPA, 'utf8')))
  const conocido = snapshot.asignaciones.some((a) => a.oficial === oficial)
  if (!conocido) {
    process.stderr.write(
      `[competencia-reply] «${oficial}» no aparece en ninguna asignación: no hay nada que replicar\n`,
    )
    process.exit(1)
  }

  const replica: Replica = {
    oficial,
    recibidaEl: fecha,
    texto: readFileSync(rutaTexto, 'utf8').trim(),
    ...(url ? { url } : {}),
  }
  const siguiente = { ...snapshot, replicas: [...snapshot.replicas, replica] }
  validarCompetencias(siguiente)
  writeFileSync(MAPA, JSON.stringify(siguiente, null, 2) + '\n')
  process.stdout.write(
    `[competencia-reply] réplica de ${oficial} publicada · ${siguiente.replicas.length} en total\n`,
  )
}

main()
```

- [ ] **Step 3: Registrar el script**

En `package.json`, junto a `finding-reply`:

```json
    "competencia-reply": "npx tsx scripts/apply-competencia-response.ts",
```

- [ ] **Step 4: Probarlo de punta a punta y revertir**

```bash
printf 'La competencia de servicios públicos incluye la supervisión del contrato, no su ejecución material.\n' > /tmp/replica-prueba.txt
npm run competencia-reply -- --oficial rafael-gomez-sanchez --fecha 2026-09-01 --texto /tmp/replica-prueba.txt
npx vitest run tests/parse-competencias.test.ts
git checkout -- public/data/competencias.json
```

Expected: el CLI imprime `1 en total`, los tests siguen en verde con la réplica dentro, y el `git checkout` deja el fichero limpio.

- [ ] **Step 5: Comprobar que rechaza a un desconocido**

```bash
npm run competencia-reply -- --oficial no-existe --fecha 2026-09-01 --texto /tmp/replica-prueba.txt; echo "salida: $?"
```

Expected: `«no-existe» no aparece en ninguna asignación` y `salida: 1`.

- [ ] **Step 6: Commit**

```bash
git add --sparse .github/ISSUE_TEMPLATE/competencia-response.yml scripts/apply-competencia-response.ts package.json
git commit -m "feat(competencias): derecho de réplica nominal

Nombrar a una persona obliga a darle un canal. Formulario de Issue, CLI
fronteado por el validador y commit en el historial público, como sus
hermanos de hallazgo y de queja. La réplica se publica íntegra.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Cierre del PR A

- [ ] `npm run typecheck` limpio
- [ ] `npm run lint` limpio
- [ ] `npx vitest run` — la suite entera en verde
- [ ] `npm run check:competencias` sale 0
- [ ] Abrir el PR contra `main` desde `nocturna-verde` describiendo: qué cambia de doctrina (§7 del spec), que **no hay UI todavía**, y que las `razon` editoriales son lo que hay que revisar fila a fila.

**Nota para quien revise:** la fila más sensible del fichero es
`b323-324-320p-coste-unitario` (colegios), porque su coste es de conservar
edificios y esa competencia está partida entre dos áreas; y la ausencia más
deliberada es `denominadores-sin-remedir`, que se queda en `sinAsignar` porque
nombrarlo sería nombrar por eliminación.

## Fuera del alcance de este PR

Pintar nada. La capa existe, valida y está vigilada; quién la consume es PR B
(`/eficiencia` y `/gestion`) y PR C (el reportaje). `eficiencia-finding.ts` no
se toca. La sección de doctrina del spec (§7: `/metodologia`, `/aviso-legal`,
`CLAUDE.md`, los docblocks) va con PR B, que es cuando los nombres se publican
de verdad.
