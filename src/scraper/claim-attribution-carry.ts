/**
 * Recuperar la atribución de bloc que una re-extracción tiró — sin inventar una
 * sola, y sin devolver ninguna que hoy no se pueda publicar.
 *
 * El 2026-08-13 la extracción volvió a correr sobre todos los plenos con UN
 * solo mapa de voces en disco (`pleno-speaker-map/15uvjew.json`, el único que
 * había existido nunca en git). El extractor avisa por escrito de lo que pasa
 * entonces —«NO speaker map … every claim will carry speakerGroup:null»— y eso
 * hizo: `pleno-claims-suggestions.json` quedó con 7.098 citas y 101
 * atribuciones, todas del mismo pleno.
 *
 * El corpus publicado, más viejo, traía 1.362 repartidas en diecisiete plenos.
 * Como la base sale de las sugerencias y el fichero publicado sale de la base,
 * cualquier rebuild publicaba 1.261 atribuciones menos: es lo que dejó
 * `downgrade-verdict` inutilizable en cuanto `verified-rebuild` empezó a fallar
 * cerrado, y por tanto lo que bloquea corregir un veredicto.
 *
 * ESTO NO RECONSTRUYE ATRIBUCIÓN. No mira audio, no llama a un modelo y no
 * deduce nada: copia lo que YA ESTÁ PUBLICADO a la cita que le corresponde, y
 * sólo cuando se puede demostrar que son la misma cita.
 *
 * Y «ya publicado» no basta. Aquellas 1.362 eran la adivinanza del extractor
 * retirado el 10-08 (3f37f5c8: nombraba el partido que salía en el texto, que
 * en un debate suele ser el atacado). La migración la quitó de las sugerencias
 * y no del fichero publicado, y el arrastre del 15-08 (472064bd) la devolvió
 * entera, grupos de un escaño incluidos. La PR #218 retiró con firma 292
 * etiquetas de un escaño y 1.007 adivinanzas que el mapa de voces no sostiene;
 * sin las dos últimas condiciones de abajo, un arrastre las devolvería otra vez.
 *
 * Seis condiciones, y las seis tienen que cumplirse:
 *
 *   · mismo id de claim
 *   · verbatim IDÉNTICO byte a byte — un id estable sobre un texto que se movió
 *     colgaría un bloc de otras palabras, y estas superficies nombran a grupos
 *     municipales
 *   · el destino no tiene bloc — jamás se pisa una atribución viva
 *   · el bloc de origen está en `SPEAKER_GROUPS`, importado de pleno-votes.ts y
 *     no recopiado aquí (regla nº1 de docs/DATA_INTEGRITY.md)
 *   · no es un grupo de un escaño, que nombra a su concejal por eliminación:
 *     `etiquetaDeUnEscano`, la regla de la prueba de corpus de #218
 *   · el mapa de voces de HOY da ese mismo grupo a ese literal: la sesión
 *     tiene mapa (`etiquetaSinMapa`, la otra regla de esa prueba) y
 *     `classifyAttribution` dice `coincide` con el resolvedor de
 *     `check:claim-provenance`, con cuyos desenlaces #218 definió lo que
 *     retiraba
 */
import { classifyAttribution } from './claim-provenance'
import { etiquetaDeUnEscano, etiquetaSinMapa, plenoDeDeclaracion } from './etiqueta-de-grupo'
import { SPEAKER_GROUPS } from './pleno-votes'

/**
 * Por qué se descartó cada arrastre que no se hizo.
 *
 * Exportado y recorrido: un total de «arrastradas» sin desglose es
 * indistinguible de una pasada que no intentó nada, que es la regla nº2 de
 * docs/DATA_INTEGRITY.md. Los tres últimos son los desenlaces de
 * `classifyAttribution` que no son `coincide`: la cuenta sale con la misma
 * forma que la tanda C de #218 (sin-mapa 424, sin-sosten 574,
 * partido-distinto 9).
 */
export const MOTIVOS_DE_DESCARTE = [
  'verbatim-distinto',
  'destino-ya-atribuido',
  'bloc-fuera-del-enum',
  'grupo-de-un-escano',
  'sin-mapa',
  'sin-sosten',
  'partido-distinto',
] as const

export type MotivoDeDescarte = (typeof MOTIVOS_DE_DESCARTE)[number]

/** Lo que el parte dice de cada motivo, para quien lo lea sin abrir esto. */
export const POR_QUE_SE_DESCARTA: Record<MotivoDeDescarte, string> = {
  'verbatim-distinto': 'el literal se movió bajo el mismo id',
  'destino-ya-atribuido': 'la cita ya lleva un grupo, y no se pisa',
  'bloc-fuera-del-enum': 'no es un grupo de SPEAKER_GROUPS',
  'grupo-de-un-escano': 'nombra a su concejal por eliminación: lo firma una persona',
  'sin-mapa': 'no hay mapa de voces de la sesión con que cotejarlo',
  'sin-sosten': 'el mapa de voces de hoy no le da grupo',
  'partido-distinto': 'el mapa de voces de hoy le da otro grupo',
}

