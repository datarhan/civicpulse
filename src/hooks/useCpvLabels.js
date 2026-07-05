// @ts-check
import { useJsonFetch } from './useJsonFetch'

const EMPTY_CPV_LABELS = {
  generatedAt: null,
  source: null,
  count: 0,
  codes: {},
}

/**
 * Trimmed CPV-2008 → Spanish-label dictionary (built by
 * `scripts/build-cpv-labels.ts`). Consumers pass `data.codes` to
 * `cpvLabel(code, codes)` in `src/lib/cpv.js`, which degrades to embedded
 * division labels for anything missing — so an empty fetch is harmless.
 */
export function useCpvLabels() {
  return useJsonFetch('/data/cpv-labels.json', EMPTY_CPV_LABELS)
}
