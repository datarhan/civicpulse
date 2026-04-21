// @ts-check
import { useEffect, useState, useMemo } from 'react'
import { usePlenos } from './usePlenos'
import { usePlenoVideos } from './usePlenoVideos'

/**
 * Is there a pleno scheduled today? If yes, surface the session + the
 * matching YouTube video so the landing map can pulse a "EN SESIÓN"
 * indicator linking to the livestream.
 *
 * Contract:
 *   - `today` is always the local date in `YYYY-MM-DD`, re-checked every
 *     5 minutes so a browser tab left open overnight still flips to the
 *     right day at midnight.
 *   - Returns `{ inSession: false, pleno: null, video: null }` on
 *     normal days (most of the month).
 *   - Session window is the full calendar day — we don't have the
 *     actual hour the pleno starts in plenos.json (the convocatoria
 *     carries it but we don't scrape that field yet), so the pulse
 *     stays on all day. Acceptable — it's the "today there's a pleno"
 *     signal, not minute-precision.
 */

function isoToday() {
  return new Date().toISOString().slice(0, 10)
}

export function useTodayPleno() {
  const { data: plenos } = usePlenos()
  const { data: videos } = usePlenoVideos()
  const [today, setToday] = useState(isoToday)

  useEffect(() => {
    const id = setInterval(() => setToday(isoToday()), 5 * 60 * 1000)
    return () => clearInterval(id)
  }, [])

  return useMemo(() => {
    const items = plenos?.items || []
    const pleno = items.find((p) => p.date === today)
    if (!pleno) return { inSession: false, pleno: null, video: null, today }
    const video = (videos?.items || []).find((v) => v.plenoDate === today) || null
    return { inSession: true, pleno, video, today }
  }, [plenos, videos, today])
}
