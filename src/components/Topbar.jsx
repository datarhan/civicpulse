import { Ic } from './Icons'
import { CITIES } from '../data/mockData'

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

export function Topbar({ cityId, crumb, onOpenCmdK }) {
  const city = CITIES.find((c) => c.id === cityId) || CITIES[0]
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
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
        <span
          className="mono"
          style={{
            fontSize: 11,
            color: 'var(--ink50)',
            textTransform: 'uppercase',
            letterSpacing: '.08em',
            whiteSpace: 'nowrap',
          }}
        >
          {city.name}
        </span>
        <span style={{ color: 'var(--ink40)' }}>/</span>
        <span style={{ fontSize: 13.5, fontWeight: 500 }}>{crumb}</span>
      </div>

      <button
        onClick={onOpenCmdK}
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
        <span style={{ flex: 1, textAlign: 'left' }}>Buscar quejas, cargos, plenos…</span>
        <span
          className="mono"
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

      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <IconBtn icon={Ic.bell} badge={3} />
        <IconBtn icon={Ic.plus} />
      </div>
    </header>
  )
}
