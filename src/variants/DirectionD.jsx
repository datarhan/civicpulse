import { useEffect, useState } from 'react'
import { NavLink } from 'react-router-dom'
import StylizedMap from '../components/LiveCity/StylizedMap'
import LiveTicker from '../components/LiveTicker'
import { useOfficials, partyColor } from '../hooks/useOfficials'
import { useTenders, formatDate as formatTenderDate } from '../hooks/useTenders'
import { usePadron } from '../hooks/usePadron'
import { useParo } from '../hooks/useParo'
import { usePromises, isPromiseFrozen } from '../hooks/usePromises'
import { useParticipa, KIND_ICON } from '../hooks/useParticipa'
import { usePress, timeAgo as pressTimeAgo } from '../hooks/usePress'
import { useBudget, formatEuros as formatBudgetEuros } from '../hooks/useBudget'
import { usePlenos, PLENO_LABEL } from '../hooks/usePlenos'
import { usePlenoAgendas } from '../hooks/usePlenoAgendas'
import { useLiveWeather, describeWmo } from '../hooks/useLiveWeather'
import { useNextMetro } from '../hooks/useNextMetro'
import { useMetroSchedule } from '../hooks/useMetroSchedule'
import { useAirQuality, describeAqi } from '../hooks/useAirQuality'
import { useTodayEvents } from '../hooks/useTodayEvents'
import { Ic } from '../components/Icons'

const RIBA_ROJA_CENTER = [39.5439, -0.5711]

const SERIF = "'Fraunces', Georgia, serif"
const SANS = "'Outfit', system-ui, -apple-system, sans-serif"
const MONO = "'DM Mono', ui-monospace, monospace"

const PALETTE = {
  bg: '#FAF8F2',
  paper: '#FFFFFF',
  ink: '#0B0F19',
  ink80: 'rgba(11,15,25,.82)',
  ink60: 'rgba(11,15,25,.68)',
  ink50: 'rgba(11,15,25,.65)',
  ink40: 'rgba(11,15,25,.60)',
  rule: '#1F1F1F',
  hair: '#DCD7C8',
  civic: '#2463EB',
  accent: '#B0291F',
  accent2: '#1E3A8A',
  ok: '#16A34A',
  warn: '#D97706',
  crit: '#DC2626',
  amber: '#B45309',
}

function fmtClock(d) {
  return d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
}

function fmtDateLong(d) {
  return d.toLocaleDateString('es-ES', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

function useClock(intervalMs = 30000) {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])
  return now
}

/* ============================================================
   HEADER
   ============================================================ */
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

/* ============================================================
   LIVE STRIP — compact weather / air / L9 metro for the topbar
   Replaces the old absolute-positioned map overlay so the map
   surface stays clean. Clicking any segment opens a details panel
   docked under the topbar with the full hourly + legal-cite context.
   ============================================================ */
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
    source = `Horario transcrito de fgv.es · válido hasta ${metro.scheduleValidUntil}`
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

/* ============================================================
   LEFT RAIL
   ============================================================ */
const RAIL_ITEMS = [
  { to: '/', label: 'Mirador', icon: Ic.home },
  { to: '/promesas', label: 'Promesas', icon: Ic.scale },
  { to: '/departamentos', label: 'Departamentos', icon: Ic.building },
  { to: '/cargos', label: 'Cargos', icon: Ic.people },
  { to: '/presupuesto', label: 'Presupuesto', icon: Ic.coin },
  { to: '/plenos', label: 'Plenos', icon: Ic.scale },
  { to: '/datos', label: 'Datos', icon: Ic.chart },
  { to: '/quejas', label: 'Quejas', icon: Ic.warn },
  { to: '/metodologia', label: 'Metodología', icon: Ic.cmd },
]

