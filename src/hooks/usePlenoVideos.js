// @ts-check
import { useJsonFetch } from './useJsonFetch'

// Removed 2026-08-01, all unused with zero importers anywhere in src/:
//
//   · KIND_LABEL / KIND_TONE — PlenoDetalle renders only `video.url` and
//     `video.title`, so a video's `kind` reaches no surface. Which is just as
//     well: the classifier misses the upstream typo "Ple extrordinari" and
//     disagrees with plenos.json on two records.
//   · usePlenoVoteSuggestions — pleno-votes-suggestions.json is regenerated
//     daily by the pipeline and rendered nowhere. The curator vote queue reads
//     it server-side, not through this hook. (It also lived in the wrong
//     module: votes are not videos.)
//
// Dead exports are worse than no exports here — they read as "this surface
// exists", and the next person wires a page to a hook nothing feeds.

export function usePlenoVideos() {
  return useJsonFetch('/data/pleno-videos.json')
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
