// @ts-check
import { useJsonFetch } from './useJsonFetch'

export function usePlenoAgendas() {
  return useJsonFetch('/data/plenos-agendas.json')
}

export const SECTION_LABEL = {
  apertura: 'Apertura',
  resolutiva: 'Resolutiva',
  informativa: 'Informativa',
  ruegos: 'Ruegos y preguntas',
  otro: '—',
}

export const SECTION_TONE = {
  apertura: 'ghost',
  resolutiva: 'civic',
  informativa: 'intel',
  ruegos: 'ghost',
  otro: 'ghost',
}