function LeftRail() {
  return (
    <aside
      style={{
        width: 56,
        flexShrink: 0,
        background: PALETTE.paper,
        borderRight: '1px solid ' + PALETTE.hair,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '12px 0',
        gap: 4,
        fontFamily: SANS,
      }}
    >
      {RAIL_ITEMS.map((n) => (
        <NavLink
          key={n.to}
          to={n.to}
          end={n.to === '/'}
          title={n.label}
          style={({ isActive }) => ({
            width: 40,
            height: 40,
            display: 'grid',
            placeItems: 'center',
            borderRadius: 8,
            background: isActive ? '#EEF4FF' : 'transparent',
            color: isActive ? PALETTE.civic : PALETTE.ink60,
            cursor: 'pointer',
            position: 'relative',
            textDecoration: 'none',
          })}
          onMouseEnter={(e) => {
            if (e.currentTarget.getAttribute('aria-current') !== 'page') {
              e.currentTarget.style.background = PALETTE.bg
            }
          }}
          onMouseLeave={(e) => {
            if (e.currentTarget.getAttribute('aria-current') !== 'page') {
              e.currentTarget.style.background = 'transparent'
            }
          }}
        >
          {({ isActive }) => (
            <>
              <n.icon width={18} height={18} />
              {isActive && (
                <span
                  style={{
                    position: 'absolute',
                    left: -1,
                    top: 8,
                    bottom: 8,
                    width: 3,
                    borderRadius: '0 3px 3px 0',
                    background: PALETTE.civic,
                  }}
                />
              )}
            </>
          )}
        </NavLink>
      ))}
    </aside>
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

/**
 * Docked ticker bottom-center of the map — "Hoy en Riba-roja". Surfaces
 * events and consultations from participa.ribarroja.es happening today
 * or tomorrow. Silently hidden when there's nothing (most days).
 */
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
        <a
          key={ev.id}
          href={ev.url}
          target="_blank"
          rel="noreferrer"
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
        </a>
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
        color: 'rgba(255,255,255,.5)',
        fontFamily: MONO,
        letterSpacing: '.04em',
        textShadow: '0 1px 2px rgba(0,0,0,.6)',
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

/* ============================================================
   EDITORIAL COLUMN
   ============================================================ */
function EditorialMasthead({ now }) {
  return (
    <div style={{ marginBottom: 18, borderBottom: '2px solid ' + PALETTE.rule, paddingBottom: 10 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          gap: 12,
          fontFamily: MONO,
          fontSize: 10.5,
          color: PALETTE.ink60,
          letterSpacing: '.1em',
          textTransform: 'uppercase',
          marginBottom: 6,
        }}
      >
        <span>CivicPulse · Boletín</span>
        <span>{fmtDateLong(now)}</span>
      </div>
      <div
        style={{
          fontFamily: SERIF,
          fontSize: 34,
          fontWeight: 900,
          letterSpacing: '-.03em',
          lineHeight: 0.95,
        }}
      >
        El Mirador
      </div>
      <div
        style={{
          fontFamily: MONO,
          fontSize: 10,
          color: PALETTE.accent,
          letterSpacing: '.18em',
          textTransform: 'uppercase',
          fontWeight: 700,
          marginTop: 5,
        }}
      >
        Diario cívico · Riba-roja de Túria
      </div>
    </div>
  )
}

function Kicker({ tone = 'ink', children }) {
  const c = {
    ink: PALETTE.ink,
    red: PALETTE.accent,
    navy: PALETTE.accent2,
    green: PALETTE.ok,
    amber: PALETTE.amber,
    gray: PALETTE.ink60,
  }[tone]
  return (
    <div
      style={{
        fontFamily: MONO,
        fontSize: 10,
        color: c,
        fontWeight: 700,
        letterSpacing: '.14em',
        textTransform: 'uppercase',
      }}
    >
      {children}
    </div>
  )
}

/**
 * Citizen-activation CTA. Top of the editorial column — the primary
 * conversion surface. Links directly to the Telegram bot with a
 * `?start=landing` tracking parameter so we can attribute activations
 * back to the dashboard. Once the operator records the 30-s Loom, swap
 * the placeholder iframe URL for the real one.
 */
function QuejaCTA() {
  // eslint-disable-next-line no-unused-vars
  const LOOM_URL = '' // TODO operator: paste Loom share URL here to enable the embed
  return (
    <div
      style={{
        marginTop: 10,
        padding: '14px 16px',
        background: '#EEF4FF',
        border: '1px solid #C7D7F8',
        borderRadius: 10,
      }}
    >
      <div
        style={{
          fontFamily: MONO,
          fontSize: 9.5,
          color: PALETTE.civic,
          letterSpacing: '.14em',
          textTransform: 'uppercase',
          fontWeight: 700,
          marginBottom: 6,
        }}
      >
        Voz ciudadana · canal directo
      </div>
      <div
        style={{
          fontFamily: SERIF,
          fontSize: 22,
          lineHeight: 1.15,
          fontWeight: 600,
          letterSpacing: '-.01em',
          color: PALETTE.ink,
          marginBottom: 10,
        }}
      >
        Denuncia un bache en 10 segundos.
      </div>
      <div style={{ fontSize: 12.5, color: PALETTE.ink60, marginBottom: 12, lineHeight: 1.45 }}>
        Abre el bot de Telegram, envía{' '}
        <span
          style={{
            fontFamily: MONO,
            background: '#fff',
            padding: '1px 5px',
            borderRadius: 3,
            border: '1px solid #DDE3EA',
          }}
        >
          /queja
        </span>
        , adjunta foto y ubicación. Si 10 vecinos la apoyan, entra al Registro Electrónico del
        Ayuntamiento como solicitud oficial. Reloj legal público, sin coste, sin datos personales
        publicados.
      </div>
      <a
        href="https://t.me/munigraph_bot?start=landing"
        target="_blank"
        rel="noreferrer"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          padding: '9px 16px',
          background: PALETTE.civic,
          color: '#fff',
          fontFamily: SANS,
          fontSize: 13.5,
          fontWeight: 600,
          borderRadius: 7,
          textDecoration: 'none',
          boxShadow: '0 2px 6px rgba(36,99,235,.25)',
        }}
      >
        Abrir el bot →
      </a>
      <a
        href="/aviso-legal"
        style={{
          marginLeft: 10,
          fontSize: 11.5,
          color: PALETTE.civic,
          textDecoration: 'underline',
          textUnderlineOffset: 2,
        }}
      >
        Cómo protegemos tus datos
      </a>
    </div>
  )
}

