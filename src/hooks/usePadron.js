// @ts-check
import { useEffect, useState } from 'react'

export function usePadron() {
  const [state, setState] = useState({ loading: true, error: null, data: null })
  useEffect(() => {
    let cancelled = false
    fetch('/data/padron.json', { cache: 'no-cache' })
      .then((r) => {
        if (!r.ok) throw new Error(`padron.json returned ${r.status}`)
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
