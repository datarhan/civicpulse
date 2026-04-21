// @ts-check
import { useEffect, useState } from 'react'

export function usePlenos() {
  const [state, setState] = useState({ loading: true, error: null, data: null })
  useEffect(() => {
    let cancelled = false
    fetch('/data/plenos.json', { cache: 'no-cache' })
      .then((r) => {
        if (!r.ok) throw new Error(`plenos.json returned ${r.status}`)
        return r.json()
      })
      .then((data) => {
        if (!cancelled) setState({ loading: false, error: null, data })
      })
      .catch((err) => {
        if (!cancelled) setState({ loading: false, error: err, data: null })
      })
    return () => {
      cancelled = true
    }
  }, [])
  return state
}

export const PLENO_TONE = {
  ordinario: 'civic',
  extraordinario: 'warn',
  urgente: 'crit',
  otro: 'ghost',
}

export const PLENO_LABEL = {
  ordinario: 'Ordinario',
  extraordinario: 'Extraordinario',
  urgente: 'Urgente',
  otro: 'Otro',
}
