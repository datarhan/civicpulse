// @ts-check
/**
 * Incendios forestales — parser puro de la respuesta GeoJSON del MapServer
 * del ICV (Institut Cartogràfic Valencià, capa «Incendios forestales
 * 1993-2024»). Sin red y sin `node:fs`: el `fetch` vive sólo en
 * scripts/scrape-incendios.ts.
 *
 * Tres decisiones que no son de estilo:
 *
 * 1. El MUNICIPIO se publica verbatim y se marca aparte con `propio`. La
 *    fuente archiva el mismo pueblo como «Riba-roja de Túria» y como
 *    «RIBA-ROJA DEL TÚRIA», y filtrar por el nombre pierde 2019 entero sin
 *    dar ningún error. El cotejo va por RIBA_ROJA_ALIASES, que es política
 *    compartida: no forkear una lista local aquí.
 *
 * 2. La CAUSA se normaliza contra una tabla DECLARADA, no con un regex
 *    permisivo. La fuente escribe «Intencionado», «Intencionada» e
 *    «intencionado» para lo mismo, y «Negligencia» junto a «Negligencias y
 *    Causas accidentales» —contarlas por separado da 9 donde hay 44. Lo que
 *    la tabla no reconoce cae en el centinela y el techo de reserva del test
 *    se cae: es preferible enterarse a coercer en silencio.
 *
 * 3. La SUPERFICIE es la del incendio completo, tal y como la da la GVA,
 *    incluso cuando sólo una parte ardió dentro del término. Recortarla por
 *    la frontera daría una cifra NUESTRA con la firma de ellos.
 */
import { normalizeAlphanumeric, stripDiacritics, RIBA_ROJA_ALIASES } from './normalize'

/** Grupos de causa que publicamos. `sinClasificar` NO es una causa. */
export type Causa = 'intencionado' | 'negligencia' | 'rayo' | 'sinClasificar'

/**
 * El centinela. La fuente usa «Otras», «Otras Causas» y «Causa desconocida»
 * para decir «no se sabe», que no es lo mismo que un grupo de causa. Se
 * publica como ausencia, nunca dentro del numerador de un porcentaje.
 */
export const CAUSA_SIN_CLASIFICAR = 'sinClasificar' as const

/** El enum. Impórtalo — no lo repitas en un test. */
export const CAUSAS: readonly Causa[] = [
  'intencionado',
  'negligencia',
  'rayo',
  CAUSA_SIN_CLASIFICAR,
]

/** Etiqueta legible por grupo, para la leyenda y el popup. */
export const CAUSA_ETIQUETA: Record<Causa, string> = {
  intencionado: 'Intencionado',
  negligencia: 'Negligencia o accidente',
  rayo: 'Rayo',
  sinClasificar: 'Sin determinar',
}

/**
 * Cada grafía observada en el corpus 1993-2024, plegada a minúsculas y sin
 * acentos. Ampliar esta tabla es un acto deliberado: si la GVA estrena
 * vocabulario, lo nuevo cae en el centinela y el techo del test avisa.
 */
const CAUSA_POR_TEXTO: Record<string, Causa> = {
  intencionado: 'intencionado',
  intencionada: 'intencionado',
  negligencia: 'negligencia',
  'negligencias y causas accidentales': 'negligencia',
  rayo: 'rayo',
  // Centinelas declarados, no causas.
  otras: CAUSA_SIN_CLASIFICAR,
  'otras causas': CAUSA_SIN_CLASIFICAR,
  'causa desconocida': CAUSA_SIN_CLASIFICAR,
  desconocida: CAUSA_SIN_CLASIFICAR,
}

