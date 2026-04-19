import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import LiveMap from '../components/LiveCity/LiveMap'
import {
  RIBA_ROJA,
  RR_EVENT_POOL,
  RR_INCIDENTS_SEED,
  RR_LAYERS,
  RR_NEIGHBORHOODS,
  RR_PRESS_POOL,
  RR_SOCIAL_POOL,
  RR_WEATHER,
} from '../data/mockData'
import { usePress, timeAgo as pressTimeAgo } from '../hooks/usePress'

const fmtClock = (d) =>
  d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
const fmtDate = (d) =>
  d.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })

const SEV_COLOR = {
  crit: '#F87171',
  warn: '#FBBF24',
  info: '#60A5FA',
  ok:   '#4ADE80',
}

function useClock() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])
  return now
}

function useLiveMonitor() {
  const [incidents, setIncidents] = useState(RR_INCIDENTS_SEED)
  const [events, setEvents] = useState(() =>
    RR_INCIDENTS_SEED.slice(0, 5).map((inc) => ({
      id: 'seed-' + inc.id,
      kind: 'pulso',
      ico: inc.sev === 'ok' ? '✓' : inc.sev === 'crit' ? '⚠' : '⚑',
      text: inc.text,
      dept: inc.dept,
      sev: inc.sev,
      ageSec: inc.age * 60,
    }))
  )
  const realPress = usePress()
  const [press, setPress] = useState(() =>
    RR_PRESS_POOL.slice(0, 4).map((p, i) => ({
      id: 'seed-press-' + i,
      kind: 'press',
      ageSec: 180 + i * 900,
      ...p,
    }))
  )

  // Once the real press snapshot loads, replace the seeded mock list with
  // real news aggregated from Levante-EMV, Las Provincias, Valencia Plaza, etc.
  useEffect(() => {
    if (!realPress.data || !realPress.data.items) return
    setPress(
      realPress.data.items.slice(0, 30).map((p) => ({
        id: 'real-press-' + p.id,
        kind: 'press',
        ageSec: Math.max(60, Math.floor((Date.now() - new Date(p.date).getTime()) / 1000)),
        headline: p.title,
        src: p.source,
        link: p.link,
        cat: p.sourceHost || '',
        tone: 'neutral',
      }))
    )
  }, [realPress.data])
  const [social, setSocial] = useState(() =>
    RR_SOCIAL_POOL.slice(0, 6).map((s, i) => ({
      id: 'seed-social-' + i,
      kind: 'social',
      ageSec: 60 + i * 180,
      ...s,
    }))
  )
  const [mhs, setMhs] = useState(RIBA_ROJA.mhsBase)
  const [activeQuejas, setActiveQuejas] = useState(47)
  const [todaySpend, setTodaySpend] = useState(14320)
  const [resolvedToday, setResolvedToday] = useState(31)
  const [budgetTick, setBudgetTick] = useState(0)

  const eventIdRef = useRef(1)
  const pressIdRef = useRef(1)
  const socialIdRef = useRef(1)

  // Event firing — every 6-12s a new event rolls in
  useEffect(() => {
    const schedule = () => {
      const delay = 6000 + Math.random() * 6000
      return setTimeout(() => {
        const pool = RR_EVENT_POOL[Math.floor(Math.random() * RR_EVENT_POOL.length)]
        const nextId = 'live-' + eventIdRef.current++
        const hood = RR_NEIGHBORHOODS.find((h) => h.id === pool.hoodId)
        const jitterLat = (Math.random() - 0.5) * 0.004
        const jitterLng = (Math.random() - 0.5) * 0.006
        const pos = hood ? [hood.center[0] + jitterLat, hood.center[1] + jitterLng] : RIBA_ROJA.center

        setEvents((prev) => [{ id: nextId, kind: 'pulso', ageSec: 0, ...pool }, ...prev].slice(0, 30))

        if (pool.sev !== 'info') {
          const isResolution = pool.sev === 'ok'
          if (isResolution) {
            setResolvedToday((v) => v + 1)
            setActiveQuejas((v) => Math.max(0, v - 1))
          } else {
            setActiveQuejas((v) => v + 1)
            const newInc = {
              id: 'L-' + (1300 + eventIdRef.current),
              pos,
              sev: pool.sev,
              text: pool.text.replace('Nueva queja: ', ''),
              dept: pool.dept,
              age: 0,
              status: 'abierta',
            }
            setIncidents((prev) => [newInc, ...prev].slice(0, 24))
          }
        }

        if (pool.ico === '€') {
          const euros = 2000 + Math.floor(Math.random() * 15000)
          setTodaySpend((v) => v + euros)
        }

        timer = schedule()
      }, delay)
    }
    let timer = schedule()
    return () => clearTimeout(timer)
  }, [])

  // Press — real data from usePress(); no simulator needed. Fallback to the
  // mock pool simulator if /data/press.json hasn't loaded yet.
  useEffect(() => {
    if (realPress.data) return // real data wins
    const schedule = () => {
      const delay = 30000 + Math.random() * 45000
      return setTimeout(() => {
        const pool = RR_PRESS_POOL[Math.floor(Math.random() * RR_PRESS_POOL.length)]
        const next = { id: 'press-' + pressIdRef.current++, kind: 'press', ageSec: 0, ...pool }
        setPress((prev) => [next, ...prev].slice(0, 20))
        timer = schedule()
      }, delay)
    }
    let timer = schedule()
    return () => clearTimeout(timer)
  }, [realPress.data])

  // Social — a new post every 4–10s (chattier than press)
  useEffect(() => {
    const schedule = () => {
      const delay = 4000 + Math.random() * 6000
      return setTimeout(() => {
        const pool = RR_SOCIAL_POOL[Math.floor(Math.random() * RR_SOCIAL_POOL.length)]
        const next = {
          id: 'social-' + socialIdRef.current++,
          kind: 'social',
          ageSec: 0,
          ...pool,
          likes: pool.likes + Math.floor(Math.random() * 8),
          replies: pool.replies + Math.floor(Math.random() * 3),
        }
        setSocial((prev) => [next, ...prev].slice(0, 30))
        timer = schedule()
      }, delay)
    }
    let timer = schedule()
    return () => clearTimeout(timer)
  }, [])

  // Age all feeds / incidents by 1s
  useEffect(() => {
    const id = setInterval(() => {
      setEvents((prev) => prev.map((e) => ({ ...e, ageSec: e.ageSec + 1 })))
      setPress((prev) => prev.map((p) => ({ ...p, ageSec: p.ageSec + 1 })))
      setSocial((prev) => prev.map((s) => ({ ...s, ageSec: s.ageSec + 1 })))
      setIncidents((prev) =>
        prev.map((i) => (i.status === 'resuelta' ? i : { ...i, age: i.age + 1 / 60 }))
      )
    }, 1000)
    return () => clearInterval(id)
  }, [])

  // MHS drift every 30s
  useEffect(() => {
    const id = setInterval(() => {
      setMhs((prev) => {
        const drift = (Math.random() - 0.48) * 0.4
        return Math.max(60, Math.min(95, +(prev + drift).toFixed(1)))
      })
    }, 30000)
    return () => clearInterval(id)
  }, [])

  // Budget particle tick
  useEffect(() => {
    const id = setInterval(() => setBudgetTick((t) => (t + 1) % 1000), 1000)
    return () => clearInterval(id)
  }, [])

  return {
    incidents,
    events,
    press,
    social,
    mhs,
    activeQuejas,
    todaySpend,
    resolvedToday,
    budgetTick,
  }
}

