// @ts-check
import { useJsonFetch } from './useJsonFetch'

// Quarterly budget-EXECUTION snapshot (ejecutado vs. presupuestado). Ships empty
// until the first scrape; a 404 resolves to the empty shape rather than erroring.
const EMPTY = { periods: [], latest: null }

export function useBudgetExecution() {
  return useJsonFetch('/data/budget-execution.json', EMPTY)
}
