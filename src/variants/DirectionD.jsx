import { useEffect, useMemo, useRef, useState } from 'react'
import StylizedMap from '../components/LiveCity/StylizedMap'
import { useOfficials, partyColor } from '../hooks/useOfficials'
import { useTenders, formatDate as formatTenderDate } from '../hooks/useTenders'
import { usePadron } from '../hooks/usePadron'
import { useBudget, formatEuros as formatBudgetEuros } from '../hooks/useBudget'
import { Ic } from '../components/Icons'
import {
  RIBA_ROJA,
  RR_EVENT_POOL,
  RR_INCIDENTS_SEED,
  RR_LAYERS,
  RR_NEIGHBORHOODS,
  RR_PRESS_POOL,
} from '../data/mockData'

const SERIF = "'Fraunces', Georgia, serif"
const SANS = "'Outfit', system-ui, -apple-system, sans-serif"
const MONO = "'DM Mono', ui-monospace, monospace"

const PALETTE = {
  bg: '#FAF8F2',
  paper: '#FFFFFF',
  ink: '#0B0F19',
  ink80: 'rgba(11,15,25,.80)',
  ink60: 'rgba(11,15,25,.60)',
  ink50: 'rgba(11,15,25,.50)',
  ink40: 'rgba(11,15,25,.40)',
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
  return d.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
}

function formatAge(sec) {
  if (sec < 60) return 'ahora'
  const m = Math.floor(sec / 60)
  if (m < 60) return `hace ${m} min`
  const h = Math.floor(m / 60)
  return `hace ${h} h`
}

function useClock(intervalMs = 30000) {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])
  return now
}

// A slower, more editorial-paced live feed — one event every 20–45s
function useSlowFeed() {
  const [events, setEvents] = useState(() =>
    RR_INCIDENTS_SEED.slice(0, 4).map((inc, i) => ({
      id: 'seed-' + inc.id,
      ageSec: 120 + i * 240,
      sev: inc.sev,
      text: inc.text,
      dept: inc.dept,
      ico: inc.sev === 'ok' ? '✓' : inc.sev === 'crit' ? '⚠' : '⚑',
    }))
  )
  const idRef = useRef(1)

  useEffect(() => {
    const schedule = () => {
      const delay = 20000 + Math.random() * 25000
      return setTimeout(() => {
        const pool = RR_EVENT_POOL[Math.floor(Math.random() * RR_EVENT_POOL.length)]
        const next = { id: 'd-' + idRef.current++, ageSec: 0, ...pool }
        setEvents((prev) => [next, ...prev].slice(0, 12))
        timer = schedule()
      }, delay)
    }
    let timer = schedule()
    return () => clearTimeout(timer)
  }, [])

  useEffect(() => {
    const id = setInterval(() => setEvents((prev) => prev.map((e) => ({ ...e, ageSec: e.ageSec + 1 }))), 1000)
    return () => clearInterval(id)
  }, [])

  return events
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
   LEFT RAIL
   ============================================================ */
const RAIL_ITEMS = [
  { id: 'mirador', label: 'Mirador', icon: Ic.home,   active: true },
  { id: 'boletin', label: 'Boletín', icon: Ic.chart },
  { id: 'quejas',  label: 'Quejas',  icon: Ic.warn },
  { id: 'cargos',  label: 'Cargos',  icon: Ic.people },
  { id: 'presup',  label: 'Presup.', icon: Ic.coin },
  { id: 'plenos',  label: 'Plenos',  icon: Ic.scale },
  { id: 'datos',   label: 'Datos',   icon: Ic.cmd },
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
        <div
          key={n.id}
          title={n.label}
          style={{
            width: 40,
            height: 40,
            display: 'grid',
            placeItems: 'center',
            borderRadius: 8,
            background: n.active ? '#EEF4FF' : 'transparent',
            color: n.active ? PALETTE.civic : PALETTE.ink60,
            cursor: 'pointer',
            position: 'relative',
          }}
          onMouseEnter={(e) => {
            if (!n.active) e.currentTarget.style.background = PALETTE.bg
          }}
          onMouseLeave={(e) => {
            if (!n.active) e.currentTarget.style.background = 'transparent'
          }}
        >
          <n.icon width={18} height={18} />
          {n.active && (
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
        </div>
      ))}
    </aside>
  )
}

