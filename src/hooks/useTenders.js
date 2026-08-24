// @ts-check
import { useJsonFetch } from './useJsonFetch'
import { fmtDateShort } from '../lib/formatters'

export function useTenders() {
  return useJsonFetch('/data/tenders.json')
}

/**
 * El vocabulario de estados y su rótulo en castellano, ATADOS POR EL COMPILADOR.
 *
 * `src/scraper/tenders.ts` exporta el enum; esto lo rehacía a mano y las dos
 * listas se separaron. Medido el 24-08-2026 sobre el snapshot publicado: 413 de
 * 1.234 filas caían al `|| c.status` de Pill y pintaban su estado como un token
 * inglés crudo —`formalized` (316), `void` (56), `provisionally_awarded` (26),
 * `abandoned` (15)— en el gris `ghost`, que es el del centinela. `formalized`
 * significa FIRMADO, el estado más comprometido que existe, y se leía igual que
 * «Sin clasificar».
 *
 * `Record<EstadoContrato, …>` es lo que impide que vuelva a pasar: un estado
 * nuevo en el enum deja de compilar `npm run typecheck`. Mismo patrón que
 * `DEPARTMENT_LABEL` en `src/scraper/departments.ts`. La importación es SÓLO DE
 * TIPO —se borra al compilar— para no arrastrar `csv-parse` al navegador.
 *
 * Los rótulos de los tres estados cancelados se comprobaron contra la ficha de
 * PLACSP de una fila de cada uno, no se tradujeron a ojo:
 *
 *   · `abandoned` → «Resultado: Desistimiento», verbatim. Es el desistimiento,
 *     y «Desistido» llevaba desde siempre en la fila de `revoked`.
 *   · `revoked` → la ficha habla de un acuerdo de no celebrar el contrato, que
 *     es la renuncia del art. 152 LCSP. Una sola ficha y no un campo rotulado:
 *     menos firme que la anterior.
 *   · `void` → no se pudo arbitrar. El «Estado» de PLACSP es del EXPEDIENTE y
 *     las filas de Gobierto son por lote, así que un expediente «Resuelta»
 *     puede contener un lote anulado. Se deja el cognado literal.
 *
 * @typedef {import('../scraper/tenders').ContractStatus
 *   | import('../scraper/tenders').TenderStatus} EstadoContrato
 */

/** @type {Record<EstadoContrato, string>} */
export const STATUS_LABEL = {
  // Dinero comprometido.
  awarded: 'Adjudicado',
  formalized: 'Formalizado',
  // Se llamó atrás: el dinero nunca llegó a comprometerse.
  void: 'Anulado',
  revoked: 'Renuncia',
  abandoned: 'Desistido',
  withdrawn: 'Retirado',
  // Todavía en marcha.
  provisionally_awarded: 'Provisional',
  in_progress: 'En curso',
  open: 'Abierto',
  evaluation: 'Valoración',
  pending: 'Pendiente',
  draft: 'Borrador',
  // Cerrados y el centinela.
  finalized: 'Finalizado',
  closed: 'Cerrado',
  unknown: 'Sin clasificar',
}

/** @type {Record<EstadoContrato, 'ok'|'warn'|'crit'|'civic'|'intel'|'neutral'|'ghost'>} */
export const STATUS_TONE = {
  // Adjudicado y formalizado son el mismo hecho para quien lee —el dinero está
  // comprometido—, así que comparten tono. Que `formalized` cayera al `ghost`
  // del centinela es la mitad de por qué el listado se leía como se leía.
  awarded: 'ok',
  formalized: 'ok',
  void: 'warn',
  revoked: 'warn',
  abandoned: 'warn',
  withdrawn: 'warn',
  provisionally_awarded: 'civic',
  in_progress: 'civic',
  open: 'civic',
  evaluation: 'civic',
  pending: 'ghost',
  draft: 'ghost',
  finalized: 'neutral',
  closed: 'neutral',
  unknown: 'ghost',
}

// Kept as a re-export shim — pages historically import formatDate from here.
export function formatDate(iso) {
  return fmtDateShort(iso)
}
