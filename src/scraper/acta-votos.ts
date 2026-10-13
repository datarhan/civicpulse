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
 *    Acuerdo al Pleno.», «7.» en línea suelta) no son encabezados: sólo cuenta un
 *    «N.-» / «N.» con texto en la misma línea, tras una línea en blanco, y que sea
 *    el siguiente al último (N = anterior + 1).
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

function encabezados(texto: string): Array<{ n: number; at: number }> {
  const out: Array<{ n: number; at: number }> = []
  let ultimo = 0
  let at = 0
  let anteriorEnBlanco = true
  for (const linea of texto.split('\n')) {
    const m = ENCABEZADO.exec(linea)
    if (m && anteriorEnBlanco && Number(m[1]) === ultimo + 1) {
      ultimo = Number(m[1])
      out.push({ n: ultimo, at })
    }
    anteriorEnBlanco = linea.replace(/[\s\f]/g, '') === ''
    at += linea.length + 1
  }
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
    for (const parte of t[3].split(/,\s*|\s+y\s+(?=\d)/)) {
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

export function parseVotacionesActa(texto: string): VotacionActa[] {
  const heads = encabezados(texto)
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
