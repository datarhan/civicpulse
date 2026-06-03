// @ts-check
import { useEffect, useMemo, useState } from 'react'

/**
 * Loads public/data/tender-queja-correlations.json and provides O(1)
 * lookups by quejaId or tenderPermalink. Empty when no correlations have
 * been generated yet — callers should render nothing rather than a
 * "loading" state (the file always exists, even if empty).
 */
export function useTenderQuejaCorrelations() {
  const [state, setState] = useState({ loading: true, error: null, data: null })
  useEffect(() => {
    let alive = true
    fetch('/data/tender-queja-correlations.json')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((data) => {
        if (alive) setState({ loading: false, error: null, data })
      })
      .catch(() => {
        if (alive) setState({ loading: false, error: null, data: { items: [], stats: {} } })
      })
    return () => {
      alive = false
    }
  }, [])
  return state
}

export function indexCorrelationsByQueja(data) {
  const map = new Map()
  for (const item of data?.items || []) {
    const arr = map.get(item.quejaId) || []
    arr.push(item)
    map.set(item.quejaId, arr)
  }
  return map
}

export function indexCorrelationsByTender(data) {
  const map = new Map()
  for (const item of data?.items || []) {
    const arr = map.get(item.tenderPermalink) || []
    arr.push(item)
    map.set(item.tenderPermalink, arr)
  }
  return map
}

/** Convenience wrappers for UI. */
export function correlationsForQueja(data, quejaId) {
  return (data?.items || []).filter((it) => it.quejaId === quejaId)
}

export function correlationsForTender(data, permalink) {
  return (data?.items || []).filter((it) => it.tenderPermalink === permalink)
}

export function useCorrelationMaps() {
  const { data, loading, error } = useTenderQuejaCorrelations()
  const byQueja = useMemo(() => indexCorrelationsByQueja(data), [data])
  const byTender = useMemo(() => indexCorrelationsByTender(data), [data])
  return { loading, error, data, byQueja, byTender }
}
