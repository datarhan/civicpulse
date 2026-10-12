// @ts-check
import { useJsonFetch } from './useJsonFetch'
import { CATALOGUE } from '../i18n'

// The findings file ships empty until the first curator promotion; a 404
// resolves to an empty snapshot rather than an error.
const EMPTY_FINDINGS = { items: [] }

/**
 * El rótulo castellano de cada gravedad de un hallazgo, leído del catálogo (`pleno.gravedad.<valor>`). /plenos/:id
 * lo pinta en el idioma de la interfaz con `rotuloDe`; las páginas que aún no están
 * traducidas siguen leyendo esta tabla y escriben lo mismo que escribían.
 */
export const SEVERITY_LABEL = {
  informational: CATALOGUE.es['pleno.gravedad.informational'],
  notable: CATALOGUE.es['pleno.gravedad.notable'],
  critical: CATALOGUE.es['pleno.gravedad.critical'],
}

export const SEVERITY_TONE = {
  informational: 'ghost',
  notable: 'warn',
  critical: 'crit',
}

export function usePlenoFindings() {
  return useJsonFetch('/data/pleno-findings.json', EMPTY_FINDINGS)
}
