#!/usr/bin/env tsx
/**
 * ¿Miente el sello de un fichero curado?
 *
 *   npm run check:stamps
 *   npm run check:stamps -- --json
 *
 * Nace de `c66cf931` (2026-08-02): retiró una acusación al PSOE de
 * `promises.json` —38 líneas menos— y dejó `generatedAt` en el 6 de julio. El
 * fichero publicado afirmaba durante 24 días una fecha anterior al cambio de su
 * propio contenido, y el efecto era visible en `/departamentos`, que enseña la
 * más vieja de sus cinco fuentes. Los dos CLI de promesas SÍ mueven el sello
 * (`apply-promise-draft.ts`, `auto-curate-promises.ts`), así que esa edición
 * los esquivó; el guard de escrituras curadas ataja el fichero, no la fecha.
 *
 * La comparación NO es «commit más nuevo que el sello»: eso es lo NORMAL —el
 * CLI escribe, y se comitea un minuto después. Lo que se mira es si el último
 * commit que tocó el fichero movió también la línea del sello. Un cambio de
 * contenido sin sello nuevo es un sello que miente, y da igual de cuándo sea el
 * commit.
 *
 * CUÁL es la línea del sello lo dice el fichero, no una lista: casi siempre
 * `generatedAt`, y `composedAt` en uno compuesto, cuyo `generatedAt` es un
 * puntero al base del que desciende y no la fecha en que se escribió. Ver
 * `claveDelSello`.
 *
 * Cuatro desenlaces, no dos — plegar «no lo pude mirar» dentro de «coincide»
 * es cómo una puerta imprime su propio visto bueno:
 *   ok            el último cambio movió el sello
 *   sello-quieto  el contenido cambió y el sello no  → sale 1
 *   sin-sello     el fichero no lleva sello (no puede mentir)
 *   sin-mirar     sin historial, o con cambios sin comitear → no se juzga
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// La lista canónica vive en el hook y es la que manda. Copiarla aquí es
// exactamente el defecto que abre docs/DATA_INTEGRITY.md: seis pruebas
// recitaron una forma y siguieron verdes mientras producción no casaba nada.
import { CURATED } from '../.claude/hooks/curated-paths.mjs'

const DATA = 'public/data'

export type Desenlace = 'ok' | 'sello-quieto' | 'sin-sello' | 'sin-mirar'

export interface FilaSello {
  file: string
  desenlace: Desenlace
  /** El sello juzgado, si lo hay. */
  sello: string | null
  /** De qué campo salió. Un fichero compuesto se sella por `composedAt`. */
  clave: 'composedAt' | 'generatedAt'
  /** El commit que tocó el fichero por última vez. */
  commit: string | null
  fechaCommit: string | null
  nota: string
}

function git(args: string[]): string {
  return execFileSync('git', args, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }).trim()
}

/**
 * Qué campo SELLA el contenido de este fichero.
 *
 * Casi siempre `generatedAt`. La excepción es un fichero COMPUESTO, cuyo
 * `generatedAt` no dice cuándo se escribió sino DE QUÉ DESCIENDE:
 * `verified-rebuild` copia al publicado el sello de su base porque
 * `cotejarCompose` exige igualdad exacta entre los dos, y llama `contradice` a
 * que lo publicado sea más nuevo. Ese campo es un puntero de linaje; el que
 * fecha el contenido es `composedAt`.
 *
 * Se decide LEYENDO EL FICHERO, no consultando una lista. Una tabla de
 * excepciones a mano dentro de un control contra el rancio se queda rancia
 * ella, que es el chiste que este repositorio ya ha contado dos veces.
 */
export function claveDelSello(obj: unknown): 'composedAt' | 'generatedAt' {
  const o = obj as { composedAt?: unknown } | null
  return typeof o?.composedAt === 'string' && o.composedAt ? 'composedAt' : 'generatedAt'
}

/**
 * ¿El diff de este commit sobre este fichero toca la línea del sello?
 *
 * `--unified=0` para no confundir una línea de CONTEXTO con una cambiada: con
 * el contexto por defecto, el sello aparece en casi cualquier diff del
 * principio del fichero y la puerta habría dado verde siempre.
 *
 * `clave` porque un fichero compuesto se sella por `composedAt`: mirar ahí el
 * campo heredado es preguntar por un campo que NO tenía que moverse, y la
 * puerta cantaría un rojo eterno que alguien acabaría apagando.
 */
export function selloEnDiff(
  diff: string,
  clave: 'composedAt' | 'generatedAt' = 'generatedAt',
): boolean {
  const re = new RegExp(`^[+-]\\s*"${clave}"\\s*:`)
  return diff.split('\n').some((l) => re.test(l))
}

const DIA_MS = 86_400_000

/**
 * ¿Este sello guarda una FECHA y no un instante?
 *
 * `competencias.json` sella `2026-08-23T00:00:00.000Z` — medianoche exacta, y
 * así en revisión tras revisión: su convención es el día. Un fichero curado a
 * mano no puede prometer una precisión que su propio formato no guarda, y
 * juzgarlo por horas lo dejaba «caduco por 18,6 h» por un commit de esa misma
 * tarde. El arreglo habría sido inventarle una hora que no tiene.
 */
export function selloEsDeDia(iso: string | null | undefined): boolean {
  if (!iso) return false
  const t = Date.parse(iso)
  return Number.isFinite(t) && t % DIA_MS === 0
}

/**
 * ¿El contenido cambió DESPUÉS de lo que el sello dice?
 *
 * Se compara con la granularidad que el sello guarda: por día si es de día, por
 * instante si trae hora. Una fecha ilegible se juzga —no se descarta—, porque
 * «no lo pude comparar» no puede colarse como «coincide».
 */
