/**
 * Qué entregas del coste efectivo existen, y cuándo puede existir la siguiente.
 *
 * Dos cosas que estaban sueltas y se juntan aquí porque son la misma:
 *
 * 1. **La lista de entregas.** Estaba copiada en `scrape-coste-efectivo.ts` y
 *    en `fetch-cesel-ccaa.ts`, leída a mano del `ddlEntrega` del ministerio.
 *    Nada la comparaba con el desplegable vivo, así que el día que se publique
 *    la entrega de 2025 no saltaría nada: el sitio seguiría titulando en 2024
 *    para siempre, sin un solo test en rojo. Aquí se exporta una vez y
 *    `check:cesel-entregas` la coteja contra la página.
 *
 * 2. **El calendario.** Orden HAP/2075/2014, disposición transitoria única:
 *    «Las Entidades Locales remitirán al Ministerio […] antes del 1 de
 *    noviembre la información a que se refiere el artículo 7 relativa al año
 *    anterior». El coste efectivo de un ejercicio se calcula sobre la
 *    liquidación de ese ejercicio, se rinde antes del 1 de noviembre del
 *    siguiente y el ministerio lo publica después. De ahí que en agosto de 2026
 *    lo más reciente que existe sea 2024 — un desfase estructural del dato, no
 *    un retraso nuestro.
 *
 * La página tiene que poder decir eso sin que nadie escriba una fecha a mano:
 * una frase con «2025» dentro se queda rancia en cuanto avanza la entrega, que
 * es la avería que `.claude/hooks/remind-stale-copy.mjs` existe para recordar.
 * `calendarioEntrega` la deriva del propio `anioBase` del snapshot.
 */

/**
 * id de entrega → ejercicio, leídos del propio `ddlEntrega` de la consulta.
 *
 * Los ids no son correlativos (falta el 2 y el 4) porque el ministerio numera
 * envíos, no ejercicios. Se conservan tal cual: son lo que la aplicación espera
 * en el desplegable.
 */
export const ENTREGAS: Record<string, number> = {
  '1': 2014,
  '3': 2015,
  '5': 2016,
  '6': 2017,
  '7': 2018,
  '8': 2019,
  '9': 2020,
  '10': 2021,
  '11': 2022,
  '12': 2023,
  '13': 2024,
}

/** Día y mes del plazo de rendición, en la forma en que los cita la Orden. */
export const VENCE_DIA = 1
export const VENCE_MES = 11

/** URL de la consulta cuyo desplegable manda sobre {@link ENTREGAS}. */
export const CONSULTA_URL =
  'https://serviciostelematicosext.hacienda.gob.es/sgcief/Cesel/Consulta/Consulta.aspx'

/** La Orden que fija el plazo, para que la prosa pueda enlazarla. */
export const ORDEN_URL = 'https://www.boe.es/buscar/doc.php?id=BOE-A-2014-11492'

/**
 * Lee los ejercicios que el ministerio ofrece en su desplegable.
 *
 * Devuelve `{}` cuando no encuentra el desplegable, y esa diferencia es el
 * punto: un `{}` significa «no he podido mirar», nunca «no hay entregas
 * nuevas». Quien lo llame tiene que tratar los dos casos por separado o
 * acabará imprimiendo su propio visto bueno con la página caída.
 */
export function parseEntregasDisponibles(html: string): Record<string, number> {
  if (!html) return {}
  const select = /<select[^>]*\bid="[^"]*ddlEntrega"[^>]*>([\s\S]*?)<\/select>/i.exec(html)
  if (!select) return {}
  const out: Record<string, number> = {}
  const opcion = /<option[^>]*\bvalue="([^"]*)"[^>]*>([\s\S]*?)<\/option>/gi
  let m: RegExpExecArray | null
  while ((m = opcion.exec(select[1]))) {
    const id = m[1].trim()
    const anio = Number(m[2].replace(/<[^>]+>/g, '').trim())
    // El desplegable lleva a veces una opción guía sin ejercicio («Seleccione…»,
    // value=""). No es una entrega y no debe contarse como tal.
    if (!id || !Number.isInteger(anio) || anio < 2000 || anio > 2100) continue
    out[id] = anio
  }
  return out
}

/**
 * Reescribe el literal {@link ENTREGAS} dentro del texto de este mismo módulo.
 *
 * Pura a propósito —texto entra, texto sale— para que la parte delicada se
 * pruebe sin tocar el disco. La usa `sync:cesel-entregas`, que corre sola en
 * noviembre: cuando el ministerio publica una entrega, la lista tiene que
 * aprenderla o el fetcher no la bajará y la guarda seguirá en rojo.
 *
 * **Estalla si no encuentra el ancla**, en vez de devolver el texto tal cual.
 * Un no-op silencioso aquí produce lo peor de los dos mundos: una PR con datos
 * nuevos y un mapa viejo, en noviembre, sin nadie mirando.
 */
export function reescribirEntregas(fuente: string, entregas: Record<string, number>): string {
  const re = /(export const ENTREGAS: Record<string, number> = \{\n)([\s\S]*?)(\n\})/
  if (!re.test(fuente)) {
    throw new Error('[cesel-entregas] no se encontró el literal ENTREGAS que reescribir')
  }
  // Por EJERCICIO, no por id: los ids son cadenas y '9' > '13', así que ordenar
  // por clave dejaría 2020 detrás de 2024 y la tabla dejaría de leerse.
  const cuerpo = Object.entries(entregas)
    .sort((a, b) => a[1] - b[1])
    .map(([id, anio]) => `  '${id}': ${anio},`)
    .join('\n')
  return fuente.replace(re, (_m, abre, _viejo, cierra) => `${abre}${cuerpo}${cierra}`)
}

/** Si el plazo de la próxima entrega sigue corriendo o ya terminó. */
export type EstadoEntrega = 'en-plazo' | 'plazo-vencido'

export interface CalendarioEntrega {
  /** El ejercicio más reciente publicado — el que titula las tarjetas. */
  ultima: number
  /** El siguiente, el que todavía no existe. */
  proxima: number
  /** Año del 1 de noviembre en que vence rendir `proxima`. */
  venceEn: number
  estado: EstadoEntrega
}

/**
 * El calendario de la entrega que falta, derivado de la que hay.
 *
 * `hoy` entra por parámetro para que la frase pueda comprobarse a los dos lados
 * del plazo. Sin eso, el texto «no llega tarde» seguiría en pantalla un año
 * después de dejar de ser cierto y ninguna prueba lo vería.
 */
export function calendarioEntrega(
  ultima: number | null | undefined,
  hoy: Date,
): CalendarioEntrega | null {
  if (typeof ultima !== 'number' || !Number.isFinite(ultima)) return null
  const proxima = ultima + 1
  // El ejercicio N se rinde antes del 1 de noviembre de N+1.
  const venceEn = proxima + 1
  const limite = Date.UTC(venceEn, VENCE_MES - 1, VENCE_DIA)
  return {
    ultima,
    proxima,
    venceEn,
    estado: hoy.getTime() < limite ? 'en-plazo' : 'plazo-vencido',
  }
}
