/**
 * La copia de `pleno-findings.json` que sirve el sitio, sin el literal de las
 * citas que la puerta editorial retiene.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DE DÓNDE SALE
 *
 * Desde el 27-08-2026 una cita `hidden` se pinta en la ficha como el hueco
 * «Literal retenido» (`citaRetenida`, src/lib/cita-retenida.js), y la nota de
 * debajo decía «su literal no se publica: ni aquí … ni en el registro de
 * declaraciones del pleno». Medido el 28-09-2026 sobre el artefacto construido:
 *
 *   · `dist/data/pleno-findings.json` —que Vite copia de `public/` y el sitio
 *     sirve en `/data/pleno-findings.json`— llevaba el texto entero de las 37
 *     citas retenidas. La página lo descarga para pintar el hueco.
 *   · La propia página lo IMPRIMÍA por dos caminos: la bitácora de
 *     correcciones de la ficha (cada reanclaje de una cita publica su
 *     `original` y su `corrected`, que son dos versiones del literal: 11 de las
 *     37) y el buscador Cmd+K, que enseña los 80 primeros caracteres de la
 *     primera cita de cada ficha (8 fichas empiezan por una retenida).
 *
 * «No se imprime» era cierto del hueco y de nada más. Lo que CLAUDE.md llama
 * «not rendered is not "not published"», dos veces en la misma ficha.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POR QUÉ AL COMPILAR, Y NO EN EL FICHERO
 *
 * El fichero del repositorio tiene que seguir llevando el literal. Lo leen la
 * CLI de correcciones (su único escritor), `check:citations`, el reanclaje,
 * `compute:finding-quote-provenance` y las pantallas del curador; y la puerta
 * se vuelve a preguntar cada noche, así que una cita retenida hoy puede dejar
 * de estarlo mañana y tiene que poder volver a imprimirse. Borrarlo de la
 * fuente sería una retirada; esto es no servirlo mientras la puerta lo retenga.
 *
 * Así que la transformación se aplica a la COPIA que se despliega, en el mismo
 * complemento de Vite que ya retira de `dist/` los ficheros que no deben salir
 * (`publication-denylist.js`). El servidor de desarrollo sirve el fichero sin
 * tocar a propósito: las colas del curador necesitan leer lo retenido.
 *
 * Y el repositorio es público desde el 8-09-2026: el literal sigue en su
 * `public/data/pleno-findings.json` y en su historia. Esto deja de SERVIRLO en
 * el sitio; no lo retira del mundo, y ni la página ni el JSON dicen otra cosa.
 * Tampoco retira lo que se dijo en la sesión: la transcripción completa de cada
 * pleno se publica en /plenos/:id, y la puerta decide qué declaraciones se
 * enseñan COMO declaraciones, no qué palabras de la sesión se publican.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * QUÉ HACE, Y QUÉ NO
 *
 *   · La cita retenida pierde `text` y gana `literalRetenido: true`. Conserva
 *     su POSICIÓN —la procedencia se lee por índice, y quitar la fila movería
 *     la marca de todas las citas de detrás—, su `speakerGroup` —el hueco dice
 *     a quién la atribuye la ficha— y su `sourceClaimId`.
 *   · Cada fila de bitácora que corrigió el TEXTO de una retenida sustituye sus
 *     dos lados por la huella de cada uno: `cita retenida · sha256:<12 hex>`,
 *     con la receta de `redactionDigest` (pleno-finding.ts). Conserva campo,
 *     motivo, editor y fecha: el registro sigue siendo comprobable —quien tenga
 *     el texto del repositorio rehace la huella—, sólo deja de ser legible.
 *   · Una fila se asigna a su cita por el TEXTO, no por el número del campo:
 *     retirar una cita renumera las de detrás (f-2026-01-19-cit-3fd230 lo
 *     hizo), y una fila vieja `quote.2.text` puede hablar de la que hoy es la 1.
 *     La cadena se sigue hacia atrás: la fila cuyo `corrected` es una versión
 *     conocida aporta su `original` como versión anterior. Una fila de texto que
 *     no encadena con ninguna cita vigente se retiene si su número señala una
 *     retenida, y se cuenta aparte: la bitácora pierde un detalle, y la otra
 *     opción es volver a imprimir el literal.
 *   · NO reescribe prosa. Un sumario, un título o un motivo que copien el
 *     literal se quedan como están (CLAUDE.md, regla 4: nada automático
 *     reescribe prosa publicada). Los señala `rastrosDeLiterales`, y los
 *     arregla una persona con `correct-pleno-finding --redact`.
 */
