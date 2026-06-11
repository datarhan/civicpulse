export function Sparkline({ data, color = 'var(--civic)', h = 36, fill = true }) {
  // Guard: Math.max(...[]) is -Infinity and a single point can't form a line —
  // either would emit NaN coordinates into the SVG path.
  if (!Array.isArray(data) || data.length < 2) return null
  const max = Math.max(...data)
  const min = Math.min(...data)
  const W = 100
  const H = 100
  const pts = data.map((v, i) => [
    (i / (data.length - 1)) * W,
    H - ((v - min) / (max - min || 1)) * (H - 8) - 4,
  ])
  const path = pts
    .map((p, i) => (i === 0 ? 'M' : 'L') + p[0].toFixed(1) + ',' + p[1].toFixed(1))
    .join(' ')
  const area = path + ` L ${W},${H} L 0,${H} Z`
  return (
    <svg
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      style={{ width: '100%', height: h, display: 'block' }}
    >
      {fill && <path d={area} fill={color} fillOpacity=".10" />}
      <path
        d={path}
        stroke={color}
        strokeWidth="1.5"
        fill="none"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  )
}
