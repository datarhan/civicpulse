import { Fragment } from 'react'

export function Sparkline({ data, color = 'var(--civic)', h = 36, fill = true }) {
  const max = Math.max(...data)
  const min = Math.min(...data)
  const W = 100
  const H = 100
  const pts = data.map((v, i) => [
    (i / (data.length - 1)) * W,
    H - ((v - min) / (max - min || 1)) * (H - 8) - 4,
  ])
  const path = pts.map((p, i) => (i === 0 ? 'M' : 'L') + p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ')
  const area = path + ` L ${W},${H} L 0,${H} Z`
  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ width: '100%', height: h, display: 'block' }}>
      {fill && <path d={area} fill={color} fillOpacity=".10" />}
      <path d={path} stroke={color} strokeWidth="1.5" fill="none" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

export function DualLine({ a, b, cA = 'var(--civic)', cB = 'var(--ok)', h = 120 }) {
  const all = [...a, ...b]
  const max = Math.max(...all)
  const min = Math.min(...all)
  const W = 300
  const path = (data) =>
    data
      .map((v, i) => {
        const x = (i / (data.length - 1)) * W
        const y = h - ((v - min) / (max - min || 1)) * (h - 16) - 8
        return (i === 0 ? 'M' : 'L') + x.toFixed(1) + ',' + y.toFixed(1)
      })
      .join(' ')
  return (
    <svg viewBox={`0 0 ${W} ${h}`} preserveAspectRatio="none" style={{ width: '100%', height: h, display: 'block' }}>
      {[0, 1, 2, 3].map((i) => (
        <line key={i} x1="0" x2={W} y1={((i + 1) * h) / 4} y2={((i + 1) * h) / 4} stroke="var(--border2)" strokeDasharray="2,3" />
      ))}
      <path d={path(a)} stroke={cA} strokeWidth="1.75" fill="none" vectorEffect="non-scaling-stroke" />
      <path d={path(b)} stroke={cB} strokeWidth="1.75" fill="none" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

export function Donut({ segments, size = 140, stroke = 18 }) {
  const r = (size - stroke) / 2
  const C = 2 * Math.PI * r
  let acc = 0
  const total = segments.reduce((s, x) => s + x.pct, 0)
  return (
    <svg viewBox={`0 0 ${size} ${size}`} style={{ width: size, height: size }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--soft)" strokeWidth={stroke} />
      {segments.map((s, i) => {
        const len = (s.pct / total) * C
        const off = acc
        acc += len
        return (
          <circle
            key={i}
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={s.color}
            strokeWidth={stroke}
            strokeDasharray={`${len} ${C}`}
            strokeDashoffset={-off}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        )
      })}
    </svg>
  )
}

export function MiniMap() {
  const pins = [
    [30, 40, 'crit'], [50, 55, 'warn'], [72, 45, 'warn'], [40, 70, 'crit'], [60, 30, 'civic'],
    [80, 65, 'warn'], [25, 60, 'ok'],   [55, 75, 'civic'],[75, 25, 'civic'],[35, 25, 'warn'],
    [65, 60, 'warn'], [45, 50, 'ok'],   [85, 40, 'civic'],
  ]
  const color = (t) =>
    t === 'crit' ? '#DC2626' : t === 'warn' ? '#D97706' : t === 'ok' ? '#16A34A' : '#2463EB'
  return (
    <div
      style={{
        position: 'relative',
        aspectRatio: '16/10',
        borderRadius: 8,
        overflow: 'hidden',
        background: '#EEF2F7',
        border: '1px solid var(--border2)',
      }}
    >
      <svg viewBox="0 0 100 62" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
        <rect x="0" y="0" width="100" height="62" fill="#EEF2F7" />
        <path d="M0 20 L100 22 M0 42 L100 40 M20 0 L18 62 M50 0 L52 62 M78 0 L80 62" stroke="#DDE3EC" strokeWidth=".6" fill="none" />
        <path d="M0 30 Q 30 28 50 32 T 100 30" stroke="#CBD5E1" strokeWidth=".8" fill="none" />
        <path d="M12 0 Q 18 30 30 62" stroke="#E3E9F2" strokeWidth=".5" fill="none" />
        <rect x="40" y="30" width="8" height="6" fill="#DDE3EC" rx="1" />
        <rect x="62" y="38" width="6" height="5" fill="#DDE3EC" rx="1" />
        <rect x="22" y="18" width="5" height="4" fill="#DDE3EC" rx="1" />
        <circle cx="48" cy="48" r="4" fill="#D6E3D4" stroke="#B8CFB4" strokeWidth=".3" />
      </svg>
      {pins.map((p, i) => (
        <div
          key={i}
          style={{
            position: 'absolute',
            left: p[0] + '%',
            top: p[1] + '%',
            width: 12,
            height: 12,
            transform: 'translate(-50%,-50%)',
            background: color(p[2]),
            borderRadius: '50%',
            border: '2px solid white',
            boxShadow: '0 1px 3px rgba(0,0,0,.2)',
          }}
        />
      ))}
      <div
        style={{
          position: 'absolute',
          left: '30%',
          top: '45%',
          width: 120,
          height: 120,
          transform: 'translate(-50%,-50%)',
          background: 'radial-gradient(circle, rgba(220,38,38,.25) 0%, transparent 60%)',
          pointerEvents: 'none',
        }}
      />
    </div>
  )
}

export function Heatmap() {
  const mk = (d, h) => {
    const workday = d < 5 && h >= 8 && h < 20
    const base = workday ? 0.6 : 0.15
    const peak = (h === 10 || h === 18) && d < 5 ? 0.4 : 0
    return Math.min(1, base + peak + (Math.sin(d * 0.7 + h * 0.3) * 0.15 + 0.15))
  }
  const days = ['L', 'M', 'X', 'J', 'V', 'S', 'D']
  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: '18px repeat(24, 1fr)', gap: 2 }}>
        <div />
        {Array.from({ length: 24 }, (_, h) => (
          <div key={h} className="mono" style={{ fontSize: 8, color: 'var(--ink40)', textAlign: 'center' }}>
            {h % 6 === 0 ? h : ''}
          </div>
        ))}
        {days.map((d, di) => (
          <Fragment key={d}>
            <div className="mono" style={{ fontSize: 9.5, color: 'var(--ink50)', display: 'grid', placeItems: 'center' }}>
              {d}
            </div>
            {Array.from({ length: 24 }, (_, h) => {
              const v = mk(di, h)
              return <div key={h} style={{ height: 14, borderRadius: 2, background: `rgba(36,99,235, ${v})` }} />
            })}
          </Fragment>
        ))}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, fontSize: 10.5, color: 'var(--ink50)' }}>
        <span>Menos</span>
        {[0.12, 0.3, 0.5, 0.7, 0.9].map((v, i) => (
          <span key={i} style={{ width: 12, height: 10, borderRadius: 2, background: `rgba(36,99,235,${v})` }} />
        ))}
        <span>Más</span>
      </div>
    </div>
  )
}