function LeadStory() {
  const { loading, error, data } = usePress()
  if (loading || error || !data) return null
  const top = (data.items || [])[0]
  if (!top) return null
  const excerpt = (top.excerpt || '').trim()
  return (
    <article style={{ paddingBottom: 22, borderBottom: '1px solid ' + PALETTE.hair }}>
      <Kicker tone="red">{top.source}</Kicker>
      <h1
        style={{
          fontFamily: SERIF,
          fontSize: 28,
          fontWeight: 800,
          letterSpacing: '-.02em',
          lineHeight: 1.1,
          margin: '8px 0 10px',
        }}
      >
        <a
          href={top.link}
          target="_blank"
          rel="noreferrer"
          style={{ color: 'inherit', textDecoration: 'none' }}
        >
          {top.title}
        </a>
      </h1>
      {excerpt && (
        <div
          style={{
            fontFamily: SERIF,
            fontSize: 14.5,
            color: PALETTE.ink80,
            lineHeight: 1.45,
            fontStyle: 'italic',
            marginBottom: 12,
          }}
        >
          {excerpt.length > 260 ? excerpt.slice(0, 260) + '…' : excerpt}
        </div>
      )}
      <div
        style={{
          fontFamily: MONO,
          fontSize: 10.5,
          color: PALETTE.ink60,
          letterSpacing: '.06em',
        }}
      >
        {pressTimeAgo(top.date).toUpperCase()} ·{' '}
        <a
          href={top.link}
          target="_blank"
          rel="noreferrer"
          style={{ color: PALETTE.civic, textDecoration: 'none', fontWeight: 600 }}
        >
          Leer en {top.source} →
        </a>
      </div>
    </article>
  )
}

function AlcaldeBox() {
  const { loading, error, data } = useOfficials()
  if (loading || error || !data) return null
  const mayor = data.officials.find((o) => o.role === 'alcalde')
  if (!mayor) return null
  return (
    <div
      style={{
        display: 'flex',
        gap: 12,
        alignItems: 'center',
        padding: '12px 0',
        borderTop: '1px solid ' + PALETTE.hair,
        borderBottom: '1px solid ' + PALETTE.hair,
        margin: '14px 0',
      }}
    >
      {mayor.photoUrl ? (
        <img
          src={mayor.photoUrl}
          alt={mayor.name}
          width={52}
          height={52}
          style={{
            width: 52,
            height: 52,
            borderRadius: 8,
            objectFit: 'cover',
            border: `2px solid ${partyColor(mayor.party)}44`,
            flexShrink: 0,
          }}
        />
      ) : null}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          className="mono"
          style={{
            fontSize: 9.5,
            color: PALETTE.ink60,
            letterSpacing: '.12em',
            textTransform: 'uppercase',
          }}
        >
          Alcalde
        </div>
        <div style={{ fontSize: 15, fontWeight: 700, marginTop: 2, letterSpacing: '-.01em' }}>
          {mayor.name}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
          <span
            className="mono"
            style={{
              fontSize: 9,
              fontWeight: 700,
              letterSpacing: '.12em',
              textTransform: 'uppercase',
              background: partyColor(mayor.party),
              color: 'white',
              padding: '2px 6px',
              borderRadius: 3,
            }}
          >
            {mayor.party}
          </span>
          <span className="mono" style={{ fontSize: 10, color: PALETTE.ink60 }}>
            {mayor.email}
          </span>
        </div>
      </div>
    </div>
  )
}

