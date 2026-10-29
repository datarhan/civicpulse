import { NavLink } from 'react-router-dom'
import { SectionGlyph } from './SectionGlyph'
import { useWikidata } from '../hooks/useWikidata'
import { useT } from '../i18n'
import { NAV, NAV_SECONDARY, NAV_GROUPS, GRUPO_PROYECTO, entradasDeGrupo } from '../nav'

export { NAV }

/**
 * La barra lateral, en los mismos grupos que la barra de secciones de la
 * portada (auditoría de las dos lecturas, fase 5, punto 3). Era una lista
 * plana de una veintena de entradas bajo «Navegación», y quien pasaba de la
 * portada a una página interior perdía los cinco nombres que la hacían
 * navegable.
 *
 * Los grupos y su orden son los de `NAV_GROUPS`, y dentro de cada uno el orden
 * de NAV: nada de aquí es una lista escrita a mano que pueda discrepar de la
 * portada. La portada va primero, sola; luego los cinco grupos y «Sobre
 * CivicPulse». Una entrada sin grupo conocido no se pierde: va al final, bajo
 * el rótulo de siempre (tests/nav-grupos.test.js ya exige que no haya ninguna).
 *
 * @param {typeof NAV} entradas
 */
export function gruposDeLaBarra(entradas = NAV) {
  const portada = entradas.filter((n) => n.to === '/')
  const grupos = [...NAV_GROUPS, GRUPO_PROYECTO]
    .map((g) => ({ ...g, entradas: entradasDeGrupo(g.id, entradas) }))
    .filter((g) => g.entradas.length > 0)
  const vistas = new Set([...portada, ...grupos.flatMap((g) => g.entradas)])
  const sueltas = entradas.filter((n) => !vistas.has(n))
  return { portada, grupos, sueltas }
}

/** Un enlace de la barra: glifo, nombre y, si la entrada lo lleva, su marca. */
function EnlaceBarra({ n, t }) {
  return (
    <NavLink
      to={n.to}
      end={n.to === '/'}
      style={({ isActive }) => ({
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        width: '100%',
        padding: '8px 10px',
        borderRadius: 'var(--r-input)',
        background: isActive ? 'var(--civic-soft)' : 'transparent',
        color: isActive ? 'var(--civic)' : 'var(--ink70)',
        fontWeight: isActive ? 600 : 500,
        marginBottom: 1,
        textAlign: 'left',
        fontSize: 'var(--fs-aux)',
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
            fontSize: 'var(--fs-micro)',
            color: 'var(--crit-ink)',
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
        <span className="mono" style={{ fontSize: 'var(--fs-micro)', color: 'var(--ink50)' }}>
          {n.badge}
        </span>
      )}
    </NavLink>
  )
}

/** El rótulo de un grupo: el mismo nombre que en la barra de la portada. */
function RotuloGrupo({ id, children }) {
  return (
    <div
      id={id}
      className="mono"
      style={{
        fontSize: 'var(--fs-micro)',
        color: 'var(--ink50)',
        padding: '12px 8px 4px',
        textTransform: 'uppercase',
        letterSpacing: '.1em',
      }}
    >
      {children}
    </div>
  )
}

function CityChip() {
  const { data } = useWikidata()
  const pop = data?.facts?.population?.value
  return (
    <div
      style={{
        margin: '10px 12px 4px',
        padding: '9px 10px',
        background: 'var(--soft)',
        borderRadius: 'var(--r-input)',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
      }}
    >
      <div
        style={{
          width: 22,
          height: 22,
          borderRadius: 'var(--r-input)',
          background: '#E8DDD2',
          display: 'grid',
          placeItems: 'center',
          fontSize: 'var(--fs-micro)',
          fontWeight: 700,
          color: '#6B4C2A',
        }}
      >
        RR
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 'var(--fs-meta)', fontWeight: 600 }}>Riba-roja de Túria</div>
        <div className="mono" style={{ fontSize: 'var(--fs-micro)', color: 'var(--ink50)' }}>
          Camp de Túria · {pop ? pop.toLocaleString('es-ES') : '—'}
        </div>
      </div>
    </div>
  )
}

export function Sidebar({ open = false, onClose }) {
  const t = useT()
  const { portada, grupos, sueltas } = gruposDeLaBarra()
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
        <div style={{ fontWeight: 700, letterSpacing: '-.01em', fontSize: 'var(--fs-body)' }}>
          Civic<span style={{ color: 'var(--civic)' }}>Pulse</span>
        </div>
      </div>

      <CityChip />

      <nav style={{ padding: '10px 10px', flex: 1, overflowY: 'auto' }}>
        {portada.map((n) => (
          <EnlaceBarra key={n.id} n={n} t={t} />
        ))}
        {grupos.map((g) => (
          <div
            key={g.id}
            role="group"
            aria-labelledby={`barra-grupo-${g.id}`}
            data-grupo-barra={g.id}
          >
            <RotuloGrupo id={`barra-grupo-${g.id}`}>{t(g.labelKey)}</RotuloGrupo>
            {g.entradas.map((n) => (
              <EnlaceBarra key={n.id ?? n.to} n={n} t={t} />
            ))}
          </div>
        ))}
        {sueltas.length > 0 && (
          <div role="group" aria-labelledby="barra-grupo-sueltas">
            <RotuloGrupo id="barra-grupo-sueltas">{t('nav.section')}</RotuloGrupo>
            {sueltas.map((n) => (
              <EnlaceBarra key={n.id ?? n.to} n={n} t={t} />
            ))}
          </div>
        )}
      </nav>

      <div
        style={{
          padding: '12px 14px',
          borderTop: '1px solid var(--border2)',
        }}
      >
        <div
          className="mono"
          style={{ fontSize: 'var(--fs-micro)', color: 'var(--ink50)', letterSpacing: '.08em' }}
        >
          {t('sidebar.footer.tag')}
        </div>
        <div style={{ fontSize: 'var(--fs-micro)', color: 'var(--ink50)', marginTop: 3 }}>
          {NAV_SECONDARY.map((n, i) => (
            <span key={n.to}>
              {i > 0 && ' · '}
              <a href={n.to} style={{ color: 'var(--civic)', textDecoration: 'none' }}>
                {t(n.labelKey)}
              </a>
            </span>
          ))}
        </div>
      </div>
    </aside>
  )
}