/**
 * Con qué se decide qué se puede devolver. Obligatorio: un arrastre sin
 * criterio es el del 15-08.
 */
export interface CriterioDeArrastre {
  /** Los grupos de un escaño, de `oneSeatBlocsOf(officials.json)`. */
  unEscano: readonly string[]
  /** Las sesiones con mapa de voces en disco (`plenosConMapa`). */
  conMapa: ReadonlySet<string>
  /**
   * El grupo que da hoy el mapa de una sesión a cada literal, o null si no hay
   * con qué cotejar (`resolverDeGrupo`). Sólo se pide para sesiones de `conMapa`.
   */
  resolverDe: (plenoId: string) => ((verbatim: string) => string | null) | null
}

interface CitaPublicada {
  claim?: {
    id?: string
    plenoId?: string | null
    speakerGroup?: string | null
    verbatim?: string
  } | null
}

interface CitaSugerida {
  id?: string
  speakerGroup?: string | null
  verbatim?: string
}

export interface ResultadoArrastre<T> {
  items: T[]
  stats: {
    /** Publicadas que traían bloc y se intentaron. */
    intentadas: number
    arrastradas: number
    /** Publicadas con bloc cuyo id ya no existe entre las sugerencias. */
    publicadasSinDestino: number
    descartes: Record<MotivoDeDescarte, number>
  }
}

const esBlocLegal = (g: unknown): g is string =>
  typeof g === 'string' && (SPEAKER_GROUPS as readonly string[]).includes(g)

/**
 * @param publicadas  el corpus publicado, del que se toma la atribución.
 * @param sugeridas   las citas re-extraídas. Se MUTAN en sitio: quien llama es
 *                    dueño del array y lo escribe después.
 * @param criterio    los grupos de un escaño y el mapa de voces de hoy.
 */
export function arrastrarAtribucion<T extends CitaSugerida>(
  publicadas: CitaPublicada[],
  sugeridas: T[],
  criterio: CriterioDeArrastre,
): ResultadoArrastre<T> {
  const porId = new Map<string, T>()
  for (const s of sugeridas ?? []) if (s?.id) porId.set(s.id, s)

  const descartes = Object.fromEntries(MOTIVOS_DE_DESCARTE.map((m) => [m, 0])) as Record<
    MotivoDeDescarte,
    number
  >
  let intentadas = 0
  let arrastradas = 0
  let publicadasSinDestino = 0

  for (const p of publicadas ?? []) {
    const bloc = p?.claim?.speakerGroup
    if (!bloc) continue
    intentadas += 1
    if (!esBlocLegal(bloc)) {
      descartes['bloc-fuera-del-enum'] += 1
      continue
    }
    const destino = p.claim?.id ? porId.get(p.claim.id) : undefined
    if (!destino) {
      publicadasSinDestino += 1
      continue
    }
    if (destino.speakerGroup) {
      descartes['destino-ya-atribuido'] += 1
      continue
    }
    const verbatim = p.claim?.verbatim ?? ''
    if ((destino.verbatim ?? '') !== verbatim) {
      descartes['verbatim-distinto'] += 1
      continue
    }
    const declaracion = { ...p.claim, id: p.claim?.id ?? '', speakerGroup: bloc }
    if (etiquetaDeUnEscano(declaracion, criterio.unEscano)) {
      descartes['grupo-de-un-escano'] += 1
      continue
    }
    const resolver = etiquetaSinMapa(declaracion, criterio.conMapa)
      ? null
      : criterio.resolverDe(plenoDeDeclaracion(declaracion))
    const desenlace = classifyAttribution({
      stored: bloc,
      fresh: resolver ? resolver(verbatim) : null,
      hasMap: resolver !== null,
    })
    if (desenlace === 'sin-publicar') {
      // `stored` es el bloc publicado, nunca null: este desenlace no puede
      // salir. Si sale, la escalera cambió y esto no sabe leerla.
      throw new Error(`[carry] ${declaracion.id}: «sin-publicar» con un grupo publicado`)
    }
    if (desenlace !== 'coincide') {
      descartes[desenlace] += 1
      continue
    }
    destino.speakerGroup = bloc
    arrastradas += 1
  }

  return {
    items: sugeridas ?? [],
    stats: { intentadas, arrastradas, publicadasSinDestino, descartes },
  }
}