function CoalitionRing() {
  const { loading, error, data } = useOfficials()
  if (loading || error || !data) return null
  const order = ['PSOE', 'PP', 'VOX', 'Compromís', 'Ciudadanos', 'Otro']
  const items = order.filter((p) => data.composition[p]).map((p) => ({ p, n: data.composition[p] }))
  return (
    <div style={{ marginBottom: 16 }}>
      <div
        className="mono"
        style={{
          fontSize: 9.5,
          color: PALETTE.ink60,
          letterSpacing: '.12em',
          textTransform: 'uppercase',
          marginBottom: 6,
        }}
      >
        Pleno · {data.count} escaños
      </div>
      <div
        style={{
          display: 'flex',
          width: '100%',
          height: 12,
          borderRadius: 6,
          overflow: 'hidden',
          border: `1px solid ${PALETTE.hair}`,
        }}
      >
        {items.map(({ p, n }) => (
          <div
            key={p}
            title={`${p}: ${n}`}
            style={{
              flex: n,
              background: partyColor(p),
              display: 'grid',
              placeItems: 'center',
              color: 'white',
              fontFamily: MONO,
              fontSize: 8.5,
              fontWeight: 700,
            }}
          >
            {n}
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 10, marginTop: 6, flexWrap: 'wrap', fontSize: 10.5 }}>
        {items.map(({ p, n }) => (
          <span key={p} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span
              style={{
                width: 7,
                height: 7,
                borderRadius: '50%',
                background: partyColor(p),
                display: 'inline-block',
              }}
            />
            <span style={{ fontWeight: 600 }}>{p}</span>
            <span className="mono" style={{ color: PALETTE.ink60 }}>
              {n}
            </span>
          </span>
        ))}
      </div>
    </div>
  )
}

function LiveContracts() {
  const { loading, error, data } = useTenders()
  if (loading || error || !data) return null
  const recent = (data.top?.recentAwarded || []).slice(0, 4)
  if (recent.length === 0) return null

  const fmtEur = (n) =>
    new Intl.NumberFormat('es-ES', {
      style: 'currency',
      currency: 'EUR',
      maximumFractionDigits: 0,
      notation: n >= 100_000 ? 'compact' : 'standard',
    }).format(n)

  return (
    <div style={{ marginBottom: 18, borderTop: '1px solid ' + PALETTE.hair, paddingTop: 14 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          marginBottom: 8,
        }}
      >
        <div
          className="mono"
          style={{
            fontSize: 10,
            color: PALETTE.ink60,
            letterSpacing: '.12em',
            textTransform: 'uppercase',
            fontWeight: 700,
          }}
        >
          Contratos adjudicados
        </div>
        <div className="mono" style={{ fontSize: 10, color: PALETTE.ink60 }}>
          {data.stats.totalContracts} · {fmtEur(data.stats.awardedTotalEuros)}
        </div>
      </div>
      {recent.map((c, i) => (
        <div
          key={c.id}
          style={{
            padding: '10px 0',
            borderTop: i === 0 ? 'none' : '1px solid ' + PALETTE.hair,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 3 }}>
            <span
              className="mono"
              style={{
                fontSize: 10,
                color: PALETTE.accent,
                letterSpacing: '.1em',
                textTransform: 'uppercase',
                fontWeight: 700,
              }}
            >
              {c.categoryTitle || c.contractType || 'Contrato'}
            </span>
            <span className="mono" style={{ fontSize: 10, color: PALETTE.ink50 }}>
              {formatTenderDate(c.awardDate)}
            </span>
          </div>
          <div style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.35, marginBottom: 2 }}>
            {c.permalink ? (
              <a
                href={c.permalink}
                target="_blank"
                rel="noreferrer"
                style={{ color: 'inherit', textDecoration: 'none' }}
              >
                {c.title.length > 100 ? c.title.slice(0, 100) + '…' : c.title}
              </a>
            ) : (
              c.title
            )}
          </div>
          <div style={{ display: 'flex', gap: 10, fontSize: 11.5, color: PALETTE.ink60 }}>
            <span>{c.contractor || 'Sin adjudicatario'}</span>
            <span
              style={{ marginLeft: 'auto', fontWeight: 700, color: PALETTE.ink }}
              className="mono"
            >
              {fmtEur(c.finalAmount)}
            </span>
          </div>
        </div>
      ))}
    </div>
  )
}

