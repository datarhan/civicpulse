// @ts-check
import { useJsonFetch } from './useJsonFetch'
import { videoDeSesion } from '../scraper/pleno-video-fuentes'

// Removed 2026-08-01, all unused with zero importers anywhere in src/:
//
//   · KIND_LABEL / KIND_TONE — PlenoDetalle renders only `video.url` and
//     `video.title`, so a video's `kind` reaches no surface. Which is just as
//     well: the classifier reads only the title, and the title can disagree
//     with plenos.json (2025-07-31: «Ple Extraordinari», the session is
//     «urgente»). Since 2026-10-27 it reads the upstream typo «extrordinari».
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

/** El vídeo que incrusta la página de cada sesión en regmeet (segunda fuente). */
export function usePlenoVideosRegmeet() {
  return useJsonFetch('/data/pleno-videos-regmeet.json')
}

/**
 * Map<plenoId, { ytId, url, title, fuentes }> para buscar en el render. Una
 * sesión en la que el canal y regmeet discrepan no entra: no se enseña ninguno
 * de los dos (`src/scraper/pleno-video-fuentes.ts`). Sin `regmeetData` (aún
 * cargando, o ausente) es el índice del canal por fecha de siempre.
 */
export function indexVideosByPleno(videosData, plenosData, regmeetData = null) {
  const canal = videosData?.items || []
  const regmeet = regmeetData?.items || []
  const plenos = plenosData?.items || []
  const byPleno = new Map()
  for (const p of plenos) {
    const { video } = videoDeSesion(p, canal, regmeet)
    if (video) byPleno.set(p.id, video)
  }
  return byPleno
}
