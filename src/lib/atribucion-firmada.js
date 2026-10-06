// @ts-check
/**
 * El tramo de una atribución firmada, como se lee.
 *
 * El grupo de una declaración lo pone el mapa de voces o, cuando el mapa no
 * acredita quién hablaba, una persona que lo firmó —tras escuchar la sesión o,
 * si no, diciéndolo en su motivo—
 * (`pleno-claim-relabels.json`, src/scraper/atribucion-firmada.ts). La
 * composición estampa `atribucionFirmada` con el tramo sólo en la
 * segunda. Aquí se escribe como lo teclea quien coteja en el reproductor del
 * pleno; las palabras de alrededor son del catálogo (`MarcaDeFirma`).
 */
import { formatTimecode } from '../scraper/quote-reanchor'

/**
 * @param {{ speakerGroup?: string|null, atribucionFirmada?: { desde: number, hasta: number } } | null | undefined} claim
 * @returns {string | null} «1:06:56–1:08:15», o null si el grupo no lo firmó una persona
 */
export function tramoDeFirma(claim) {
  const tramo = claim?.atribucionFirmada
  if (!claim?.speakerGroup || !tramo) return null
  return `${formatTimecode(tramo.desde)}–${formatTimecode(tramo.hasta)}`
}