export interface Incendio {
  /** Parte de incendio forestal de la Comunitat Valenciana. Clave estable. */
  id: string
  /** El mismo parte en la numeración del ministerio. */
  idMinisterio: string | null
  anyo: number
  /** Nombre del municipio VERBATIM, con la grafía que trae la fuente. */
  municipio: string
  /** ¿Lo archiva la GVA en Riba-roja? Falso = ardió aquí, consta en otro. */
  propio: boolean
  paraje: string | null
  /** Medio de detección; null cuando la fuente trae el centinela ' '. */
  deteccion: string | null
  causa: Causa
  /** El texto original de g_caus_txt, para poder citarlo. */
  causaOriginal: string | null
  detectadoEl: string | null
  horaDeteccion: string | null
  extinguidoEl: string | null
  /** Superficie forestal del incendio COMPLETO, en hectáreas (sup_f). */
  superficieHa: number
  arboladaHa: number
  noArboladaHa: number
  /** Anillos en [lat, lng] —el orden de Leaflet y de geo.json—, a 5 decimales. */
  anillos: number[][][]
  /** [minLat, minLng, maxLat, maxLng] de los anillos ya redondeados. */
  bbox: [number, number, number, number]
  /** Media de los vértices. Ancla del mapa, NO el punto de inicio del fuego. */
  centroide: [number, number]
}

/** ~1 m. Los 16 decimales del servidor triplican el peso sin decir nada. */
const DECIMALES = 5

const ALIAS_PLEGADOS = new Set(RIBA_ROJA_ALIASES.map(normalizeAlphanumeric))

const redondear = (n: number): number => Number(n.toFixed(DECIMALES))

/** Cadena util o null: '', ' ' y undefined son ausencias, no valores. */
function texto(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const t = v.trim()
  return t.length > 0 ? t : null
}

function numero(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0
}

/** dd/mm/aaaa → aaaa-mm-dd. Cualquier otra forma es null, no una fecha inventada. */
function fechaIso(v: unknown): string | null {
  const t = texto(v)
  if (!t) return null
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(t)
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null
}

/** HH:MM:SS → HH:MM. */
function horaCorta(v: unknown): string | null {
  const t = texto(v)
  if (!t) return null
  const m = /^(\d{2}):(\d{2})/.exec(t)
  return m ? `${m[1]}:${m[2]}` : null
}

/** Pliega la grafía de la fuente a un grupo de causa declarado. */
export function normalizarCausa(raw: string | null | undefined): Causa {
  const t = texto(raw)
  if (!t) return CAUSA_SIN_CLASIFICAR
  const plegado = stripDiacritics(t.toLowerCase()).replace(/\s+/g, ' ').trim()
  return CAUSA_POR_TEXTO[plegado] ?? CAUSA_SIN_CLASIFICAR
}

/**
 * GeoJSON trae [lng, lat]; Leaflet y geo.json usan [lat, lng]. Se invierte
 * aquí, una vez, para que ninguna capa tenga que acordarse.
 */
function anillosDe(geom: unknown): number[][][] {
  if (!geom || typeof geom !== 'object') return []
  const g = geom as { type?: string; coordinates?: unknown }
  const aLatLng = (anillo: unknown): number[][] =>
    Array.isArray(anillo)
      ? anillo
          .filter((p): p is number[] => Array.isArray(p) && p.length >= 2)
          .map((p) => [redondear(p[1]), redondear(p[0])])
      : []

  if (g.type === 'Polygon' && Array.isArray(g.coordinates)) {
    return g.coordinates.map(aLatLng).filter((a) => a.length > 0)
  }
  if (g.type === 'MultiPolygon' && Array.isArray(g.coordinates)) {
    return g.coordinates
      .flatMap((poligono) => (Array.isArray(poligono) ? poligono.map(aLatLng) : []))
      .filter((a) => a.length > 0)
  }
  return []
}

/** Extensión y centroide se derivan de los anillos YA redondeados, para que
 *  el centroide no pueda caer fuera de su propio bbox por el redondeo. */
function extension(anillos: number[][][]): {
  bbox: [number, number, number, number]
  centroide: [number, number]
} {
  let minLat = Infinity
  let minLng = Infinity
  let maxLat = -Infinity
  let maxLng = -Infinity
  let sumaLat = 0
  let sumaLng = 0
  let n = 0
  for (const anillo of anillos) {
    for (const [lat, lng] of anillo) {
      if (lat < minLat) minLat = lat
      if (lat > maxLat) maxLat = lat
      if (lng < minLng) minLng = lng
      if (lng > maxLng) maxLng = lng
      sumaLat += lat
      sumaLng += lng
      n += 1
    }
  }
  if (n === 0) return { bbox: [0, 0, 0, 0], centroide: [0, 0] }
  return {
    bbox: [minLat, minLng, maxLat, maxLng],
    centroide: [redondear(sumaLat / n), redondear(sumaLng / n)],
  }
}

