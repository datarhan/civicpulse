// @ts-check
import { useEffect, useState } from 'react'

/**
 * Shared loader for the static JSON snapshots under /public/data.
 *
 * Every domain hook (usePadron, usePress, useTenders, …) composes this. It
 * owns the {loading, error, data} lifecycle, the no-cache fetch, and the
 * unmount-cancellation guard so a late response never sets state on an
 * unmounted component. Domain hooks keep their own co-located label maps and
 * helper exports; only the fetch boilerplate moves here.
 *
 * @param {string} path  absolute public path, e.g. '/data/padron.json'
 * @returns {{ loading: boolean, error: Error|null, data: any }}
 */
export function useJsonFetch(path) {
  const [state, setState] = useState({ loading: true, error: null, data: null })
  useEffect(() => {
    let cancelled = false
    fetch(path, { cache: 'no-cache' })
      .then((r) => {
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
