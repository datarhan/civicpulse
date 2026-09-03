/**
 * Lectura pura de un GetCapabilities de WMS: sin red, sin fs.
 *
 * Existe porque un identificador numérico de capa de ArcGIS se corre cuando el
 * organismo republica el servicio, y pedir el que ya no existe NO da error:
 * devuelve `200 image/png` con una imagen en blanco. El porqué completo está en
 * `src/lib/patricova.js`; el CLI que la usa es `scripts/check-wms.ts`.
 */
import { stripDiacritics } from './normalize.js'

export interface CapaWms {
  /** El `<Name>`, que es lo que viaja en `layers=` de la petición. */
  id: string
  /** El `<Title>`, que es lo que NO se mueve al republicar. */
  titulo: string
}

export type DesenlaceWms = 'ok' | 'movida' | 'sin-capa' | 'inalcanzable'

export interface ParteWms {
  desenlace: DesenlaceWms
  idConfigurado: string
  /** El id que hoy lleva el título buscado, cuando se ha encontrado. */
  idEncontrado?: string
  titulo?: string
  mensaje: string
}

/** Los desenlaces que paran la nocturna. Se exporta para que nadie la repita. */
export const DESENLACES_WMS_QUE_BLOQUEAN: readonly DesenlaceWms[] = ['movida', 'sin-capa']

export function bloqueaWms(d: DesenlaceWms): boolean {
  return DESENLACES_WMS_QUE_BLOQUEAN.includes(d)
}

/**
 * El título de la capa que el mapa dice pintar.
 *
 * Se compara sobre texto sin acentos, y pide «riesgo de inundacion» entero: el
 * mismo servicio publica «Estudios de Inundabilidad», que habla de lo mismo a
 * ojo y no es. Un patrón más laxo cogería aquélla y la guarda daría el visto
 * bueno sobre la capa equivocada.
 */
export const TITULO_RIESGO_INUNDACION = /riesgo\s+de\s+inundacion/i

/**
 * ¿Es ésta la capa que el mapa dice pintar?
 *
 * Se exporta la PREGUNTA y no sólo el patrón: el patrón va sobre texto sin
 * acentos, y dejar que cada llamador se acuerde de quitarlos es cómo una
 * comprobación acaba diciendo que no encuentra lo que tiene delante.
 */
export function esRiesgoDeInundacion(titulo: string): boolean {
  return TITULO_RIESGO_INUNDACION.test(stripDiacritics(titulo))
}

/**
 * Las capas con nombre del documento. Las que no tienen `<Name>` son grupos
 * —contenedores del árbol— y no se pueden pedir, así que no cuentan.
 *
 * Se lee con expresiones regulares y no con un parser de XML a propósito: es la
 * única forma de no meter una dependencia nueva para leer dos etiquetas, y el
 * documento lo emite ArcGIS con una forma estable.
 */
export function parseCapasWms(xml: string): CapaWms[] {
  const capas: CapaWms[] = []
  // Los pares <Name>…</Name><Title>…</Title> que ArcGIS emite en ese orden
  // dentro de cada <Layer>. Se captura sin mirar el contenido y se limpia
  // después: los títulos vienen envueltos en CDATA —que empieza por «<»— y una
  // clase [^<] no lo atraviesa. Ésa fue la primera versión, y no leía NADA.
  const re = /<Layer\b[^>]*>\s*<Name>([\s\S]*?)<\/Name>\s*<Title>([\s\S]*?)<\/Title>/g
  let m: RegExpExecArray | null
  while ((m = re.exec(xml)) !== null) {
    const id = sinCdata(m[1])
    const titulo = sinCdata(m[2])
    if (id && titulo) capas.push({ id, titulo })
  }
  return capas
}

/** Quita el envoltorio CDATA si lo lleva, y recorta. */
function sinCdata(s: string): string {
  const m = s.match(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/)
  return (m ? m[1] : s).trim()
}

/** ¿Sigue el número configurado siendo el de la capa que decimos pintar? */
export function valorarWms(idConfigurado: string, capas: CapaWms[]): ParteWms {
  const halladas = capas.filter((c) => esRiesgoDeInundacion(c.titulo))

  if (halladas.length === 0) {
    return {
      desenlace: 'sin-capa',
      idConfigurado,
      mensaje:
        'el servicio ya no publica ninguna capa titulada «riesgo de inundación» — ' +
        'hay que mirar GetCapabilities a mano y decidir cuál la sustituye',
    }
  }

  const capa = halladas[0]
  if (capa.id === idConfigurado) {
    return {
      desenlace: 'ok',
      idConfigurado,
      idEncontrado: capa.id,
      titulo: capa.titulo,
      mensaje: `la capa ${idConfigurado} sigue siendo «${capa.titulo}»`,
    }
  }

  return {
    desenlace: 'movida',
    idConfigurado,
    idEncontrado: capa.id,
    titulo: capa.titulo,
    // Nombrar el número nuevo es la diferencia entre un aviso y un aviso que se
    // puede arreglar sin repetir la investigación entera.
    mensaje:
      `el mapa pide la capa ${idConfigurado} y «${capa.titulo}» es hoy la ` +
      `${capa.id}: el ICV republicó y los números se corrieron. ` +
      `Pedir la vieja no da error, da una imagen en blanco.`,
  }
}