/* ============================================================
   MAP OVERLAY BADGE
   ============================================================ */
function StatusBadge({ mhs }) {
  return (
    <div
      style={{
        position: 'absolute',
        top: 14,
        left: 14,
        zIndex: 400,
        display: 'flex',
        gap: 12,
        alignItems: 'center',
        background: 'rgba(14,20,34,.82)',
        backdropFilter: 'blur(14px)',
        WebkitBackdropFilter: 'blur(14px)',
        border: '1px solid rgba(96,165,250,.22)',
        borderRadius: 10,
        padding: '10px 14px',
        color: 'white',
        fontFamily: SANS,
      }}
    >
      <div>
        <div style={{ fontFamily: MONO, fontSize: 9, color: 'rgba(255,255,255,.55)', letterSpacing: '.12em' }}>
          SALUD MUNICIPAL
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 2 }}>
          <span style={{ fontFamily: MONO, fontSize: 22, fontWeight: 800, color: '#4ADE80', lineHeight: 1 }}>
            {mhs.toFixed(1)}
          </span>
          <span style={{ fontFamily: MONO, fontSize: 10, color: '#4ADE80', fontWeight: 700 }}>▲ 0.4</span>
        </div>
      </div>
      <span style={{ width: 1, height: 32, background: 'rgba(255,255,255,.12)' }} />
      <div>
        <div style={{ fontFamily: MONO, fontSize: 9, color: 'rgba(255,255,255,.55)', letterSpacing: '.12em' }}>
          PRÓXIMO PLENO
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 2 }}>
          <span style={{ fontFamily: MONO, fontSize: 14, fontWeight: 700 }}>HOY 18:00</span>
          <span style={{ fontFamily: MONO, fontSize: 10, color: '#F5B544' }}>2 puntos calientes</span>
        </div>
      </div>
    </div>
  )
}

