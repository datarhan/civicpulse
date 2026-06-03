// @ts-check
import { useJsonFetch } from './useJsonFetch'

export const LEGAL_SENSITIVITY_LABEL = {
  low: 'Sensibilidad legal: baja',
  medium: 'Sensibilidad legal: media',
  high: 'Sensibilidad legal: alta',
}

export const LEGAL_SENSITIVITY_TONE = {
  low: 'ghost',
  medium: 'warn',
  high: 'crit',
}

export const CITATION_KIND_LABEL = {
  'local-snapshot': 'Dato local',
  web: 'Web',
  'official-doc': 'Documento oficial',
  wikidata: 'Wikidata',
  wikipedia: 'Wikipedia',
  boe: 'BOE',
}

export const CITATION_TRUST_TONE = {
  high: 'ok',
  medium: 'warn',
  low: 'crit',
}

// Shipped before the first `promote-report` run produces the file → a 404
// resolves to this empty snapshot instead of erroring the page.
const EMPTY_REPORTS = {
  version: '1.0',
  generatedAt: '',
  legalNotice: '',
  contactUrl: '',
  methodologyUrl: '/metodologia',
  items: [],
}

export function useJournalistReports() {
  return useJsonFetch('/data/journalist-reports.json', EMPTY_REPORTS)
}

export function useJournalistReportById(assignmentOrReportId) {
  const all = useJournalistReports()
  const report =
    all.data?.items?.find((r) => r.assignmentId === assignmentOrReportId) ??
    all.data?.items?.find((r) => r.id === assignmentOrReportId) ??
    null
  return { ...all, report }
}
