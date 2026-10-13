/**
 * Votaciones de un acta de pleno de Riba-roja, leídas de su texto (pdftotext).
 *
 * El acta es la única fuente que publica el desglose por grupos con autoridad:
 * «por 13 votos a favor (11 PSOE, 1 EUPV – Unides Podem per Riba-roja y 1
 * Compromís…) y 7 abstenciones (7 PP) y 1 voto en contra (1 VOX), acordó».
 * Los asuntos de urgencia llevan DOS votaciones —la declaración de urgencia y
 * el fondo— y sólo la de fondo es «cómo votó cada grupo el asunto»: confundirlas
 * es exactamente el tipo de cruce que corrompió rx4hb4-10/-11. Un asunto sin
 * dictaminar lleva igual una votación previa («Previa ratificación de su
 * inclusión en el orden del día…, acordó pasar a continuación al fondo»), y en el
 * acta del 27-07-2026 su fondo no tiene votación transcrita: leerla como fondo
 * publicaría la ratificación como el voto del asunto.
 *
 * Tres cosas del texto real que este parser tiene en cuenta, cada una fijada en
 * `tests/acta-votos.test.ts`:
 *  - Las listas numeradas dentro de un punto («1.- Informe…», «4.- Propuesta de
 *    Acuerdo al Pleno.», «7.» en línea suelta, «3. SERVICIOS PÚBLICOS (SP)») no son
 *    encabezados: sólo cuenta el siguiente número al último (N = anterior + 1), con
 *    texto en la misma línea, y o bien con el título de un punto (un expediente,
 *    «Asuntos de urgencia», «Ruegos y preguntas»…) —haya o no línea en blanco
 *    delante—, o bien tras una línea en blanco y sin que el mismo N vuelva con
 *    título antes del N+1 (`encabezadosActa`).
 *  - Las urgencias no llevan número propio: van todas bajo «Asuntos de Urgencia».
 *  - El acta a veces no cierra un paréntesis («(11 PSOE y 7 PP y 3 abstenciones
 *    (1 VOX, …)»): el tramo se cierra donde empieza el siguiente sentido de voto.
 *
 * Puro. No decide nada: lo usa `check:votos-acta`, que sólo informa.
 */
import { SPEAKER_GROUPS, type VoteBloc, type VoteByBloc, type VoteDirection } from './pleno-votes'

/**
 * `urgencia`: la declaración de urgencia de un asunto fuera del orden del día.
 * `ratificacion`: cualquier otra votación previa que acuerda «pasar a continuación
 * al fondo» (hoy, la ratificación de un asunto sin dictaminar). `fondo`: el
 * asunto. Sólo `fondo` dice cómo votó cada grupo el asunto.
 */
export type FaseVotacion = 'urgencia' | 'ratificacion' | 'fondo'

export interface VotacionActa {
  itemNumber: number | null
  fase: FaseVotacion
  unanimidad: boolean
  /** Vacío cuando `unanimidad`. Un grupo que no se reconoce va con `bloc: null`. */
  blocs: Array<VoteByBloc & { seats: number }>
  /** Nombres del paréntesis que no casan con ningún SPEAKER_GROUP (y trozos ilegibles). */
  sinMapear: string[]
  /** La cláusula «por … acordó», con el espacio en blanco colapsado. */
  literal: string
}

const ALIAS: Array<[RegExp, VoteBloc]> = [
  [/\bPSOE\b|socialista/i, 'PSOE'],
  [/^\s*PP\b|partido popular|\bpopular\b/i, 'PP'],
  [/\bVOX\b/i, 'VOX'],
  [/EUPV|unides podem|unidas podemos|esquerra unida|podem/i, 'EU-Podem'],
  [/compromís|compromis/i, 'Compromís'],
  [/ciudadanos|\bCs\b/i, 'Ciudadanos'],
]

/** El grupo que nombra el acta, o null: nunca un grupo por descarte (regla 3). */
export function blocDeActa(nombre: string): VoteBloc | null {
  for (const [re, b] of ALIAS) if (re.test(nombre)) return SPEAKER_GROUPS.includes(b) ? b : null
  return null
}

const SENTIDO: Array<[RegExp, VoteDirection]> = [
  [/a favor/i, 'a_favor'],
  [/en contra/i, 'en_contra'],
  [/abstenci/i, 'abstencion'],
]

/**
 * «por … acordó/acuerda» — la cláusula de una votación del pleno. La cola nominal
 * se acota: una votación citada en los antecedentes («por 8 votos a favor, 6 en
 * contra y 7 abstenciones y continuar…») no lleva «acordó» cerca y no debe
 * alcanzar el de un párrafo lejano. Sin `\b` al final: en JS «ó» no es carácter
 * de palabra y `acordó\b` no casaría nunca ante «:».
 */
const CLAUSULA =
  /\bpor\s+(unanimidad[^,.:;]{0,60}?|\d+\s+votos?\s[\s\S]{0,700}?)\s*,?\s*(?:acord[óo]|acuerda)(?![a-záéíóúñ])/gi