import type { ClaimVisibility } from './claim-public-gate'
import { sha256Short } from './hash'
import { CORRECTION_QUOTE_FIELD_RE } from './pleno-finding'
import { normaliseForQuoteMatch, prepararHeno, quoteAppearsInPrepared } from './quote-match'
import { PUERTA_QUE_RETIENE as PUERTA, citaRetenida } from '../lib/cita-retenida.js'

/**
 * El resultado de la puerta que retiene el literal. Se define con el predicado
 * en src/lib/cita-retenida.js; aquí se tipa contra el enum de la puerta, así
 * que un valor que no sea uno de sus resultados no compila.
 */
export const PUERTA_QUE_RETIENE: ClaimVisibility = PUERTA

const ETIQUETA_HUELLA = 'cita retenida'

/** Cómo es un lado de bitácora retenido, para pruebas y para quien lea el JSON. */
export const HUELLA_RE = /^cita retenida · sha256:[0-9a-f]{12}$/

/**
 * La huella de un literal: la receta de `redactionDigest` en pleno-finding.ts,
 * con su propia etiqueta. Revela nada por sí sola y confirma todo a quien tenga
 * el texto, que es lo que tiene que poder hacer un auditor con la historia
 * pública del repositorio.
 */
export function huellaDeLiteral(texto: string): string {
  return `${ETIQUETA_HUELLA} · sha256:${sha256Short(JSON.stringify(texto))}`
}

/** ¿Corrige esta fila el TEXTO de una cita? Leído del regex de la CLI, no copiado. */
function indiceDeFilaDeTexto(field: unknown): number | null {
  if (typeof field !== 'string') return null
  const m = CORRECTION_QUOTE_FIELD_RE.exec(field)
  return m && m[2] === 'text' ? Number(m[1]) : null
}

export interface CitaLike {
  text?: string
  speakerGroup?: string | null
  sourceClaimId?: string | null
  literalRetenido?: boolean
}

export interface FilaLike {
  field: string
  original: string
  corrected: string
  literalRetenido?: boolean
  [k: string]: unknown
}

export interface FichaLike {
  id: string
  quotes?: CitaLike[]
  corrections?: FilaLike[]
  [k: string]: unknown
}

export interface ProcedenciaLike {
  quotes?: Record<string, Array<{ gate?: string } | null>>
}

/**
 * Lo que leen las funciones que sólo MIRAN una ficha. Más estrecho que
 * `FichaLike` a propósito: una `PlenoFinding` del validador encaja tal cual, y la
 * CLI de correcciones no tiene que forzar el tipo para preguntar.
 */
export interface FichaConCitas {
  id: string
  quotes?: ReadonlyArray<{ text?: string; literalRetenido?: boolean } | null | undefined>
  corrections?: ReadonlyArray<{ field: string; original: string; corrected: string }>
}

/**
 * Todas las versiones que el repositorio guarda del texto de cada cita vigente,
 * por su índice de hoy: el texto actual y, hacia atrás, el `original` de cada
 * fila cuyo `corrected` ya es una versión conocida.
 */
export function versionesDeCitas(f: FichaConCitas): Array<Set<string>> {
  const versiones = (f.quotes ?? []).map(
    (q) => new Set(typeof q?.text === 'string' ? [q.text] : []),
  )
  const filas = (f.corrections ?? []).filter((c) => indiceDeFilaDeTexto(c?.field) != null)
  let cambio = true
  while (cambio) {
    cambio = false
    for (const c of filas) {
      for (const conocidas of versiones) {
        if (conocidas.has(c.corrected) && !conocidas.has(c.original)) {
          conocidas.add(c.original)
          cambio = true
        }
      }
    }
  }
  return versiones
}

