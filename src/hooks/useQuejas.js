// @ts-check
import { useJsonFetch } from './useJsonFetch'
import { CATALOGUE, rotuloDe, useT } from '../i18n'

/**
 * El rótulo castellano de cada estado, leído del catálogo. La ficha de una queja lo
 * pinta en el idioma de la interfaz con `quejas.estado.<estado>`; las páginas que
 * aún no están traducidas siguen leyendo esta tabla y escriben lo que escribían.
 */
export const STATE_LABEL = {
  capturada: CATALOGUE.es['quejas.estado.capturada'],
  apoyada_verificada: CATALOGUE.es['quejas.estado.apoyada_verificada'],
  registrada: CATALOGUE.es['quejas.estado.registrada'],
  notificada_10d: CATALOGUE.es['quejas.estado.notificada_10d'],
  en_tramite: CATALOGUE.es['quejas.estado.en_tramite'],
  resuelta: CATALOGUE.es['quejas.estado.resuelta'],
  silencio_negativo: CATALOGUE.es['quejas.estado.silencio_negativo'],
  escalada_sindic: CATALOGUE.es['quejas.estado.escalada_sindic'],
  cerrada_no_registrada: CATALOGUE.es['quejas.estado.cerrada_no_registrada'],
}

export const STATE_TONE = {
  capturada: 'neutral',
  apoyada_verificada: 'civic',
  registrada: 'civic',
  notificada_10d: 'civic',
  en_tramite: 'intel',
  resuelta: 'ok',
  silencio_negativo: 'warn',
  escalada_sindic: 'crit',
  cerrada_no_registrada: 'ghost',
}

/**
 * El rótulo castellano de cada categoría, leído del catálogo, como `STATE_LABEL`: la
 * ficha lo pinta con `quejas.categoria.<categoría>`.
 */
export const CATEGORY_LABEL = {
  via_publica: CATALOGUE.es['quejas.categoria.via_publica'],
  limpieza: CATALOGUE.es['quejas.categoria.limpieza'],
  zonas_verdes: CATALOGUE.es['quejas.categoria.zonas_verdes'],
  alumbrado: CATALOGUE.es['quejas.categoria.alumbrado'],
  trafico: CATALOGUE.es['quejas.categoria.trafico'],
  mobiliario_urbano: CATALOGUE.es['quejas.categoria.mobiliario_urbano'],
  ruido: CATALOGUE.es['quejas.categoria.ruido'],
  agua_saneamiento: CATALOGUE.es['quejas.categoria.agua_saneamiento'],
  transporte: CATALOGUE.es['quejas.categoria.transporte'],
  transparencia: CATALOGUE.es['quejas.categoria.transparencia'],
  urbanismo: CATALOGUE.es['quejas.categoria.urbanismo'],
  accesibilidad: CATALOGUE.es['quejas.categoria.accesibilidad'],
  seguridad: CATALOGUE.es['quejas.categoria.seguridad'],
  cultura: CATALOGUE.es['quejas.categoria.cultura'],
  educacion: CATALOGUE.es['quejas.categoria.educacion'],
  servicios_sociales: CATALOGUE.es['quejas.categoria.servicios_sociales'],
  medio_ambiente: CATALOGUE.es['quejas.categoria.medio_ambiente'],
  residuos: CATALOGUE.es['quejas.categoria.residuos'],
  comercio: CATALOGUE.es['quejas.categoria.comercio'],
  fiestas: CATALOGUE.es['quejas.categoria.fiestas'],
  vivienda: CATALOGUE.es['quejas.categoria.vivienda'],
  agricultura: CATALOGUE.es['quejas.categoria.agricultura'],
  mayores: CATALOGUE.es['quejas.categoria.mayores'],
  juventud: CATALOGUE.es['quejas.categoria.juventud'],
  turismo: CATALOGUE.es['quejas.categoria.turismo'],
  salud: CATALOGUE.es['quejas.categoria.salud'],
  deportes: CATALOGUE.es['quejas.categoria.deportes'],
  igualdad: CATALOGUE.es['quejas.categoria.igualdad'],
  bienestar_animal: CATALOGUE.es['quejas.categoria.bienestar_animal'],
  otros: CATALOGUE.es['quejas.categoria.otros'],
}

/**
 * El rótulo de una categoría y de un estado, en el idioma de la interfaz.
 *
 * `CATEGORY_LABEL` y `STATE_LABEL` son el castellano del catálogo y siguen
 * siendo la reserva: existen para que una superficie sin catálogo no pueda
 * discrepar de una con él. Pero /quejas y /quejas/dashboard las leían TAL CUAL
 * dentro de un `LocaleProvider`, así que con la interfaz en valencià seguían
 * escribiendo «Neteja» como «Limpieza» — con las claves traducidas ya escritas
 * desde #59, esperando a que alguien las leyera.
 *
 * Un enum del bot no es dato del lector: `service_code` y `status` son máquina,
 * y el rótulo que los nombra es interfaz. Por eso se traducen, mientras que el
 * texto de la queja —que lo escribió un vecino— se queda como está.
 */
export function useEtiquetasDeQueja() {
  const t = useT()
  return {
    categoria: (code) => rotuloDe(t, `quejas.categoria.${code}`, CATEGORY_LABEL[code] || code),
    estado: (code) => rotuloDe(t, `quejas.estado.${code}`, STATE_LABEL[code] || code),
  }
}

export function useQuejas() {
  return useJsonFetch('/data/quejas.json')
}

export function useQuejaResponses() {
  return useJsonFetch('/data/quejas-responses.json')
}

// Re-exported from the shared formatters module so existing call sites
// (`import { timeAgo, prettyNeighborhood } from '../hooks/useQuejas'`) keep working.
export { timeAgo, prettyNeighborhood } from '../lib/formatters'
