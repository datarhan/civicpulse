/**
 * Medir un mapa de hablantes contra otro, y contra lo que un curador firmó.
 *
 * Existe para decidir si el mapa de TEXTO (`speaker-map-texto.ts`) puede sustituir
 * al de audio (Gemini). Lo que importa no es cuánto cubre, sino cuántas veces dice
 * un bloque que otro contradice: una atribución equivocada pone las palabras de un
 * partido en boca de otro, y eso es grado difamación. Una abstención no hace daño
 * — pero un mapa que se abstiene en todo tampoco sirve, así que la cobertura tiene
 * su propio suelo.
 *
 * Cada comparación separa los cubos (regla 2 de DATA_INTEGRITY) y nunca los suma
 * en un «acierto» único:
 *
 *   coinciden · CONTRADICEN · sólo A · sólo B · ninguno · mixto · no evaluado
 *
 * - `mixto`: una etiqueta publicada cuyas líneas reciben DOS bloques. No es una
 *   abstención: es el mapa diciendo que esa etiqueta son dos personas, y contarla
 *   como «ninguno» escondía 14 de las 43 etiquetas de `10yl550`.
 * - `noEvaluado`: líneas que uno de los dos mapas nunca miró (trozo fallido o sin
 *   intentar). Un hueco de Gemini no es un «Gemini se abstuvo».
 *
 * La UNIDAD de la decisión es la etiqueta publicada, no la línea: las líneas de una
 * etiqueta no son independientes (una sola cesión de turno decide todas), y contar
 * líneas daría intervalos de confianza falsamente estrechos.
 *
 * Las dos lecturas pasan por `alignSpeakerMap`, la misma alineación que usa el
 * extractor, así que se mide lo que se publicaría y no una aproximación.
 */
import { alignSpeakerMap } from './speaker-map-align'
import type { RawSegment, SpeakerMap } from './speaker-map'
import { ventanas, type Separacion } from './speaker-map-texto'

export interface Cubos {
  /** Líneas (o etiquetas) del denominador, `noEvaluado` incluido. */
  total: number
  coinciden: number
  /** Los dos mapas dan bloque, y es distinto. El número que manda. */
  contradicen: number
  soloA: number
  soloB: number
  ninguno: number
  /** Sólo por etiqueta: uno de los dos da dos bloques a la misma etiqueta. */
  mixto: number
  /** Uno de los dos mapas nunca miró este tramo. Fuera de toda tasa. */
  noEvaluado: number
}

export const cubosVacios = (): Cubos => ({
  total: 0,
  coinciden: 0,
  contradicen: 0,
  soloA: 0,
  soloB: 0,
  ninguno: 0,
  mixto: 0,
  noEvaluado: 0,
})

const MIXTO = '__mixto__'
const NO_EVALUADO = '__no-evaluado__'

function contar(c: Cubos, a: string | null, b: string | null): void {
  c.total += 1
  if (a === NO_EVALUADO || b === NO_EVALUADO) c.noEvaluado += 1
  else if (a === MIXTO || b === MIXTO) c.mixto += 1
  else if (a && b) {
    if (a === b) c.coinciden += 1
    else c.contradicen += 1
  } else if (a) c.soloA += 1
  else if (b) c.soloB += 1
  else c.ninguno += 1
}

/**
 * Índices de las líneas publicadas que el mapa NO miró.
 *
 * Un mapa de Gemini numera sus huecos por trozo de `chunkSeconds`; uno de texto,
 * por ventana (`separacion` en el mapa). Sin mapa, ninguna línea fue mirada.
 */
export function lineasNoEvaluadas(
  published: readonly RawSegment[],
  map: SpeakerMap | null,
): Set<number> {
  if (!map) return new Set(published.map((_, i) => i))
  const huecos = new Set((map.stats?.failedChunks ?? []).map((f) => f.chunk))
  const out = new Set<number>()
  if (huecos.size === 0) return out
  const separacion = (map as SpeakerMap & { separacion?: Separacion }).separacion
  if (separacion) {
    // Las ventanas se recalculan sobre los segmentos del propio mapa, que son los
    // publicados (re-etiquetados con pyannote, si es el caso) en el mismo orden.
    const textoAIndice = new Map<string, number>()
    published.forEach((s, i) => textoAIndice.set(`${s.start}|${s.text}`, i))
    for (const v of ventanas(map.segments, separacion)) {
      if (!huecos.has(v.indice)) continue
      for (const s of map.segments.slice(v.desde, v.hasta)) {
        const i = textoAIndice.get(`${s.start}|${s.text}`)
        if (i !== undefined) out.add(i)
      }
    }
    return out
  }
  published.forEach((s, i) => {
    if (huecos.has(Math.floor(s.start / map.chunkSeconds))) out.add(i)
  })
  return out
}

