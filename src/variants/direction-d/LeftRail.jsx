import { NavLink } from 'react-router-dom'
import { SectionGlyph } from '../../components/SectionGlyph'
import { PALETTE, SANS } from './tokens'

// One glyph per section — Detalles Gráficos v2 §03. The glyph itself comes from
// SECTION_GLYPHS keyed by `to`; this list only owns order + hover label.
const RAIL_ITEMS = [
  { to: '/', label: 'Mirador' },
  { to: '/cambios', label: 'Novedades' },
  { to: '/cargos', label: 'Cargos' },
  { to: '/presupuesto', label: 'Presupuesto' },
  { to: '/plenos', label: 'Plenos' },
  { to: '/promesas', label: 'Promesas' },
  { to: '/departamentos', label: 'Departamentos' },
  { to: '/hallazgos', label: 'Hallazgos' },
  { to: '/declaraciones', label: 'Declaraciones' },
  { to: '/datos', label: 'Datos' },
  { to: '/quejas', label: 'Quejas' },
  { to: '/empleo', label: 'Empleo' },
  { to: '/laboratorio', label: 'Laboratorio' },
  { to: '/metodologia', label: 'Metodología' },
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
              <SectionGlyph to={n.to} size={18} />
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
export { LeftRail }
