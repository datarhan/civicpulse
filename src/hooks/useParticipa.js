import { useEffect, useState } from 'react'

export function useParticipa() {
  const [state, setState] = useState({ loading: true, error: null, data: null })
  useEffect(() => {
    let cancelled = false
    fetch('/data/participa.json', { cache: 'no-cache' })
      .then((r) => {
        if (!r.ok) throw new Error(`participa.json returned ${r.status}`)
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

export const KIND_ICON = {
  activity: '🧑‍🤝‍🧑',
  survey: '📋',
  other: '📢',
}

export const KIND_LABEL = {
  activity: 'Actividad',
  survey: 'Encuesta',
  other: 'Aviso',
}