/** El bloque que un mapa avala para cada línea publicada; `null` si ninguno. */
export function blocsPorLinea(
  published: readonly RawSegment[],
  map: SpeakerMap | null,
): Array<string | null> {
  if (!map) return published.map(() => null)
  const r = alignSpeakerMap({ published, map })
  const out: Array<string | null> = published.map(() => null)
  for (const l of r.lines) out[l.index] = l.bloc
  return out
}

/** Por línea: bloque, `null`, o `NO_EVALUADO`. */
function estadoPorLinea(published: readonly RawSegment[], map: SpeakerMap | null) {
  const blocs = blocsPorLinea(published, map)
  const fuera = lineasNoEvaluadas(published, map)
  return blocs.map((b, i) => (fuera.has(i) ? NO_EVALUADO : b))
}

/**
 * Por etiqueta publicada: el bloque si todas sus líneas evaluadas coinciden,
 * `MIXTO` si hay dos, `null` si ninguna línea tiene bloque, `NO_EVALUADO` si el
 * mapa no miró ninguna de sus líneas.
 */
function estadoPorEtiqueta(
  published: readonly RawSegment[],
  porLinea: ReadonlyArray<string | null>,
): Map<string, string | null> {
  const blocs = new Map<string, Set<string>>()
  const evaluadas = new Map<string, number>()
  published.forEach((s, i) => {
    if (!blocs.has(s.speaker)) blocs.set(s.speaker, new Set())
    const b = porLinea[i]
    if (b === NO_EVALUADO) return
    evaluadas.set(s.speaker, (evaluadas.get(s.speaker) ?? 0) + 1)
    if (b) blocs.get(s.speaker)!.add(b)
  })
  const out = new Map<string, string | null>()
  for (const [label, set] of blocs) {
    if (!evaluadas.get(label)) out.set(label, NO_EVALUADO)
    else if (set.size > 1) out.set(label, MIXTO)
    else out.set(label, set.size === 1 ? [...set][0] : null)
  }
  return out
}

export interface Contradiccion {
  index: number
  start: number
  speaker: string
  a: string
  b: string
  text: string
}

export interface ComparacionMapas {
  porLinea: Cubos
  /** Por etiqueta publicada: la unidad de la decisión. */
  porEtiqueta: Cubos
  /** Cada línea en que se contradicen, para escucharla. */
  contradicciones: Contradiccion[]
  /** Etiquetas a las que sólo B (texto) da bloque: no se pueden juzgar contra A. */
  soloB: Array<{ label: string; bloc: string; start: number }>
}

export function compararMapas(
  published: readonly RawSegment[],
  a: SpeakerMap | null,
  b: SpeakerMap | null,
): ComparacionMapas {
  const la = estadoPorLinea(published, a)
  const lb = estadoPorLinea(published, b)
  const porLinea = cubosVacios()
  const contradicciones: Contradiccion[] = []
  published.forEach((s, i) => {
    contar(porLinea, la[i], lb[i])
    const x = la[i]
    const y = lb[i]
    if (x && y && x !== NO_EVALUADO && y !== NO_EVALUADO && x !== y) {
      contradicciones.push({
        index: i,
        start: s.start,
        speaker: s.speaker,
        a: x,
        b: y,
        text: s.text,
      })
    }
  })

  const ea = estadoPorEtiqueta(published, la)
  const eb = estadoPorEtiqueta(published, lb)
  const porEtiqueta = cubosVacios()
  const soloB: ComparacionMapas['soloB'] = []
  for (const label of ea.keys()) {
    const x = ea.get(label) ?? null
    const y = eb.get(label) ?? null
    contar(porEtiqueta, x, y)
    if (!x && y && y !== MIXTO && y !== NO_EVALUADO) {
      soloB.push({ label, bloc: y, start: published.find((s) => s.speaker === label)!.start })
    }
  }
  return { porLinea, porEtiqueta, contradicciones, soloB }
}

/** Un tramo firmado: «la intervención entre estos segundos es de este bloque». */
export interface TramoFirmado {
  id: string
  plenoId: string
  desde: number
  hasta: number
  bloc: string
}

