// @ts-check
import { useEffect, useState } from 'react'
import {
  CircleMarker,
  MapContainer,
  Marker,
  Polyline,
  Popup,
  TileLayer,
  useMap,
} from 'react-leaflet'
import L from 'leaflet'
import { useGeo } from '../../hooks/useGeo'
import {
  computeOtherStationSchedule,
  computeStationSchedule,
  findMetroStation,
} from '../../hooks/useNextMetro'
import { useMetroNetwork, indexLineColors } from '../../hooks/useMetroNetwork'
import { useMetroSchedule } from '../../hooks/useMetroSchedule'

/** Map each local station's OSM name to the GTFS slug in
 *  metro-schedule.json. Keep in sync with TARGET_STOPS in
 *  scripts/scrape-fgv-gtfs.ts. */
const GTFS_SLUG_BY_NAME = {
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
const METRO_COLOR = '#A47E52' // L9 (icono--linea-9.svg)
const METRO_L2_COLOR = '#B4397F' // L2 (icono--linea-2.svg)
const HEAVY_RAIL_COLOR = '#6B7280'
const BOUNDARY_COLOR = '#C85A3A'

function colorForMetroRef(ref) {
  if (ref === 'VT-005') return METRO_L2_COLOR
  return METRO_COLOR
}

const DEFAULT_CENTER = [39.5439, -0.5711]

function ResizeOnMount() {
  const map = useMap()
  useEffect(() => {
    const id = setTimeout(() => map.invalidateSize(), 120)
    return () => clearTimeout(id)
  }, [map])
  return null
}

function MunicipalBoundary() {
  const { loading, error, data } = useGeo()
  if (loading || error || !data?.boundary) return null
  return (
    <Polyline
      positions={data.boundary.polygon}
      pathOptions={{
        color: BOUNDARY_COLOR,
        weight: 2,
        opacity: 0.55,
        dashArray: '6 4',
        fill: false,
      }}
    />
  )
}

function OsmNeighborhoods() {
  const { loading, error, data } = useGeo()
  if (loading || error || !data?.neighborhoods) return null
  return (
    <>
      {data.neighborhoods.map((n) => {
        const icon = L.divIcon({
          className: 'cp-osm-neigh',
          html: `<div class="cp-osm-neigh-dot"></div>
                 <div class="cp-osm-neigh-label">${n.name}</div>`,
          iconSize: [140, 20],
          iconAnchor: [6, 6],
        })
        return <Marker key={n.id} position={n.centroid} icon={icon} interactive={false} />
      })}
    </>
  )
}

/**
 * Render railway tracks + stations from the real OSM geometry stored in
 * public/data/geo.json. Each way is a separate polyline so branch points
 * render correctly (we don't try to stitch disjoint segments into one ring).
 * Subway/light_rail gets the Metrovalencia yellow; heavy rail gets a muted
 * grey to distinguish Adif's Aranjuez–Valencia line from the passenger metro.
 */
function Railways() {
  const { loading, error, data } = useGeo()
  if (loading || error || !data?.railways) return null
  const ways = data.railways.ways || []
  const stations = data.railways.stations || []
  return (
    <>
      {ways.map((w) => {
        const isMetro = w.kind === 'subway' || w.kind === 'light_rail' || w.kind === 'tram'
        const color = isMetro ? colorForMetroRef(w.ref) : HEAVY_RAIL_COLOR
        return (
          <div key={w.id} style={{ display: 'contents' }}>
            {/* halo for the metro only — keeps heavy rail discreet */}
            {isMetro && (
              <Polyline
                positions={w.line}
                pathOptions={{ color, weight: 9, opacity: 0.18, lineCap: 'round' }}
              />
            )}
            <Polyline
              positions={w.line}
              pathOptions={{
                color,
                weight: isMetro ? 2.5 : 1.5,
                opacity: isMetro ? 0.9 : 0.55,
                lineCap: 'round',
                dashArray: isMetro ? undefined : '4 3',
              }}
            />
          </div>
        )
      })}
      {stations.map((s) => {
        const match = findMetroStation(s.name)
        let fill = HEAVY_RAIL_COLOR
        let radius = 5
        let weight = 1.5
        if (match?.kind === 'l9') {
          fill = METRO_COLOR
          radius = 7
          weight = 2
        } else if (match?.kind === 'other') {
          fill = match.station.lineColor
          radius = 7
          weight = 2
        }
        return (
          <CircleMarker
            key={s.id}
            center={s.centroid}
            radius={radius}
            pathOptions={{
              color: '#0B0F19',
              weight,
              fillColor: fill,
              fillOpacity: match ? 1 : 0.85,
            }}
          >
            <Popup closeButton={true} autoPan={true}>
              <StationSchedulePopup name={s.name} match={match} rawStation={s} />
            </Popup>
          </CircleMarker>
        )
      })}
    </>
  )
}

/** Render the station popup using real FGV GTFS data. At the Riba-roja
 *  terminus we hide the inbound-arrival row (it's just trains pulling
 *  into the terminus, not a boardable departure). */
function GtfsSchedulePopup({ gtfs, match, name }) {
  const isTerminus = match?.kind === 'l9' && match.station.terminus
  const station = match?.station
  const lineColor = match?.kind === 'other' ? station.lineBadgeBg : '#A47E52'
  const lineLabel = match?.kind === 'other' ? station.line : 'L9'
  const departures = isTerminus
    ? gtfs.departures.filter((d) => d.heading !== 'Riba-roja')
    : gtfs.departures
  // Group by line for the badge.
  const lines = [...new Set(departures.map((d) => d.line))]
  return (
    <div style={{ fontFamily: 'Outfit, system-ui, sans-serif', minWidth: 260 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        {lines.map((ln) => (
          <span
            key={ln}
            style={{
              width: 18,
              height: 18,
              borderRadius: '50%',
              background: ln === 'L2' ? '#B4397F' : lineColor,
              color: '#FFFFFF',
              display: 'grid',
              placeItems: 'center',
              fontFamily: 'DM Mono, monospace',
              fontSize: 9,
              fontWeight: 800,
            }}
          >
            {ln}
          </span>
        ))}
        <span style={{ fontWeight: 700, fontSize: 14 }}>{station?.label || name}</span>
        {isTerminus && (
          <span
            style={{
              fontSize: 9,
              fontFamily: 'DM Mono, monospace',
              background: '#EEF4FF',
              color: '#2463EB',
              padding: '2px 5px',
              borderRadius: 3,
              letterSpacing: '.06em',
              textTransform: 'uppercase',
              marginLeft: 'auto',
            }}
          >
            Terminus
          </span>
        )}
      </div>
      <div style={{ borderTop: '1px solid #DCD7C8', paddingTop: 4 }}>
        {departures.map((d) => (
          <div
            key={`${d.line}-${d.heading}`}
            style={{ display: 'flex', alignItems: 'baseline', gap: 8, padding: '4px 0' }}
          >
            <span
              style={{
                fontSize: 10.5,
                color: '#FFFFFF',
                background: d.line === 'L2' ? '#B4397F' : '#A47E52',
                padding: '1px 5px',
                borderRadius: 3,
                fontFamily: 'DM Mono, monospace',
                fontWeight: 700,
              }}
            >
              {d.line}
            </span>
            <span style={{ fontSize: 11, color: 'rgba(11,15,25,.55)', minWidth: 128 }}>
              → {d.heading}
            </span>
            <span
              style={{
                fontFamily: 'DM Mono, monospace',
                fontSize: 13,
                fontWeight: 700,
                color: '#0B0F19',
              }}
            >
              {d.label}
              {d.afterMidnight ? ' (mañana)' : ''}
            </span>
            <span
              style={{
                fontFamily: 'DM Mono, monospace',
                fontSize: 11,
                color: '#B45309',
              }}
            >
              {d.minutesAway === 0 ? 'ahora' : `${d.minutesAway} min`}
            </span>
          </div>
        ))}
      </div>
      <div
        style={{
          marginTop: 8,
          fontSize: 10,
          color: 'rgba(11,15,25,.55)',
          fontFamily: 'DM Mono, monospace',
          letterSpacing: '.04em',
        }}
      >
        FGV GTFS · válido hasta {gtfs.validThrough}
      </div>
      <a
        href="https://www.metrovalencia.es/es/consulta-de-horarios-y-planificador/"
        target="_blank"
        rel="noreferrer"
        style={{
          marginTop: 4,
          display: 'inline-block',
          fontSize: 12,
          color: '#2463EB',
          textDecoration: 'none',
        }}
      >
        Ver horario oficial →
      </a>
    </div>
  )
}

function StationSchedulePopup({ name, match, rawStation }) {
  // Tick every 30s so the popup stays fresh while open. Cheap — no network.
  const [tick, setTick] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setTick(Date.now()), 30_000)
    return () => clearInterval(id)
  }, [])

  // Real GTFS-derived schedule (fallback to hardcoded tables via the
  // existing match.kind === 'l9' / 'other' branches below).
  const { findNext } = useMetroSchedule()
  const gtfsSlug = GTFS_SLUG_BY_NAME[name]
  const gtfs = gtfsSlug ? findNext(gtfsSlug, new Date(tick)) : null

  if (gtfs && gtfs.departures.length > 0 && match) {
    return <GtfsSchedulePopup gtfs={gtfs} match={match} name={name} />
  }

  if (match?.kind === 'other') {
    // Metrovalencia station on a different line (currently L2). Schedule
    // is approximate — computed from published headway + our transcribed
    // station offset; labelled clearly so users verify on fgv.es.
    const { station } = match
    const now = new Date(tick)
    const sched = station.schedule ? computeOtherStationSchedule(station, now) : null
    return (
      <div style={{ fontFamily: 'Outfit, system-ui, sans-serif', minWidth: 260 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <span
            style={{
              width: 18,
              height: 18,
              borderRadius: '50%',
              background: station.lineBadgeBg,
              color: station.lineBadgeColor,
              display: 'grid',
              placeItems: 'center',
              fontFamily: 'DM Mono, monospace',
              fontSize: 9,
              fontWeight: 800,
            }}
          >
            {station.line}
          </span>
          <span style={{ fontWeight: 700, fontSize: 14 }}>{station.label}</span>
        </div>
        {sched ? (
          <div style={{ borderTop: '1px solid #DCD7C8', paddingTop: 4 }}>
            {sched.directions.map((d) => (
              <div
                key={d.heading}
                style={{ display: 'flex', alignItems: 'baseline', gap: 8, padding: '4px 0' }}
              >
                <span style={{ fontSize: 11, color: 'rgba(11,15,25,.55)', minWidth: 120 }}>
                  → {d.heading}
                </span>
                <span
                  style={{
                    fontFamily: 'DM Mono, monospace',
                    fontSize: 13,
                    fontWeight: 700,
                    color: '#0B0F19',
                  }}
                >
                  {d.label}
                  {d.afterMidnight ? ' (mañana)' : ''}
                </span>
                <span
                  style={{
                    fontFamily: 'DM Mono, monospace',
                    fontSize: 11,
                    color: '#B45309',
                  }}
                >
                  {d.minutesAway === 0 ? 'ahora' : `${d.minutesAway} min`}
                </span>
                <span style={{ fontSize: 10, color: 'rgba(11,15,25,.45)' }}>aprox</span>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ borderTop: '1px solid #DCD7C8', paddingTop: 6 }}>
            {station.headings.map((h) => (
              <div
                key={h}
                style={{ display: 'flex', alignItems: 'baseline', gap: 8, padding: '3px 0' }}
              >
                <span style={{ fontSize: 11.5, color: 'rgba(11,15,25,.55)', minWidth: 110 }}>
                  → {h}
                </span>
                <span style={{ fontSize: 11, color: 'rgba(11,15,25,.55)', fontStyle: 'italic' }}>
                  ver horario en metrovalencia.es
                </span>
              </div>
            ))}
          </div>
        )}
        <div
          style={{
            marginTop: 8,
            fontSize: 11,
            color: 'rgba(11,15,25,.65)',
          }}
        >
          {sched
            ? `Línea ${station.line} — horario aproximado (headway ${station.schedule.weekday.intervalMin} min).`
            : `Línea ${station.line} — Metrovalencia (FGV).`}
        </div>
        {sched && (
          <div
            style={{
              marginTop: 4,
              fontSize: 10,
              color: 'rgba(11,15,25,.55)',
              fontFamily: 'DM Mono, monospace',
              letterSpacing: '.04em',
            }}
          >
            Válido hasta {sched.scheduleValidUntil} · confirma en fgv.es
          </div>
        )}
        <a
          href={station.scheduleUrl}
          target="_blank"
          rel="noreferrer"
          style={{
            marginTop: 6,
            display: 'inline-block',
            fontSize: 12,
            color: '#2463EB',
            textDecoration: 'none',
          }}
        >
          Horario oficial {station.line} →
        </a>
      </div>
    )
  }

  if (!match || match.kind !== 'l9') {
    // Not an L9 station — likely Adif heavy-rail (RENFE Cercanías C3
    // Valencia-Utiel passes through the municipality). We don't have a
    // schedule for it; honest fallback directs the user to Renfe.
    return (
      <div style={{ fontFamily: 'Outfit, system-ui, sans-serif', minWidth: 220 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <span
            style={{
              width: 16,
              height: 16,
              borderRadius: '50%',
              background: '#6B7280',
              color: 'white',
              display: 'grid',
              placeItems: 'center',
              fontFamily: 'DM Mono, monospace',
              fontSize: 8,
              fontWeight: 800,
            }}
          >
            RE
          </span>
          <span style={{ fontWeight: 700, fontSize: 14 }}>{name}</span>
        </div>
        <div style={{ borderTop: '1px solid #DCD7C8', paddingTop: 6, fontSize: 12 }}>
          <div style={{ color: 'rgba(11,15,25,.75)', marginBottom: 4 }}>
            Estación sobre la línea de Adif (ferrocarril convencional). No forma parte de L9
            Metrovalencia.
          </div>
          <div style={{ color: 'rgba(11,15,25,.55)', fontSize: 11.5 }}>
            {rawStation?.operator || 'Adif · Red convencional'}
          </div>
        </div>
        <a
          href="https://www.renfe.com/es/es/cercanias/cercanias-valencia"
          target="_blank"
          rel="noreferrer"
          style={{
            marginTop: 8,
            display: 'inline-block',
            fontSize: 12,
            color: '#2463EB',
            textDecoration: 'none',
          }}
        >
          Horarios Renfe Cercanías València →
        </a>
      </div>
    )
  }

  const meta = match.station
  const now = new Date(tick)
  const sched = computeStationSchedule(meta, now)
  const row = (dirLabel, dep, isApprox) => (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, padding: '4px 0' }}>
      <span style={{ fontSize: 11, color: 'rgba(11,15,25,.55)', minWidth: 96 }}>→ {dirLabel}</span>
      <span
        style={{
          fontFamily: 'DM Mono, monospace',
          fontSize: 13,
          fontWeight: 700,
          color: '#0B0F19',
        }}
      >
        {dep.label}
        {dep.afterMidnight ? ' (mañana)' : ''}
      </span>
      <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 11, color: '#B45309' }}>
        {dep.minutesAway === 0 ? 'ahora' : `${dep.minutesAway} min`}
      </span>
      {isApprox && <span style={{ fontSize: 10, color: 'rgba(11,15,25,.45)' }}>aprox</span>}
    </div>
  )

  return (
    <div style={{ fontFamily: 'Outfit, system-ui, sans-serif', minWidth: 240 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          marginBottom: 4,
        }}
      >
        <span
          style={{
            width: 16,
            height: 16,
            borderRadius: '50%',
            background: METRO_COLOR,
            color: '#FFFFFF',
            display: 'grid',
            placeItems: 'center',
            fontFamily: 'DM Mono, monospace',
            fontSize: 8,
            fontWeight: 800,
          }}
        >
          L9
        </span>
        <span style={{ fontWeight: 700, fontSize: 14 }}>{meta.label}</span>
        {meta.terminus && (
          <span
            style={{
              fontSize: 9,
              fontFamily: 'DM Mono, monospace',
              background: '#EEF4FF',
              color: '#2463EB',
              padding: '2px 5px',
              borderRadius: 3,
              letterSpacing: '.06em',
              textTransform: 'uppercase',
              marginLeft: 'auto',
            }}
          >
            Terminus
          </span>
        )}
      </div>
      <div style={{ borderTop: '1px solid #DCD7C8', paddingTop: 4 }}>
        {row(sched.outbound.heading, sched.outbound, false)}
        {!meta.terminus && row(sched.inbound.heading, sched.inbound, sched.approximateInbound)}
      </div>
      <div
        style={{
          marginTop: 6,
          fontSize: 10,
          color: 'rgba(11,15,25,.55)',
          fontFamily: 'DM Mono, monospace',
          letterSpacing: '.04em',
        }}
      >
        Horario transcrito de fgv.es · válido hasta {sched.scheduleValidUntil}
      </div>
      <a
        href="https://www.metrovalencia.es"
        target="_blank"
        rel="noreferrer"
        style={{
          marginTop: 4,
          display: 'inline-block',
          fontSize: 12,
          color: '#2463EB',
          textDecoration: 'none',
        }}
      >
        Ver horario oficial →
      </a>
    </div>
  )
}

/**
 * Render the whole Metrovalencia + FGV network (10 lines · ~1k tracks ·
 * ~215 stations). Tracks are colour-coded by the line ref (L1..L10); a
 * station that serves multiple lines gets a concentric-ring look. Tracks
 * inside the Riba-roja municipality are also rendered by the local
 * `Railways()` component above, so we drop our own track render for
 * L9+L2 refs (VT-005/VT-012) to avoid double-stroking near Riba-roja.
 */
function normaliseStationName(n) {
  return (n || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // strip diacritics: Masía → Masia
    .toLowerCase()
    .trim()
}

function FullNetwork() {
  const { loading, error, data } = useMetroNetwork()
  const { data: geo } = useGeo()
  if (loading || error || !data) return null
  const colors = indexLineColors(data)
  // Stations already rendered at full size by the local Railways() layer.
  // Skip them here to avoid double-markers. Match on a diacritic-stripped,
  // case-folded key since OSM carries both "Masia de Traver" and
  // "Masía de Traver" as separate nodes.
  const localStationKeys = new Set(
    (geo?.railways?.stations || []).map((s) => normaliseStationName(s.name)),
  )
  return (
    <>
      {data.tracks.map((t) => {
        // Colour = the first line's colour (when a track is shared by
        // multiple lines, the brand colour matches either — picking the
        // lowest-numbered line keeps things deterministic).
        const ref = t.lineRefs[0]
        const color = colors[ref] || '#64748B'
        return (
          <div key={t.id} style={{ display: 'contents' }}>
            {/* Thin treatment for the whole regional network. Tracks
                inside the municipality get over-drawn by Railways() below
                with a bolder halo + stroke so local detail still reads as
                dominant — the user's civic focus area.  */}
            <Polyline
              positions={t.line}
              pathOptions={{
                color: '#0B0F19',
                weight: 2.4,
                opacity: 0.42,
                lineCap: 'round',
              }}
            />
            <Polyline
              positions={t.line}
              pathOptions={{
                color,
                weight: 1.3,
                opacity: 0.9,
                lineCap: 'round',
              }}
            />
          </div>
        )
      })}
      {data.stations.map((s) => {
        if (localStationKeys.has(normaliseStationName(s.name))) return null
        const refs = s.lineRefs
        const fill = colors[refs[0]] || '#64748B'
        return (
          <CircleMarker
            key={s.id}
            center={s.centroid}
            radius={3.5}
            pathOptions={{
              color: '#0B0F19',
              weight: 1,
              fillColor: fill,
              fillOpacity: 1,
            }}
          >
            <Popup closeButton={true} autoPan={true}>
              <div style={{ fontFamily: 'Outfit, system-ui, sans-serif', minWidth: 180 }}>
                <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 6 }}>{s.name}</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {refs.map((r) => (
                    <span
                      key={r}
                      style={{
                        background: colors[r] || '#64748B',
                        color: '#FFFFFF',
                        fontFamily: 'DM Mono, monospace',
                        fontSize: 10,
                        fontWeight: 800,
                        padding: '2px 6px',
                        borderRadius: 3,
                      }}
                    >
                      {r}
                    </span>
                  ))}
                </div>
                <a
                  href="https://www.metrovalencia.es"
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    marginTop: 8,
                    display: 'inline-block',
                    fontSize: 12,
                    color: '#2463EB',
                    textDecoration: 'none',
                  }}
                >
                  Ver horarios en metrovalencia.es →
                </a>
              </div>
            </Popup>
          </CircleMarker>
        )
      })}
    </>
  )
}