export interface RetencionStats {
  /** Citas cuya puerta es `hidden` y que se sirven sin texto. */
  citasRetenidas: number
  /** Filas de bitácora cuyo texto se sustituyó por su huella. */
  filasDeBitacora: number
  /** Citas sin fila en la procedencia: se sirven como están, igual que las pinta la página. */
  citasSinPuerta: number
  /** Filas de texto, en fichas con retenidas, que no encadenan con ninguna cita vigente. */
  filasHuerfanas: number
}

const NOTA_DE_LA_COPIA =
  'Esta es la copia que sirve el sitio. No lleva el literal de las citas que la puerta ' +
  'editorial retiene —acusaciones públicas que el verificador no pudo contrastar con ningún ' +
  'dato municipal—: cada una conserva su posición, su grupo y su afirmación, marcada con ' +
  '«literalRetenido: true», y las filas de la bitácora que copiaban ese literal lo sustituyen ' +
  'por su huella sha256. No es una retirada del texto: el repositorio del proyecto, que es ' +
  'público, sigue llevándolo en este mismo fichero, y lo dicho en la sesión consta en su ' +
  'transcripción completa.'

/**
 * La copia servida. Pura: no toca la entrada, que es el fichero del
 * repositorio y tiene que seguir llevando el literal.
 *
 * Falla cerrado si la procedencia no trae la tabla de citas: sin puertas no se
 * sabe qué retener, y servir el fichero entero es lo que esto existe para
 * impedir. Una ficha concreta sin filas de procedencia, en cambio, se sirve como
 * está y se cuenta: es lo mismo que hace la página, que sin procedencia pinta
 * las citas sin marca, y lo vigila `check:finding-quotes`.
 */
export function retenerLiterales<S extends { items?: FichaLike[] }>(
  snapshot: S,
  procedencia: ProcedenciaLike,
): {
  snapshot: S & {
    items: FichaLike[]
    literalesRetenidos: {
      citas: number
      filasDeBitacora: number
      nota: string
      metodologia: string
    }
  }
  stats: RetencionStats
  retenidas: Array<{ findingId: string; quoteIndex: number }>
} {
  const puertas = procedencia?.quotes
  if (puertas == null || typeof puertas !== 'object') {
    throw new Error(
      'retenerLiterales: la procedencia no trae la tabla de citas (`quotes`); sin las puertas ' +
        'no se sabe qué literal retener, y servir el fichero entero no es una opción',
    )
  }
  const copia = structuredClone(snapshot) as S & { items: FichaLike[] }
  const stats: RetencionStats = {
    citasRetenidas: 0,
    filasDeBitacora: 0,
    citasSinPuerta: 0,
    filasHuerfanas: 0,
  }
  const retenidas: Array<{ findingId: string; quoteIndex: number }> = []

  for (const f of copia.items ?? []) {
    const filasDePuerta = puertas[f.id]
    const quotes = f.quotes ?? []
    // Las versiones se leen ANTES de quitar ningún texto: la cadena empieza en él.
    const versiones = versionesDeCitas(f)
    const retenida = quotes.map((q, i) => citaRetenida(filasDePuerta?.[i], q))

    quotes.forEach((q, i) => {
      if (filasDePuerta?.[i] == null) {
        stats.citasSinPuerta += 1
        return
      }
      if (!retenida[i]) return
      const { text: _literal, ...resto } = q
      quotes[i] = { ...resto, literalRetenido: true }
      stats.citasRetenidas += 1
      retenidas.push({ findingId: f.id, quoteIndex: i })
    })

    if (!retenida.some(Boolean) || !Array.isArray(f.corrections)) continue
    f.corrections = f.corrections.map((c) => {
      const indice = indiceDeFilaDeTexto(c?.field)
      if (indice == null) return c
      const duenas = versiones.flatMap((conocidas, j) => (conocidas.has(c.corrected) ? [j] : []))
      let retener: boolean
      if (duenas.length > 0) {
        retener = duenas.some((j) => retenida[j])
      } else {
        stats.filasHuerfanas += 1
        retener = retenida[indice] === true
      }
      if (!retener) return c
      stats.filasDeBitacora += 1
      return {
        ...c,
        original: huellaDeLiteral(String(c.original)),
        corrected: huellaDeLiteral(String(c.corrected)),
        literalRetenido: true,
      }
    })
  }

  const snapshotServido = Object.assign(copia, {
    literalesRetenidos: {
      citas: stats.citasRetenidas,
      filasDeBitacora: stats.filasDeBitacora,
      nota: NOTA_DE_LA_COPIA,
      metodologia: '/metodologia#citas-contraste',
    },
  })
  return { snapshot: snapshotServido, stats, retenidas }
}

