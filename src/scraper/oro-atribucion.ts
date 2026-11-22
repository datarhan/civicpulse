/**
 * El conjunto de oro de la atribución (paso 1.1 del plan de plenos, 22-11-2026):
 * líneas de transcripción sorteadas al azar que una persona ESCUCHA y etiqueta con
 * el bloque de quien habla. Es la vara con la que se mide cada opción de la fase 1
 * —diarización global, el mapa por texto, las dos señales juntas—, así que tiene
 * que existir, y su regla de puntuación estar escrita, antes de mirar ninguna.
 *
 * ## Por qué esto y no las hojas que ya hay
 *
 * - La hoja del 19-10 se eligió por DISCREPANCIAS y es toda PP/PSOE: mide los
 *   casos difíciles, no la tasa de error. Se guarda aparte, como casos difíciles.
 * - `muestra-escucha-mapa.ts` estratifica por el bloque que PROPONE un mapa: para
 *   comparar dos mapas está bien, pero ya ha mirado los mapas, y un oro que sale
 *   de lo que dijo un candidato no puede medir a ese candidato.
 *
 * ## Qué se sortea
 *
 * La unidad es la LÍNEA de la transcripción de una sesión de AUDIO (un segmento
 * del transcriptor, de unos 5 s), con su segundo de inicio y fin, de al menos
 * `PALABRAS_MIN` palabras: por debajo no hay ni voz que reconocer ni frase que
 * citar. Se escucha ese intervalo del vídeo y se apunta quién habla. No la cita
 * extraída: el 22-11-2026 cerca de la mitad de las citas servidas de sesiones de
 * audio no aparecían en la transcripción servida a su lado —extraídas de una
 * transcripción anterior, o traducidas del valenciano—, y sortear sólo las que se
 * dejan encontrar inclinaba el oro hacia las sesiones recién extraídas y hacia
 * quien habla en castellano. Una línea anclada al tiempo del vídeo sirve para
 * puntuar cualquier método. Una misma frase repetida en una sesión (un bucle del
 * transcriptor) es una sola escucha.
 *
 * Al azar, con semilla FIJA, por turnos entre sesiones barajadas: ninguna sesión
 * se come la muestra, y la muestra llega a todas las que puede sin elegir nada
 * mirando quién habla. No se estratifica por bloque: sin mirar un mapa no se sabe
 * de quién es la voz. Lo que se estima es la precisión POR LÍNEA PROMEDIADA ENTRE
 * SESIONES, no la precisión sobre las citas publicadas: una sesión corta pesa lo
 * mismo que una larga, que es lo que conviene porque los errores de un mapa van
 * por sesión.
 *
 * ## Orden, tandas y reserva
 *
 * Se sortea UNA lista ordenada de `TAMANO_LISTA` (300). Las 40 primeras son la
 * tanda 1 (diciembre, antes de que nadie mire un mapa); las 60 siguientes, la
 * tanda 2 (enero); el resto, la reserva, en bloques de `BLOQUE_RESERVA`, que sólo
 * se escucha según la regla de abajo.
 *
 * ## La regla de puntuación (fijada antes de escuchar, 22-11-2026)
 *
 * 1. A cada línea, el método le da el bloque que cubre la mayor parte de
 *    [desde, hasta], o se abstiene.
 * 2. PRECISIÓN = aciertos ÷ líneas donde el método da un bloque que publicaría
 *    sin una persona (uno de varios escaños A LA FECHA DE LA SESIÓN) y quien
 *    escuchó dio una etiqueta utilizable: un bloque o `no-concejal`. Un
 *    `no-concejal` o un bloque de un escaño escuchados donde el método dijo otro
 *    bloque son ERRORES: es justo la atribución falsa que la vara existe para
 *    medir.
 * 3. Fuera del denominador: `varias-voces`, `no-distingo` y `nadie-habla`. La
 *    COBERTURA (líneas con bloque del método ÷ todas las escuchadas) se publica
 *    al lado.
 * 4. Lo que el método atribuye a un bloque de un escaño se cuenta APARTE y nunca
 *    suma para la barra: nombrar a un bloque así es nombrar a una persona (nivel
 *    C, `singleSeatBlocs`).
 * 5. LA BARRA: cota inferior de Wilson ≥ 0,95 sobre las puntuadas. El mínimo de
 *    puntuadas para pasar es 73 con cero errores, 110 con uno, 142 con dos, 173
 *    con tres y 202 con cuatro.
 * 6. UN SOLO VEREDICTO, en un punto fijado ahora: cuando el método llega a
 *    `PUNTUADAS_OBJETIVO` (150) puntuadas, o cuando se acaba la lista si no llega.
 *    Se escucha en orden —tanda 1, tanda 2 y luego la reserva por bloques— sólo
 *    hasta ese punto. Ampliar depende de la COBERTURA (cuántas puntúa), nunca de
 *    los errores, y no se mira el resultado por el camino para parar antes:
 *    parar en cuanto pasa es elegir el momento que pasa. En 150 la barra admite
 *    dos errores (tres ya no); si la lista se acaba antes, vale el mínimo de la
 *    regla 5 con lo que haya.
 * 7. DESCARTAR un método antes de ese punto sólo si sus errores ya hacen la barra
 *    inalcanzable en él (`barraInalcanzable`): descartar ahorra escucha y no
 *    cambia ningún veredicto, porque ese método ya no podía pasar. La regla de la
 *    decisión 4.2, «tres errores en las primeras 40», no servía: con la barra en
 *    100 de 100, un solo error ya impedía pasar con 100.
 * 8. Cada desacuerdo entre un método y el oro se vuelve a escuchar a ciegas,
 *    mezclado con el mismo número de acuerdos. La primera etiqueta queda en el
 *    registro; si la segunda escucha la cambia, cuenta la segunda y se anota.
 *
 * La hoja es CIEGA: no lleva el bloque publicado, ni el de ningún mapa, ni la
 * etiqueta del diarizador; sólo la frase, el enlace al segundo y las columnas que
 * rellena quien escucha.
 */
