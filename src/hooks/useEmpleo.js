// @ts-check
import { useJsonFetch } from './useJsonFetch'
import { isOfferClosed, OFERTA_STATUS_TONE } from '../scraper/empleo'

/**
 * Open job vacancies from the Riba-roja municipal employment agency (ADL),
 * scraped nightly into /data/empleo.json. Both the list fields and the
 * per-offer detail "ficha" live in this one snapshot, so /empleo/:id reads the
 * same file and finds its offer by id — no separate per-offer fetch.
 */
export function useEmpleo() {
  return useJsonFetch('/data/empleo.json')
}

// Re-exportados, NO redeclarados. Eran dos copias idénticas byte a byte de las
// del scraper, que es justo la forma que abre docs/DATA_INTEGRITY.md: seis
// pruebas recitaron una forma y se quedaron verdes mientras producción no
// casaba nada. Coincidían hoy; el problema es que nada obligaba a que siguieran
// coincidiendo mañana.
export { OFERTA_STATUS_TONE, OFERTA_STATUS_LABEL } from '../scraper/empleo'

/**
 * Days-until-deadline + an urgency tone for the Pill. Returns null when the
 * offer carries no "Fin inscripciones" date.
 *
 * @param {string|null|undefined} iso  ISO deadline (YYYY-MM-DD)
 * @param {number} [now]  epoch ms (injectable for tests)
 * @returns {{ days: number, tone: string, closed: boolean, closingSoon: boolean }|null}
 */
/**
 * The status to SHOW, which is not always the status the portal publishes.
 *
 * portalemp's own `status` field is not maintained: two live offers carry
 * "Abierta" with closing dates of 2026-06-30 and 2026-01-15 — one of them seven
 * months past. The card renders that pill next to a computed deadline pill, so
 * the same offer said "Abierta" and "cerrada" side by side, and a job seeker
 * could click through to apply for something long dead.
 *
 * A date that has passed is a fact; the upstream label is a claim. Prefer the
 * fact.
 */
export function effectiveStatus(offer, now = Date.now()) {
  const info = deadlineInfo(offer?.deadline, now)
  if (info?.closed) return { label: 'Cerrada', tone: 'ghost', overridden: true }
  return {
    label: offer?.status,
    tone: OFERTA_STATUS_TONE[offer?.status] || offer?.statusTone || 'neutral',
    overridden: false,
  }
}

export function deadlineInfo(iso, now = Date.now()) {
  if (!iso) return null
  const days = Math.ceil((Date.parse(iso) - now) / 86400000)
  let tone = 'ok'
  if (days < 0)
    tone = 'ghost' // already closed
  else if (days <= 7)
    tone = 'crit' // closes within a week
  else if (days <= 14) tone = 'warn' // closing soon
  // `closed` sale del predicado compartido, no de un `days < 0` local: es el
  // mismo que cuenta el scraper y el mismo que suma el KPI.
  return {
    days,
    tone,
    closed: isOfferClosed({ deadline: iso }, now),
    closingSoon: days >= 0 && days <= 14,
  }
}