function ParticipaBlockD() {
  const { loading, error, data } = useParticipa()
  if (loading || error || !data) return null
  const items = (data.items || []).slice(0, 3)
  if (items.length === 0) return null
  const fmt = (iso) => new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })
  return (
    <div
      style={{
        marginBottom: 18,
        borderTop: '1px solid ' + PALETTE.hair,
        paddingTop: 14,
      }}
    >
      <div
        className="mono"
        style={{
          fontSize: 10,
          color: PALETTE.ink60,
          letterSpacing: '.12em',
          textTransform: 'uppercase',
          fontWeight: 700,
          marginBottom: 8,
        }}
      >
        Participación ciudadana · {data.stats.total}
      </div>
      {items.map((it, i) => (
        <div
          key={it.id}
          style={{
            display: 'flex',
            gap: 10,
            padding: '10px 0',
            borderTop: i === 0 ? 'none' : '1px solid ' + PALETTE.hair,
            alignItems: 'flex-start',
          }}
        >
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: 6,
              background: it.kind === 'survey' ? 'rgba(36,99,235,.12)' : 'rgba(22,163,74,.12)',
              display: 'grid',
              placeItems: 'center',
              fontSize: 14,
              flexShrink: 0,
            }}
          >
            {KIND_ICON[it.kind] || '📢'}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.3, marginBottom: 2 }}>
              <a
                href={it.link}
                target="_blank"
                rel="noreferrer"
                style={{ color: 'inherit', textDecoration: 'none' }}
              >
                {it.title.length > 80 ? it.title.slice(0, 80) + '…' : it.title}
              </a>
            </div>
            <div className="mono" style={{ fontSize: 10, color: PALETTE.ink60 }}>
              {fmt(it.date)} · {it.categories[0] || 'aviso'}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

function PressBlockD() {
  const { loading, error, data } = usePress()
  if (loading || error || !data) return null
  const items = (data.items || []).slice(0, 5)
  if (items.length === 0) return null
  return (
    <div
      style={{
        marginBottom: 18,
        borderTop: '1px solid ' + PALETTE.hair,
        paddingTop: 14,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          marginBottom: 8,
        }}
      >
        <div
          className="mono"
          style={{
            fontSize: 10,
            color: PALETTE.ink60,
            letterSpacing: '.12em',
            textTransform: 'uppercase',
            fontWeight: 700,
          }}
        >
          Prensa · {data.stats.total} titulares
        </div>
        <div className="mono" style={{ fontSize: 10, color: PALETTE.ink50 }}>
          {data.stats.sources} medios
        </div>
      </div>
      {items.map((p, i) => (
        <div
          key={p.id}
          style={{
            padding: '10px 0',
            borderTop: i === 0 ? 'none' : '1px solid ' + PALETTE.hair,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 2 }}>
            <span
              className="mono"
              style={{
                fontSize: 10,
                color: PALETTE.accent,
                letterSpacing: '.08em',
                textTransform: 'uppercase',
                fontWeight: 700,
              }}
            >
              {p.source}
            </span>
            <span className="mono" style={{ fontSize: 10, color: PALETTE.ink50 }}>
              {pressTimeAgo(p.date)}
            </span>
          </div>
          <div style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.35 }}>
            <a
              href={p.link}
              target="_blank"
              rel="noreferrer"
              style={{ color: 'inherit', textDecoration: 'none' }}
            >
              {p.title.length > 110 ? p.title.slice(0, 110) + '…' : p.title}
            </a>
          </div>
        </div>
      ))}
    </div>
  )
}

