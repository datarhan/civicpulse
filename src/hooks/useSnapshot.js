// @ts-check
import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from 'react'
import { ensureSnapshot, peekSnapshot, subscribeSnapshot } from '../lib/snapshot-store'

const LOADING_STATE = Object.freeze({ loading: true, error: null, data: null })

/**
 * React binding for the snapshot store. Exact useJsonFetch semantics:
 * {loading, error, data}; 404 + non-null fallback → fallback; errors are
 * per-mount retried (the store never caches them). Pass a module-level
 * constant as `fallback` — it is read through a ref at mapping time, so
 * a fresh literal per render would not churn, matching the old contract.
 *
 * @param {string} path
 * @param {any} [fallback]
 * @returns {{ loading: boolean, error: Error|null, data: any }}
 */
export function useSnapshot(path, fallback = null) {
  const fallbackRef = useRef(fallback)
  fallbackRef.current = fallback
  const subscribe = useCallback((cb) => subscribeSnapshot(path, cb), [path])
  const getSnap = useCallback(() => peekSnapshot(path), [path])
  const entry = useSyncExternalStore(subscribe, getSnap)
  useEffect(() => {
    // Once per mount: starts the first load, and retries when the cached
    // entry is an error (ensureSnapshot refetches on 'error' status).
    ensureSnapshot(path)
  }, [path])
  return useMemo(() => {
    if (!entry || entry.status === 'loading') return LOADING_STATE
    if (entry.status === 'ready') return { loading: false, error: null, data: entry.data }
    if (entry.status === 'missing') {
      const fb = fallbackRef.current
      if (fb != null) return { loading: false, error: null, data: fb }
      return { loading: false, error: entry.error, data: null }
    }
    return { loading: false, error: entry.error, data: null }
  }, [entry])
}
