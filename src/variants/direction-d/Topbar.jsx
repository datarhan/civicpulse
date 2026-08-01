import { useEffect, useState } from 'react'
import { Ic } from '../../components/Icons'
import { useLiveWeather, describeWmo } from '../../hooks/useLiveWeather'
import { useNextMetro } from '../../hooks/useNextMetro'
import { useMetroSchedule } from '../../hooks/useMetroSchedule'
import { useAirQuality, describeAqi } from '../../hooks/useAirQuality'
import { PALETTE, SANS, MONO, fmtClock } from './tokens'

function Header({ now }) {
  return (
    <header
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        padding: '0 20px',
        height: 54,
        background: PALETTE.paper,
        borderBottom: '1px solid ' + PALETTE.hair,
        flexShrink: 0,
        fontFamily: SANS,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <svg width="22" height="22" viewBox="0 0 24 24">
          <rect x="1" y="1" width="22" height="22" rx="5" fill={PALETTE.civic} />
          <path
            d="M5 13 Q 7 13, 8 11 T 11 8 Q 12 7, 13 10 T 16 14 Q 17 15, 19 13"
            fill="none"
            stroke="white"
            strokeWidth="1.7"
            strokeLinecap="round"
          />
        </svg>
        <div style={{ fontWeight: 700, letterSpacing: '-.01em', fontSize: 15 }}>CivicPulse</div>
        <span style={{ color: PALETTE.ink40, fontSize: 13 }}>·</span>
        <span
          style={{
            fontFamily: MONO,
            fontSize: 10,
            color: PALETTE.ink50,
            textTransform: 'uppercase',
            letterSpacing: '.12em',
          }}
        >
          Comunitat Valenciana
        </span>
        <span style={{ color: PALETTE.ink40 }}>›</span>
        <span style={{ fontSize: 13.5, fontWeight: 600 }}>Riba-roja de Túria</span>
        <span
          style={{
            fontFamily: MONO,
            fontSize: 9,
            color: 'white',
            background: PALETTE.accent,
            padding: '2px 6px',
            borderRadius: 3,
            fontWeight: 700,
            letterSpacing: '.08em',
            marginLeft: 4,
          }}
        >
          MVP
        </span>
      </div>

      <LiveStrip />
      <div style={{ flex: 1 }} />

      <button
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '6px 10px',
          borderRadius: 7,
          background: PALETTE.bg,
          color: PALETTE.ink50,
          fontSize: 12.5,
          minWidth: 260,
          border: '1px solid ' + PALETTE.hair,
          cursor: 'pointer',
          fontFamily: SANS,
        }}
      >
        <Ic.search width={14} height={14} />
        <span style={{ flex: 1, textAlign: 'left' }}>Buscar en el municipio…</span>
        <span
          style={{
            fontFamily: MONO,
            fontSize: 10,
            padding: '2px 5px',
            background: PALETTE.paper,
            border: '1px solid ' + PALETTE.hair,
            borderRadius: 4,
          }}
        >
          ⌘K
        </span>
      </button>

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-end',
          lineHeight: 1.2,
        }}
      >
        <span style={{ fontFamily: MONO, fontSize: 14, fontWeight: 700, color: PALETTE.ink }}>
          {fmtClock(now)}
        </span>
        <span
          style={{
            fontFamily: MONO,
            fontSize: 9.5,
            color: PALETTE.ink50,
            letterSpacing: '.08em',
            textTransform: 'uppercase',
          }}
        >
          ed. mañana
        </span>
      </div>

      <div
        style={{
          width: 30,
          height: 30,
          borderRadius: '50%',
          background: 'linear-gradient(135deg,' + PALETTE.civic + ',' + PALETTE.accent2 + ')',
          color: 'white',
          display: 'grid',
          placeItems: 'center',
          fontSize: 11,
          fontWeight: 700,
        }}
      >
        MP
      </div>
    </header>
  )
}

