// @ts-check
import { useJsonFetch } from './useJsonFetch'

export const STATE_LABEL = {
  capturada: 'Capturada',
  apoyada_verificada: 'Verificada',
  registrada: 'Registrada en sede',
  notificada_10d: 'Acuse recibido',
  en_tramite: 'En trámite',
  resuelta: 'Resuelta',
  silencio_negativo: 'Silencio administrativo',
  escalada_sindic: 'Escalada al Síndic',
  cerrada_no_registrada: 'Cerrada sin registrar',
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

export const CATEGORY_LABEL = {
  via_publica: 'Vía pública',
  limpieza: 'Limpieza',
  zonas_verdes: 'Zonas verdes',
  alumbrado: 'Alumbrado',
  trafico: 'Tráfico',
  mobiliario_urbano: 'Mobiliario urbano',
  ruido: 'Ruido',
  agua_saneamiento: 'Agua y saneamiento',
  transporte: 'Transporte',
  transparencia: 'Transparencia',
  urbanismo: 'Urbanismo',
  accesibilidad: 'Accesibilidad',
  seguridad: 'Seguridad',
  cultura: 'Cultura',
  educacion: 'Educación',
  servicios_sociales: 'Servicios sociales',
  medio_ambiente: 'Medio ambiente',
  residuos: 'Residuos',
  comercio: 'Comercio',
  fiestas: 'Fiestas',
  vivienda: 'Vivienda',
  agricultura: 'Agricultura',
  mayores: 'Mayores',
  juventud: 'Juventud',
  turismo: 'Turismo',
  salud: 'Salud',
  deportes: 'Deportes',
  igualdad: 'Igualdad',
  bienestar_animal: 'Bienestar animal',
  otros: 'Otros',
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