/** «fue aprobada por unanimidad» — el acta anterior, sin «acordó». */
const APROBADA_UNANIMIDAD = /\baprobad[ao]s?\s+por\s+unanimidad[^,.:;]{0,60}/gi

const SENTIDO_RE = String.raw`(?:a favor|en contra|abstenci[oó]n(?:es)?)`
/**
 * Un tramo: «13 votos a favor (…)». El paréntesis acaba en «)» o, si el acta no
 * lo cierra, donde empieza el siguiente tramo («… y 3 abstenciones (»).
 */
const TRAMO = new RegExp(
  String.raw`(\d+)\s+(?:votos?\s+)?(${SENTIDO_RE})\s*\(([^()]*?)(?:\)|(?=(?:\s*,\s*|\s+y\s+)\d+\s+(?:votos?\s+)?${SENTIDO_RE}))`,
  'gi',
)

/** Encabezado de punto: «10.- 6/2026/PGRU …», «4.-CONTRATACIÓN…» u «11. Asuntos de Urgencia.» */
const ENCABEZADO = /^\s*(\d{1,2})\s*\.(?:\s*[-–]\s*|\s+)\S/
/**
 * Cualquier «N.» seguido de texto, con o sin separador («2.INTERVENCIÓN, …»). Un
 * dígito pegado al punto sólo vale si abre un expediente («8.26/2024/PGRU»): si
 * no, es una cifra («2.940,81») o un apartado («9.1 SECRETARÍA»).
 */
const NUMERADA = /^\s*(\d{1,2})\s*\.(?:(?=\d+\/\d{4}\/)|(?!\d))(?:\s*[-–]\s*|\s*)(\S.*)$/
/** «8 Asuntos de urgencia.» (otxq2c) y «9- Ruegos y preguntas.» (of2npg): sin el punto. */
const NUMERADA_SIN_PUNTO =
  /^\s*(\d{1,2})\s*[-–]?\s+((?:(?:asuntos?|despacho) de urgencia|ruegos y preguntas).*)$/i
/**
 * Lo que sólo trae el título de un punto del orden del día: un expediente
 * («Expediente», «1926/2026/GEN», «13/2026/PGRU»; con mayúscula, porque «del
 * expediente de imposición» en el cuerpo de un punto no lo es) o uno de los
 * puntos fijos del orden.
 */
const EXPEDIENTE = /\b(?:Expediente|EXPEDIENTE)\b|\b\d+\/\d{4}\/[A-Z]{2,}\b/
const PUNTO_FIJO =
  /^(?:(?:asuntos?|despacho) de urgencia|aprobaci[oó]n (?:de(?:l| las?)? )?actas?\b|ruegos y preguntas|dar cuenta\b|daci[oó]n (?:de )?cuenta\b|moci[oó]n?(?![a-záéíóúñ]))/i

export interface OpcionesActa {
  /**
   * Número del primer punto que se espera en el texto (1 por omisión). Sólo para
   * un extracto que empieza a mitad del acta: el acta entera empieza en el 1, y
   * un texto que empezara con una lista «3.» no debe poder saltarse el 1 y el 2.
   */
  desde?: number
}

interface Candidata {
  n: number
  /** Lleva el título de un punto (`EXPEDIENTE` o `PUNTO_FIJO`). */
  titulo: boolean
}

const enBlanco = (linea: string | undefined) => linea == null || linea.replace(/[\s\f]/g, '') === ''

/**
 * Un título partido en varias líneas tras una en blanco («5.SECRETARÍA» /
 * «(GESTIÓN» / «PATRIMONIAL),» / «EXPEDIENTE» / «514/2025/GEN,», en hp3y4s): el
 * expediente se busca en las cuatro líneas siguientes, si la del número es corta.
 */
function candidata(lineas: string[], i: number): Candidata | null {
  const m = NUMERADA.exec(lineas[i]) ?? NUMERADA_SIN_PUNTO.exec(lineas[i])
  if (!m) return null
  let titulo = EXPEDIENTE.test(m[2]) || PUNTO_FIJO.test(m[2])
  if (!titulo && enBlanco(lineas[i - 1]) && m[2].length <= 40) {
    const siguientes: string[] = []
    for (let j = i + 1; j <= i + 4 && !enBlanco(lineas[j]); j++) siguientes.push(lineas[j])
    titulo = EXPEDIENTE.test(siguientes.join(' '))
  }
  return { n: Number(m[1]), titulo }
}

/**
 * Los encabezados de punto, en orden. Una línea lo es si es el siguiente número
 * (N = anterior + 1) y además:
 *  - lleva el título de un punto, haya o no línea en blanco delante: pdftotext
 *    no siempre la deja, y un encabezado perdido arrastraba todos los puntos
 *    siguientes al anterior (10yl550, k4olcs, qz6weg, 1du4rf5); o
 *  - tiene la forma «N.-» / «N. » tras una línea en blanco («1.- Ratificar el
 *    carácter urgente de la sesión»), salvo que más adelante, antes de un título
 *    del punto N+1, aparezca un título del punto N: entonces es una lista dentro
 *    del punto anterior («3. SERVICIOS PÚBLICOS (SP)» de una carta de servicios,
 *    y luego «3.- INTEGRIDAD, Expediente…», en k4olcs).
 * Una lista dentro de un punto cuyo número no siga al último («1. Que…») nunca
 * cuenta, ni con título.
 */
