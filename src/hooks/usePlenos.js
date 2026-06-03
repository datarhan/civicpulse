// @ts-check
import { useJsonFetch } from './useJsonFetch'

export function usePlenos() {
  return useJsonFetch('/data/plenos.json')
}

export const PLENO_TONE = {
  ordinario: 'civic',
  extraordinario: 'warn',
  urgente: 'crit',
  otro: 'ghost',
}

export const PLENO_LABEL = {
  ordinario: 'Ordinario',
  extraordinario: 'Extraordinario',
  urgente: 'Urgente',
  otro: 'Otro',
}
