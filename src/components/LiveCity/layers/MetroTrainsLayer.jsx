// @ts-check
import { useEffect, useRef, useState } from 'react'
import { CircleMarker, Tooltip } from 'react-leaflet'
import { useGeo } from '../../../hooks/useGeo'
import { L9_STATIONS } from '../../../hooks/useNextMetro'
import { METRO_COLOR, normaliseStationName } from '../shared'
import { trainPositionsAt } from '../../../lib/metro-train'

// Representative round-trip glide period. NOT the real 30-min headway — a
// visible cadence for a schematic marker, disclosed as "representativo".
const CYCLE_MS = 26000

function prefersReducedMotion() {
  return (
    typeof window !== 'undefined' &&
    !!window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

/** Join the 3 L9 stations to their real OSM centroids, ordered along the line. */
function orderedL9Stations(geo) {
  const stations = geo?.railways?.stations || []
  const byName = new Map(stations.map((s) => [normaliseStationName(s.name), s.centroid]))
  return [...L9_STATIONS]
    .sort((a, b) => a.offsetFromTerminusMin - b.offsetFromTerminusMin)
    .map((s) => ({ id: s.id, name: s.label, pos: byName.get(normaliseStationName(s.osmName)) }))
    .filter((s) => Array.isArray(s.pos))
}

/**
 * A single schematic L9 train easing between the real station centroids. Driven
 * by one throttled (~15 fps) rAF loop, cancelled on unmount / toggle-off. Under
 * prefers-reduced-motion the loop never starts and the train sits parked at the
 * terminus. Deliberately labelled "representativo · horario 2025" — see
 * src/lib/metro-train.js for why this is a representation, not a live position.
 */
export function MetroTrainsLayer() {
  const { data: geo } = useGeo()
  const reduce = prefersReducedMotion()
  const [elapsed, setElapsed] = useState(0)
  const raf = useRef(0)
  const startRef = useRef(0)
  const lastRef = useRef(0)

  useEffect(() => {
    if (reduce) return undefined
    const loop = (t) => {
      if (!startRef.current) startRef.current = t
      if (t - lastRef.current >= 66) {
        setElapsed(t - startRef.current)
        lastRef.current = t
      }
      raf.current = requestAnimationFrame(loop)
    }
    raf.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf.current)
  }, [reduce])

  const stations = orderedL9Stations(geo)
  if (stations.length < 2) return null
  const trains = trainPositionsAt(stations, reduce ? 0 : elapsed, CYCLE_MS)

  return (
    <>
      {trains.map((tr) => (
        <CircleMarker
          key={tr.id}
          center={tr.pos}
          radius={6}
          pathOptions={{ color: '#FFFFFF', weight: 2.5, fillColor: METRO_COLOR, fillOpacity: 1 }}
        >
          <Tooltip direction="top">
            <div style={{ fontFamily: 'Outfit, sans-serif', fontSize: 12 }}>
              <strong>L9 Metrovalencia</strong>
              <br />
              <span style={{ fontSize: 10.5, color: '#B45309' }}>
                representativo · horario 2025
              </span>
            </div>
          </Tooltip>
        </CircleMarker>
      ))}
    </>
  )
}
