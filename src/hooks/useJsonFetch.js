// @ts-check
import { useEffect, useRef, useState } from 'react'

/**
 * Shared loader for the static JSON snapshots under /public/data.
 *
 * Every domain hook (usePadron, usePress, useTenders, …) composes this. It
 * owns the {loading, error, data} lifecycle, the no-cache fetch, and the
 * unmount-cancellation guard so a late response never sets state on an
 * unmounted component. Domain hooks keep their own co-located label maps and
 * helper exports; only the fetch boilerplate moves here.
 *
 * `fallback` lets a hook treat a **404** as "snapshot not generated yet" and
 * resolve to a default-shaped object instead of erroring — the curated /
 * curator-promoted snapshots (journalist reports/assignments) ship before
 * their first run produces a file. Any other non-ok status still throws.
 * Pass a **module-level constant** as `fallback` (not a fresh literal): the
 * effect deps stay `[path]` and `fallback` is read through a ref, so a stable
 * reference avoids re-fetch churn while a new object each render would not.
 *
 * @param {string} path  absolute public path, e.g. '/data/padron.json'
 * @param {any} [fallback]  value to resolve to on a 404 (default: null → 404 throws)
 * @returns {{ loading: boolean, error: Error|null, data: any }}
 */
export function useJsonFetch(path, fallback = null) {
  const [state, setState] = useState({ loading: true, error: null, data: null })
  const fallbackRef = useRef(fallback)
  fallbackRef.current = fallback
  useEffect(() => {
    let cancelled = false
    fetch(path, { cache: 'no-cache' })
      .then((r) => {
        if (r.status === 404 && fallbackRef.current != null) return fallbackRef.current
        if (!r.ok) throw new Error(`${path} returned ${r.status}`)
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
  }, [path])
  return state
}