import { createHash } from 'node:crypto'
import { wilsonLowerBound } from './automation-policy'
import { SPEAKER_GROUPS } from './pleno-votes'

/** Lo que puede escribir quien escucha. Fuera de esto, la hoja no valida. */
export const ETIQUETAS_ESCUCHA = [
  ...SPEAKER_GROUPS,
  /** Habla alguien que no es concejal: secretaría, intervención, público. */
  'no-concejal',
  /** Hablan varias personas en el intervalo y ninguna lo ocupa casi entero. */
  'varias-voces',
  /** Habla una sola persona, pero no se sabe quién. */
  'no-distingo',
  /** En el intervalo no habla nadie (el tiempo de la transcripción está mal). */
  'nadie-habla',
] as const
export type EtiquetaEscucha = (typeof ETIQUETAS_ESCUCHA)[number]

/** Las que no entran en el denominador de la precisión (regla 3). */
export const FUERA_DEL_DENOMINADOR: readonly EtiquetaEscucha[] = [
  'varias-voces',
  'no-distingo',
  'nadie-habla',
]

export const SEMILLA_ORO = 20261122
export const TAMANO_LISTA = 300
export const PRIMERA_TANDA = 40
export const SEGUNDA_TANDA = 60
export const BLOQUE_RESERVA = 50
/** Puntuadas que se buscan antes de dejar de ampliar (regla 6). */
export const PUNTUADAS_OBJETIVO = 150
export const BARRA = 0.95
/** Palabras mínimas de una línea sorteable. */
export const PALABRAS_MIN = 8

export interface Candidata {
  plenoId: string
  /** Fecha del pleno, AAAA-MM-DD. */
  fecha: string
  /** `<plenoId>@<segundo de inicio>` (`#2` si dos líneas empiezan en el mismo). */
  turnoId: string
  texto: string
  /** Segundos de inicio y fin de la línea en el vídeo. */
  desde: number
  hasta: number
  /** URL del vídeo de la sesión (la misma que transcribió). */
  video: string
}

export const palabras = (t: string) => t.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length

/** 1 y 2 son las tandas; 3, 4, 5, 6 los bloques de la reserva. */
export type Tanda = number

export interface ElegidaOro extends Candidata {
  /** Orden de escucha, 1..n. */
  n: number
  tanda: Tanda
}

export function tandaDe(n: number): Tanda {
  if (n <= PRIMERA_TANDA) return 1
  if (n <= PRIMERA_TANDA + SEGUNDA_TANDA) return 2
  return 3 + Math.floor((n - PRIMERA_TANDA - SEGUNDA_TANDA - 1) / BLOQUE_RESERVA)
}