/** La tabla de puertas de la procedencia, o un error: sin ella no se sabe qué está retenido. */
function puertasDe(procedencia: ProcedenciaLike, quien: string) {
  const puertas = procedencia?.quotes
  if (puertas == null || typeof puertas !== 'object') {
    throw new Error(
      `${quien}: la procedencia no trae la tabla de citas (\`quotes\`); sin las puertas no se ` +
        'sabe qué literal está retenido, y responder «ninguno» sería inventarlo',
    )
  }
  return puertas
}

/**
 * Cada cita retenida, con todas las versiones de su literal que el repositorio
 * guarda (`versionesDeCitas`): lo que buscan `rastrosDeLiterales` y
 * `tramosDeLiterales`. El id es `<ficha>#<índice de hoy>`.
 *
 * Decide con `citaRetenida`, el predicado de la página, y busca la fila de cada
 * ficha como `provenanceFor`: lo que sale de aquí es lo que el lector ve como
 * hueco. `provenanceFor` no se importa porque vive con un gancho de React, y
 * esto lo carga también la CLI; su búsqueda es la de abajo, y
 * `tests/literales-retenidos.test.ts` comprueba sobre los datos que coinciden.
 */
export function literalesRetenidosDe(
  fuente: { items?: ReadonlyArray<FichaConCitas> },
  procedencia: ProcedenciaLike,
): Array<{ id: string; versiones: string[] }> {
  const puertas = puertasDe(procedencia, 'literalesRetenidosDe')
  const out: Array<{ id: string; versiones: string[] }> = []
  for (const f of fuente.items ?? []) {
    const filas = Array.isArray(puertas[f.id]) ? puertas[f.id] : []
    const versiones = versionesDeCitas(f)
    ;(f.quotes ?? []).forEach((q, i) => {
      if (citaRetenida(filas[i], q)) out.push({ id: `${f.id}#${i}`, versiones: [...versiones[i]] })
    })
  }
  return out
}

/**
 * ¿Reproduce alguno de estos textos un tramo de un literal que la puerta
 * retiene EN ESTA FICHA? Para la CLI de correcciones, ANTES de escribir un texto
 * que se publica en la bitácora.
 *
 * Lo pide la enmienda de motivos (`--amend-reason`), que existe sobre todo para
 * quitar de un motivo el literal de una retenida: el motivo del 9-08 de
 * `f-2026-05-11-acu-7c65c5` citaba el arranque de una. Una herramienta que
 * arregla eso no puede dejar escribir otra vez lo mismo, y la prueba de los
 * datos publicados sólo lo diría después, sobre un fichero ya escrito.
 *
 * Pregunta con las DOS cribas que miran la copia servida —ocho palabras seguidas
 * y `TRAMO_MINIMO_EN_CARACTERES`—, porque la prueba de los datos publicados
 * mira las dos: con una sola, la CLI dejaría escribir un motivo que esa prueba
 * pondría en rojo después (el estilo indirecto sólo lo ve la de caracteres).
 *
 * Los textos van por nombre (`{ nuevo, porque }`) para que la respuesta diga
 * cuál: `[{ campo: 'nuevo', cita: 3 }]`, una vez aunque lo vean las dos cribas.
 * Falla cerrado sin procedencia.
 */