function GlassPanel({ children, style = {} }) {
  return (
    <div
      style={{
        background: 'rgba(14,20,34,.82)',
        backdropFilter: 'blur(14px)',
        WebkitBackdropFilter: 'blur(14px)',
        border: '1px solid rgba(96,165,250,.18)',
        borderRadius: 12,
        color: 'white',
        boxShadow: '0 8px 24px rgba(0,0,0,.35)',
        ...style,
      }}
    >
      {children}
    </div>
  )
}

function Pod({ label, value, sub, tone = 'info', subTone }) {
  const color = {
    ok:   '#4ADE80',
    warn: '#FBBF24',
    crit: '#F87171',
    info: '#60A5FA',
    amber:'#F5B544',
  }[tone]
  return (
    <GlassPanel style={{ padding: '10px 14px', minWidth: 118 }}>
      <div
        className="mono"
        style={{
          fontSize: 9.5,
          color: 'rgba(255,255,255,.55)',
          textTransform: 'uppercase',
          letterSpacing: '.12em',
        }}
      >
        {label}
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 3 }}>
        <div
          className="mono"
          style={{ fontSize: 22, fontWeight: 800, color, letterSpacing: '-.01em', lineHeight: 1 }}
        >
          {value}
        </div>
        {sub && (
          <span
            className="mono"
            style={{
              fontSize: 10,
              color: subTone === 'ok' ? '#4ADE80' : subTone === 'crit' ? '#F87171' : 'rgba(255,255,255,.6)',
              fontWeight: 700,
            }}
          >
            {sub}
          </span>
        )}
      </div>
    </GlassPanel>
  )
}

