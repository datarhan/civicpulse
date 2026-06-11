// @ts-check
import { useJsonFetch } from './useJsonFetch'
import { fmtDateShort } from '../lib/formatters'

export function useTenders() {
  return useJsonFetch('/data/tenders.json')
}

export const STATUS_LABEL = {
  awarded: 'Adjudicado',
  revoked: 'Desistido',
  in_progress: 'En curso',
  open: 'Abierto',
  finalized: 'Finalizado',
  draft: 'Borrador',
  pending: 'Pendiente',
  closed: 'Cerrado',
  evaluation: 'Valoración',
  withdrawn: 'Retirado',
  unknown: 'Sin clasificar',
}

export const STATUS_TONE = {
  awarded: 'ok',
  revoked: 'warn',
  in_progress: 'civic',
  open: 'civic',
  finalized: 'neutral',
  draft: 'ghost',
  pending: 'ghost',
  closed: 'neutral',
  evaluation: 'civic',
  withdrawn: 'warn',
  unknown: 'ghost',
}

// Kept as a re-export shim — pages historically import formatDate from here.
export function formatDate(iso) {
  return fmtDateShort(iso)
}
