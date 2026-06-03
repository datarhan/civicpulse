// @ts-check
import { useJsonFetch } from './useJsonFetch'

export const ASSIGNMENT_STATUS_LABEL = {
  pending: 'Pendiente',
  running: 'Ejecutando',
  drafted: 'Borrador',
  promoted: 'Publicado',
  failed: 'Fallido',
}

export const ASSIGNMENT_STATUS_TONE = {
  pending: 'ghost',
  running: 'intel',
  drafted: 'warn',
  promoted: 'ok',
  failed: 'crit',
}

// Shipped before the first `journalist:assign` run produces the file → a 404
// resolves to this empty snapshot instead of erroring the page.
const EMPTY_ASSIGNMENTS = { version: '1.0', generatedAt: '', items: [] }

export function useJournalistAssignments() {
  return useJsonFetch('/data/journalist-assignments.json', EMPTY_ASSIGNMENTS)
}