function PromesasBlockD() {
  const { loading, error, data } = usePromises()
  if (loading || error || !data) return null
  const frozen = isPromiseFrozen(data)
  const total = data.items?.length ?? 0
  if (total === 0) return null
  const byParty = (data.items || []).reduce((acc, p) => {
    acc[p.party] = (acc[p.party] || 0) + 1
    return acc
  }, {})
  const parties = Object.entries(byParty).sort((a, b) => b[1] - a[1])
  return (
    <div
      style={{
        marginBottom: 18,
        borderTop: '1px solid ' + PALETTE.hair,
        paddingTop: 14,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 6 }}>
        <div
          className="mono"
          style={{
            fontSize: 10,
            color: PALETTE.ink60,
            letterSpacing: '.12em',
            textTransform: 'uppercase',
            fontWeight: 700,
          }}
        >
          Seguimiento de promesas
        </div>
        {frozen && (
          <span
            className="mono"
            style={{
              fontSize: 9,
              color: PALETTE.crit,
              background: 'rgba(220,38,38,.08)',
              padding: '1px 6px',
              borderRadius: 3,
              letterSpacing: '.08em',
              textTransform: 'uppercase',
              fontWeight: 700,
            }}
          >
            LOREG · congelado
          </span>
        )}
        <span className="mono" style={{ fontSize: 10, color: PALETTE.ink50, marginLeft: 'auto' }}>
          {total}
        </span>
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', fontSize: 11, marginBottom: 8 }}>
        {parties.map(([party, n]) => (
          <span
            key={party}
            style={{
              fontFamily: MONO,
              fontSize: 10.5,
              fontWeight: 700,
              color: 'white',
              background:
                party === 'PSOE'
                  ? '#D01832'
                  : party === 'PP'
                    ? '#2463EB'
                    : party === 'VOX'
                      ? '#3A8018'
                      : party === 'Compromís'
                        ? '#A06116'
                        : '#64748B',
              padding: '2px 7px',
              borderRadius: 3,
            }}
          >
            {party} · {n}
          </span>
        ))}
      </div>
      <div style={{ fontSize: 11.5, color: PALETTE.ink80, lineHeight: 1.45, marginBottom: 6 }}>
        Compromisos públicos documentados con cita verbatim y fuente primaria. Sin juicios
        automáticos de cumplimiento.
      </div>
      <a
        href="/promesas"
        style={{ color: PALETTE.accent, textDecoration: 'none', fontSize: 11.5, fontWeight: 600 }}
      >
        Ver tracker completo →
      </a>
    </div>
  )
}

function DepartamentosBlockD() {
  const { data: agendas } = usePlenoAgendas()
  const officialsSnap = useOfficials()
  const promisesSnap = usePromises()
  if (!agendas?.stats) return null
  const frozen = isPromiseFrozen(promisesSnap.data)
  const vencidos = frozen ? 0 : (agendas.stats.plazosVencidosCount ?? 0)
  const coverage = agendas.stats.deptCoverage ?? null
  const totalDepts = 28
  const totalOfficials = officialsSnap.data?.officials?.length ?? null
  return (
    <div
      style={{
        marginBottom: 18,
        borderTop: '1px solid ' + PALETTE.hair,
        paddingTop: 14,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 6 }}>
        <div
          className="mono"
          style={{
            fontSize: 10,
            color: PALETTE.ink60,
            letterSpacing: '.12em',
            textTransform: 'uppercase',
            fontWeight: 700,
          }}
        >
          Rendición de cuentas por concejalía
        </div>
        {!frozen && vencidos > 0 && (
          <span
            className="mono"
            style={{
              fontSize: 9.5,
              color: PALETTE.warn,
              background: 'rgba(217,119,6,.10)',
              padding: '1px 6px',
              borderRadius: 3,
              letterSpacing: '.08em',
              textTransform: 'uppercase',
              fontWeight: 700,
            }}
          >
            ⚠ {vencidos} plazos vencidos
          </span>
        )}
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
          gap: 8,
          marginBottom: 10,
        }}
      >
        <div>
          <div
            className="mono"
            style={{
              fontSize: 9,
              color: PALETTE.ink50,
              textTransform: 'uppercase',
              letterSpacing: '.1em',
            }}
          >
            Concejalías
          </div>
          <div className="mono" style={{ fontSize: 18, fontWeight: 700, color: PALETTE.ink }}>
            {totalDepts}
          </div>
        </div>
        {coverage !== null && (
          <div>
            <div
              className="mono"
              style={{
                fontSize: 9,
                color: PALETTE.ink50,
                textTransform: 'uppercase',
                letterSpacing: '.1em',
              }}
            >
              Con responsable
            </div>
            <div className="mono" style={{ fontSize: 18, fontWeight: 700, color: PALETTE.ink }}>
              {coverage}/{totalDepts}
            </div>
          </div>
        )}
        {totalOfficials !== null && (
          <div>
            <div
              className="mono"
              style={{
                fontSize: 9,
                color: PALETTE.ink50,
                textTransform: 'uppercase',
                letterSpacing: '.1em',
              }}
            >
              Concejales
            </div>
            <div className="mono" style={{ fontSize: 18, fontWeight: 700, color: PALETTE.ink }}>
              {totalOfficials}
            </div>
          </div>
        )}
      </div>
      <div style={{ fontSize: 11.5, color: PALETTE.ink80, lineHeight: 1.45, marginBottom: 6 }}>
        Cruza votos de pleno, promesas electorales y quejas ciudadanas por concejalía. Un plazo
        vencido se marca como aviso editorial — el estado nunca se modifica de forma automática.
      </div>
      <a
        href="/departamentos"
        style={{ color: PALETTE.accent, textDecoration: 'none', fontSize: 11.5, fontWeight: 600 }}
      >
        Ver dashboard por departamento →
      </a>
    </div>
  )
}