function LayerSwitcher({ layer, onLayer }) {
  return (
    <div
      style={{
        position: 'absolute',
        bottom: 14,
        left: 14,
        zIndex: 400,
        display: 'flex',
        gap: 4,
        padding: 5,
        background: 'rgba(14,20,34,.82)',
        backdropFilter: 'blur(14px)',
        WebkitBackdropFilter: 'blur(14px)',
        border: '1px solid rgba(96,165,250,.18)',
        borderRadius: 10,
      }}
    >
      {RR_LAYERS.map((l) => (
        <button
          key={l.id}
          onClick={() => onLayer(l.id)}
          style={{
            padding: '5px 10px',
            borderRadius: 6,
            background: layer === l.id ? '#F5B544' : 'transparent',
            color: layer === l.id ? '#0B0F19' : 'rgba(255,255,255,.75)',
            fontWeight: layer === l.id ? 700 : 500,
            fontSize: 11.5,
            fontFamily: SANS,
            cursor: 'pointer',
          }}
        >
          {l.name}
        </button>
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
        maxWidth: 220,
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
      Vista esquemática · geometría OSM
      <br />
      Tren L9 · horario MetroValencia
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

function LeadStory() {
  return (
    <article style={{ paddingBottom: 22, borderBottom: '1px solid ' + PALETTE.hair }}>
      <Kicker tone="red">Promesa incumplida</Kicker>
      <h1
        style={{
          fontFamily: SERIF,
          fontSize: 30,
          fontWeight: 800,
          letterSpacing: '-.02em',
          lineHeight: 1.05,
          margin: '8px 0 12px',
        }}
      >
        La respuesta a quejas del Sector 14 se ha duplicado este trimestre
      </h1>
      <div
        style={{
          fontFamily: SERIF,
          fontSize: 15,
          color: PALETTE.ink80,
          lineHeight: 1.45,
          fontStyle: 'italic',
          marginBottom: 14,
        }}
      >
        El servicio municipal de Limpieza prometió 48 horas. Los datos del propio Ayuntamiento
        muestran una media de 73 horas en el barrio con mayor crecimiento poblacional.
      </div>

      <div
        style={{
          display: 'flex',
          gap: 18,
          padding: '14px 16px',
          background: PALETTE.paper,
          border: '1px solid ' + PALETTE.hair,
          marginBottom: 14,
        }}
      >
        <div>
          <div
            style={{
              fontFamily: SERIF,
              fontSize: 36,
              fontWeight: 800,
              color: PALETTE.accent,
              lineHeight: 1,
              letterSpacing: '-.02em',
            }}
          >
            73h
          </div>
          <div
            style={{
              fontFamily: MONO,
              fontSize: 9.5,
              color: PALETTE.ink60,
              letterSpacing: '.08em',
              textTransform: 'uppercase',
              marginTop: 3,
            }}
          >
            Media real
          </div>
        </div>
        <div style={{ width: 1, background: PALETTE.hair }} />
        <div>
          <div
            style={{
              fontFamily: SERIF,
              fontSize: 36,
              fontWeight: 800,
              color: PALETTE.ok,
              lineHeight: 1,
              letterSpacing: '-.02em',
            }}
          >
            48h
          </div>
          <div
            style={{
              fontFamily: MONO,
              fontSize: 9.5,
              color: PALETTE.ink60,
              letterSpacing: '.08em',
              textTransform: 'uppercase',
              marginTop: 3,
            }}
          >
            Prometido
          </div>
        </div>
        <div style={{ flex: 1 }} />
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3 }}>
          <div
            style={{
              fontFamily: MONO,
              fontSize: 9.5,
              color: PALETTE.ink60,
              letterSpacing: '.08em',
              textTransform: 'uppercase',
            }}
          >
            Δ trimestre
          </div>
          <div style={{ fontFamily: MONO, fontSize: 14, fontWeight: 700, color: PALETTE.crit }}>
            ▲ 52%
          </div>
        </div>
      </div>

      <div
        style={{
          fontFamily: MONO,
          fontSize: 10.5,
          color: PALETTE.ink60,
          letterSpacing: '.06em',
        }}
      >
        POR <b style={{ color: PALETTE.ink }}>REDACCIÓN CIVICPULSE</b> · análisis de 312 quejas
        {' '}·{' '}
        <span style={{ color: PALETTE.civic, fontWeight: 600 }}>Leer completo →</span>
      </div>
    </article>
  )
}

function SecondaryStories() {
  const stories = [
    {
      kicker: 'Movilidad',
      kTone: 'navy',
      head: 'Metro L9 reducirá frecuencia en agosto: los barrios del este, afectados',
      byline: 'M. Torres',
      ago: 'hace 2 h',
    },
    {
      kicker: 'Transparencia',
      kTone: 'amber',
      head: 'El contrato de alumbrado LED (€680k) se adjudicó a la misma empresa por sexta vez',
      byline: 'Á. Núñez',
      ago: 'hace 4 h',
    },
    {
      kicker: 'Medio Ambiente',
      kTone: 'green',
      head: 'El río Túria recupera caudal medio tras las lluvias del fin de semana',
      byline: 'Redacción',
      ago: 'hace 6 h',
    },
  ]
  return (
    <section style={{ paddingTop: 18, paddingBottom: 18, borderBottom: '1px solid ' + PALETTE.hair }}>
      <div
        style={{
          fontFamily: MONO,
          fontSize: 10,
          color: PALETTE.ink60,
          letterSpacing: '.12em',
          textTransform: 'uppercase',
          marginBottom: 14,
        }}
      >
        Secundarias
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {stories.map((s, i) => (
          <article
            key={i}
            style={{
              paddingBottom: i < stories.length - 1 ? 14 : 0,
              borderBottom: i < stories.length - 1 ? '1px dotted ' + PALETTE.hair : 'none',
            }}
          >
            <Kicker tone={s.kTone}>{s.kicker}</Kicker>
            <h2
              style={{
                fontFamily: SERIF,
                fontSize: 17,
                fontWeight: 700,
                lineHeight: 1.2,
                letterSpacing: '-.01em',
                margin: '5px 0 6px',
              }}
            >
              {s.head}
            </h2>
            <div
              style={{
                fontFamily: MONO,
                fontSize: 10.5,
                color: PALETTE.ink60,
                letterSpacing: '.05em',
              }}
            >
              POR <b style={{ color: PALETTE.ink }}>{s.byline.toUpperCase()}</b> · {s.ago}
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}

function LiveStrip({ events }) {
  return (
    <section style={{ paddingTop: 18 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 12,
        }}
      >
        <div
          style={{
            fontFamily: MONO,
            fontSize: 10,
            color: PALETTE.ink60,
            letterSpacing: '.12em',
            textTransform: 'uppercase',
          }}
        >
          Ahora mismo
        </div>
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 5,
            fontSize: 10,
            color: PALETTE.ok,
            fontFamily: MONO,
            letterSpacing: '.06em',
          }}
        >
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: PALETTE.ok,
              animation: 'ribaPulse 1.5s infinite',
            }}
          />
          LIVE
        </span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {events.slice(0, 5).map((e) => (
          <div
            key={e.id}
            style={{
              display: 'flex',
              gap: 10,
              paddingBottom: 10,
              borderBottom: '1px dotted ' + PALETTE.hair,
              animation: e.ageSec < 2 ? 'ribaNew 500ms cubic-bezier(.2,.9,.2,1)' : 'none',
            }}
          >
            <div
              style={{
                width: 20,
                height: 20,
                flexShrink: 0,
                borderRadius: 4,
                display: 'grid',
                placeItems: 'center',
                fontSize: 10,
                background:
                  e.sev === 'crit'
                    ? 'rgba(220,38,38,.12)'
                    : e.sev === 'warn'
                    ? 'rgba(217,119,6,.12)'
                    : e.sev === 'ok'
                    ? 'rgba(22,163,74,.12)'
                    : 'rgba(36,99,235,.12)',
                color:
                  e.sev === 'crit'
                    ? PALETTE.crit
                    : e.sev === 'warn'
                    ? PALETTE.warn
                    : e.sev === 'ok'
                    ? PALETTE.ok
                    : PALETTE.civic,
              }}
            >
              {e.ico}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12.5, fontWeight: 500, lineHeight: 1.35, color: PALETTE.ink }}>
                {e.text}
              </div>
              <div
                style={{
                  display: 'flex',
                  gap: 6,
                  marginTop: 2,
                  fontFamily: MONO,
                  fontSize: 10,
                  color: PALETTE.ink50,
                }}
              >
                <span>{formatAge(e.ageSec)}</span>
                <span>·</span>
                <span>{e.dept}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
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
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 8 }}>
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
            <span style={{ marginLeft: 'auto', fontWeight: 700, color: PALETTE.ink }} className="mono">
              {fmtEur(c.finalAmount)}
            </span>
          </div>
        </div>
      ))}
    </div>
  )
}

