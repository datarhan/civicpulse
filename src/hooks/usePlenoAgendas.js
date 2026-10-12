// @ts-check
import { useJsonFetch } from './useJsonFetch'
import { CATALOGUE } from '../i18n'

export function usePlenoAgendas() {
  return useJsonFetch('/data/plenos-agendas.json')
}

/**
 * El rótulo castellano de cada sección del orden del día, leído del catálogo (`pleno.seccion.<valor>`). /plenos/:id
 * lo pinta en el idioma de la interfaz con `rotuloDe`; las páginas que aún no están
 * traducidas siguen leyendo esta tabla y escriben lo mismo que escribían.
 */
export const SECTION_LABEL = {
  apertura: CATALOGUE.es['pleno.seccion.apertura'],
  resolutiva: CATALOGUE.es['pleno.seccion.resolutiva'],
  informativa: CATALOGUE.es['pleno.seccion.informativa'],
  ruegos: CATALOGUE.es['pleno.seccion.ruegos'],
  otro: CATALOGUE.es['pleno.seccion.otro'],
}

export const SECTION_TONE = {
  apertura: 'ghost',
  resolutiva: 'civic',
  informativa: 'intel',
  ruegos: 'ghost',
  otro: 'ghost',
}