function NetworkLegend() {
  const { data } = useMetroNetwork()
  if (!data?.lines) return null
  return (
    <div
      style={{
        position: 'absolute',
        bottom: 28,
        right: 12,
        background: 'rgba(255,255,255,.92)',
        border: '1px solid #DCD7C8',
        borderRadius: 7,
        padding: '5px 8px',
        fontFamily: "'Outfit', system-ui, sans-serif",
        zIndex: 400,
        boxShadow: '0 4px 14px rgba(11,15,25,.08)',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        whiteSpace: 'nowrap',
      }}
    >
      <span
        style={{
          fontFamily: "'DM Mono', monospace",
          fontSize: 8.5,
          color: 'rgba(11,15,25,.55)',
          letterSpacing: '.1em',
          textTransform: 'uppercase',
          flexShrink: 0,
        }}
      >
        Metrovalencia
      </span>
      <div style={{ display: 'inline-flex', gap: 3 }}>
        {data.lines.map((l) => (
          <span
            key={l.ref}
            title={l.name}
            style={{
              background: l.color,
              color: '#FFFFFF',
              fontFamily: "'DM Mono', monospace",
              fontSize: 8.5,
              fontWeight: 800,
              padding: '1px 4px',
              borderRadius: 3,
              lineHeight: 1.3,
            }}
          >
            {l.ref}
          </span>
        ))}
      </div>
    </div>
  )
}

function MapAttribution() {
  return (
    <div
      style={{
        position: 'absolute',
        bottom: 8,
        left: 16,
        fontFamily: "'DM Mono', monospace",
        fontSize: 9,
        color: 'rgba(11,15,25,.45)',
        letterSpacing: '.08em',
        textTransform: 'uppercase',
        zIndex: 400,
        pointerEvents: 'none',
      }}
    >
      OSM · CARTO Voyager · Metrovalencia (L1–L10) + Adif
    </div>
  )
}

export default function StylizedMap({ center = DEFAULT_CENTER }) {
  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', background: '#EFE9D9' }}>
      <MapContainer
        center={center}
        zoom={13}
        minZoom={10}
        maxZoom={17}
        className="cp-stylized-map"
        zoomControl
        scrollWheelZoom
        style={{ width: '100%', height: '100%' }}
        attributionControl={false}
        worldCopyJump={false}
      >
        <ResizeOnMount />

        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
          subdomains={['a', 'b', 'c', 'd']}
          attribution=""
        />

        <FullNetwork />
        <MunicipalBoundary />
        <OsmNeighborhoods />
        <Railways />
      </MapContainer>

      <NetworkLegend />
      <MapAttribution />
    </div>
  )
}