/**
 * Una respuesta `f=geojson&outSR=4326` del MapServer → filas tipadas.
 * Una carga sin `features` da cero filas; no es un error del parser.
 */
export function parseIncendios(raw: string): Incendio[] {
  let doc: { features?: unknown }
  try {
    doc = JSON.parse(raw)
  } catch {
    throw new Error('[incendios] la respuesta no es JSON — ¿cambió el servicio del ICV?')
  }
  const features = Array.isArray(doc?.features) ? doc.features : []

  const filas: Incendio[] = []
  for (const f of features) {
    if (!f || typeof f !== 'object') continue
    const p = ((f as { properties?: unknown }).properties ?? {}) as Record<string, unknown>
    const id = texto(p.NumPIF_CV)
    if (!id) continue // sin parte oficial no hay clave estable: no se publica

    const anillos = anillosDe((f as { geometry?: unknown }).geometry)
    const { bbox, centroide } = extension(anillos)
    const municipio = texto(p.nom_mun) ?? ''

    filas.push({
      id,
      idMinisterio: texto(p.NumPIF_Min),
      anyo: numero(p.anyo),
      municipio,
      propio: ALIAS_PLEGADOS.has(normalizeAlphanumeric(municipio)),
      paraje: texto(p.paraje),
      deteccion: texto(p.detecp_txt),
      causa: normalizarCausa(texto(p.g_caus_txt)),
      causaOriginal: texto(p.g_caus_txt),
      detectadoEl: fechaIso(p.f_detec),
      horaDeteccion: horaCorta(p.h_detec),
      extinguidoEl: fechaIso(p.fextinc),
      superficieHa: numero(p.sup_f),
      arboladaHa: numero(p.tot_arb),
      noArboladaHa: numero(p.tot_narb),
      anillos,
      bbox,
      centroide,
    })
  }
  return filas
}

/**
 * Junta los lotes de las 32 capas anuales. Deduplica por parte oficial —un
 * incendio a caballo de dos años aparece en las dos capas— y ordena por
 * (año, parte) para que dos pasadas idénticas den el mismo fichero.
 */
export function unirIncendios(lotes: Incendio[][]): Incendio[] {
  const porId = new Map<string, Incendio>()
  for (const lote of lotes) {
    for (const i of lote) if (!porId.has(i.id)) porId.set(i.id, i)
  }
  return [...porId.values()].sort((a, b) => a.anyo - b.anyo || a.id.localeCompare(b.id))
}

/** Un incendio con la procedencia de la consulta que lo encontró. */
export interface IncendioSituado extends Incendio {
  /**
   * ¿Su perímetro cruza la frontera municipal? Falso = la GVA lo atribuye a
   * Riba-roja pero lo cartografía fuera del término. No es un caso teórico:
   * el mayor de la serie —1994VL0267, 128 ha— está así, a 5,3 km del centro
   * y sin solape ni de bounding box. Se publica, pero no se pinta: dibujarlo
   * pondría una cicatriz donde no ardió, y tirarlo dejaría nuestro recuento
   * 128 ha por debajo del suyo sin decir por qué.
   */
  intersecta: boolean
}

/**
 * Junta las dos consultas que se le hacen al mismo servicio: la ESPACIAL
 * —el perímetro cruza el término— y la NOMINAL —la GVA lo archiva aquí—.
 * El perímetro manda: quien aparece en la espacial intersecta, aunque
 * también salga en la nominal.
 */
export function unirPorProcedencia(
  intersectan: Incendio[][],
  atribuidos: Incendio[][],
): IncendioSituado[] {
  const porId = new Map<string, IncendioSituado>()
  for (const i of unirIncendios(intersectan)) porId.set(i.id, { ...i, intersecta: true })
  for (const i of unirIncendios(atribuidos)) {
    if (!porId.has(i.id)) porId.set(i.id, { ...i, intersecta: false })
  }
  return [...porId.values()].sort((a, b) => a.anyo - b.anyo || a.id.localeCompare(b.id))
}
