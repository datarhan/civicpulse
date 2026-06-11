// @ts-check
import { useJsonFetch } from './useJsonFetch'

// The findings file ships empty until the first curator promotion; a 404
// resolves to an empty snapshot rather than an error.
const EMPTY_FINDINGS = { items: [] }

export const SEVERITY_LABEL = {
  informational: 'Informativo',
  notable: 'Relevante',
  critical: 'Crítico',
}

export const SEVERITY_TONE = {
  informational: 'ghost',
  notable: 'warn',
  critical: 'crit',
}

export function usePlenoFindings() {
  return useJsonFetch('/data/pleno-findings.json', EMPTY_FINDINGS)
}
