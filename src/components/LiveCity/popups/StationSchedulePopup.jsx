// @ts-check
import { useEffect, useState } from 'react'
import { computeOtherStationSchedule, computeStationSchedule } from '../../../hooks/useNextMetro'
import { useMetroSchedule } from '../../../hooks/useMetroSchedule'
import { ExtLink } from '../../Primitives'
import { GTFS_SLUG_BY_NAME, METRO_COLOR } from '../shared'
import { readableInk } from '../../../lib/contrast'
import { GtfsSchedulePopup } from './GtfsSchedulePopup'

export function StationSchedulePopup({ name, match, rawStation }) {
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
              fontSize: 'var(--fs-micro)',
              fontWeight: 800,
            }}
          >
            {station.line}
          </span>
          <span style={{ fontWeight: 700, fontSize: 'var(--fs-body)' }}>{station.label}</span>
        </div>
        {sched ? (
          <div style={{ borderTop: '1px solid #DCD7C8', paddingTop: 4 }}>
            {sched.directions.map((d) => (
              <div
                key={d.heading}
                style={{ display: 'flex', alignItems: 'baseline', gap: 8, padding: '4px 0' }}
              >
                <span
                  style={{
                    fontSize: 'var(--fs-micro)',
                    color: 'rgba(11,15,25,.55)',
                    minWidth: 120,
                  }}
                >
                  → {d.heading}
                </span>
                <span
                  style={{
                    fontFamily: 'DM Mono, monospace',
                    fontSize: 'var(--fs-aux)',
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
                    fontSize: 'var(--fs-micro)',
                    color: '#B45309',
                  }}
                >
                  {d.minutesAway === 0 ? 'ahora' : `${d.minutesAway} min`}
                </span>
                <span style={{ fontSize: 'var(--fs-micro)', color: 'rgba(11,15,25,.45)' }}>
                  aprox
                </span>
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
                <span
                  style={{
                    fontSize: 'var(--fs-micro)',
                    color: 'rgba(11,15,25,.55)',
                    minWidth: 110,
                  }}
                >
                  → {h}
                </span>
                <span
                  style={{
                    fontSize: 'var(--fs-micro)',
                    color: 'rgba(11,15,25,.55)',
                  }}
                >
                  ver horario en metrovalencia.es
                </span>
              </div>
            ))}
          </div>
        )}
        <div
          style={{
            marginTop: 8,
            fontSize: 'var(--fs-micro)',
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
              fontSize: 'var(--fs-micro)',
              color: 'rgba(11,15,25,.55)',
              fontFamily: 'DM Mono, monospace',
              letterSpacing: '.04em',
            }}
          >
            Válido hasta {sched.scheduleValidUntil} · confirma en fgv.es
          </div>
        )}
        <ExtLink
          href={station.scheduleUrl}
          style={{
            marginTop: 6,
            display: 'inline-block',
            fontSize: 'var(--fs-meta)',
            color: 'var(--civic)',
            textDecoration: 'none',
          }}
        >
          Horario oficial {station.line} →
        </ExtLink>
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
              fontSize: 'var(--fs-micro)',
              fontWeight: 800,
            }}
          >
            RE
          </span>
          <span style={{ fontWeight: 700, fontSize: 'var(--fs-body)' }}>{name}</span>
        </div>
        <div style={{ borderTop: '1px solid #DCD7C8', paddingTop: 6, fontSize: 'var(--fs-meta)' }}>
          <div style={{ color: 'rgba(11,15,25,.75)', marginBottom: 4 }}>
            Estación sobre la línea de Adif (ferrocarril convencional). No forma parte de L9
            Metrovalencia.
          </div>
          <div style={{ color: 'rgba(11,15,25,.55)', fontSize: 'var(--fs-micro)' }}>
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
            fontSize: 'var(--fs-meta)',
            color: 'var(--civic)',
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
      <span style={{ fontSize: 'var(--fs-micro)', color: 'rgba(11,15,25,.55)', minWidth: 96 }}>
        → {dirLabel}
      </span>
      <span
        style={{
          fontFamily: 'DM Mono, monospace',
          fontSize: 'var(--fs-aux)',
          fontWeight: 700,
          color: '#0B0F19',
        }}
      >
        {dep.label}
        {dep.afterMidnight ? ' (mañana)' : ''}
      </span>
      <span
        style={{ fontFamily: 'DM Mono, monospace', fontSize: 'var(--fs-micro)', color: '#B45309' }}
      >
        {dep.minutesAway === 0 ? 'ahora' : `${dep.minutesAway} min`}
      </span>
      {isApprox && (
        <span style={{ fontSize: 'var(--fs-micro)', color: 'rgba(11,15,25,.45)' }}>aprox</span>
      )}
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
            color: readableInk(METRO_COLOR),
            display: 'grid',
            placeItems: 'center',
            fontFamily: 'DM Mono, monospace',
            fontSize: 'var(--fs-micro)',
            fontWeight: 800,
          }}
        >
          L9
        </span>
        <span style={{ fontWeight: 700, fontSize: 'var(--fs-body)' }}>{meta.label}</span>
        {meta.terminus && (
          <span
            style={{
              fontSize: 'var(--fs-micro)',
              fontFamily: 'DM Mono, monospace',
              background: '#EEF4FF',
              color: 'var(--civic)',
              padding: '2px 5px',
              borderRadius: 'var(--r-input)',
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
          fontSize: 'var(--fs-micro)',
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
          fontSize: 'var(--fs-meta)',
          color: 'var(--civic)',
          textDecoration: 'none',
        }}
      >
        Ver horario oficial →
      </a>
    </div>
  )
}
