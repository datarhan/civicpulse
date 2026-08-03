import { useTodayEvents } from '../../hooks/useTodayEvents'
import { SANS, MONO } from './tokens'
import { ExtLink } from '../../components/Primitives'

function EventTicker() {
  const { events } = useTodayEvents()
  if (events.length === 0) return null
  // Keep it to the top 2 so the card never dominates the map.
  const top = events.slice(0, 2)
  return (
    <div
      style={{
        position: 'absolute',
        left: '50%',
        transform: 'translateX(-50%)',
        bottom: 36,
        zIndex: 400,
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        pointerEvents: 'none',
        fontFamily: SANS,
        maxWidth: 560,
        width: 'calc(100% - 64px)',
      }}
    >
      {top.map((ev) => (
        <ExtLink
          key={ev.id}
          href={ev.url}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            background: 'rgba(14,20,34,.82)',
            backdropFilter: 'blur(14px)',
            WebkitBackdropFilter: 'blur(14px)',
            border: '1px solid rgba(96,165,250,.22)',
            borderRadius: 10,
            padding: '9px 13px',
            color: 'white',
            textDecoration: 'none',
            pointerEvents: 'auto',
            minWidth: 0,
          }}
          title={`${ev.kindLabel} · ${ev.date}`}
        >
          <span style={{ fontSize: 16, lineHeight: 1 }} aria-hidden="true">
            {ev.icon}
          </span>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div
              style={{
                fontFamily: MONO,
                fontSize: 9,
                color: 'rgba(255,255,255,.55)',
                letterSpacing: '.12em',
              }}
            >
              {ev.isToday ? 'HOY EN RIBA-ROJA' : 'MAÑANA EN RIBA-ROJA'} ·{' '}
              {ev.kindLabel.toUpperCase()}
            </div>
            <div
              style={{
                fontFamily: SANS,
                fontSize: 13,
                fontWeight: 600,
                color: '#E2E8F0',
                marginTop: 2,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {ev.title}
            </div>
          </div>
          <span
            style={{
              fontFamily: MONO,
              fontSize: 10,
              color: '#F5B544',
              letterSpacing: '.06em',
              flexShrink: 0,
            }}
          >
            participa ›
          </span>
        </ExtLink>
      ))}
    </div>
  )
}

function MapAttribution() {
  return (
    <div
      style={{
        position: 'absolute',
        top: 82,
        right: 14,
        zIndex: 400,
        maxWidth: 240,
        fontSize: 9.5,
        // Attribution sits directly on the map tiles, whose luminance we do
        // not control, so it carried its own contrast with a soft shadow and
        // measured 1.37:1 against the terrain. An opaque dark plate under it
        // makes the pairing deterministic instead of tile-dependent.
        color: 'rgba(255,255,255,.92)',
        // .55 still let the tiles through to 4.43:1. .78 makes the plate
        // dominant enough that the ratio no longer depends on what is under it.
        background: 'rgba(11,15,25,.78)',
        padding: '3px 6px',
        borderRadius: 4,
        fontFamily: MONO,
        letterSpacing: '.04em',
        pointerEvents: 'none',
        textAlign: 'right',
        lineHeight: 1.4,
      }}
    >
      Límite OSM · relación 342356
      <br />
      Barrios OSM · L9 MetroValencia
    </div>
  )
}
export { EventTicker, MapAttribution }
