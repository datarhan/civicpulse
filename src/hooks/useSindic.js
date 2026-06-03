// @ts-check
import { useJsonFetch } from './useJsonFetch'

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
  cultura: 'Cultura',
  otros: 'Otros',
}

export const SINDIC_SENTIDO_LABEL = {
  recomendacion: 'Recomendación',
  sugerencia: 'Sugerencia',
  'recordatorio-deberes': 'Recordatorio de deberes legales',
  'cierre-sin-recomendacion': 'Cierre sin recomendación',
  inadmitida: 'Inadmitida',
  archivada: 'Archivada',
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
