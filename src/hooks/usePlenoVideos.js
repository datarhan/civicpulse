// @ts-check
import { useEffect, useState } from 'react'

export const KIND_LABEL = {
  ordinario: 'Ordinario',
  extraordinario: 'Extraordinario',
  urgente: 'Urgente',
  otro: 'Otro',
}

export const KIND_TONE = {
  ordinario: 'civic',
  extraordinario: 'intel',
  urgente: 'warn',
  otro: 'neutral',
}

export function usePlenoVideos() {
  const [state, setState] = useState({ loading: true, error: null, data: null })
  useEffect(() => {
    let alive = true
    fetch('/data/pleno-videos.json')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((data) => { if (alive) setState({ loading: false, error: null, data }) })
      .catch((error) => { if (alive) setState({ loading: false, error, data: null }) })
    return () => { alive = false }
  }, [])
  return state
}

export function usePlenoVoteSuggestions() {
  const [state, setState] = useState({ loading: true, error: null, data: null })
  useEffect(() => {
    let alive = true
    fetch('/data/pleno-votes-suggestions.json')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((data) => { if (alive) setState({ loading: false, error: null, data }) })
      .catch(() => {
        // Missing suggestions file is expected before any transcription has run;
        // surface as empty rather than error.
        if (alive) setState({ loading: false, error: null, data: { items: [], stats: { total: 0 } } })
      })
    return () => { alive = false }
  }, [])
  return state
}

/** Build a Map<plenoId, videoEntry> for O(1) lookups in render. */
export function indexVideosByPleno(videosData, plenosData) {
  const videos = videosData?.items || []
  const plenos = plenosData?.items || []
  const byDate = new Map()
  for (const v of videos) byDate.set(v.plenoDate, v)
  const byPleno = new Map()
  for (const p of plenos) {
    const v = byDate.get(p.date)
    if (v) byPleno.set(p.id, v)
  }
  return byPleno
}
