// @ts-check
import { useJsonFetch } from './useJsonFetch'
import { CATALOGUE } from '../i18n'

export const SINDIC_MATERIA_LABEL = {
  urbanismo: 'Urbanismo',
  vivienda: 'Vivienda',
  'medio-ambiente': 'Medio ambiente',
  'via-publica': 'Vía pública',
  'servicios-publicos': 'Servicios públicos',
  seguridad: 'Seguridad',
  'hacienda-tributaria': 'Hacienda',
  transparencia: 'Transparencia',
  contratacion: 'Contratación',
  'servicios-sociales': 'Servicios sociales',
  salud: 'Salud',
  educacion: 'Educación',
  igualdad: 'Igualdad',
  'procedimiento-administrativo': 'Procedimiento administrativo',
  'empleo-publico': 'Empleo público',
  cultura: 'Cultura',
  otros: 'Otros',
}

/**
 * El rótulo castellano de cada `sentido`, leído del catálogo, como `STATE_LABEL` en
 * useQuejas: /quejas lo pinta en el idioma de la interfaz con
 * `quejas.sindic.sentido.<sentido>`, y una copia aquí podría discrepar de él.
 */
export const SINDIC_SENTIDO_LABEL = {
  recomendacion: CATALOGUE.es['quejas.sindic.sentido.recomendacion'],
  sugerencia: CATALOGUE.es['quejas.sindic.sentido.sugerencia'],
  'recordatorio-deberes': CATALOGUE.es['quejas.sindic.sentido.recordatorio-deberes'],
  'cierre-sin-recomendacion': CATALOGUE.es['quejas.sindic.sentido.cierre-sin-recomendacion'],
  inadmitida: CATALOGUE.es['quejas.sindic.sentido.inadmitida'],
  archivada: CATALOGUE.es['quejas.sindic.sentido.archivada'],
}

export const SINDIC_SENTIDO_TONE = {
  recomendacion: 'warn',
  sugerencia: 'civic',
  'recordatorio-deberes': 'crit',
  'cierre-sin-recomendacion': 'ok',
  inadmitida: 'ghost',
  archivada: 'ghost',
}

export function useSindic() {
  return useJsonFetch('/data/sindic.json')
}