function EditorialColumn({ events, now }) {
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
      <AlcaldeBox />
      <CoalitionRing />
      <LiveContracts />
      <LeadStory />
      <SecondaryStories />
      <LiveStrip events={events} />
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
  const path = pts.map((p, i) => (i === 0 ? 'M' : 'L') + p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ')
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: 60, height: 20, display: 'block' }}>
      <path d={path} stroke={color} strokeWidth="1.25" fill="none" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

function Kpi({ label, value, delta, tone, sub, spark, sparkColor, serif }) {
  const color =
    tone === 'ok' ? PALETTE.ok : tone === 'warn' ? PALETTE.warn : tone === 'crit' ? PALETTE.crit : PALETTE.ink
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

  // Population sparkline: last 10 years of total.
  const popSpark =
    padron?.series?.total?.slice(-10).map((p) => p.value) || [78, 79, 79, 80, 80, 81, 81, 81, 81, 81]
  const popLatest = padron ? Math.round(padron.latestTotal / 100) / 10 : 24.6 // thousands
  const popDecade = padron ? padron.growth.decadePct : 0
  const popDeltaStr = padron
    ? (popDecade >= 0 ? '▲ ' : '▼ ') + Math.abs(popDecade).toFixed(1) + '%'
    : '—'

  // Budget numbers
  const totalRevenue = budget?.snapshot?.totalRevenue
  const totalExpense = budget?.snapshot?.totalExpense
  const budgetYear = budget?.snapshot?.year
  const budgetValue = totalExpense
    ? formatBudgetEuros(totalExpense, { compact: true })
    : '€47.3k'
  const balance = budget?.snapshot?.balance || 0

  // Tenders totals
  const awardedTotal = tenders?.stats?.awardedTotalEuros
  const awardedCount = tenders?.stats?.awardedContracts
  const awardedValue = awardedTotal
    ? formatBudgetEuros(awardedTotal, { compact: true })
    : '—'

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
        value={padron ? popLatest.toFixed(1) + 'k' : '—'}
        delta={popDeltaStr}
        tone={popDecade > 0 ? 'ok' : 'warn'}
        sub={padron ? `10 años` : 'INE Padrón'}
        spark={popSpark}
        serif
      />
      <Kpi
        label={budgetYear ? `Presup. ${budgetYear}` : 'Presupuesto'}
        value={budgetValue}
        delta={balance >= 0 ? '▲' : '▼'}
        tone={balance >= 0 ? 'ok' : 'warn'}
        sub="MinHac CONPREL"
        spark={[20, 28, 32, 40, 42, 47]}
        sparkColor={PALETTE.civic}
      />
      <Kpi
        label="Gastos personal"
        value={
          budget?.snapshot?.expenseByEconomicChapter?.[0]?.amount
            ? formatBudgetEuros(budget.snapshot.expenseByEconomicChapter[0].amount, { compact: true })
            : '—'
        }
        delta={totalExpense ? ((budget.snapshot.expenseByEconomicChapter[0].amount / totalExpense) * 100).toFixed(0) + '%' : '—'}
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
        label="Pleno"
        value="18:00"
        delta="HOY"
        tone="crit"
        sub="2 calientes"
      />
      <div
        style={{
          padding: '0 18px',
          display: 'flex',
          alignItems: 'center',
          borderLeft: '1px solid ' + PALETTE.hair,
          background: PALETTE.bg,
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
          Recibo
          <br />
          IBI
        </div>
        <div
          style={{
            fontFamily: SERIF,
            fontSize: 24,
            fontWeight: 800,
            color: PALETTE.accent,
            letterSpacing: '-.02em',
            marginLeft: 10,
          }}
        >
          €487
        </div>
      </div>
    </footer>
  )
}

/* ============================================================
   APP
   ============================================================ */
export default function DirectionD() {
  const [layer, setLayer] = useState('incidencias')
  const [mhs] = useState(RIBA_ROJA.mhsBase)
  const events = useSlowFeed()
  const now = useClock(1000) // 1s for live metro arrival countdown

  // Memoized incidents — refined direction keeps pins stable
  const incidents = useMemo(() => RR_INCIDENTS_SEED, [])

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
        @keyframes ribaNew {
          0%   { opacity: 0; transform: translateX(-8px); }
          100% { opacity: 1; transform: translateX(0); }
        }
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

        {/* Map column */}
        <div style={{ flex: 1, position: 'relative', minWidth: 0 }}>
          <StylizedMap incidents={incidents} layer={layer} now={now} />
          <StatusBadge mhs={mhs} />
          <LayerSwitcher layer={layer} onLayer={setLayer} />
          <MapAttribution />
        </div>

        {/* Editorial column */}
        <EditorialColumn events={events} now={now} />
      </div>

      <KpiStrip />
    </div>
  )
}
