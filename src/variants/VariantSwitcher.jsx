import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'

const VARIANTS = [
  { id: 'a', to: '/',         code: 'A', label: 'Dashboard' },
  { id: 'b', to: '/hud',      code: 'B', label: 'City HUD' },
  { id: 'c', to: '/briefing', code: 'C', label: 'Briefing' },
  { id: 'd', to: '/d',        code: 'D', label: 'El Mirador' },
]

function currentVariant(pathname) {
  if (pathname.startsWith('/hud')) return 'b'
  if (pathname.startsWith('/briefing')) return 'c'
  if (pathname.startsWith('/d')) return 'd'
  if (pathname === '/variants') return 'chooser'
  return 'a'
}

export function VariantSwitcher({ position = 'top-right', theme = 'light' }) {
  const location = useLocation()
  const current = currentVariant(location.pathname)
  const [open, setOpen] = useState(false)

  const dark = theme === 'dark'

  const chipBg = dark ? 'rgba(14,20,34,.82)' : 'rgba(255,255,255,.94)'
  const chipBorder = dark ? 'rgba(96,165,250,.25)' : 'rgba(11,15,25,.10)'
  const chipText = dark ? 'white' : '#0B0F19'
  const mutedText = dark ? 'rgba(255,255,255,.55)' : 'rgba(11,15,25,.55)'

  const wrapStyle = {
    position: 'fixed',
    zIndex: 45,
    ...(position === 'bottom-right-b'
      ? { bottom: 78, right: 20 }
      : position === 'top-right-b'
      ? { top: 62, right: 14 }
      : position === 'bottom-right-d'
      ? { bottom: 96, right: 440 }
      : { top: 14, right: 14 }),
  }

  const menuDirection =
    position === 'bottom-right-b' || position === 'bottom-right-d' ? 'up' : 'down'

  return (
    <div style={wrapStyle}>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '7px 12px',
          borderRadius: 20,
          background: chipBg,
          backdropFilter: 'blur(14px)',
          WebkitBackdropFilter: 'blur(14px)',
          border: `1px solid ${chipBorder}`,
          color: chipText,
          fontSize: 12,
          fontWeight: 600,
          fontFamily: "'Outfit', system-ui, sans-serif",
          boxShadow: dark ? '0 6px 20px rgba(0,0,0,.4)' : '0 6px 20px rgba(11,15,25,.10)',
          cursor: 'pointer',
        }}
      >
        <span
          className="mono"
          style={{
            width: 18,
            height: 18,
            borderRadius: 4,
            background: '#2463EB',
            color: 'white',
            display: 'grid',
            placeItems: 'center',
            fontSize: 10,
            fontWeight: 700,
          }}
        >
          {current === 'chooser' ? '?' : current.toUpperCase()}
        </span>
        <span>{current === 'chooser' ? 'Elegir dirección' : 'Dirección ' + current.toUpperCase()}</span>
        <span style={{ color: mutedText, fontSize: 10 }}>▾</span>
      </button>

      {open && (
        <>
          <div
            onClick={() => setOpen(false)}
            style={{ position: 'fixed', inset: 0, zIndex: -1 }}
          />
          <div
            style={{
              position: 'absolute',
              ...(menuDirection === 'up'
                ? { bottom: 'calc(100% + 6px)' }
                : { top: 'calc(100% + 6px)' }),
              right: 0,
              width: 240,
              background: dark ? 'rgba(14,20,34,.96)' : 'white',
              border: `1px solid ${chipBorder}`,
              borderRadius: 10,
              boxShadow: '0 12px 32px rgba(11,15,25,.18)',
              padding: 6,
              color: chipText,
            }}
          >
            <div
              className="mono"
              style={{
                padding: '8px 10px 4px',
                fontSize: 10,
                color: mutedText,
                textTransform: 'uppercase',
                letterSpacing: '.08em',
              }}
            >
              Variantes
            </div>
            {VARIANTS.map((v) => {
              const active = v.id === current
              return (
                <Link
                  key={v.id}
                  to={v.to}
                  onClick={() => setOpen(false)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '9px 10px',
                    borderRadius: 7,
                    textDecoration: 'none',
                    color: 'inherit',
                    background: active
                      ? (dark ? 'rgba(91,141,239,.25)' : 'var(--civic-soft)')
                      : 'transparent',
                  }}
                  onMouseEnter={(e) => {
                    if (!active)
                      e.currentTarget.style.background = dark ? 'rgba(255,255,255,.05)' : 'var(--soft)'
                  }}
                  onMouseLeave={(e) => {
                    if (!active) e.currentTarget.style.background = 'transparent'
                  }}
                >
                  <span
                    className="mono"
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: 5,
                      background: active ? '#2463EB' : (dark ? 'rgba(255,255,255,.08)' : 'var(--soft)'),
                      color: active ? 'white' : 'inherit',
                      display: 'grid',
                      placeItems: 'center',
                      fontSize: 11,
                      fontWeight: 700,
                      flexShrink: 0,
                    }}
                  >
                    {v.code}
                  </span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: active ? 600 : 500 }}>{v.label}</div>
                  </div>
                  {active && (
                    <span
                      className="mono"
                      style={{ fontSize: 9, color: mutedText, letterSpacing: '.08em' }}
                    >
                      ACTIVA
                    </span>
                  )}
                </Link>
              )
            })}
            <div style={{ borderTop: `1px solid ${chipBorder}`, margin: '6px 0 4px' }} />
            <Link
              to="/variants"
              onClick={() => setOpen(false)}
              style={{
                display: 'block',
                padding: '9px 10px',
                borderRadius: 7,
                textDecoration: 'none',
                color: 'var(--civic)',
                fontSize: 12.5,
                fontWeight: 500,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = dark ? 'rgba(255,255,255,.05)' : 'var(--soft)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent'
              }}
            >
              Comparar las tres →
            </Link>
          </div>
        </>
      )}
    </div>
  )
}
