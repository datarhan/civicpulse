// @ts-check
import { useJsonFetch } from './useJsonFetch'

// Missing suggestions file is expected before any transcription has run;
// resolve to an empty snapshot on 404 rather than an error. Module-level
// constant so the effect deps in useJsonFetch stay stable.
const EMPTY_VOTE_SUGGESTIONS = { items: [], stats: { total: 0 } }

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
  return useJsonFetch('/data/pleno-videos.json')
}

export function usePlenoVoteSuggestions() {
  return useJsonFetch('/data/pleno-votes-suggestions.json', EMPTY_VOTE_SUGGESTIONS)
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
