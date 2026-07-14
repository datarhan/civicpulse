// @ts-check
import { useEffect, useRef } from 'react'
import { useMap } from 'react-leaflet'
import L from 'leaflet'

/**
 * On layer enable, make sure every pin is actually on screen: the map's
 * default framing centers the casco and can clip the southern strip — Leaflet
 * culls off-view circles to an empty path, so a clipped pin silently doesn't
 * paint and nothing hints it exists. If any pin lies outside the current view,
 * fitBounds to the pins (padded; never zooms in). One-shot per layer enable —
 * waits for the snapshot if it's still loading, and deliberately does NOT
 * refit on later filter/timeline changes (a map that keeps jumping is worse
 * than a stable frame).
 */
export function FitToPins({ points }) {
  const map = useMap()
  const fitted = useRef(false)
  useEffect(() => {
    if (fitted.current || !points.length) return
    fitted.current = true
    const bounds = L.latLngBounds(points)
    if (!map.getBounds().contains(bounds)) {
      map.fitBounds(bounds, { padding: [48, 48], maxZoom: map.getZoom() })
    }
  }, [map, points])
  return null
}
