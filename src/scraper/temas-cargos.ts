/**
 * «¿A quién le pregunto por…?» — el vocabulario curado de /cargos, y lo que se
 * hace con él. Puro, sin E/S.
 *
 * La auditoría de las dos lecturas (§3) midió que la respuesta a «¿quién lleva
 * lo mío?» era una línea dentro de una tarjeta de seis bloques. La decisión D3
 * del operador fija cómo se construye el buscador:
 *
 * - **El vocabulario palabra → área delegada es un fichero curado**
 *   (`public/data/temas-cargos.json`, en la lista CURATED), y sólo lo escribe
 *   `npm run tema-cargo`, que re-valida el fichero entero con este módulo.
 * - **El fichero no nombra a nadie.** Lleva de «basura» a «Servicios públicos
 *   municipales», con las palabras literales de `portfolios` en
 *   officials.json; quién tiene hoy esa área sale de la lista de cargos, como
 *   en cada tarjeta de /cargos. El validador rechaza cualquier campo de
 *   persona y cualquier campo con forma de juicio (`CAMPOS_PROHIBIDOS`, de
 *   competencias.ts): competencia, no culpa.
 * - **`literal` o `editorial`, como en competencias.json.** Es `literal`
 *   cuando el área nombra el asunto con sus palabras —«cementerio» en «Áreas
 *   Industriales y Cementerio»—, y el validador lo comprueba; si no, el salto
 *   lo damos nosotros y no se publica sin su `razon`. `aviso` es una salvedad
 *   para cualquier fila: la enseñanza en «colegio», que es de la Generalitat.
 * - **Un asunto que ninguna área nombra va a `sinAsignar`, con su motivo**, y
 *   la página dice «pregunta en el registro general», nunca una conjetura.
 * - **Una palabra, una respuesta**: ninguna palabra lleva a dos asuntos.
 *
 * Y una regla que no está en el fichero sino en la respuesta: si el área de
 * un asunto no la tiene hoy nadie en la lista de cargos —un cambio de reparto,
 * un área renombrada—, eso NO es «nadie la tiene»: es que el vocabulario se ha
 * quedado atrás. `respuestaDeTema` lo devuelve como `sinTitular`, la página
 * dice que hoy no lo sabe, y `temasSinTitular` es la alarma que pone roja la
 * prueba del fichero publicado.
 */

import { stripDiacritics } from './normalize'
import { CAMPOS_PROHIBIDOS, CONFIANZAS, type Confianza } from './competencias'

export interface TemaConCargo {
  tema: string
  /** Lo que un vecino escribiría. El propio `tema` cuenta aunque no esté aquí. */
  palabras: string[]
  /** LITERAL de `portfolios` en officials.json. */
  cargo: string
  confianza: Confianza
  /** Obligatoria cuando `confianza === 'editorial'`. */
  razon?: string
  /** Una salvedad que el lector necesita junto a la respuesta. */
  aviso?: string
  /** AAAA-MM-DD: cuándo entró la fila. */
  fecha: string
}

export interface TemaSinAsignar {
  tema: string
  palabras: string[]
  motivo: string
  aviso?: string
  fecha: string
}

export type EntradaDeTema = TemaConCargo | TemaSinAsignar

export interface TemasCargos {
  generatedAt: string
  note: string
  /** De dónde salen las cadenas de `cargo`: la página que raspa scrape-officials. */
  fuente: { titulo: string; url: string }
  temas: TemaConCargo[]
  sinAsignar: TemaSinAsignar[]
}

/** Nada en este fichero nombra a una persona. */
const CAMPOS_DE_PERSONA = ['oficial', 'nombre', 'partido', 'slug', 'email', 'persona', 'titular']
const PROHIBIDOS: ReadonlySet<string> = new Set([...CAMPOS_PROHIBIDOS, ...CAMPOS_DE_PERSONA])

const CLAVES_CON_CARGO = new Set([
  'tema',
  'palabras',
  'cargo',
  'confianza',
  'razon',
  'aviso',
  'fecha',
])
const CLAVES_SIN_ASIGNAR = new Set(['tema', 'palabras', 'motivo', 'aviso', 'fecha'])
const CLAVES_RAIZ = new Set(['generatedAt', 'note', 'fuente', 'temas', 'sinAsignar'])
const CLAVES_FUENTE = new Set(['titulo', 'url'])

/** Lo bastante para decir por qué, no una etiqueta. */
const MIN_EXPLICACION = 20

/**
 * En minúsculas, sin tildes y con los espacios plegados: «Básura » es «basura».
 * Y lo que se teclea de dos maneras en valenciano, de una: la ele geminada
 * («col·legi», «col.legi» y «collegi») y el apóstrofo (’ y ').
 */
