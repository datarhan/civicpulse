import { NavLink } from 'react-router-dom'
import { SectionGlyph } from '../../components/SectionGlyph'
import { NAV, NAV_SECONDARY } from '../../nav'
import { PALETTE, SANS } from './tokens'
import { useT } from '../../i18n'

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
  const t = useT()
  return (
    // <nav>, not <aside>: this IS the landing's navigation — the only one,
    // since the route bypasses the Sidebar. As a second unlabelled <aside>
    // beside the editorial column it also tripped axe's `landmark-unique`.
    // Geometry lives in `.d-rail` (DirectionD's style block) because it flips
    // from a vertical rail to a horizontal scroller below the breakpoint, and
    // an inline style would outrank the media query.
    <nav className="d-rail" aria-label={t('a11y.railLabel')} style={{ fontFamily: SANS }}>
      {NAV.map((item) => (
        <RailLink key={item.to} item={item} />
      ))}
      <div
        aria-hidden="true"
        className="d-rail-sep"
        style={{ background: PALETTE.hair, flexShrink: 0 }}
      />
      {NAV_SECONDARY.map((item) => (
        <RailLink key={item.to} item={item} />
      ))}
    </nav>
  )
}
export { LeftRail }
