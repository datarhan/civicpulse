import { Ic } from './Icons'
import { useT } from '../i18n'

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
          borderRadius: 'var(--r-input)',
          placeItems: 'center',
          color: 'var(--ink70)',
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
            fontSize: 'var(--fs-micro)',
            color: 'var(--ink50)',
            textTransform: 'uppercase',
            letterSpacing: '.08em',
            whiteSpace: 'nowrap',
          }}
        >
          Riba-roja de Túria
        </span>
        <span className="cp-topbar-muni" style={{ color: 'var(--ink50)' }}>
          /
        </span>
        <span
          className="cp-topbar-crumb"
          style={{
            fontSize: 'var(--fs-aux)',
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
          borderRadius: 'var(--r-input)',
          background: 'var(--soft)',
          color: 'var(--ink50)',
          fontSize: 'var(--fs-meta)',
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
            fontSize: 'var(--fs-micro)',
            padding: '2px 5px',
            background: 'var(--paper)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--r-input)',
          }}
        >
          ⌘K
        </span>
      </button>
    </header>
  )
}