function Clock() {
  const now = useClock()
  return (
    <GlassPanel style={{ padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 12 }}>
      <svg width="20" height="20" viewBox="0 0 24 24">
        <rect x="1" y="1" width="22" height="22" rx="5" fill="#5B8DEF" />
        <path
          d="M5 13 Q 7 13, 8 11 T 11 8 Q 12 7, 13 10 T 16 14 Q 17 15, 19 13"
          fill="none"
          stroke="white"
          strokeWidth="1.7"
          strokeLinecap="round"
        />
      </svg>
      <div>
        <div className="mono" style={{ fontSize: 9, color: 'rgba(255,255,255,.6)', letterSpacing: '.12em' }}>
          RIBA-ROJA · LIVE
        </div>
        <div className="mono" style={{ fontSize: 14, fontWeight: 700, color: '#F5B544' }}>
          {fmtClock(now)}
        </div>
      </div>
      <div style={{ width: 1, height: 28, background: 'rgba(255,255,255,.1)' }} />
      <div>
        <div className="mono" style={{ fontSize: 9, color: 'rgba(255,255,255,.6)', letterSpacing: '.12em' }}>
          FECHA
        </div>
        <div style={{ fontSize: 13, fontWeight: 600, textTransform: 'capitalize' }}>{fmtDate(now)}</div>
      </div>
    </GlassPanel>
  )
}

function Weather() {
  const w = RR_WEATHER
  return (
    <GlassPanel style={{ padding: '10px 14px', display: 'flex', gap: 14, alignItems: 'center' }}>
      <div style={{ fontSize: 32, lineHeight: 1 }}>{w.icon}</div>
      <div>
        <div
          className="mono"
          style={{ fontSize: 9, color: 'rgba(255,255,255,.6)', letterSpacing: '.12em' }}
        >
          TÚRIA · AHORA
        </div>
        <div className="mono" style={{ fontSize: 22, fontWeight: 800, lineHeight: 1.1 }}>
          {w.temp}°<span style={{ fontSize: 14, color: 'rgba(255,255,255,.55)' }}>C</span>
        </div>
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,.7)' }}>
          {w.condition} · {w.min}° / {w.max}°
        </div>
      </div>
      <div style={{ width: 1, height: 42, background: 'rgba(255,255,255,.1)' }} />
      <div style={{ fontSize: 11 }}>
        <div style={{ color: 'rgba(255,255,255,.55)', letterSpacing: '.08em' }} className="mono">
          AQI
        </div>
        <div
          className="mono"
          style={{ fontSize: 18, fontWeight: 800, color: '#4ADE80', lineHeight: 1.1 }}
        >
          {w.aqi}
        </div>
        <div style={{ color: '#4ADE80' }}>{w.aqiLabel}</div>
      </div>
    </GlassPanel>
  )
}

