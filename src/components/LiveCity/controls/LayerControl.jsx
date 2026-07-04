// @ts-check

/**
 * Ordered list of toggleable map layers. Add an entry here (and a matching
 * default in the StylizedMap `layers` state) as each layer ships — a chip only
 * appears once its layer actually renders, so the control never lies about what
 * a toggle does. `glyph` is a decorative Unicode marker (aria-hidden).
 */
export const MAP_LAYERS = [
  { key: 'money', label: 'Gasto municipal', glyph: '€' },
  { key: 'poi', label: 'Servicios', glyph: '◉' },
  { key: 'metro', label: 'Tren L9', glyph: '◆' },
  { key: 'flood', label: 'Riesgo inundación', glyph: '≈' },
]

const cardStyle = {
  background: 'rgba(255,255,255,.94)',
  border: '1px solid #DCD7C8',
  borderRadius: 9,
  padding: '7px 9px',
  fontFamily: "'Outfit', system-ui, sans-serif",
  boxShadow: '0 4px 16px rgba(11,15,25,.16)',
}

const titleStyle = {
  fontFamily: "'DM Mono', monospace",
  fontSize: 8.5,
  color: 'rgba(11,15,25,.55)',
  letterSpacing: '.12em',
  textTransform: 'uppercase',
  marginBottom: 6,
}

function chipStyle(on) {
  return {
    all: 'unset',
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    gap: 5,
    fontSize: 12,
    fontWeight: 600,
    padding: '4px 9px',
    borderRadius: 999,
    border: `1px solid ${on ? '#2463EB' : '#C9C3B4'}`,
    background: on ? '#2463EB' : 'transparent',
    color: on ? '#FFFFFF' : 'rgba(11,15,25,.7)',
    transition: 'background .12s, color .12s, border-color .12s',
  }
}

export function LayerControl({ layers, onToggle }) {
  return (
    <div style={cardStyle} role="group" aria-label="Capas del mapa">
      <div style={titleStyle}>Capas del mapa</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {MAP_LAYERS.map(({ key, label, glyph }) => {
          const on = !!layers[key]
          return (
            <button
              key={key}
              type="button"
              onClick={() => onToggle(key)}
              aria-pressed={on}
              style={chipStyle(on)}
            >
              <span aria-hidden="true" style={{ fontFamily: "'DM Mono', monospace" }}>
                {glyph}
              </span>
              {label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