export function BudgetBars({ months, plan, actual }) {
  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: 8, alignItems: 'end', height: 180 }}>
        {months.map((m, i) => (
          <div key={m} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
            <div style={{ height: 160, width: '100%', position: 'relative', display: 'flex', alignItems: 'flex-end', gap: 2, justifyContent: 'center' }}>
              <div
                style={{
                  width: '40%',
                  height: (plan[i] / 4) * 100 + '%',
                  background: 'var(--soft)',
                  borderRadius: '3px 3px 0 0',
                  border: '1px dashed var(--border)',
                }}
              />
              <div
                style={{
                  width: '40%',
                  height: (actual[i] / 4) * 100 + '%',
                  background: actual[i] > plan[i] ? 'var(--crit)' : 'var(--civic)',
                  borderRadius: '3px 3px 0 0',
                  opacity: actual[i] > 0 ? 1 : 0,
                }}
              />
            </div>
            <div className="mono" style={{ fontSize: 10, color: 'var(--ink50)' }}>{m}</div>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 14, marginTop: 14, fontSize: 11.5, color: 'var(--ink60)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 10, height: 10, background: 'var(--civic)', borderRadius: 2 }} />
          Ejecutado
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 10, height: 10, background: 'var(--soft)', border: '1px dashed var(--border)', borderRadius: 2 }} />
          Presupuestado
        </div>
        <div style={{ marginLeft: 'auto' }} className="mono">
          Q1: <b>€10.4M</b> / €10.7M · <span style={{ color: 'var(--ok)' }}>−2.8%</span>
        </div>
      </div>
    </div>
  )
}