function LayerSwitcher({ layer, onLayer }) {
  return (
    <GlassPanel style={{ padding: 6, display: 'flex', gap: 4 }}>
      {RR_LAYERS.map((l) => (
        <button
          key={l.id}
          onClick={() => onLayer(l.id)}
          title={l.hint}
          style={{
            padding: '7px 12px',
            borderRadius: 8,
            background: layer === l.id ? '#F5B544' : 'transparent',
            color: layer === l.id ? '#0B0F19' : 'rgba(255,255,255,.75)',
            fontWeight: layer === l.id ? 700 : 500,
            fontSize: 12,
          }}
        >
          {l.name}
        </button>
      ))}
    </GlassPanel>
  )
}

function formatAge(sec) {
  if (sec < 60) return 'ahora'
  const m = Math.floor(sec / 60)
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60)
  return `${h} h ${m % 60}m`
}

const PLATFORM_GLYPH = { x: '𝕏', mastodon: '🐘', bluesky: '🦋' }

function PulsoItem({ e }) {
  return (
    <div
      style={{
        display: 'flex',
        gap: 10,
        paddingBottom: 8,
        borderBottom: '1px solid rgba(255,255,255,.06)',
        animation: e.ageSec < 2 ? 'ribaNew 600ms cubic-bezier(.2,.9,.2,1)' : 'none',
      }}
    >
      <div
        style={{
          width: 22,
          height: 22,
          flexShrink: 0,
          borderRadius: 6,
          display: 'grid',
          placeItems: 'center',
          fontSize: 11,
          background:
            e.sev === 'crit'
              ? 'rgba(248,113,113,.2)'
              : e.sev === 'warn'
              ? 'rgba(251,191,36,.2)'
              : e.sev === 'ok'
              ? 'rgba(74,222,128,.2)'
              : 'rgba(96,165,250,.2)',
          color: SEV_COLOR[e.sev] || SEV_COLOR.info,
        }}
      >
        {e.ico}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 500, lineHeight: 1.3 }}>{e.text}</div>
        <div style={{ display: 'flex', gap: 6, marginTop: 2, fontSize: 10, color: 'rgba(255,255,255,.5)' }}>
          <span className="mono">{formatAge(e.ageSec)}</span>
          <span>·</span>
          <span>{e.dept}</span>
        </div>
      </div>
    </div>
  )
}

function PressItem({ p }) {
  return (
    <div
      style={{
        display: 'flex',
        gap: 10,
        paddingBottom: 10,
        borderBottom: '1px solid rgba(255,255,255,.06)',
        animation: p.ageSec < 2 ? 'ribaNew 600ms cubic-bezier(.2,.9,.2,1)' : 'none',
      }}
    >
      <div
        className="mono"
        style={{
          width: 30,
          height: 30,
          flexShrink: 0,
          borderRadius: 6,
          background: p.color,
          color: 'white',
          display: 'grid',
          placeItems: 'center',
          fontSize: 10,
          fontWeight: 800,
          letterSpacing: '-.02em',
        }}
      >
        {p.mono}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10.5, color: 'rgba(255,255,255,.7)' }}>
          <span style={{ fontWeight: 700, color: 'white' }}>{p.src}</span>
          <span style={{ color: 'rgba(255,255,255,.3)' }}>·</span>
          <span className="mono">{formatAge(p.ageSec)}</span>
          <span
            className="mono"
            style={{
              marginLeft: 'auto',
              fontSize: 9,
              color:
                p.tone === 'warn'
                  ? '#FBBF24'
                  : p.tone === 'ok'
                  ? '#4ADE80'
                  : 'rgba(255,255,255,.5)',
              textTransform: 'uppercase',
              letterSpacing: '.06em',
            }}
          >
            {p.cat}
          </span>
        </div>
        <div style={{ fontSize: 12.5, fontWeight: 500, lineHeight: 1.35, marginTop: 3 }}>
          {p.link ? (
            <a
              href={p.link}
              target="_blank"
              rel="noreferrer"
              style={{ color: 'inherit', textDecoration: 'none' }}
            >
              {p.headline}
            </a>
          ) : (
            p.headline
          )}
        </div>
      </div>
    </div>
  )
}

