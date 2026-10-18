// @ts-check
import { useEffect } from 'react'
import { useMap } from 'react-leaflet'

/** Map each local station's OSM name to the GTFS slug in
 *  metro-schedule.json. Keep in sync with TARGET_STOPS in
 *  scripts/scrape-fgv-gtfs.ts. */
export const GTFS_SLUG_BY_NAME = {
  'Riba-roja de Túria': 'riba-roja-de-turia',
  'Masia de Traver': 'masia-de-traver',
  'Masía de Traver': 'masia-de-traver',
  'València la Vella': 'valencia-la-vella',
  'El Clot': 'el-clot',
}

// Metrovalencia official line brand colours (sourced from
// metrovalencia.es icon SVGs, April 2026). Adif heavy-rail uses a muted
// grey to read as secondary. OSM ref tags on the track ways:
//   VT-012 → Metrovalencia L9 (Riba-roja terminus line, 3 local stops)
//   VT-005 → Metrovalencia L2 (Llíria line; El Clot is the local stop)
// Verified by geographic-nearest mapping between stations and ways.
export const METRO_COLOR = '#A47E52' // L9 (icono--linea-9.svg)
export const METRO_L2_COLOR = '#B4397F' // L2 (icono--linea-2.svg)
export const HEAVY_RAIL_COLOR = '#6B7280'
export const BOUNDARY_COLOR = '#C85A3A'

export function colorForMetroRef(ref) {
  if (ref === 'VT-005') return METRO_L2_COLOR
  return METRO_COLOR
}

export const DEFAULT_CENTER = [39.5439, -0.5711]

/**
 * Lo que la cinta «DIRECTO» ocupa del borde de arriba del mapa, más 8 px de aire:
 * LiveTicker la pone a `top: 14` con `height: 36`, y por encima de todo lo que va en
 * el mapa (z-index 401). Nada que tenga que leerse entero puede subir de aquí.
 */
export const BAJO_LA_CINTA = 58

/**
 * Margen de arriba para el auto-pan de una ficha: la cinta «DIRECTO» de la portada
 * (LiveTicker: `top: 14`, `height: 36`) va encima del mapa, y una ficha que Leaflet
 * dejaba pegada al borde superior quedaba con su cabecera debajo. A 375 px la ficha
 * de un contrato llena el mapa y Leaflet no la puede encajar entera; entonces manda
 * el margen de arriba, así que lo que va bajo la cabecera —el enlace a la ficha del
 * barrio— queda a la vista.
 */
export const MARGEN_FICHA_ARRIBA = /** @type {[number, number]} */ ([5, BAJO_LA_CINTA])

export function ResizeOnMount() {
  const map = useMap()
  useEffect(() => {
    const id = setTimeout(() => map.invalidateSize(), 120)
    return () => clearTimeout(id)
  }, [map])
  return null
}

// Leaflet divIcon html is raw innerHTML. Neighborhood names come verbatim
// from community-edited OSM tags, so escape them — a poisoned tag must never
// execute in visitors' browsers.
export function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

// FullNetwork de-dupes stations against the local Railways() layer by a
// diacritic-stripped, case-folded key (OSM carries both "Masia de Traver"
// and "Masía de Traver" as separate nodes).
export function normaliseStationName(n) {
  return (n || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // strip diacritics: Masía → Masia
    .toLowerCase()
    .trim()
}
