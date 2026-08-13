// @ts-check
import { CircleMarker, Polyline, Popup } from 'react-leaflet'
import { useGeo } from '../../../hooks/useGeo'
import { useMetroNetwork, indexLineColors } from '../../../hooks/useMetroNetwork'
import { normaliseStationName } from '../shared'
import { readableInk } from '../../../lib/contrast'

/**
 * Render the whole Metrovalencia + FGV network (10 lines · ~1k tracks ·
 * ~215 stations). Tracks are colour-coded by the line ref (L1..L10); a
 * station that serves multiple lines gets a concentric-ring look. Tracks
 * inside the Riba-roja municipality are also rendered by the local
 * `Railways()` component, so we drop our own track render for
 * L9+L2 refs (VT-005/VT-012) to avoid double-stroking near Riba-roja.
 */
export function FullNetwork() {
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
                        color: readableInk(colors[r] || '#64748B'),
                        fontFamily: 'DM Mono, monospace',
                        fontSize: 10,
                        fontWeight: 800,
                        padding: '2px 6px',
                        borderRadius: 'var(--r-input)',
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
                    color: 'var(--civic)',
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
