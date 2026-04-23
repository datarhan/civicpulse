// @ts-check
import { useEffect, useState } from 'react'

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
  const [state, setState] = useState({ loading: true, error: null, data: null })
  useEffect(() => {
    let alive = true
    fetch('/data/pleno-findings.json', { cache: 'no-cache' })
      .then((r) => {
        if (r.status === 404) return { items: [] }
        if (!r.ok) throw new Error(`pleno-findings returned ${r.status}`)
        return r.json()
      })
      .then((data) => {
        if (alive) setState({ loading: false, error: null, data })
      })
      .catch((error) => {
        if (alive) setState({ loading: false, error, data: null })
      })
    return () => {
      alive = true
    }
  }, [])
  return state
}