export function tramosRetenidosEn(
  textos: Record<string, string>,
  ficha: FichaConCitas,
  procedencia: ProcedenciaLike,
): Array<{ campo: string; cita: number }> {
  const literales = literalesRetenidosDe({ items: [ficha] }, procedencia)
  const prefijo = `${ficha.id}:`
  const servido = { items: [{ ...textos, id: ficha.id }] }
  const hallados = new Map<string, { campo: string; cita: number }>()
  for (const r of [
    ...rastrosDeLiterales(servido, literales),
    ...tramosDeLiterales(servido, literales),
  ]) {
    if (!r.ruta.startsWith(prefijo) || r.ruta === `${prefijo}id`) continue
    const hallado = { campo: r.ruta.slice(prefijo.length), cita: Number(r.id.split('#').pop()) }
    hallados.set(`${hallado.campo}#${hallado.cita}`, hallado)
  }
  return [...hallados.values()]
}

/** Por debajo de esto, un literal se diría en cualquier sitio: no se criba. */
const PALABRAS_MINIMAS = 5

/**
 * ¿Dónde queda un tramo de algún literal retenido? Recorre cada cadena del
 * objeto servido y pregunta con la regla de emparejamiento de siempre
 * (`quoteAppearsInPrepared`, ventana de ocho palabras), con cada versión que el
 * repositorio guarda de cada literal.
 *
 * La ruta de una hoja dentro de `items[k]` se escribe `<id de la ficha>:<campo>`
 * —`f-…:summary`, `f-…:corrections[1].reason`—, porque el índice de la ficha
 * cambia cada vez que se publica o se retira otra.
 */
export function rastrosDeLiterales(
  servido: unknown,
  literales: Array<{ id: string; versiones: string[] }>,
): Array<{ id: string; ruta: string }> {
  const hojas = hojasDeTexto(servido).map(({ ruta, texto }) => ({
    ruta,
    heno: prepararHeno(texto),
  }))
  const out: Array<{ id: string; ruta: string }> = []
  for (const lit of literales) {
    const medibles = lit.versiones.filter(
      (v) => v.trim().split(/\s+/).filter(Boolean).length >= PALABRAS_MINIMAS,
    )
    if (medibles.length === 0) continue
    for (const { ruta, heno } of hojas) {
      if (medibles.some((v) => quoteAppearsInPrepared(v, heno, 8))) out.push({ id: lit.id, ruta })
    }
  }
  return out
}

/**
 * Cada cadena del objeto servido, con su ruta. La recorren las dos cribas, así
 * que las dos miran exactamente lo mismo: la ruta de una hoja dentro de
 * `items[k]` se escribe `<id de la ficha>:<campo>`.
 */
function hojasDeTexto(servido: unknown): Array<{ ruta: string; texto: string }> {
  const hojas: Array<{ ruta: string; texto: string }> = []
  const recorrer = (v: unknown, ruta: string) => {
    if (typeof v === 'string') hojas.push({ ruta, texto: v })
    else if (Array.isArray(v)) v.forEach((x, i) => recorrer(x, `${ruta}[${i}]`))
    else if (v && typeof v === 'object')
      for (const [k, x] of Object.entries(v)) recorrer(x, ruta ? `${ruta}.${k}` : k)
  }
  const raiz = servido as { items?: unknown }
  if (raiz && typeof raiz === 'object' && Array.isArray(raiz.items)) {
    for (const [k, x] of Object.entries(raiz)) {
      if (k !== 'items') recorrer(x, k)
    }
    for (const f of raiz.items as Array<{ id?: string }>) {
      const prefijo = typeof f?.id === 'string' ? `${f.id}:` : ''
      for (const [k, x] of Object.entries(f ?? {})) recorrer(x, `${prefijo}${k}`)
    }
  } else {
    recorrer(servido, '')
  }
  return hojas
}

