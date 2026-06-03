import { NavLink } from 'react-router-dom'
import { Ic } from '../../components/Icons'
import { PALETTE, SANS } from './tokens'

const RAIL_ITEMS = [
  { to: '/', label: 'Mirador', icon: Ic.home },
  { to: '/cambios', label: 'Novedades', icon: Ic.bell },
  { to: '/cargos', label: 'Cargos', icon: Ic.people },
  { to: '/presupuesto', label: 'Presupuesto', icon: Ic.coin },
  { to: '/plenos', label: 'Plenos', icon: Ic.scale },
  { to: '/promesas', label: 'Promesas', icon: Ic.scale },
  { to: '/departamentos', label: 'Departamentos', icon: Ic.building },
  { to: '/hallazgos', label: 'Hallazgos', icon: Ic.warn },
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
export { LeftRail }
