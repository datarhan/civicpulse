import { Ic } from './Icons'

function TwkSelect({ label, value, onChange, opts }) {
  return (
    <div>
      <div
        className="mono"
        style={{
          fontSize: 10.5,
          color: 'var(--ink50)',
          textTransform: 'uppercase',
          letterSpacing: '.06em',
          marginBottom: 5,
        }}
      >
        {label}
      </div>
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        {opts.map((o) => (
          <button
            key={o.v}
            onClick={() => onChange(o.v)}
            style={{
              padding: '5px 9px',
              borderRadius: 6,
              fontSize: 11.5,
              background: value === o.v ? 'var(--civic)' : 'var(--soft)',
              color: value === o.v ? 'white' : 'var(--ink80)',
              fontWeight: value === o.v ? 600 : 500,
            }}
          >
            {o.l}
          </button>
        ))}
      </div>
    </div>
  )
}

function TwkToggle({ label, value, onChange }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <div style={{ fontSize: 12.5 }}>{label}</div>
      <button
        onClick={() => onChange(!value)}
        style={{
          width: 34,
          height: 20,
          borderRadius: 20,
          padding: 2,
          background: value ? 'var(--civic)' : 'var(--border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: value ? 'flex-end' : 'flex-start',
          transition: 'background .15s',
        }}
      >
        <span
          style={{
            width: 16,
            height: 16,
            borderRadius: '50%',
            background: 'white',
            boxShadow: '0 1px 2px rgba(0,0,0,.2)',
          }}
        />
      </button>
    </div>
  )
}

export function TweaksPanel({ open, onClose, state, onChange }) {
  if (!open) return null
  return (
    <div
      style={{
        position: 'fixed',
        bottom: 20,
        right: 20,
        width: 268,
        zIndex: 40,
        background: 'var(--paper)',
        border: '1px solid var(--border)',
        borderRadius: 12,
        boxShadow: '0 16px 40px rgba(0,0,0,.15)',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          padding: '10px 14px',
          borderBottom: '1px solid var(--border2)',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <Ic.settings width={14} height={14} style={{ color: 'var(--ink50)' }} />
        <div style={{ fontSize: 12.5, fontWeight: 600, flex: 1 }}>Ajustes</div>
        <button
          onClick={onClose}
          className="mono"
          style={{ fontSize: 10, color: 'var(--ink40)' }}
        >
          cerrar
        </button>
      </div>
      <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 14, fontSize: 12.5 }}>
        <TwkSelect
          label="Densidad"
          value={state.density}
          onChange={(v) => onChange({ density: v })}
          opts={[
            { v: 'compact', l: 'Compacta' },
            { v: 'comfortable', l: 'Cómoda' },
            { v: 'spacious', l: 'Espaciosa' },
          ]}
        />
        <TwkToggle
          label="Modo oscuro"
          value={state.dark}
          onChange={(v) => onChange({ dark: v })}
        />
      </div>
    </div>
  )
}

export function TweaksButton({ onOpen }) {
  return (
    <button
      onClick={onOpen}
      aria-label="Ajustes"
      style={{
        position: 'fixed',
        bottom: 20,
        right: 20,
        width: 40,
        height: 40,
        borderRadius: 999,
        background: 'var(--paper)',
        border: '1px solid var(--border)',
        boxShadow: '0 4px 12px rgba(11,15,25,.08)',
        display: 'grid',
        placeItems: 'center',
        color: 'var(--ink60)',
        zIndex: 30,
      }}
    >
      <Ic.settings width={18} height={18} />
    </button>
  )
}
