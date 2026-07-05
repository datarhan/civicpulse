// @ts-check
import { useMetroNetwork } from '../../../hooks/useMetroNetwork'

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
          color: 'rgba(11,15,25,.55)',
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
              color: '#FFFFFF',
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