function LiveStrip() {
  const { data: weather } = useLiveWeather()
  const fallbackMetro = useNextMetro()
  const { findNext } = useMetroSchedule()
  const { data: air } = useAirQuality()
  const [expanded, setExpanded] = useState(null) // 'weather' | 'air' | 'metro' | null
  const [nowTick, setNowTick] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNowTick(Date.now()), 15_000)
    return () => clearInterval(id)
  }, [])

  // Prefer real GTFS data for Riba-roja terminus; fall back to the
  // hardcoded hook when the JSON hasn't loaded yet.
  const gtfsRibaRoja = findNext('riba-roja-de-turia', new Date(nowTick))
  const gtfsNext = gtfsRibaRoja?.departures.find((d) => d.line === 'L9' && d.heading === 'València')
  const metro = gtfsNext
    ? {
        stationName: 'Riba-roja de Túria',
        departureLabel: gtfsNext.label,
        minutesAway: gtfsNext.minutesAway,
        afterMidnight: gtfsNext.afterMidnight,
        heading: 'València',
        scheduleValidUntil: gtfsRibaRoja.validThrough,
        scheduleSource: 'FGV GTFS',
        isRealtime: true,
      }
    : fallbackMetro

  useEffect(() => {
    if (!expanded) return
    const onKey = (e) => e.key === 'Escape' && setExpanded(null)
    const onClick = (e) => {
      if (!e.target.closest('[data-livestrip]')) setExpanded(null)
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('mousedown', onClick)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('mousedown', onClick)
    }
  }, [expanded])

  if (!weather && !metro && !air) return null
  const [emoji, wmoLabel] = weather ? describeWmo(weather.weatherCode) : ['', '']
  const aqi = air ? describeAqi(air.eaqi) : null

  const divider = (
    <span style={{ width: 1, height: 18, background: PALETTE.hair, flexShrink: 0 }} aria-hidden />
  )

  const chipStyle = (active) => ({
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    cursor: 'pointer',
    background: active ? '#EEF4FF' : 'transparent',
    border: 'none',
    padding: '2px 6px',
    borderRadius: 5,
    font: 'inherit',
    color: 'inherit',
  })

  return (
    <div
      data-livestrip
      className="cp-livestrip"
      style={{
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '4px 10px',
        borderRadius: 7,
        background: PALETTE.bg,
        border: '1px solid ' + PALETTE.hair,
        fontFamily: SANS,
        flexShrink: 0,
      }}
    >
      {weather && (
        <button
          type="button"
          aria-expanded={expanded === 'weather'}
          aria-label="Clima — detalles"
          onClick={() => setExpanded(expanded === 'weather' ? null : 'weather')}
          style={chipStyle(expanded === 'weather')}
        >
          <span style={{ fontSize: 15, lineHeight: 1 }} aria-hidden="true">
            {emoji}
          </span>
          <span className="mono" style={{ fontSize: 12, fontWeight: 700, color: PALETTE.ink }}>
            {weather.tempC != null ? `${weather.tempC}°` : '—'}
          </span>
          {weather.todayMin != null && weather.todayMax != null && (
            <span className="mono" style={{ fontSize: 10.5, color: PALETTE.ink50 }}>
              {Math.round(weather.todayMin)}°/{Math.round(weather.todayMax)}°
            </span>
          )}
        </button>
      )}

      {air && aqi && (
        <>
          {weather && divider}
          <button
            type="button"
            aria-expanded={expanded === 'air'}
            aria-label="Calidad del aire — detalles"
            onClick={() => setExpanded(expanded === 'air' ? null : 'air')}
            style={chipStyle(expanded === 'air')}
          >
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: aqi.color,
                flexShrink: 0,
              }}
              aria-hidden="true"
            />
            <span className="mono" style={{ fontSize: 11, fontWeight: 700, color: PALETTE.ink }}>
              AQI {air.eaqi ?? '–'}
            </span>
            <span style={{ fontSize: 11.5, color: PALETTE.ink50 }}>{aqi.label}</span>
          </button>
        </>
      )}

      {metro && (
        <>
          {(weather || air) && divider}
          <button
            type="button"
            aria-expanded={expanded === 'metro'}
            aria-label="Metro L9 — detalles"
            onClick={() => setExpanded(expanded === 'metro' ? null : 'metro')}
            style={chipStyle(expanded === 'metro')}
          >
            <span
              style={{
                width: 18,
                height: 18,
                borderRadius: '50%',
                background: '#A47E52',
                color: '#FFFFFF',
                display: 'grid',
                placeItems: 'center',
                fontFamily: MONO,
                fontSize: 9,
                fontWeight: 800,
                flexShrink: 0,
              }}
              aria-hidden="true"
            >
              L9
            </span>
            <span className="mono" style={{ fontSize: 10.5, color: PALETTE.ink50 }}>
              → {metro.heading || 'València'}
            </span>
            <span className="mono" style={{ fontSize: 12, fontWeight: 700 }}>
              {metro.departureLabel}
            </span>
            <span className="mono" style={{ fontSize: 10.5, color: PALETTE.ink50 }}>
              {metro.minutesAway === 0 ? 'ahora' : `${metro.minutesAway} min`}
              {metro.afterMidnight ? ' (mañana)' : ''}
            </span>
          </button>
        </>
      )}

      {expanded && (
        <LiveDetails
          section={expanded}
          weather={weather}
          wmoLabel={wmoLabel}
          emoji={emoji}
          air={air}
          aqi={aqi}
          metro={metro}
          onClose={() => setExpanded(null)}
        />
      )}
    </div>
  )
}