/** mulberry32: barajado reproducible, sin dependencias (el de muestra-escucha-mapa.ts). */
export function aleatorio(semilla: number): () => number {
  let a = semilla >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function barajar<T>(xs: readonly T[], rnd: () => number): T[] {
  const a = [...xs]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/** Una misma frase de la misma sesión es una sola escucha. */
const claveDeFrase = (c: Candidata) =>
  `${c.plenoId}|${c.texto.toLowerCase().replace(/\s+/g, ' ').trim()}`

/**
 * El sorteo. La entrada se ordena antes de barajar, así que el resultado depende
 * sólo de la población y la semilla, no del orden en que se leyó el disco.
 */
export function sortearOro(
  poblacion: readonly Candidata[],
  semilla = SEMILLA_ORO,
  n = TAMANO_LISTA,
): { elegidas: ElegidaOro[]; repetidas: number } {
  const unicas = new Map<string, Candidata>()
  // Orden por unidades de código, no `localeCompare`: el orden no puede depender
  // del idioma de la máquina que sortea.
  const porId = (a: Candidata, b: Candidata) =>
    a.turnoId < b.turnoId ? -1 : a.turnoId > b.turnoId ? 1 : 0
  for (const c of [...poblacion].sort(porId)) {
    const k = claveDeFrase(c)
    if (!unicas.has(k)) unicas.set(k, c)
  }
  const rnd = aleatorio(semilla)
  const porSesion = new Map<string, Candidata[]>()
  for (const c of unicas.values())
    porSesion.set(c.plenoId, [...(porSesion.get(c.plenoId) ?? []), c])
  const sesiones = barajar([...porSesion.keys()].sort(), rnd)
  const colas = sesiones.map((s) => barajar(porSesion.get(s)!, rnd))

  const elegidas: ElegidaOro[] = []
  while (elegidas.length < n && colas.some((c) => c.length > 0)) {
    for (const cola of colas) {
      const c = cola.shift()
      if (!c || elegidas.length >= n) continue
      const orden = elegidas.length + 1
      elegidas.push({ ...c, n: orden, tanda: tandaDe(orden) })
    }
  }
  return { elegidas, repetidas: poblacion.length - unicas.size }
}

/**
 * Regla 7: ¿ya no puede pasar la barra en el punto del veredicto, aunque todo lo
 * que queda saliera bien y puntuado? `quedan` son las líneas de la lista aún sin
 * escuchar.
 */
export function barraInalcanzable(errores: number, puntuadas: number, quedan: number): boolean {
  // Las que llegará a tener en el punto del veredicto (regla 6): 150, o las que
  // dé la lista si se acaba antes. Más allá no se escucha.
  const n = Math.max(puntuadas, Math.min(PUNTUADAS_OBJETIVO, puntuadas + quedan))
  if (n === 0) return true
  return wilsonLowerBound(n - errores, n) < BARRA
}

/** Regla 5: ¿pasa la barra con estas puntuadas y estos errores? */
export function pasaLaBarra(errores: number, puntuadas: number): boolean {
  return puntuadas > 0 && wilsonLowerBound(puntuadas - errores, puntuadas) >= BARRA
}

/** El enlace que abre el vídeo unos segundos antes de la frase. */
export function enlaceAlSegundo(video: string, desde: number, antes = 5): string {
  const t = Math.max(0, Math.floor(desde) - antes)
  return `${video}${video.includes('?') ? '&' : '?'}t=${t}s`
}

/** 8199.9 → «2:16:39», como lo enseña YouTube. */
export function hms(s: number): string {
  const t = Math.floor(s)
  const h = Math.floor(t / 3600)
  const m = Math.floor((t % 3600) / 60)
  const ss = t % 60
  return `${h}:${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}`
}

export const COLUMNAS_HOJA = [
  'n',
  'tanda',
  'plenoId',
  'fecha',
  'turno_id',
  'enlace',
  'desde',
  'desde_s',
  'hasta_s',
  'frase',
  'escuchado',
  'oyente',
  'fecha_escucha',
  'notas',
] as const

/** Las columnas que se congelan: cambiar una es cambiar la muestra. */
const CONGELADAS = [
  'n',
  'tanda',
  'plenoId',
  'turno_id',
  'enlace',
  'desde_s',
  'hasta_s',
  'frase',
] as const

/**
 * El texto de una celda. Sin tabuladores ni saltos (rompen la fila), y con un
 * espacio delante si empieza por algo que una hoja de cálculo tomaría por una
 * fórmula o por una comilla de campo.
 */
export function celda(s: string): string {
  const t = s.replace(/[\t\r\n]+/g, ' ').trim()
  return /^[=+\-@"]/.test(t) ? ` ${t}` : t
}

const huella = (s: string) => createHash('sha256').update(s).digest('hex').slice(0, 16)

function valoresCongelados(e: ElegidaOro): Record<(typeof CONGELADAS)[number], string> {
  return {
    n: String(e.n),
    tanda: String(e.tanda),
    plenoId: e.plenoId,
    turno_id: e.turnoId,
    enlace: enlaceAlSegundo(e.video, e.desde),
    desde_s: e.desde.toFixed(1),
    hasta_s: e.hasta.toFixed(1),
    frase: celda(e.texto),
  }
}

/**
 * La huella de una fila congelada: lo que `--comprobar` compara. La frase entra
 * sin el espacio que `celda` pone delante, porque una hoja de cálculo lo quita.
 */
export function huellaDeFila(valores: Record<string, string>): string {
  return huella(CONGELADAS.map((k) => (valores[k] ?? '').trim()).join('␟'))
}

/** La huella de la lista entera, para fijarla en el repositorio. */
export function huellaDeLista(huellas: readonly string[]): string {
  return huella(huellas.join('\n'))
}

/** La hoja en TSV: una fila por línea, con lo que rellena quien escucha vacío. */
export function hojaOro(
  elegidas: readonly ElegidaOro[],
  cabecera: readonly string[],
): { tsv: string; huellas: string[] } {
  const huellas: string[] = []
  const filas = elegidas.map((e) => {
    const v = valoresCongelados(e)
    huellas.push(huellaDeFila(v))
    return COLUMNAS_HOJA.map((k) =>
      k === 'desde' ? hms(e.desde) : k === 'fecha' ? e.fecha : k in v ? v[k as keyof typeof v] : '',
    ).join('\t')
  })
  const tsv =
    [...cabecera.map((l) => `# ${l}`), COLUMNAS_HOJA.join('\t'), ...filas].join('\n') + '\n'
  return { tsv, huellas }
}

/**
 * Una celda que una hoja de cálculo entrecomilló al guardar (lleva una coma, una
 * comilla): «"a, b"» es «a, b», y «""» dentro es una comilla.
 */
function sinComillas(x: string): string {
  const t = x.trim()
  return t.length >= 2 && t.startsWith('"') && t.endsWith('"')
    ? t.slice(1, -1).replace(/""/g, '"')
    : x
}

export interface FilaEscuchada {
  n: number
  turnoId: string
  tanda: number
  escuchado: EtiquetaEscucha | null
  oyente: string
  huella: string
}

/**
 * Lee una hoja rellena, venga de donde venga: quita el BOM, acepta CRLF, busca
 * las columnas por nombre (una hoja de cálculo puede reordenarlas) y normaliza a
 * NFC (una tilde descompuesta en dos caracteres es la misma letra). Una
 * etiqueta fuera
 * de `ETIQUETAS_ESCUCHA` es un error, no una respuesta: si no, una errata se
 * contaría. Una fila sin escuchar queda `null` —pendiente—, nunca fallo ni
 * acierto. Una escuchada sin oyente o sin fecha AAAA-MM-DD, también es un error.
 */
export function leerHojaOro(texto: string): { filas: FilaEscuchada[]; errores: string[] } {
  const sinBom = texto.charCodeAt(0) === 0xfeff ? texto.slice(1) : texto
  const lineas = sinBom
    .normalize('NFC')
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith('#'))
  const [cab, ...resto] = lineas
  const col = (cab ?? '').split('\t').map((c) => c.trim())
  const i = (k: string) => col.indexOf(k)
  const errores: string[] = []
  for (const k of new Set(['n', 'turno_id', 'escuchado', 'oyente', 'fecha_escucha', ...CONGELADAS]))
    if (i(k) < 0) errores.push(`falta la columna «${k}»`)
  if (errores.length) return { filas: [], errores }
  const validas = new Set<string>(ETIQUETAS_ESCUCHA)
  const filas: FilaEscuchada[] = []
  for (const l of resto) {
    const c = l.split('\t').map(sinComillas)
    // Una fila de sólo tabuladores la añade una hoja de cálculo al guardar.
    if (c.every((x) => x.trim() === '')) continue
    const v = (k: string) => (c[i(k)] ?? '').trim()
    const e = v('escuchado')
    const n = v('n')
    if (e && !validas.has(e)) errores.push(`fila ${n}: «${e}» no es una etiqueta válida`)
    if (e && !v('oyente')) errores.push(`fila ${n}: etiquetada sin oyente`)
    if (e && !/^\d{4}-\d{2}-\d{2}$/.test(v('fecha_escucha')))
      errores.push(`fila ${n}: etiquetada sin fecha_escucha AAAA-MM-DD`)
    const congeladas: Record<string, string> = {}
    for (const k of CONGELADAS) congeladas[k] = v(k)
    // Una hoja de cálculo guarda 8199.0 como 8199: el número es el mismo.
    for (const k of ['desde_s', 'hasta_s'] as const) {
      const x = Number(congeladas[k].replace(',', '.'))
      if (congeladas[k] !== '' && Number.isFinite(x)) congeladas[k] = x.toFixed(1)
    }
    filas.push({
      n: Number(n),
      turnoId: v('turno_id'),
      tanda: Number(v('tanda')),
      escuchado: e && validas.has(e) ? (e as EtiquetaEscucha) : null,
      oyente: v('oyente'),
      huella: huellaDeFila(congeladas),
    })
  }
  return { filas, errores }
}
