// @ts-check
import { useMemo } from 'react'
import { useJsonFetch } from './useJsonFetch'

const EMPTY_CORRELATIONS = { items: [], stats: {} }

/**
 * Loads public/data/tender-queja-correlations.json and provides O(1)
 * lookups by quejaId or tenderPermalink. Empty when no correlations have
 * been generated yet — callers should render nothing rather than a
 * "loading" state (a 404 resolves to the empty snapshot).
 */
export function useTenderQuejaCorrelations() {
  return useJsonFetch('/data/tender-queja-correlations.json', EMPTY_CORRELATIONS)
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