function DetailRow({ k, v }) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        gap: 12,
        padding: '3px 0',
        fontSize: 12.5,
        borderBottom: '1px dashed ' + PALETTE.hair,
      }}
    >
      <span style={{ color: PALETTE.ink50 }}>{k}</span>
      <span className="mono" style={{ color: PALETTE.ink, fontWeight: 600 }}>
        {v}
      </span>
    </div>
  )
}

function LiveDetails({ section, weather, wmoLabel, emoji, air, aqi, metro, onClose }) {
  let title = ''
  let body = null
  let source = ''
  if (section === 'weather' && weather) {
    title = `${emoji} ${wmoLabel}`
    source = 'Open-Meteo · actualizado cada 10 min'
    body = (
      <>
        {weather.tempC != null && (
          <DetailRow
            k="Temperatura"
            v={`${weather.tempC}° ${weather.todayMin != null && weather.todayMax != null ? `(${Math.round(weather.todayMin)}°/${Math.round(weather.todayMax)}°)` : ''}`}
          />
        )}
        {weather.feelsLikeC != null && (
          <DetailRow k="Sensación térmica" v={`${weather.feelsLikeC}°`} />
        )}
        {weather.humidity != null && <DetailRow k="Humedad" v={`${weather.humidity}%`} />}
        {weather.windKmh != null && <DetailRow k="Viento" v={`${weather.windKmh} km/h`} />}
        {weather.precipProbMax != null && (
          <DetailRow k="Prob. lluvia (hoy)" v={`${weather.precipProbMax}%`} />
        )}
        {weather.sunriseIso && (
          <DetailRow k="Amanece" v={`↑ ${formatLocalHm(weather.sunriseIso)}`} />
        )}
        {weather.sunsetIso && (
          <DetailRow k="Anochece" v={`↓ ${formatLocalHm(weather.sunsetIso)}`} />
        )}
        {weather.tomorrowMin != null && weather.tomorrowMax != null && (
          <DetailRow
            k="Mañana"
            v={`${Math.round(weather.tomorrowMin)}° / ${Math.round(weather.tomorrowMax)}°`}
          />
        )}
      </>
    )
  } else if (section === 'air' && air && aqi) {
    title = `Calidad del aire · ${aqi.label}`
    source = 'Open-Meteo Air Quality · EAQI (EEA) · actualizado cada 15 min'
    body = (
      <>
        <DetailRow k="EAQI" v={`${air.eaqi ?? '—'} · ${aqi.label}`} />
        {air.pm25 != null && <DetailRow k="PM₂.₅" v={`${air.pm25.toFixed(1)} µg/m³`} />}
        {air.pm10 != null && <DetailRow k="PM₁₀" v={`${air.pm10.toFixed(1)} µg/m³`} />}
        {air.no2 != null && <DetailRow k="NO₂" v={`${air.no2.toFixed(1)} µg/m³`} />}
        {air.ozone != null && <DetailRow k="O₃" v={`${air.ozone.toFixed(1)} µg/m³`} />}
        {Array.isArray(air.pm25Last24h) && air.pm25Last24h.length > 4 && (
          <div style={{ padding: '8px 0 2px' }}>
            <div
              style={{
                fontSize: 10.5,
                color: PALETTE.ink50,
                marginBottom: 4,
                letterSpacing: '.06em',
                textTransform: 'uppercase',
                fontFamily: MONO,
              }}
            >
              PM₂.₅ · últimas 24 h
            </div>
            <Pm25Sparkline values={air.pm25Last24h} color={aqi.color} width={260} height={36} />
          </div>
        )}
      </>
    )
  } else if (section === 'metro' && metro) {
    title = `Metro L9 · ${metro.stationName}`
    // "válido hasta 2025-12-31" printed in August 2026 reads as a guarantee of
    // a timetable that lapsed seven months ago. FGV has not republished the
    // GTFS feed, so the departures are a REFERENCE, not a promise — say so
    // instead of quoting a date already in the past. The map popup already
    // applied this rule; the topbar chip did not.
    {
      const vu = metro.scheduleValidUntil
      const lapsed = vu && new Date(vu).getTime() < Date.now()
      source = lapsed
        ? `Horario de referencia FGV (${String(vu).slice(0, 4)}) · FGV no ha republicado; confirma en fgv.es`
        : `Horario transcrito de fgv.es · válido hasta ${vu}`
    }
    body = (
      <>
        <DetailRow
          k="Próximo tren"
          v={`${metro.departureLabel}${metro.afterMidnight ? ' (mañana)' : ''}`}
        />
        <DetailRow k="Faltan" v={metro.minutesAway === 0 ? 'ahora' : `${metro.minutesAway} min`} />
        <DetailRow k="Sentido" v={`Hacia ${metro.heading || 'València'}`} />
        <DetailRow k="Estación" v={`${metro.stationName} (terminus)`} />
        <DetailRow k="Fuente" v="FGV · fgv.es" />
        <div
          style={{
            marginTop: 6,
            padding: '6px 8px',
            background: '#FFF7E6',
            border: '1px solid #F3D9A8',
            borderRadius: 6,
            fontSize: 11.5,
            color: '#7C4A00',
          }}
        >
          Pulsa cualquier estación de L9 en el mapa para ver los próximos trenes en ambos sentidos.
        </div>
        <div style={{ marginTop: 10 }}>
          <a
            href="https://www.metrovalencia.es"
            target="_blank"
            rel="noreferrer"
            style={{ fontSize: 12, color: PALETTE.civic }}
          >
            Ver horario oficial →
          </a>
        </div>
      </>
    )
  }
  return (
    <div
      role="dialog"
      aria-label={title}
      style={{
        position: 'absolute',
        top: 'calc(100% + 8px)',
        right: 0,
        zIndex: 500,
        minWidth: 300,
        maxWidth: 340,
        background: PALETTE.paper,
        border: '1px solid ' + PALETTE.hair,
        borderRadius: 10,
        boxShadow: '0 12px 32px rgba(11,15,25,.12)',
        padding: '14px 16px 12px',
        fontFamily: SANS,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 8,
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 700, color: PALETTE.ink }}>{title}</div>
        <button
          type="button"
          aria-label="Cerrar"
          onClick={onClose}
          style={{
            width: 22,
            height: 22,
            borderRadius: 5,
            display: 'grid',
            placeItems: 'center',
            color: PALETTE.ink50,
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
          }}
        >
          ×
        </button>
      </div>
      {body}
      <div
        style={{
          fontSize: 10.5,
          color: PALETTE.ink50,
          fontFamily: MONO,
          letterSpacing: '.04em',
          marginTop: 10,
          paddingTop: 8,
          borderTop: '1px solid ' + PALETTE.hair,
        }}
      >
        {source}
      </div>
    </div>
  )
}

function formatLocalHm(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleTimeString('es-ES', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Madrid',
  })
}

function Pm25Sparkline({ values, color, width = 96, height = 18 }) {
  const nums = values.filter((v) => typeof v === 'number' && Number.isFinite(v))
  if (nums.length < 2) return null
  const w = width
  const h = height
  const min = Math.min(...nums)
  const max = Math.max(...nums)
  const span = max - min || 1
  const step = w / (nums.length - 1)
  const d = nums
    .map((v, i) => {
      const x = i * step
      const y = h - ((v - min) / span) * (h - 2) - 1
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')
  return (
    <svg
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      style={{ display: 'block' }}
      aria-hidden="true"
    >
      <path d={d} fill="none" stroke={color} strokeWidth="1.4" opacity="0.85" />
    </svg>
  )
}
export { Header }
