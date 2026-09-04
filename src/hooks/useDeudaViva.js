// @ts-check
import { useJsonFetch } from './useJsonFetch'

// Saldo vivo de deuda del ayuntamiento (`npm run scrape:deuda-viva`, entrega
// anual del Ministerio de Hacienda). No es el capítulo «Deuda pública» del
// presupuesto, que es lo que se aparta ese año para atenderla.
const EMPTY = { serie: [], ultimo: null, noPublicados: [], stats: null }

export function useDeudaViva() {
  return useJsonFetch('/data/deuda-viva.json', EMPTY)
}