export function normaliza(s: string): string {
  return stripDiacritics(
    String(s)
      .toLowerCase()
      .replace(/l[·.]l/g, 'll')
      .replace(/[’‘´`]/g, "'"),
  )
    .replace(/\s+/g, ' ')
    .trim()
}

const esCadena = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0

function barreProhibidos(v: unknown, donde: string): void {
  if (Array.isArray(v)) {
    v.forEach((x, i) => barreProhibidos(x, `${donde}[${i}]`))
    return
  }
  if (v && typeof v === 'object') {
    for (const [k, x] of Object.entries(v)) {
      if (PROHIBIDOS.has(k)) throw new Error(`${donde}: campo prohibido «${k}»`)
      barreProhibidos(x, `${donde}.${k}`)
    }
  }
}

function soloClaves(o: Record<string, unknown>, admitidas: Set<string>, donde: string): void {
  for (const k of Object.keys(o))
    if (!admitidas.has(k)) throw new Error(`${donde}: campo desconocido «${k}»`)
}

/** ¿Nombra `cargo` el asunto con sus propias palabras, como palabras enteras? */
function nombraElAsunto(cargo: string, tema: string): boolean {
  return ` ${normaliza(cargo).replace(/[^a-z0-9ñ ]/g, ' ')} `
    .replace(/\s+/g, ' ')
    .includes(` ${normaliza(tema)} `)
}

function validaEntrada(e: any, donde: string, conCargo: boolean): void {
  if (!e || typeof e !== 'object' || Array.isArray(e)) throw new Error(`${donde}: no es un objeto`)
  soloClaves(e, conCargo ? CLAVES_CON_CARGO : CLAVES_SIN_ASIGNAR, donde)
  if (!esCadena(e.tema)) throw new Error(`${donde}: falta tema`)
  if (!Array.isArray(e.palabras) || e.palabras.length === 0 || !e.palabras.every(esCadena))
    throw new Error(`${donde} (${e.tema}): palabras tiene que ser una lista de palabras`)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(e.fecha ?? ''))
    throw new Error(`${donde} (${e.tema}): fecha AAAA-MM-DD`)
  if (e.aviso !== undefined && !(esCadena(e.aviso) && e.aviso.length >= MIN_EXPLICACION))
    throw new Error(
      `${donde} (${e.tema}): un aviso dice algo, de ${MIN_EXPLICACION} caracteres o más`,
    )
  if (!conCargo) {
    if (!(esCadena(e.motivo) && e.motivo.length >= MIN_EXPLICACION))
      throw new Error(`${donde} (${e.tema}): un asunto sin área necesita su motivo`)
    return
  }
  if (!esCadena(e.cargo)) throw new Error(`${donde} (${e.tema}): falta cargo`)
  if (!CONFIANZAS.includes(e.confianza))
    throw new Error(`${donde} (${e.tema}): confianza tiene que ser ${CONFIANZAS.join(' o ')}`)
  if (e.confianza === 'literal' && !nombraElAsunto(e.cargo, e.tema))
    throw new Error(
      `${donde} (${e.tema}): «literal» exige que el área nombre el asunto, y «${e.cargo}» no dice «${e.tema}»: es editorial, con su razon`,
    )
  if (e.confianza === 'editorial' && !(esCadena(e.razon) && e.razon.length >= MIN_EXPLICACION))
    throw new Error(`${donde} (${e.tema}): una atribución editorial necesita su razon`)
  if (e.confianza === 'literal' && e.razon !== undefined)
    throw new Error(
      `${donde} (${e.tema}): una fila literal no lleva razon; si hace falta una salvedad, es un aviso`,
    )
}

/** Lanza con el primer problema; devuelve el fichero tal cual si está bien. */
export function validateTemasCargos(raw: unknown): TemasCargos {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw))
    throw new Error('temas-cargos: no es un objeto')
  const f = raw as Record<string, any>
  barreProhibidos(f, 'temas-cargos')
  soloClaves(f, CLAVES_RAIZ, 'temas-cargos')
  if (Number.isNaN(Date.parse(f.generatedAt ?? ''))) throw new Error('temas-cargos: generatedAt')
  if (!esCadena(f.note)) throw new Error('temas-cargos: falta la note')
  if (!f.fuente || typeof f.fuente !== 'object') throw new Error('temas-cargos: falta la fuente')
  soloClaves(f.fuente, CLAVES_FUENTE, 'temas-cargos.fuente')
  if (!esCadena(f.fuente.titulo) || !/^https:\/\//.test(f.fuente.url ?? ''))
    throw new Error('temas-cargos: la fuente lleva título y una URL https')
  if (!Array.isArray(f.temas) || !Array.isArray(f.sinAsignar))
    throw new Error('temas-cargos: temas y sinAsignar son listas')
  f.temas.forEach((e: unknown, i: number) => validaEntrada(e, `temas[${i}]`, true))
  f.sinAsignar.forEach((e: unknown, i: number) => validaEntrada(e, `sinAsignar[${i}]`, false))

  // Una palabra, una respuesta: el asunto y sus palabras, entre todas las filas.
  const vista = new Map<string, string>()
  const temas = new Set<string>()
  for (const e of [...f.temas, ...f.sinAsignar] as EntradaDeTema[]) {
    const t = normaliza(e.tema)
    if (temas.has(t)) throw new Error(`temas-cargos: el asunto «${e.tema}» está dos veces`)
    temas.add(t)
    for (const p of new Set([t, ...e.palabras.map(normaliza)])) {
      const otro = vista.get(p)
      if (otro !== undefined && otro !== t)
        throw new Error(`temas-cargos: «${p}» lleva a dos asuntos, «${otro}» y «${e.tema}»`)
      vista.set(p, t)
    }
  }
  return raw as TemasCargos
}

const conCargo = (e: EntradaDeTema): e is TemaConCargo => 'cargo' in e
const todas = (v: TemasCargos): EntradaDeTema[] => [...v.temas, ...v.sinAsignar]
const palabrasDe = (e: EntradaDeTema): string[] => [
  ...new Set([normaliza(e.tema), ...e.palabras.map(normaliza)]),
]

/** Con menos letras, un trozo coincide con casi todo. */
export const MIN_LETRAS_DE_BUSQUEDA = 3

export type ResultadoDeBusqueda =
  | { tipo: 'vacio' }
  | { tipo: 'uno'; entrada: EntradaDeTema }
  | { tipo: 'varios'; entradas: EntradaDeTema[] }
  | { tipo: 'ninguno' }

/**
 * Lo que un vecino escribe → el asunto. Primero una palabra exacta; si no, un
 * trozo de `MIN_LETRAS_DE_BUSQUEDA` letras o más dentro de alguna palabra. Si
 * el trozo está en varios asuntos, se ofrecen todos y no se elige ninguno.
 */
export function buscaTema(v: TemasCargos, consulta: string): ResultadoDeBusqueda {
  const q = normaliza(consulta ?? '')
  if (!q) return { tipo: 'vacio' }
  const exacta = todas(v).find((e) => palabrasDe(e).includes(q))
  if (exacta) return { tipo: 'uno', entrada: exacta }
  if (q.length < MIN_LETRAS_DE_BUSQUEDA) return { tipo: 'vacio' }
  const entradas = todas(v).filter((e) => palabrasDe(e).some((p) => p.includes(q)))
  if (entradas.length === 0) return { tipo: 'ninguno' }
  return entradas.length === 1
    ? { tipo: 'uno', entrada: entradas[0] }
    : { tipo: 'varios', entradas }
}

export interface Titular {
  slug: string
  portfolios?: string[] | null
}

export type RespuestaDeTema<T extends Titular> =
  | {
      tipo: 'cargo'
      cargo: string
      titulares: T[]
      confianza: Confianza
      razon?: string
      aviso?: string
    }
  | { tipo: 'sinTitular'; cargo: string }
  | { tipo: 'sinAsignar'; motivo: string; aviso?: string }

/** El asunto → quién tiene hoy su área, en el orden de la lista de cargos. */
export function respuestaDeTema<T extends Titular>(
  e: EntradaDeTema,
  cargos: readonly T[],
): RespuestaDeTema<T> {
  if (!conCargo(e)) return { tipo: 'sinAsignar', motivo: e.motivo, aviso: e.aviso }
  const titulares = cargos.filter((o) => (o.portfolios ?? []).includes(e.cargo))
  if (titulares.length === 0) return { tipo: 'sinTitular', cargo: e.cargo }
  return {
    tipo: 'cargo',
    cargo: e.cargo,
    titulares,
    confianza: e.confianza,
    razon: e.razon,
    aviso: e.aviso,
  }
}

/** Los asuntos cuya área no tiene hoy nadie en la lista de cargos: la deriva. */
export function temasSinTitular(v: TemasCargos, cargos: readonly Titular[]): string[] {
  return v.temas
    .filter((e) => !cargos.some((o) => (o.portfolios ?? []).includes(e.cargo)))
    .map((e) => e.tema)
}
