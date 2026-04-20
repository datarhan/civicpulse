import { NavLink } from 'react-router-dom'
import { Ic } from './Icons'
import { useWikidata } from '../hooks/useWikidata'

// Landing (/) always renders Direction D — the map kiosk with real data.
// Table-view pages below stay inside the Sidebar+Topbar shell.
export const NAV = [
  { to: '/',            id: 'inicio',   label: 'Panel',        icon: Ic.home,   shortcut: 'G H' },
  { to: '/cargos',      id: 'cargos',   label: 'Cargos',       icon: Ic.people, shortcut: 'G C' },
  { to: '/presupuesto', id: 'presup',   label: 'Presupuesto',  icon: Ic.coin,   shortcut: 'G P' },
  { to: '/plenos',      id: 'plenos',   label: 'Plenos',       icon: Ic.scale,  shortcut: 'G L' },
  { to: '/promesas',    id: 'promesas', label: 'Promesas',     icon: Ic.scale,  shortcut: 'G R' },
  { to: '/datos',       id: 'datos',    label: 'Datos',        icon: Ic.chart,  shortcut: 'G D' },
  { to: '/quejas',      id: 'quejas',   label: 'Quejas',       icon: Ic.warn,   shortcut: 'G Q' },
]

function CityChip() {
  const { data } = useWikidata()
  const pop = data?.facts?.population?.value
  return (
    <div
      style={{
        margin: '10px 12px 4px',
        padding: '9px 10px',
        background: 'var(--soft)',
        borderRadius: 8,
        display: 'flex',
        alignItems: 'center',
        gap: 10,
      }}
    >
      <div
        style={{
          width: 22,
          height: 22,
          borderRadius: 5,
          background: '#E8DDD2',
          display: 'grid',
          placeItems: 'center',
          fontSize: 9,
          fontWeight: 700,
          color: '#6B4C2A',
        }}
      >
        RR
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12.5, fontWeight: 600 }}>Riba-roja de Túria</div>
        <div className="mono" style={{ fontSize: 9.5, color: 'var(--ink50)' }}>
          Camp de Túria · {pop ? pop.toLocaleString('es-ES') : '—'}
        </div>
      </div>
    </div>
  )
}

export function Sidebar() {
  return (
    <aside
      className="cp-shell-sidebar"
      style={{
        width: 232,
        background: 'var(--paper)',
        borderRight: '1px solid var(--border2)',
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0,
        position: 'sticky',
        top: 0,
        height: '100vh',
        zIndex: 5,
      }}
    >
      <div
        style={{
          padding: '18px 18px 16px',
          display: 'flex',
          alignItems: 'center',
          gap: 9,
          borderBottom: '1px solid var(--border2)',
        }}
      >
        <svg width="22" height="22" viewBox="0 0 24 24">
          <rect x="1" y="1" width="22" height="22" rx="5" fill="var(--civic)" />
          <path
            d="M5 13 Q 7 13, 8 11 T 11 8 Q 12 7, 13 10 T 16 14 Q 17 15, 19 13"
            fill="none"
            stroke="white"
            strokeWidth="1.7"
            strokeLinecap="round"
          />
        </svg>
        <div style={{ fontWeight: 700, letterSpacing: '-.01em', fontSize: 15 }}>CivicPulse</div>
      </div>

      <CityChip />

      <nav style={{ padding: '10px 10px', flex: 1, overflowY: 'auto' }}>
        <div
          className="mono"
          style={{
            fontSize: 10,
            color: 'var(--ink40)',
            padding: '10px 8px 6px',
            textTransform: 'uppercase',
            letterSpacing: '.1em',
          }}
        >
          Navegación
        </div>
        {NAV.map((n) => (
          <NavLink
            key={n.id}
            to={n.to}
            end={n.to === '/'}
            style={({ isActive }) => ({
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              width: '100%',
              padding: '8px 10px',
              borderRadius: 8,
              background: isActive ? 'var(--civic-soft)' : 'transparent',
              color: isActive ? 'var(--civic)' : 'var(--ink80)',
              fontWeight: isActive ? 600 : 500,
              marginBottom: 1,
              textAlign: 'left',
              fontSize: 13.5,
              transition: 'background .15s',
            })}
            onMouseEnter={(e) => {
              if (!e.currentTarget.style.background.includes('var(--civic-soft)')) {
                const active = e.currentTarget.getAttribute('aria-current') === 'page'
                if (!active) e.currentTarget.style.background = 'var(--soft)'
              }
            }}
            onMouseLeave={(e) => {
              const active = e.currentTarget.getAttribute('aria-current') === 'page'
              if (!active) e.currentTarget.style.background = 'transparent'
            }}
          >
            <n.icon width={18} height={18} style={{ flexShrink: 0, opacity: 0.9 }} />
            <span style={{ flex: 1 }}>{n.label}</span>
            {n.liveBadge && (
              <span
                className="mono"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  fontSize: 9,
                  color: 'var(--crit)',
                  fontWeight: 700,
                  letterSpacing: '.08em',
                }}
              >
                <span
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    background: 'var(--crit)',
                    animation: 'ribaPulse 1.5s infinite',
                  }}
                />
                LIVE
              </span>
            )}
            {n.badge && !n.liveBadge && (
              <span className="mono" style={{ fontSize: 10, color: 'var(--ink50)' }}>
                {n.badge}
              </span>
            )}
          </NavLink>
        ))}

      </nav>

      <div
        style={{
          padding: '12px 14px',
          borderTop: '1px solid var(--border2)',
        }}
      >
        <div className="mono" style={{ fontSize: 10, color: 'var(--ink50)', letterSpacing: '.08em' }}>
          MVP público · datos abiertos
        </div>
        <div style={{ fontSize: 11, color: 'var(--ink60)', marginTop: 3 }}>
          <a
            href="/aviso-legal"
            style={{ color: 'var(--civic)', textDecoration: 'none' }}
          >
            Aviso legal
          </a>{' '}
          ·{' '}
          <a
            href="/metodologia"
            style={{ color: 'var(--civic)', textDecoration: 'none' }}
          >
            Metodología
          </a>
        </div>
      </div>
    </aside>
  )
}
