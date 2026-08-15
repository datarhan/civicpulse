/**
 * Recuperar la atribución de bloc que una re-extracción tiró — sin inventar una
 * sola.
 *
 * El 2026-08-13 la extracción volvió a correr sobre todos los plenos con UN
 * solo mapa de voces en disco (`pleno-speaker-map/15uvjew.json`, el único que
 * ha existido nunca en git). El extractor avisa por escrito de lo que pasa
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
 * sólo cuando se puede demostrar que son la misma cita. Lo que sale de aquí no
 * añade ni una afirmación nueva sobre ningún grupo municipal; deja el corpus
 * diciendo lo que hoy dice.
 *
 * El arreglo de fondo es otro y sigue pendiente: regenerar los mapas de voces y
 * volver a extraer. Mientras tanto, esto impide que una re-extracción se lleve
 * por delante trabajo de atribución que costó meses.
 *
 * Cuatro condiciones, y las cuatro tienen que cumplirse:
 *
 *   · mismo id de claim
 *   · verbatim IDÉNTICO byte a byte — un id estable sobre un texto que se movió
 *     colgaría un bloc de otras palabras, y estas superficies nombran a grupos
 *     municipales
 *   · el destino no tiene bloc — jamás se pisa una atribución viva
 *   · el bloc de origen está en `SPEAKER_GROUPS`, importado de pleno-votes.ts y
 *     no recopiado aquí (regla nº1 de docs/DATA_INTEGRITY.md)
 */
import { SPEAKER_GROUPS } from './pleno-votes'

/**
 * Por qué se descartó cada arrastre que no se hizo.
 *
 * Exportado y recorrido: un total de «arrastradas» sin desglose es
 * indistinguible de una pasada que no intentó nada, que es la regla nº2 de
 * docs/DATA_INTEGRITY.md.
 */
export const MOTIVOS_DE_DESCARTE = [
  'verbatim-distinto',
  'destino-ya-atribuido',
  'bloc-fuera-del-enum',
] as const

export type MotivoDeDescarte = (typeof MOTIVOS_DE_DESCARTE)[number]

interface CitaPublicada {
  claim?: { id?: string; speakerGroup?: string | null; verbatim?: string } | null
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
 */
export function arrastrarAtribucion<T extends CitaSugerida>(
  publicadas: CitaPublicada[],
  sugeridas: T[],
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
    if ((destino.verbatim ?? '') !== (p.claim?.verbatim ?? '')) {
      descartes['verbatim-distinto'] += 1
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
