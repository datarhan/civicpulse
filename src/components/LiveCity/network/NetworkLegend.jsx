// @ts-check
import { useMetroNetwork } from '../../../hooks/useMetroNetwork'
import { readableInk } from '../../../lib/contrast'

/**
 * La clave de colores de las líneas de Metrovalencia, como una tarjeta más de la
 * pila de controles (StylizedMap.jsx), junto a las leyendas de las capas.
 *
 * Hasta el 18-10-2026 flotaba sola, abajo a la derecha, a z-400 y con 397 px fijos:
 * a la altura de la pila y del mismo z, la pila le ganaba el empate. Medido con
 * `elementFromPoint`: tapada un 97 % a 320 y 375 px (y empezando fuera del mapa, más
 * ancha que él), del 30 al 100 % entre 600 y 1280, y limpia sólo desde 1440. Dentro
 * de la pila no puede chocar con nada de ella, y las líneas saltan de renglón.
 * Cuándo se enseña (plegada, en un móvil) lo dicen las reglas de DirectionD.jsx,
 * y por eso su `display` vive allí y no aquí.
 */
export function NetworkLegend() {
  const { data } = useMetroNetwork()
  if (!data?.lines) return null
  return (
    <div
      className="cp-leyenda-red"
      style={{
        alignSelf: 'flex-start',
        maxWidth: '100%',
        boxSizing: 'border-box',
        background: 'rgba(255,255,255,.94)',
        border: '1px solid #DCD7C8',
        borderRadius: 'var(--r-input)',
        padding: '5px 8px',
        fontFamily: "'Outfit', system-ui, sans-serif",
        boxShadow: '0 4px 14px rgba(11,15,25,.08)',
        flexWrap: 'wrap',
        alignItems: 'center',
        columnGap: 8,
        rowGap: 4,
      }}
    >
      <span
        style={{
          fontFamily: "'DM Mono', monospace",
          fontSize: 'var(--fs-micro)',
          color: 'rgba(11,15,25,.62)',
          letterSpacing: '.1em',
          textTransform: 'uppercase',
          flexShrink: 0,
        }}
      >
        Metrovalencia
      </span>
      <div style={{ display: 'inline-flex', flexWrap: 'wrap', gap: 3 }}>
        {data.lines.map((l) => (
          <span
            key={l.ref}
            title={l.name}
            style={{
              background: l.color,
              // Brand fill stays exact (L1 IS that yellow); the INK flips per
              // colour. White measured 1.54:1 on L10, 1.79 on L1, 1.87 on L8.
              color: readableInk(l.color),
              fontFamily: "'DM Mono', monospace",
              fontSize: 'var(--fs-aux)',
              fontWeight: 800,
              padding: '1px 4px',
              borderRadius: 'var(--r-input)',
              lineHeight: 1.3,
              whiteSpace: 'nowrap',
            }}
          >
            {l.ref}
          </span>
        ))}
      </div>
    </div>
  )
}