function EditorialColumn({ now }) {
  return (
    <aside
      style={{
        width: 420,
        flexShrink: 0,
        background: PALETTE.bg,
        borderLeft: '1px solid ' + PALETTE.hair,
        overflowY: 'auto',
        padding: '24px 26px',
        fontFamily: SANS,
        color: PALETTE.ink,
      }}
    >
      <EditorialMasthead now={now} />
      <QuejaCTA />
      <LeadStory />
      <AlcaldeBox />
      <CoalitionRing />
      <PromesasBlockD />
      <DepartamentosBlockD />
      <PressBlockD />
      <LiveContracts />
      <ParticipaBlockD />
    </aside>
  )
}

/* ============================================================
   BOTTOM KPI STRIP
   ============================================================ */
function MiniSpark({ data, color }) {
  const max = Math.max(...data)
  const min = Math.min(...data)
  const W = 60
  const H = 20
  const pts = data.map((v, i) => [
    (i / (data.length - 1)) * W,
    H - ((v - min) / (max - min || 1)) * (H - 2) - 1,
  ])
  const path = pts
    .map((p, i) => (i === 0 ? 'M' : 'L') + p[0].toFixed(1) + ',' + p[1].toFixed(1))
    .join(' ')
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      style={{ width: 60, height: 20, display: 'block' }}
    >
      <path
        d={path}
        stroke={color}
        strokeWidth="1.25"
        fill="none"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  )
}

function Kpi({ label, value, delta, tone, sub, spark, sparkColor, serif }) {
  const color =
    tone === 'ok'
      ? PALETTE.ok
      : tone === 'warn'
        ? PALETTE.warn
        : tone === 'crit'
          ? PALETTE.crit
          : PALETTE.ink
  return (
    <div
      style={{
        flex: 1,
        padding: '10px 16px',
        borderRight: '1px solid ' + PALETTE.hair,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
      }}
    >
      <div
        style={{
          fontFamily: MONO,
          fontSize: 9.5,
          color: PALETTE.ink50,
          letterSpacing: '.12em',
          textTransform: 'uppercase',
        }}
      >
        {label}
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 2 }}>
        <span
          style={{
            fontFamily: serif ? SERIF : MONO,
            fontSize: serif ? 26 : 18,
            fontWeight: 800,
            color,
            letterSpacing: '-.015em',
            lineHeight: 1,
          }}
        >
          {value}
        </span>
        {delta && (
          <span
            style={{
              fontFamily: MONO,
              fontSize: 10.5,
              fontWeight: 700,
              color: delta.startsWith('▲')
                ? PALETTE.ok
                : delta.startsWith('▼')
                  ? PALETTE.crit
                  : PALETTE.ink50,
            }}
          >
            {delta}
          </span>
        )}
      </div>
      {(sub || spark) && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 4 }}>
          {sub && (
            <span style={{ fontFamily: MONO, fontSize: 10, color: PALETTE.ink50 }}>{sub}</span>
          )}
          {spark && <MiniSpark data={spark} color={sparkColor || color} />}
        </div>
      )}
    </div>
  )
}