/**
 * Cuántos caracteres seguidos —normalizados con `normaliseForQuoteMatch`— puede
 * compartir una cadena servida con un literal retenido antes de contar como
 * copia suya.
 *
 * La criba de ocho palabras de `rastrosDeLiterales` no ve dos formas de copiar
 * que se encontraron publicadas el 29-09-2026: el estilo indirecto, que cambia
 * la persona del verbo justo donde la ventana necesitaba la octava palabra, y
 * un sumario que copia la versión ANTERIOR de un literal que luego se reancló.
 * Medido ese día sobre cinco instantáneas, del 11-08 en adelante: por encima de
 * cuarenta caracteres sólo había copias de verdad —dos sumarios y un motivo de
 * corrección—; por debajo, lo más largo que no era copia llegaba a 33 dentro de
 * la misma ficha y a 30 entre fichas, y eran nombres de instituciones y de
 * temas. Entre 30 y 39 una cita de verdad y un tema quedaban a un carácter: ahí
 * no separa ningún umbral, y esa franja es de la pregunta humana, no de esto.
 */
export const TRAMO_MINIMO_EN_CARACTERES = 40

/** Longitud de la subcadena común más larga de `a` y `b`. */
function subcadenaComunMasLarga(a: string, b: string): number {
  let anterior = new Int32Array(b.length + 1)
  let actual = new Int32Array(b.length + 1)
  let mejor = 0
  for (let i = 1; i <= a.length; i += 1) {
    const c = a.charCodeAt(i - 1)
    for (let j = 1; j <= b.length; j += 1) {
      actual[j] = c === b.charCodeAt(j - 1) ? anterior[j - 1] + 1 : 0
      if (actual[j] > mejor) mejor = actual[j]
    }
    ;[anterior, actual] = [actual, anterior]
    actual.fill(0)
  }
  return mejor
}

/**
 * ¿Qué cadena servida comparte al menos `minimo` caracteres seguidos con alguna
 * versión de un literal retenido? Recorre las mismas hojas que
 * `rastrosDeLiterales` y compara con TODAS las versiones que el repositorio
 * guarda de cada literal (`versionesDeCitas`): la que copió un sumario puede ser
 * la anterior a un reanclaje.
 *
 * Una ventana de `minimo` caracteres de un literal que aparece en una hoja es
 * exactamente una subcadena común de esa longitud, así que se indexan las
 * ventanas de los literales una vez y cada hoja se recorre una sola vez; la
 * longitud exacta, para el informe, se calcula sólo donde hubo coincidencia.
 */
export function tramosDeLiterales(
  servido: unknown,
  literales: Array<{ id: string; versiones: string[] }>,
  minimo: number = TRAMO_MINIMO_EN_CARACTERES,
): Array<{ id: string; ruta: string; caracteres: number }> {
  const normalizadas = literales.map((lit) =>
    lit.versiones.map((v) => normaliseForQuoteMatch(v)).filter((v) => v.length >= minimo),
  )
  const ventanas = new Map<string, Set<number>>()
  normalizadas.forEach((versiones, k) => {
    for (const v of versiones) {
      for (let i = 0; i + minimo <= v.length; i += 1) {
        const ventana = v.slice(i, i + minimo)
        const duenos = ventanas.get(ventana) ?? new Set<number>()
        duenos.add(k)
        ventanas.set(ventana, duenos)
      }
    }
  })

  const out: Array<{ id: string; ruta: string; caracteres: number }> = []
  if (ventanas.size === 0) return out
  for (const { ruta, texto } of hojasDeTexto(servido)) {
    const hoja = normaliseForQuoteMatch(texto)
    const tocados = new Set<number>()
    for (let i = 0; i + minimo <= hoja.length; i += 1) {
      const duenos = ventanas.get(hoja.slice(i, i + minimo))
      if (duenos) for (const k of duenos) tocados.add(k)
    }
    for (const k of [...tocados].sort((x, y) => x - y)) {
      const caracteres = Math.max(...normalizadas[k].map((v) => subcadenaComunMasLarga(hoja, v)))
      out.push({ id: literales[k].id, ruta, caracteres })
    }
  }
  return out
}
