// @ts-check
import { useMetroNetwork } from '../../../hooks/useMetroNetwork'
import { readableInk } from '../../../lib/contrast'

export function NetworkLegend() {
  const { data } = useMetroNetwork()
  if (!data?.lines) return null
  return (
    <div
      style={{
        position: 'absolute',
        bottom: 28,
        right: 12,
        background: 'rgba(255,255,255,.92)',
        border: '1px solid #DCD7C8',
        borderRadius: 7,
        padding: '5px 8px',
        fontFamily: "'Outfit', system-ui, sans-serif",
        zIndex: 400,
        boxShadow: '0 4px 14px rgba(11,15,25,.08)',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        whiteSpace: 'nowrap',
      }}
    >
      <span
        style={{
          fontFamily: "'DM Mono', monospace",
          fontSize: 8.5,
          color: 'rgba(11,15,25,.62)',
          letterSpacing: '.1em',
          textTransform: 'uppercase',
          flexShrink: 0,
        }}
      >
        Metrovalencia
      </span>
      <div style={{ display: 'inline-flex', gap: 3 }}>
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
              fontSize: 8.5,
              fontWeight: 800,
              padding: '1px 4px',
              borderRadius: 3,
              lineHeight: 1.3,
            }}
          >
            {l.ref}
          </span>
        ))}
      </div>
    </div>
  )
}
