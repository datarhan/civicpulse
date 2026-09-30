// @ts-check
import { useJsonFetch } from './useJsonFetch'
import { CATALOGUE } from '../i18n'

export function useParticipa() {
  return useJsonFetch('/data/participa.json')
}

export const KIND_ICON = {
  activity: '🧑‍🤝‍🧑',
  survey: '📋',
  other: '📢',
}

/**
 * Los rótulos en castellano, leídos del catálogo para que no haya dos copias. Los
 * usa /cambios, que todavía no pasa el rótulo por el idioma de la interfaz; el
 * mapa de la portada ya lo hace con `participa.tipo.<clase>`.
 */
export const KIND_LABEL = {
  activity: CATALOGUE.es['participa.tipo.activity'],
  survey: CATALOGUE.es['participa.tipo.survey'],
  other: CATALOGUE.es['participa.tipo.other'],
}
