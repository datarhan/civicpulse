// @ts-check
import { readableInk } from '../../../lib/contrast'

/** Render the station popup using real FGV GTFS data. At the Riba-roja
 *  terminus we hide the inbound-arrival row (it's just trains pulling
 *  into the terminus, not a boardable departure). */
export function GtfsSchedulePopup({ gtfs, match, name }) {
  const isTerminus = match?.kind === 'l9' && match.station.terminus
  const station = match?.station
  const lineColor = match?.kind === 'other' ? station.lineBadgeBg : '#A47E52'
  const departures = isTerminus
    ? gtfs.departures.filter((d) => d.heading !== 'Riba-roja')
    : gtfs.departures
  // Group by line for the badge.
  const lines = [...new Set(departures.map((d) => d.line))]
  // Honesty: metro-schedule.json's validThrough can lie in the past (FGV hasn't
  // republished). Don't claim "válido hasta" a date that has already passed —
  // present it as a reference year instead.
  const validDate = gtfs.validThrough ? new Date(gtfs.validThrough) : null
  const expired = !!validDate && validDate.getTime() < Date.now()
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
              color: readableInk(ln === 'L2' ? '#B4397F' : lineColor),
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
                color: readableInk(d.line === 'L2' ? '#B4397F' : '#A47E52'),
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
        {expired
          ? `FGV GTFS · horario ${validDate.getFullYear()} (referencia)`
          : `FGV GTFS · válido hasta ${gtfs.validThrough}`}
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
