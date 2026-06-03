// @ts-check
import { useEffect, useState } from 'react'

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

export function useJournalistReports() {
  const [state, setState] = useState({ loading: true, error: null, data: null })
  useEffect(() => {
    let alive = true
    fetch('/data/journalist-reports.json', { cache: 'no-cache' })
      .then((r) => {
        if (r.status === 404)
          return {
            version: '1.0',
            generatedAt: '',
            legalNotice: '',
            contactUrl: '',
            methodologyUrl: '/metodologia',
            items: [],
          }
        if (!r.ok) throw new Error(`journalist-reports returned ${r.status}`)
        return r.json()
      })
      .then((data) => {
        if (alive) setState({ loading: false, error: null, data })
      })
      .catch((error) => {
        if (alive) setState({ loading: false, error, data: null })
      })
    return () => {
      alive = false
    }
  }, [])
  return state
}

export function useJournalistReportById(assignmentOrReportId) {
  const all = useJournalistReports()
  const report =
    all.data?.items?.find((r) => r.assignmentId === assignmentOrReportId) ??
    all.data?.items?.find((r) => r.id === assignmentOrReportId) ??
    null
  return { ...all, report }
}
