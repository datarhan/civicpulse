// @ts-check
import { useJsonFetch } from './useJsonFetch'

/**
 * Open job vacancies from the Riba-roja municipal employment agency (ADL),
 * scraped nightly into /data/empleo.json. Both the list fields and the
 * per-offer detail "ficha" live in this one snapshot, so /empleo/:id reads the
 * same file and finds its offer by id — no separate per-offer fetch.
 */
export function useEmpleo() {
  return useJsonFetch('/data/empleo.json')
}

export const OFERTA_STATUS_TONE = {
  Abierta: 'ok',
  Cerrada: 'ghost',
  Adjudicada: 'neutral',
  Anulada: 'crit',
}

export const OFERTA_STATUS_LABEL = {
  Abierta: 'Abierta',
  Cerrada: 'Cerrada',
  Adjudicada: 'Adjudicada',
  Anulada: 'Anulada',
}

/**
 * Days-until-deadline + an urgency tone for the Pill. Returns null when the
 * offer carries no "Fin inscripciones" date.
 *
 * @param {string|null|undefined} iso  ISO deadline (YYYY-MM-DD)
 * @param {number} [now]  epoch ms (injectable for tests)
 * @returns {{ days: number, tone: string, closed: boolean, closingSoon: boolean }|null}
 */
export function deadlineInfo(iso, now = Date.now()) {
  if (!iso) return null
  const days = Math.ceil((Date.parse(iso) - now) / 86400000)
  let tone = 'ok'
  if (days < 0)
    tone = 'ghost' // already closed
  else if (days <= 7)
    tone = 'crit' // closes within a week
  else if (days <= 14) tone = 'warn' // closing soon
  return { days, tone, closed: days < 0, closingSoon: days >= 0 && days <= 14 }
}