export type VeredictoOro = 'acierta' | 'contradice' | 'se-abstiene' | 'sin-lineas' | 'no-evaluado'

export interface ResultadoOro {
  /** Líneas publicadas cuyo punto medio cae en un tramo firmado. */
  lineas: {
    total: number
    aciertan: number
    contradicen: number
    seAbstienen: number
    noEvaluadas: number
  }
  /**
   * Por tramo: `contradice` si UNA línea evaluada contradice la firma, `acierta` si
   * alguna coincide y ninguna contradice, `se-abstiene` si el mapa miró y no dice
   * nada, `no-evaluado` si no miró, `sin-lineas` si la transcripción actual no tiene
   * líneas en esos segundos. Severo a propósito: un tramo puede incluir una
   * interrupción ajena, y eso se ve en el detalle, pero la cuenta no la perdona.
   */
  tramos: Array<{
    id: string
    veredicto: VeredictoOro
    lineas: number
    aciertan: number
    contradicen: number
  }>
}

export function compararConOro(
  published: readonly RawSegment[],
  map: SpeakerMap | null,
  tramos: readonly TramoFirmado[],
): ResultadoOro {
  const estado = estadoPorLinea(published, map)
  const lineas = { total: 0, aciertan: 0, contradicen: 0, seAbstienen: 0, noEvaluadas: 0 }
  const out: ResultadoOro['tramos'] = []
  for (const t of tramos) {
    let n = 0
    let ok = 0
    let mal = 0
    let fuera = 0
    published.forEach((s, i) => {
      const medio = (s.start + s.end) / 2
      if (medio < t.desde || medio > t.hasta) return
      n += 1
      const b = estado[i]
      if (b === NO_EVALUADO) fuera += 1
      else if (b === t.bloc) ok += 1
      else if (b) mal += 1
    })
    lineas.total += n
    lineas.aciertan += ok
    lineas.contradicen += mal
    lineas.noEvaluadas += fuera
    lineas.seAbstienen += n - ok - mal - fuera
    const veredicto: VeredictoOro =
      n === 0
        ? 'sin-lineas'
        : mal > 0
          ? 'contradice'
          : ok > 0
            ? 'acierta'
            : fuera === n
              ? 'no-evaluado'
              : 'se-abstiene'
    out.push({ id: t.id, veredicto, lineas: n, aciertan: ok, contradicen: mal })
  }
  return { lineas, tramos: out }
}

/**
 * Los tramos firmados de `pleno-claim-relabels.json` que dan un bloque y se
 * firmaron ESCUCHANDO. Una entrada cuyo motivo dice que no se escuchó el vídeo no
 * es oro: es una lectura del texto, la misma clase de juicio que se mide.
 */
export function tramosDeRelabels(doc: unknown): TramoFirmado[] {
  const entries = (doc as { entries?: Record<string, unknown> })?.entries ?? {}
  const out: TramoFirmado[] = []
  for (const [id, raw] of Object.entries(entries)) {
    const e = raw as {
      speakerGroup?: string | null
      reason?: string
      segundos?: { desde?: number; hasta?: number }
    }
    if (
      !e?.speakerGroup ||
      typeof e.segundos?.desde !== 'number' ||
      typeof e.segundos?.hasta !== 'number'
    )
      continue
    if (/no se ha escuchado/i.test(e.reason ?? '')) continue
    out.push({
      id,
      plenoId: id.split('-')[0],
      desde: e.segundos.desde,
      hasta: e.segundos.hasta,
      bloc: e.speakerGroup,
    })
  }
  return out
}

/**
 * Intervalo de Wilson al 95 % para una proporción `k/n`.
 *
 * Con 0 de 8, la proporción es 0 y la cota superior ~32 %: lo que se sabe de un
 * cero depende del denominador, y publicar sólo el cero lo esconde.
 */
export function wilson(k: number, n: number, z = 1.96): { inferior: number; superior: number } {
  if (n === 0) return { inferior: 0, superior: 1 }
  const p = k / n
  const den = 1 + (z * z) / n
  const centro = (p + (z * z) / (2 * n)) / den
  const radio = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / den
  return { inferior: Math.max(0, centro - radio), superior: Math.min(1, centro + radio) }
}

/** «12/340 (3,5 %)»: numerador, denominador y porcentaje, siempre juntos. */
export function fraccion(n: number, d: number): string {
  if (d === 0) return `${n}/0 (—)`
  return `${n}/${d} (${((100 * n) / d).toFixed(1).replace('.', ',')} %)`
}