function SocialItem({ s }) {
  return (
    <div
      style={{
        display: 'flex',
        gap: 10,
        paddingBottom: 10,
        borderBottom: '1px solid rgba(255,255,255,.06)',
        animation: s.ageSec < 2 ? 'ribaNew 600ms cubic-bezier(.2,.9,.2,1)' : 'none',
      }}
    >
      <div
        style={{
          width: 32,
          height: 32,
          flexShrink: 0,
          borderRadius: '50%',
          background: s.bg,
          color: 'white',
          display: 'grid',
          placeItems: 'center',
          fontSize: 11,
          fontWeight: 800,
        }}
      >
        {s.initials}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11 }}>
          <span style={{ fontWeight: 700, color: 'white' }}>{s.name}</span>
          {s.verified && (
            <span
              style={{
                width: 12,
                height: 12,
                borderRadius: '50%',
                background: '#60A5FA',
                color: 'white',
                fontSize: 8,
                display: 'grid',
                placeItems: 'center',
                fontWeight: 800,
              }}
            >
              ✓
            </span>
          )}
          <span style={{ color: 'rgba(255,255,255,.5)' }}>@{s.handle}</span>
          <span style={{ color: 'rgba(255,255,255,.3)' }}>·</span>
          <span className="mono" style={{ color: 'rgba(255,255,255,.5)', fontSize: 10 }}>
            {formatAge(s.ageSec)}
          </span>
          <span
            style={{
              marginLeft: 'auto',
              fontSize: 11,
              opacity: 0.55,
            }}
          >
            {PLATFORM_GLYPH[s.platform] || '•'}
          </span>
        </div>
        <div style={{ fontSize: 12.5, lineHeight: 1.4, marginTop: 3, color: 'rgba(255,255,255,.92)' }}>
          {s.text}
        </div>
        <div
          className="mono"
          style={{
            display: 'flex',
            gap: 14,
            marginTop: 5,
            fontSize: 10,
            color: 'rgba(255,255,255,.45)',
          }}
        >
          <span>♡ {s.likes}</span>
          <span>↺ {s.reposts}</span>
          <span>↩ {s.replies}</span>
        </div>
      </div>
    </div>
  )
}

function LiveTicker({ tab, onTab, events, press, social }) {
  const tabs = [
    { id: 'pulso',  label: 'Pulso',  count: events.length },
    { id: 'press',  label: 'Prensa', count: press.length },
    { id: 'social', label: 'Social', count: social.length },
  ]
  return (
    <GlassPanel style={{ padding: 14, width: 340 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div>
          <div
            className="mono"
            style={{ fontSize: 9, color: 'rgba(255,255,255,.55)', letterSpacing: '.12em' }}
          >
            TIEMPO REAL · RIBA-ROJA
          </div>
          <div style={{ fontSize: 13, fontWeight: 700, marginTop: 2 }}>Feeds en directo</div>
        </div>
        <span
          style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 10, color: '#4ADE80' }}
        >
          <span
            style={{
              width: 7,
              height: 7,
              borderRadius: '50%',
              background: '#4ADE80',
              animation: 'ribaPulse 1.5s infinite',
            }}
          />
          LIVE
        </span>
      </div>

      <div
        style={{
          display: 'flex',
          gap: 4,
          padding: 3,
          background: 'rgba(255,255,255,.05)',
          borderRadius: 8,
          marginBottom: 10,
        }}
      >
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => onTab(t.id)}
            style={{
              flex: 1,
              padding: '6px 8px',
              borderRadius: 6,
              background: tab === t.id ? '#5B8DEF' : 'transparent',
              color: tab === t.id ? 'white' : 'rgba(255,255,255,.7)',
              fontWeight: tab === t.id ? 700 : 500,
              fontSize: 12,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 5,
            }}
          >
            {t.label}
            <span
              className="mono"
              style={{
                fontSize: 9,
                padding: '1px 5px',
                borderRadius: 8,
                background: tab === t.id ? 'rgba(255,255,255,.25)' : 'rgba(255,255,255,.08)',
                color: tab === t.id ? 'white' : 'rgba(255,255,255,.55)',
              }}
            >
              {t.count}
            </span>
          </button>
        ))}
      </div>

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          maxHeight: 360,
          overflowY: 'auto',
        }}
      >
        {tab === 'pulso' && events.map((e) => <PulsoItem key={e.id} e={e} />)}
        {tab === 'press' && press.map((p) => <PressItem key={p.id} p={p} />)}
        {tab === 'social' && social.map((s) => <SocialItem key={s.id} s={s} />)}
      </div>
    </GlassPanel>
  )
}

