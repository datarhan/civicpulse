import { useEffect, useState } from 'react'

export function usePlenoAgendas() {
  const [state, setState] = useState({ loading: true, error: null, data: null })
  useEffect(() => {
    let cancelled = false
    fetch('/data/plenos-agendas.json', { cache: 'no-cache' })
      .then((r) => {
        if (!r.ok) throw new Error(`plenos-agendas.json returned ${r.status}`)
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

export const SECTION_LABEL = {
  apertura: 'Apertura',
  resolutiva: 'Resolutiva',
  informativa: 'Informativa',
  ruegos: 'Ruegos y preguntas',
  otro: '—',
}

export const SECTION_TONE = {
  apertura: 'ghost',
  resolutiva: 'civic',
  informativa: 'intel',
  ruegos: 'ghost',
  otro: 'ghost',
}