function KpiStrip() {
  const padron = usePadron().data
  const budget = useBudget().data
  const tenders = useTenders().data
  const paro = useParo().data
  const plenos = usePlenos().data

  const popSpark = padron?.series?.total?.slice(-10).map((p) => p.value) || null
  const popLatest = padron ? Math.round(padron.latestTotal / 100) / 10 : null
  const popDecade = padron ? padron.growth.decadePct : 0
  const popDeltaStr = padron
    ? (popDecade >= 0 ? '▲ ' : '▼ ') + Math.abs(popDecade).toFixed(1) + '%'
    : '—'

  const totalExpense = budget?.snapshot?.totalExpense
  const budgetYear = budget?.snapshot?.year
  const budgetValue = totalExpense ? formatBudgetEuros(totalExpense, { compact: true }) : '—'
  const balance = budget?.snapshot?.balance || 0

  const awardedTotal = tenders?.stats?.awardedTotalEuros
  const awardedCount = tenders?.stats?.awardedContracts
  const awardedValue = awardedTotal ? formatBudgetEuros(awardedTotal, { compact: true }) : '—'

  const nextPleno = (plenos?.items || [])[0]
  const plenoDate = nextPleno
    ? new Date(nextPleno.date).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })
    : '—'
  const plenoKind = nextPleno ? PLENO_LABEL[nextPleno.kind] || nextPleno.kind : ''
  const totalPlenos = plenos?.stats?.total

  return (
    <footer
      style={{
        display: 'flex',
        height: 76,
        background: PALETTE.paper,
        borderTop: '1px solid ' + PALETTE.rule,
        flexShrink: 0,
        fontFamily: SANS,
      }}
    >
      <Kpi
        label={padron ? `Población ${padron.latestYear}` : 'Población'}
        value={popLatest ? popLatest.toFixed(1) + 'k' : '—'}
        delta={popDeltaStr}
        tone={popDecade > 0 ? 'ok' : 'warn'}
        sub={padron ? `10 años · INE` : 'INE Padrón'}
        spark={popSpark}
        serif
      />
      <Kpi
        label={budgetYear ? `Presup. ${budgetYear}` : 'Presupuesto'}
        value={budgetValue}
        delta={budget ? (balance >= 0 ? '▲' : '▼') : '—'}
        tone={balance >= 0 ? 'ok' : 'warn'}
        sub="MinHac CONPREL"
      />
      <Kpi
        label="Gastos personal"
        value={
          budget?.snapshot?.expenseByEconomicChapter?.[0]?.amount
            ? formatBudgetEuros(budget.snapshot.expenseByEconomicChapter[0].amount, {
                compact: true,
              })
            : '—'
        }
        delta={
          totalExpense && budget?.snapshot?.expenseByEconomicChapter?.[0]?.amount
            ? ((budget.snapshot.expenseByEconomicChapter[0].amount / totalExpense) * 100).toFixed(
                0,
              ) + '%'
            : '—'
        }
        tone="civic"
        sub="Cap.1 económico"
      />
      <Kpi
        label="Contratos adj."
        value={awardedValue}
        delta={awardedCount ? '· ' + awardedCount : '—'}
        tone="ok"
        sub="Gobierto/PLACSP"
      />
      <Kpi
        label={paro ? `Paro ${paro.latestPeriod || ''}` : 'Paro'}
        value={paro ? paro.latestTotal.toLocaleString('es-ES') : '—'}
        delta={(() => {
          if (!paro?.series || paro.series.length < 2) return '—'
          const last = paro.series[paro.series.length - 1].total
          const prev = paro.series[paro.series.length - 2].total
          const diff = last - prev
          return (diff >= 0 ? '▲ +' : '▼ ') + diff
        })()}
        tone={(() => {
          if (!paro?.series || paro.series.length < 2) return 'civic'
          const last = paro.series[paro.series.length - 1].total
          const prev = paro.series[paro.series.length - 2].total
          return last < prev ? 'ok' : 'warn'
        })()}
        sub="SEPE · paro registrado"
        spark={paro?.series?.slice(-12).map((p) => p.total) || null}
        sparkColor={PALETTE.accent}
      />
      <Kpi
        label="Último pleno"
        value={plenoDate}
        delta={plenoKind || '—'}
        tone="civic"
        sub={totalPlenos ? `${totalPlenos} sesiones` : 'ribarroja.es'}
      />
    </footer>
  )
}

/* ============================================================
   APP
   ============================================================ */
export default function DirectionD() {
  const now = useClock(60000)

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        background: PALETTE.bg,
        color: PALETTE.ink,
        fontFamily: SANS,
      }}
    >
      <style>{`
        @keyframes ribaPulse { 0%,100% { opacity: 1 } 50% { opacity: .3 } }
        .d-root .leaflet-container { background: #0B0F19; }
        .d-root .leaflet-control-zoom { display: none; }
        .d-root .leaflet-tooltip {
          background: rgba(14,20,34,.9);
          color: white;
          border: 1px solid rgba(96,165,250,.25);
          box-shadow: 0 4px 10px rgba(0,0,0,.4);
        }
        .d-root .leaflet-tooltip-top::before { border-top-color: rgba(14,20,34,.9); }
      `}</style>

      <Header now={now} />

      <div style={{ flex: 1, display: 'flex', minHeight: 0 }} className="d-root">
        <LeftRail />

        <div style={{ flex: 1, position: 'relative', minWidth: 0 }}>
          <StylizedMap center={RIBA_ROJA_CENTER} />
          <LiveTicker />
          <EventTicker />
          <MapAttribution />
        </div>

        <EditorialColumn now={now} />
      </div>

      <KpiStrip />
    </div>
  )
}