function ActivityGauge({ mhs }) {
  const angle = (mhs - 60) / 35 * 180
  const color = mhs >= 80 ? '#4ADE80' : mhs >= 70 ? '#FBBF24' : '#F87171'
  const cx = 72
  const cy = 68
  const r = 56
  const rad = ((180 - angle) * Math.PI) / 180
  const x2 = cx + r * Math.cos(rad)
  const y2 = cy - r * Math.sin(rad)
  return (
    <GlassPanel style={{ padding: 16, width: 320 }}>
      <div
        className="mono"
        style={{ fontSize: 10, color: 'rgba(255,255,255,.55)', letterSpacing: '.12em' }}
      >
        ÍNDICE DE SALUD MUNICIPAL
      </div>
      <div style={{ display: 'flex', gap: 14, alignItems: 'center', marginTop: 6 }}>
        <svg viewBox="0 0 144 80" width="144" height="80">
          <path d="M 16 68 A 56 56 0 0 1 128 68" stroke="rgba(255,255,255,.08)" strokeWidth="10" fill="none" />
          <path
            d={`M 16 68 A 56 56 0 0 1 ${x2.toFixed(1)} ${y2.toFixed(1)}`}
            stroke={color}
            strokeWidth="10"
            strokeLinecap="round"
            fill="none"
          />
          <circle cx={cx} cy={cy} r="3" fill={color} />
        </svg>
        <div style={{ flex: 1 }}>
          <div
            className="mono"
            style={{ fontSize: 40, fontWeight: 800, color, lineHeight: 1, letterSpacing: '-.02em' }}
          >
            {mhs.toFixed(1)}
          </div>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,.6)', marginTop: 4 }}>
            {mhs >= 80 ? 'Saludable' : mhs >= 70 ? 'Observación' : 'Atención'}
          </div>
        </div>
      </div>
    </GlassPanel>
  )
}

function Legend({ layer }) {
  const items =
    layer === 'incidencias'
      ? [
          { c: '#F87171', l: 'Crítica' },
          { c: '#FBBF24', l: 'Media' },
          { c: '#60A5FA', l: 'Info' },
          { c: '#4ADE80', l: 'Resuelta' },
        ]
      : layer === 'calor'
      ? [
          { c: '#16A34A', l: 'Saludable ≥82' },
          { c: '#FBBF24', l: 'Observación 76–81' },
          { c: '#EF4444', l: 'Atención <76' },
        ]
      : layer === 'aire'
      ? [
          { c: '#16A34A', l: 'Buena' },
          { c: '#FBBF24', l: 'Moderada' },
          { c: '#EF4444', l: 'Mala' },
        ]
      : [
          { c: '#60A5FA', l: 'Personal' },
          { c: '#B084EE', l: 'Obras' },
          { c: '#22D3EE', l: 'Servicios' },
          { c: '#4ADE80', l: 'Medio Amb.' },
          { c: '#FBBF24', l: 'Movilidad' },
          { c: '#F97316', l: 'Cultura' },
        ]
  return (
    <GlassPanel style={{ padding: '8px 12px', display: 'flex', gap: 12, flexWrap: 'wrap' }}>
      {items.map((it) => (
        <span key={it.l} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11 }}>
          <span style={{ width: 9, height: 9, borderRadius: '50%', background: it.c }} />
          <span style={{ color: 'rgba(255,255,255,.82)' }}>{it.l}</span>
        </span>
      ))}
    </GlassPanel>
  )
}

