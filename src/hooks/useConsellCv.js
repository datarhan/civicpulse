import { useEffect, useState } from 'react'

export function useConsellCv() {
  const [state, setState] = useState({ loading: true, error: null, data: null })
  useEffect(() => {
    let cancelled = false
    fetch('/data/consell-cv.json', { cache: 'no-cache' })
      .then((r) => {
        if (!r.ok) throw new Error(`consell-cv.json ${r.status}`)
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
