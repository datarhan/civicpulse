// @ts-check
import { useEffect, useState } from 'react'

/**
 * Load the full Metrovalencia + FGV network (10 lines, ~1k track segments,
 * ~215 stations) written by `scripts/scrape-metro-network.ts`. Each track
 * and station carries its `lineRefs: ["L1", "L2", …]` list so the map can
 * colour them by line. Brand colours live on the `lines` summary.
 *
 * This is ~940 KB of JSON — heavier than our typical snapshot. It's loaded
 * lazily by the landing-page map; other pages should not import this hook.
 */
export function useMetroNetwork() {
  const [state, setState] = useState({ loading: true, error: null, data: null })
  useEffect(() => {
    let alive = true
    fetch('/data/metro-network.json')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((data) => {
        if (alive) setState({ loading: false, error: null, data })
      })
      .catch((error) => {
        if (alive) setState({ loading: false, error, data: null })
      })
    return () => {
      alive = false
    }
  }, [])
  return state
}

/** Map helpers — given the network payload, return a { "L1": "#…" } lookup. */
export function indexLineColors(data) {
  const out = {}
  for (const l of data?.lines || []) out[l.ref] = l.color
  return out
}
