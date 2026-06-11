// @ts-check
import { useJsonFetch } from './useJsonFetch'

export function usePromises() {
  return useJsonFetch('/data/promises.json')
}

export function usePromiseSuggestions() {
  return useJsonFetch('/data/promise-suggestions.json')
}

export function isPromiseFrozen(snap, now = new Date()) {
  if (!snap?.frozenUntil) return false
  try {
    return now < new Date(snap.frozenUntil)
  } catch {
    return false
  }
}

// Historical alias of the canonical palette (despite the name it holds hex
// values, not design-token tones). Gains Ciudadanos for free; Otro stays
// the neutral slate.
export { PARTY_COLORS as PARTY_TONE } from '../lib/party-colors'

export const STATUS_LABEL = {
  documentada: 'Documentada',
  'en-verificacion': 'En verificación',
  'en-progreso': 'En progreso',
  cumplida: 'Cumplida',
  parcial: 'Parcial',
  'no-ejecutada': 'No ejecutada',
  inviable: 'Inviable',
}

export const STATUS_TONE = {
  documentada: 'ghost',
  'en-verificacion': 'civic',
  'en-progreso': 'civic',
  cumplida: 'ok',
  parcial: 'warn',
  'no-ejecutada': 'crit',
  inviable: 'neutral',
}

export const TOPIC_LABEL = {
  fiscal: 'Fiscal',
  vivienda: 'Vivienda',
  movilidad: 'Movilidad',
  'medio-ambiente': 'Medio ambiente',
  social: 'Acción social',
  cultura: 'Cultura',
  seguridad: 'Seguridad',
  empleo: 'Empleo',
  urbanismo: 'Urbanismo',
  salud: 'Salud',
  participacion: 'Participación',
  educacion: 'Educación',
  deporte: 'Deporte',
  juventud: 'Juventud',
  mayores: 'Mayores',
  igualdad: 'Igualdad',
  transparencia: 'Transparencia',
  other: 'Otros',
}
