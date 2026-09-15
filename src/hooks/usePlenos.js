// @ts-check
import { useJsonFetch } from './useJsonFetch'
import { CATALOGUE } from '../i18n'

export function usePlenos() {
  return useJsonFetch('/data/plenos.json')
}

export const PLENO_TONE = {
  ordinario: 'civic',
  extraordinario: 'warn',
  urgente: 'crit',
  otro: 'ghost',
}

/**
 * El rótulo castellano de cada clase de sesión, leído del catálogo. La portada lo
 * pinta en el idioma de la interfaz con `pleno.tipo.<clase>`; las páginas que aún no
 * están traducidas siguen leyendo esta tabla y escriben lo mismo que escribían.
 */
export const PLENO_LABEL = {
  ordinario: CATALOGUE.es['pleno.tipo.ordinario'],
  extraordinario: CATALOGUE.es['pleno.tipo.extraordinario'],
  urgente: CATALOGUE.es['pleno.tipo.urgente'],
  otro: CATALOGUE.es['pleno.tipo.otro'],
}
