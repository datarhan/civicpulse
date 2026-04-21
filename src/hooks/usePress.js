// @ts-check
import { useEffect, useState } from 'react'

export function usePress() {
  const [state, setState] = useState({ loading: true, error: null, data: null })
  useEffect(() => {
    let cancelled = false
    fetch('/data/press.json', { cache: 'no-cache' })
      .then((r) => {
        if (!r.ok) throw new Error(`press.json returned ${r.status}`)
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

export function timeAgo(iso) {
  if (!iso) return ''
  const then = new Date(iso).getTime()
  const now = Date.now()
  const sec = Math.max(0, Math.floor((now - then) / 1000))
  if (sec < 60) return 'ahora'
  const min = Math.floor(sec / 60)
  if (min < 60) return `hace ${min} min`
  const h = Math.floor(min / 60)
  if (h < 48) return `hace ${h} h`
  const d = Math.floor(h / 24)
  if (d < 14) return `hace ${d} d`
  return new Date(iso).toLocaleDateString('es-ES', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}