function NeighborhoodList() {
  const sorted = [...RR_NEIGHBORHOODS].sort((a, b) => b.mhs - a.mhs)
  return (
    <GlassPanel style={{ padding: 14, width: 280 }}>
      <div
        className="mono"
        style={{ fontSize: 10, color: 'rgba(255,255,255,.55)', letterSpacing: '.12em' }}
      >
        BARRIOS · RANKING MHS
      </div>
      <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {sorted.map((n) => (
          <div
            key={n.id}
            style={{
              display: 'grid',
              gridTemplateColumns: '14px 1fr 44px',
              alignItems: 'center',
              gap: 10,
              fontSize: 12,
            }}
          >
            <span style={{ width: 10, height: 10, borderRadius: 3, background: n.color }} />
            <div>
              <div style={{ fontWeight: 500 }}>{n.name}</div>
              <div className="mono" style={{ fontSize: 10, color: 'rgba(255,255,255,.5)' }}>
                {n.pop.toLocaleString('es-ES')} hab.
              </div>
            </div>
            <div
              className="mono"
              style={{
                textAlign: 'right',
                fontSize: 14,
                fontWeight: 700,
                color: n.mhs >= 82 ? '#4ADE80' : n.mhs >= 76 ? '#FBBF24' : '#F87171',
              }}
            >
              {n.mhs}
            </div>
          </div>
        ))}
      </div>
    </GlassPanel>
  )
}

function KioskBtn({ kiosk, onToggle }) {
  return (
    <button
      onClick={onToggle}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '8px 12px',
        borderRadius: 8,
        background: kiosk ? '#F5B544' : 'rgba(14,20,34,.82)',
        color: kiosk ? '#0B0F19' : 'white',
        border: kiosk ? '1px solid rgba(245,181,68,.6)' : '1px solid rgba(96,165,250,.18)',
        backdropFilter: 'blur(14px)',
        WebkitBackdropFilter: 'blur(14px)',
        fontSize: 12,
        fontWeight: 600,
        cursor: 'pointer',
      }}
    >
      {kiosk ? '⤬ Salir kiosco' : '⛶ Pantalla completa'}
    </button>
  )
}