export function contenidoCambioTrasElSello(sello: string, fechaCommit: string): boolean {
  const s = Date.parse(sello)
  const c = Date.parse(fechaCommit)
  if (!Number.isFinite(s) || !Number.isFinite(c)) return true
  return selloEsDeDia(sello) ? Math.floor(c / DIA_MS) > Math.floor(s / DIA_MS) : c > s
}

function mirar(nombre: string): FilaSello {
  const rel = `${DATA}/${nombre}`
  const base: FilaSello = {
    file: nombre,
    desenlace: 'sin-mirar',
    sello: null,
    clave: 'generatedAt',
    commit: null,
    fechaCommit: null,
    nota: '',
  }
  if (!existsSync(resolve(rel))) return { ...base, nota: 'no está en public/data' }

  let sello: string | null = null
  let clave: 'composedAt' | 'generatedAt' = 'generatedAt'
  try {
    const obj = JSON.parse(readFileSync(resolve(rel), 'utf8')) as Record<string, unknown>
    clave = claveDelSello(obj)
    sello = typeof obj[clave] === 'string' ? (obj[clave] as string) : null
  } catch {
    return { ...base, nota: 'JSON ilegible' }
  }
  if (!sello) {
    return { ...base, desenlace: 'sin-sello', nota: 'sin generatedAt — no puede mentir' }
  }

  // Con cambios sin comitear el último commit ya no describe lo que hay en
  // disco. Decirlo, no juzgarlo.
  const sucio = git(['status', '--porcelain', '--', rel])
  if (sucio) {
    return { ...base, sello, clave, nota: 'con cambios sin comitear' }
  }

  const sha = git(['log', '-1', '--format=%H', '--', rel])
  if (!sha) return { ...base, sello, clave, nota: 'sin historial' }
  const fecha = git(['log', '-1', '--format=%aI', '--', rel])
  const diff = git(['show', '--format=', '--unified=0', sha, '--', rel])

  // Dos condiciones, y hacen falta las dos. El diff dice si el sello SE MOVIÓ;
  // las fechas dicen si TENÍA QUE MOVERSE. Un cambio hecho dentro del día que
  // el sello ya declara —cuando el sello es de día— está cubierto por él.
  if (selloEnDiff(diff, clave)) {
    return {
      ...base,
      desenlace: 'ok',
      sello,
      clave,
      commit: sha.slice(0, 8),
      fechaCommit: fecha,
      nota: 'el último cambio movió el sello',
    }
  }
  if (!contenidoCambioTrasElSello(sello, fecha)) {
    return {
      ...base,
      desenlace: 'ok',
      sello,
      clave,
      commit: sha.slice(0, 8),
      fechaCommit: fecha,
      nota: selloEsDeDia(sello)
        ? `el sello es del día ${sello.slice(0, 10)} y el cambio también — cubierto`
        : 'el sello ya es posterior al cambio',
    }
  }
  return {
    ...base,
    desenlace: 'sello-quieto',
    sello,
    clave,
    commit: sha.slice(0, 8),
    fechaCommit: fecha,
    nota: `el contenido cambió en ${sha.slice(0, 8)} (${fecha.slice(0, 10)}) y ${clave} sigue en ${sello.slice(0, 10)}`,
  }
}

function main() {
  const filas = Object.keys(CURATED as Record<string, string>).map(mirar)

  if (process.argv.includes('--json')) {
    process.stdout.write(JSON.stringify(filas, null, 2) + '\n')
  }

  const cuenta = (d: Desenlace) => filas.filter((f) => f.desenlace === d).length
  const malos = filas.filter((f) => f.desenlace === 'sello-quieto')

  // Una puerta que no examinó nada no está verde, está muda. Sin esto, un fallo
  // al leer la lista canónica imprimiría «0 sellos quietos» y pasaría por bien.
  const juzgados = cuenta('ok') + malos.length
  if (filas.length === 0 || juzgados === 0) {
    process.stderr.write(
      `[check-stamps] no se juzgó NINGÚN fichero de ${filas.length} de la lista curada — ` +
        `la comprobación no midió nada, que no es lo mismo que estar limpia\n`,
    )
    process.exit(2)
  }

  if (!process.argv.includes('--json')) {
    process.stdout.write(
      `[check-stamps] ${filas.length} fichero(s) curado(s) · ${cuenta('ok')} ok · ` +
        `${malos.length} con el sello quieto · ${cuenta('sin-sello')} sin sello · ` +
        `${cuenta('sin-mirar')} sin mirar\n\n`,
    )
    // `ERROR` + código en kebab entre corchetes NO es decoración: es el
    // vocabulario que `pickCheckDiagnosis` busca para llevar al digest el
    // renglón que dice QUÉ falla. Sin él se quedaba con las dos últimas líneas
    // —el consejo de cómo arreglarlo— y el aviso no nombraba ni un fichero.
    for (const f of malos) {
      process.stdout.write(`  ERROR [sello-quieto] ${f.file} — ${f.nota}\n`)
    }
    for (const f of filas.filter((r) => r.desenlace === 'sin-mirar')) {
      process.stdout.write(`  sin mirar     ${f.file.padEnd(34)} ${f.nota}\n`)
    }
    if (malos.length > 0) {
      process.stdout.write(
        `\n  El sello publicado es más viejo que el contenido que sella. Se arregla\n` +
          `  reescribiendo el fichero por su CLI (docs/DATA_SOURCES.md dice cuál), que\n` +
          `  pone la fecha al escribir — no editando la fecha a mano.\n`,
      )
    }
  }

  process.exit(malos.length > 0 ? 1 : 0)
}

if (import.meta.url === `file://${process.argv[1]}`) main()
