import { NavLink } from 'react-router-dom'
import { Ic } from './Icons'
import { SectionGlyph } from './SectionGlyph'
import { useWikidata } from '../hooks/useWikidata'
import { useT } from '../i18n'

// Landing (/) always renders Direction D — the map kiosk with real data.
// Table-view pages below stay inside the Sidebar+Topbar shell.
// `labelKey` is an i18n key; `label` is the fallback display string used by
// breadcrumb matching when the key is not loaded (e.g. during SSR/hydration).
export const NAV = [
  { to: '/', id: 'inicio', labelKey: 'nav.inicio', label: 'Panel', icon: Ic.home, shortcut: 'G H' },
  {
    to: '/cambios',
    id: 'cambios',
    labelKey: 'nav.cambios',
    label: 'Novedades',
    icon: Ic.chart,
    shortcut: 'G N',
  },
  {
    to: '/cargos',
    id: 'cargos',
    labelKey: 'nav.cargos',
    label: 'Cargos',
    icon: Ic.people,
    shortcut: 'G C',
  },
  {
    to: '/presupuesto',
    id: 'presup',
    labelKey: 'nav.presup',
    label: 'Presupuesto',
    icon: Ic.coin,
    shortcut: 'G P',
  },
  {
    to: '/plenos',
    id: 'plenos',
    labelKey: 'nav.plenos',
    label: 'Plenos',
    icon: Ic.scale,
    shortcut: 'G L',
  },
  {
    to: '/promesas',
    id: 'promesas',
    labelKey: 'nav.promesas',
    label: 'Promesas',
    icon: Ic.scale,
    shortcut: 'G R',
  },
  {
    to: '/departamentos',
    id: 'depts',
    labelKey: 'nav.departamentos',
    label: 'Departamentos',
    icon: Ic.building,
    shortcut: 'G E',
  },
  {
    to: '/hallazgos',
    id: 'findings',
    labelKey: 'nav.hallazgos',
    label: 'Hallazgos',
    icon: Ic.warn,
    shortcut: 'G F',
  },
  {
    to: '/declaraciones',
    id: 'declaraciones',
    labelKey: 'nav.declaraciones',
    label: 'Declaraciones',
    icon: Ic.list ?? Ic.warn,
    shortcut: 'G L',
  },
  {
    to: '/datos',
    id: 'datos',
    labelKey: 'nav.datos',
    label: 'Datos',
    icon: Ic.chart,
    shortcut: 'G D',
  },
  {
    to: '/quejas',
    id: 'quejas',
    labelKey: 'nav.quejas',
    label: 'Quejas',
    icon: Ic.warn,
    shortcut: 'G Q',
  },
  {
    to: '/laboratorio',
    id: 'laboratorio',
    labelKey: 'nav.laboratorio',
    label: 'Laboratorio',
    icon: Ic.lab,
    shortcut: 'G B',
  },
  // "Periodistas" (the AI journalist agent) is the highest legal-sensitivity
  // surface — it drafts biographies of named living officials. It is hidden
  // from the public production build for the MVP launch and stays available in
  // dev. Re-enable in production via VITE_ENABLE_PERIODISTAS=true. Keep this
  // gate in sync with PERIODISTAS_ENABLED in src/App.jsx.
  ...(import.meta.env.MODE !== 'production' || import.meta.env.VITE_ENABLE_PERIODISTAS === 'true'
    ? [
        {
          to: '/laboratorio/agentes',
          id: 'agentes',
          labelKey: 'nav.agentes',
          label: 'Periodistas',
          icon: Ic.lab,
          shortcut: 'G A',
        },
      ]
    : []),
  // /curator is dev-only — surfaces in the sidebar only when running
  // `npm run dev` on a curator's laptop. Production builds tree-shake
  // this entry out via the import.meta.env.MODE check below.
  ...(import.meta.env.MODE !== 'production'
    ? [
        {
          to: '/curator',
          id: 'curator',
          labelKey: 'nav.curator',
          label: 'Curator (dev)',
          icon: Ic.settings ?? Ic.warn,
          shortcut: 'G C',
        },
      ]
    : []),
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

export function Sidebar({ open = false, onClose }) {
  const t = useT()
  return (
    <aside
      className={`cp-shell-sidebar${open ? ' cp-sidebar-open' : ''}`}
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
      onClick={(e) => {
        // Close drawer when a nav link inside the sidebar is clicked (mobile)
        if (onClose && e.target.closest('a')) onClose()
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
        {/* Canonical pulse monogram (Brandbook v2 §01). Traces itself once on
            shell mount — the only moment the logo animates (Motion.dc.html). */}
        <svg
          width="24"
          height="24"
          viewBox="0 0 64 64"
          fill="none"
          className="cp-pulse-draw"
          style={{ '--cp-dash': 80 }}
          aria-hidden="true"
        >
          <rect width="64" height="64" rx="14" fill="var(--civic)" />
          <path
            d="M10 34 L20 34 L24 26 L32 44 L38 30 L42 34 L54 34"
            stroke="white"
            strokeWidth="3.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
          <circle cx="54" cy="34" r="2.6" fill="white" />
        </svg>
        <div style={{ fontWeight: 700, letterSpacing: '-.01em', fontSize: 15 }}>
          Civic<span style={{ color: 'var(--civic)' }}>Pulse</span>
        </div>
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
          {t('nav.section')}
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
            <SectionGlyph to={n.to} size={18} style={{ opacity: 0.9 }} />
            <span style={{ flex: 1 }}>{t(n.labelKey)}</span>
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
        <div
          className="mono"
          style={{ fontSize: 10, color: 'var(--ink50)', letterSpacing: '.08em' }}
        >
          {t('sidebar.footer.tag')}
        </div>
        <div style={{ fontSize: 11, color: 'var(--ink60)', marginTop: 3 }}>
          <a href="/aviso-legal" style={{ color: 'var(--civic)', textDecoration: 'none' }}>
            {t('sidebar.footer.legal')}
          </a>{' '}
          ·{' '}
          <a href="/metodologia" style={{ color: 'var(--civic)', textDecoration: 'none' }}>
            {t('sidebar.footer.method')}
          </a>
        </div>
      </div>
    </aside>
  )
}
