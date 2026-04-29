import { Ic } from './Icons'
import { useT } from '../i18n'

function IconBtn({ icon: I, badge }) {
  return (
    <button
      style={{
        width: 32,
        height: 32,
        borderRadius: 7,
        display: 'grid',
        placeItems: 'center',
        color: 'var(--ink60)',
        position: 'relative',
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--soft)')}
      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
    >
      <I width={16} height={16} />
      {badge && (
        <span
          className="mono"
          style={{
            position: 'absolute',
            top: 4,
            right: 4,
            background: 'var(--crit)',
            color: 'white',
            fontSize: 9,
            minWidth: 14,
            height: 14,
            borderRadius: 7,
            padding: '0 4px',
            display: 'grid',
            placeItems: 'center',
            fontWeight: 700,
            lineHeight: 1,
          }}
        >
          {badge}
        </span>
      )}
    </button>
  )
}

export function Topbar({ crumb, onOpenCmdK, onOpenSidebar }) {
  const t = useT()
  return (
    <header
      className="cp-shell-topbar"
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 4,
        background: 'var(--paper)',
        borderBottom: '1px solid var(--border2)',
        padding: '10px 24px',
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        height: 52,
      }}
    >
      <button
        type="button"
        onClick={onOpenSidebar}
        aria-label={t('topbar.menu.aria')}
        className="cp-hamburger"
        style={{
          width: 36,
          height: 36,
          borderRadius: 8,
          placeItems: 'center',
          color: 'var(--ink80)',
          background: 'var(--soft)',
          flexShrink: 0,
        }}
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        >
          <line x1="4" y1="7" x2="20" y2="7" />
          <line x1="4" y1="12" x2="20" y2="12" />
          <line x1="4" y1="17" x2="20" y2="17" />
        </svg>
      </button>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
        <span
          className="mono cp-topbar-muni"
          style={{
            fontSize: 11,
            color: 'var(--ink50)',
            textTransform: 'uppercase',
            letterSpacing: '.08em',
            whiteSpace: 'nowrap',
          }}
        >
          Riba-roja de Túria
        </span>
        <span className="cp-topbar-muni" style={{ color: 'var(--ink40)' }}>
          /
        </span>
        <span
          className="cp-topbar-crumb"
          style={{
            fontSize: 13.5,
            fontWeight: 500,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {crumb}
        </span>
      </div>

      <button
        onClick={onOpenCmdK}
        className="cp-topbar-search"
        aria-label={t('topbar.search.aria')}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '6px 10px',
          borderRadius: 7,
          background: 'var(--soft)',
          color: 'var(--ink50)',
          fontSize: 12.5,
          minWidth: 280,
        }}
      >
        <Ic.search width={14} height={14} />
        <span className="cp-topbar-search-hint" style={{ flex: 1, textAlign: 'left' }}>
          {t('topbar.search')}
        </span>
        <span
          className="mono cp-topbar-search-kbd"
          style={{
            fontSize: 10,
            padding: '2px 5px',
            background: 'var(--paper)',
            border: '1px solid var(--border)',
            borderRadius: 4,
          }}
        >
          ⌘K
        </span>
      </button>
    </header>
  )
}