export default function Ciudad() {
  const { incidents, events, press, social, mhs, activeQuejas, todaySpend, resolvedToday, budgetTick } =
    useLiveMonitor()
  const [layer, setLayer] = useState('incidencias')
  const [feedTab, setFeedTab] = useState('pulso')
  const [kiosk, setKiosk] = useState(false)
  const containerRef = useRef(null)

  const fmtEur = useMemo(
    () =>
      new Intl.NumberFormat('es-ES', {
        style: 'currency',
        currency: 'EUR',
        maximumFractionDigits: 0,
      }),
    []
  )

  const toggleKiosk = useCallback(async () => {
    const next = !kiosk
    setKiosk(next)
    document.body.classList.toggle('cp-kiosk', next)
    try {
      if (next && document.documentElement.requestFullscreen) {
        await document.documentElement.requestFullscreen()
      } else if (!next && document.fullscreenElement) {
        await document.exitFullscreen()
      }
    } catch {
      // user denied or not supported — panel-only kiosk still works
    }
  }, [kiosk])

  useEffect(() => {
    const onChange = () => {
      if (!document.fullscreenElement && kiosk) {
        setKiosk(false)
        document.body.classList.remove('cp-kiosk')
      }
    }
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [kiosk])

  useEffect(() => () => document.body.classList.remove('cp-kiosk'), [])

  const height = kiosk ? '100vh' : 'calc(100vh - 52px)'

  return (
    <div
      ref={containerRef}
      className="cp-live-container"
      style={{
        position: 'relative',
        width: '100%',
        height,
        background: '#0B0F19',
        overflow: 'hidden',
      }}
    >
      <style>{`
        @keyframes ribaPulse { 0%,100% { opacity: 1 } 50% { opacity: .3 } }
        @keyframes ribaNew {
          0%   { opacity: 0; transform: translateX(-14px); }
          100% { opacity: 1; transform: translateX(0); }
        }
        .cp-live-container .leaflet-container { background: #0B0F19; }
        .cp-live-container .leaflet-popup-content-wrapper {
          border-radius: 8px;
        }
        .cp-live-container .leaflet-control-zoom {
          border: 1px solid rgba(96,165,250,.25) !important;
          margin-top: 80px !important;
          margin-left: 14px !important;
        }
        .cp-live-container .leaflet-control-zoom a {
          background: rgba(14,20,34,.82);
          color: white;
          border-bottom-color: rgba(96,165,250,.18);
          backdrop-filter: blur(10px);
        }
        .cp-live-container .leaflet-tooltip {
          background: rgba(14,20,34,.9);
          color: white;
          border: 1px solid rgba(96,165,250,.25);
          box-shadow: 0 4px 10px rgba(0,0,0,.4);
        }
        .cp-live-container .leaflet-tooltip-top::before { border-top-color: rgba(14,20,34,.9); }
      `}</style>

      <LiveMap incidents={incidents} layer={layer} budgetTick={budgetTick} />

      {/* Top row — clock + KPI pods + kiosk toggle */}
      <div
        style={{
          position: 'absolute',
          top: 14,
          left: 14,
          right: 14,
          zIndex: 400,
          display: 'flex',
          gap: 10,
          alignItems: 'flex-start',
          flexWrap: 'wrap',
        }}
      >
        <Clock />
        <div style={{ flex: 1, display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
          <Pod
            label="Quejas activas"
            value={activeQuejas}
            sub={`+${Math.floor(resolvedToday / 6)} / h`}
            subTone="info"
            tone="warn"
          />
          <Pod label="Resueltas hoy" value={resolvedToday} tone="ok" />
          <Pod label="€ ejecutados hoy" value={fmtEur.format(todaySpend).replace('€', '€')} tone="info" />
          <Pod label="Equipo en calle" value="14" sub="activo" subTone="ok" tone="amber" />
          <Pod label="Pleno" value="18:00" sub="hoy" tone="crit" />
        </div>
        <KioskBtn kiosk={kiosk} onToggle={toggleKiosk} />
      </div>

      {/* Left column — gauge + ticker */}
      <div
        style={{
          position: 'absolute',
          top: 110,
          left: 14,
          zIndex: 400,
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
          maxHeight: 'calc(100% - 180px)',
        }}
      >
        <ActivityGauge mhs={mhs} />
        <LiveTicker
          tab={feedTab}
          onTab={setFeedTab}
          events={events}
          press={press}
          social={social}
        />
      </div>

      {/* Right column — neighborhood ranking */}
      <div
        style={{
          position: 'absolute',
          top: 110,
          right: 14,
          zIndex: 400,
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
        }}
      >
        <Weather />
        <NeighborhoodList />
      </div>

      {/* Bottom — layer switcher + legend */}
      <div
        style={{
          position: 'absolute',
          bottom: 14,
          left: 0,
          right: 0,
          zIndex: 400,
          display: 'flex',
          justifyContent: 'center',
          gap: 10,
          flexWrap: 'wrap',
          padding: '0 14px',
        }}
      >
        <LayerSwitcher layer={layer} onLayer={setLayer} />
        <Legend layer={layer} />
      </div>
    </div>
  )
}