export function encabezadosActa(
  texto: string,
  opciones: OpcionesActa = {},
): Array<{ n: number; at: number }> {
  const lineas = texto.split('\n')
  const cands = lineas.map((_, i) => candidata(lineas, i))
  const tituloDelMismoAntesDelSiguiente = (n: number, i: number) => {
    for (let j = i + 1; j < cands.length; j++) {
      const c = cands[j]
      if (!c?.titulo) continue
      if (c.n === n + 1) return false
      if (c.n === n) return true
    }
    return false
  }

  const out: Array<{ n: number; at: number }> = []
  let ultimo = (opciones.desde ?? 1) - 1
  let at = 0
  let anteriorEnBlanco = true
  lineas.forEach((linea, i) => {
    const c = cands[i]
    if (c && c.n === ultimo + 1) {
      const forma =
        anteriorEnBlanco && ENCABEZADO.test(linea) && !tituloDelMismoAntesDelSiguiente(c.n, i)
      if (c.titulo || forma) {
        ultimo = c.n
        out.push({ n: c.n, at })
      }
    }
    anteriorEnBlanco = enBlanco(linea)
    at += linea.length + 1
  })
  return out
}

function faseDe(texto: string, at: number, fin: number): FaseVotacion {
  const despues = texto.slice(fin, fin + 80).replace(/\s+/g, ' ')
  if (!/^\s*pasar\s+a\s+continuaci[oó]n\s+al\s+fondo/i.test(despues)) return 'fondo'
  const antes = texto.slice(Math.max(0, at - 500), at).replace(/\s+/g, ' ')
  return /declaraci[oó]n de (?:la )?urgencia/i.test(antes) ? 'urgencia' : 'ratificacion'
}

/** Marca en `sinMapear` de una cláusula no unánime de la que no se leyó ningún grupo. */
export const SIN_DESGLOSE = '(cláusula sin desglose legible)'

function blocsDe(clausula: string): Pick<VotacionActa, 'blocs' | 'sinMapear'> {
  const blocs: VotacionActa['blocs'] = []
  const sinMapear: string[] = []
  const plano = clausula.replace(/\s+/g, ' ')
  for (const t of plano.matchAll(TRAMO)) {
    const direction = SENTIDO.find(([re]) => re.test(t[2]))![1]
    // «…, 1 EUPV- Unides Podem, y 1 VOX)» (qz6weg, punto 10): la «y» tras la coma
    // también separa, o «y 1 VOX» se quedaría sin número delante.
    for (const parte of t[3].split(/,\s*(?:y\s+(?=\d))?|\s+y\s+(?=\d)/)) {
      if (!parte.trim()) continue
      const pm = /^\s*(\d+)\s+(.+?)\s*$/.exec(parte)
      if (!pm) {
        // Un trozo sin número no se pega a ningún grupo: se declara.
        sinMapear.push(parte.trim())
        continue
      }
      const bloc = blocDeActa(pm[2])
      if (bloc == null) sinMapear.push(pm[2])
      blocs.push({ bloc, direction, seats: Number(pm[1]) })
    }
  }
  // Una cláusula nominal sin ningún tramo legible no es «nadie votó»: se declara.
  if (blocs.length === 0) sinMapear.push(SIN_DESGLOSE)
  return { blocs, sinMapear }
}

export function parseVotacionesActa(texto: string, opciones: OpcionesActa = {}): VotacionActa[] {
  const heads = encabezadosActa(texto, opciones)
  const puntoEn = (at: number) => [...heads].reverse().find((h) => h.at < at)?.n ?? null

  const halladas: Array<{ at: number; fin: number; votacion: VotacionActa }> = []
  for (const m of texto.matchAll(CLAUSULA)) {
    const at = m.index!
    const fin = at + m[0].length
    const literal = m[0].replace(/\s+/g, ' ').trim()
    const unanimidad = /^por\s+unanimidad/i.test(literal)
    const { blocs, sinMapear } = unanimidad ? { blocs: [], sinMapear: [] } : blocsDe(m[1])
    halladas.push({
      at,
      fin,
      votacion: {
        itemNumber: puntoEn(at),
        fase: faseDe(texto, at, fin),
        unanimidad,
        blocs,
        sinMapear,
        literal,
      },
    })
  }
  for (const m of texto.matchAll(APROBADA_UNANIMIDAD)) {
    const at = m.index!
    const fin = at + m[0].length
    if (halladas.some((h) => at < h.fin && fin > h.at)) continue
    halladas.push({
      at,
      fin,
      votacion: {
        itemNumber: puntoEn(at),
        fase: 'fondo',
        unanimidad: true,
        blocs: [],
        sinMapear: [],
        literal: m[0].replace(/\s+/g, ' ').trim(),
      },
    })
  }
  return halladas.sort((a, b) => a.at - b.at).map((h) => h.votacion)
}
