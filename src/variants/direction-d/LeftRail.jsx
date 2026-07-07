import { NavLink } from 'react-router-dom'
import { SectionGlyph } from '../../components/SectionGlyph'
import { NAV, NAV_SECONDARY } from '../../nav'
import { PALETTE, SANS } from './tokens'

// The icon-only rail renders from the SHARED nav lists (src/nav.js) — the same
// source the labelled Sidebar uses — so the two menus can never drift. The
// glyph comes from SECTION_GLYPHS keyed by `to`; hover title prefers `railLabel`
// (landing branding, e.g. `/` = "Mirador") then falls back to `label`.

function RailLink({ item }) {
  return (
    <NavLink
      to={item.to}
      end={item.to === '/'}
      title={item.railLabel ?? item.label}
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
          <SectionGlyph to={item.to} size={18} />
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
  )
}

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
      {NAV.map((item) => (
        <RailLink key={item.to} item={item} />
      ))}
      <div
        aria-hidden="true"
        style={{ width: 22, height: 1, background: PALETTE.hair, margin: '6px 0' }}
      />
      {NAV_SECONDARY.map((item) => (
        <RailLink key={item.to} item={item} />
      ))}
    </aside>
  )
}
export { LeftRail }
