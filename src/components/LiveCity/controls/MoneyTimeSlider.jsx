// @ts-check
import { useEffect, useRef, useState } from 'react'
import { fmtDateShort } from '../../../lib/formatters'
import { useT } from '../../../i18n'
import { MoneyCoverage } from './MoneyCoverage'

const cardStyle = {
  background: 'rgba(255,255,255,.94)',
  border: '1px solid #DCD7C8',
  borderRadius: 'var(--r-input)',
  padding: '8px 10px',
  fontFamily: "'Outfit', system-ui, sans-serif",
  boxShadow: '0 4px 16px rgba(11,15,25,.16)',
  // 232 forced the header row (title + the two filter chips) onto three lines.
  // Invisible while the layer was opt-in; the layer now opens by default.
  width: 268,
}

/**
 * Money-timeline control for the landing map's spending layer. Play sweeps the
 * cumulative cursor `value` from min→max (2018→2025) via rAF; a range input
 * scrubs it; a DANA toggle restricts to flood-recovery spend; an obras toggle
 * restricts to construction contracts. Bails to the end frame under
 * prefers-reduced-motion (no animation) and cancels the rAF on unmount /
 * toggle-off. Mirrors Presupuesto/TimeSlider, re-themed for the map.
 */
export function MoneyTimeSlider({
  snapshot,
  min,
  max,
  value,
  onChange,
  danaOnly,
  onToggleDana,
  obrasOnly,
  onToggleObras,
}) {
  const t = useT()
  const [playing, setPlaying] = useState(false)
  const raf = useRef(0)
  const acc = useRef(value)

  useEffect(() => {
    if (!playing) return undefined
    const reduce =
      typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduce) {
      onChange(max)
      setPlaying(false)
      return undefined
    }
    acc.current = value
    const step = (max - min) / 120
    const tick = () => {
      acc.current = Math.min(max, acc.current + step)
      onChange(acc.current)
      if (acc.current >= max) {
        setPlaying(false)
        return
      }
      raf.current = requestAnimationFrame(tick)
    }
    raf.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing])

  if (!min || !max || min >= max) return null
  const label = fmtDateShort(new Date(value).toISOString())

  return (
    <div style={cardStyle}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 4,
        }}
      >
        <span
          style={{
            fontFamily: "'DM Mono', monospace",
            fontSize: 'var(--fs-micro)',
            color: 'rgba(11,15,25,.62)',
            letterSpacing: '.1em',
            textTransform: 'uppercase',
          }}
        >
          {t('map.money.title')}
        </span>
        <span style={{ display: 'flex', gap: 4 }}>
          <button
            type="button"
            onClick={() => onToggleObras(!obrasOnly)}
            aria-pressed={obrasOnly}
            style={{
              all: 'unset',
              cursor: 'pointer',
              fontSize: 'var(--fs-micro)',
              fontWeight: 700,
              padding: '2px 7px',
              borderRadius: 'var(--r-pill)',
              border: `1px solid ${obrasOnly ? 'var(--civic)' : '#C9C3B4'}`,
              background: obrasOnly ? 'rgba(14,91,98,.14)' : 'transparent',
              color: obrasOnly ? '#1D4FBB' : 'rgba(11,15,25,.62)',
            }}
          >
            {t('map.money.obras')}
          </button>
          <button
            type="button"
            onClick={() => onToggleDana(!danaOnly)}
            aria-pressed={danaOnly}
            style={{
              all: 'unset',
              cursor: 'pointer',
              fontSize: 'var(--fs-micro)',
              fontWeight: 700,
              padding: '2px 7px',
              borderRadius: 'var(--r-pill)',
              border: `1px solid ${danaOnly ? '#E08600' : '#C9C3B4'}`,
              background: danaOnly ? 'rgba(224,134,0,.16)' : 'transparent',
              color: danaOnly ? '#A85F00' : 'rgba(11,15,25,.62)',
            }}
          >
            {t('map.money.dana')}
          </button>
        </span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <button
          type="button"
          onClick={() => {
            if (value >= max) onChange(min)
            setPlaying((p) => !p)
          }}
          aria-label={`${playing ? t('map.timeline.pause') : t('map.timeline.play')}: ${t('map.money.title')}`}
          style={{ all: 'unset', cursor: 'pointer', fontSize: 'var(--fs-body)', lineHeight: 1 }}
        >
          {playing ? '⏸' : '▶'}
        </button>
        <input
          type="range"
          min={min}
          max={max}
          value={value}
          step={Math.max(1, (max - min) / 200)}
          onChange={(e) => {
            setPlaying(false)
            onChange(Number(e.target.value))
          }}
          aria-label="Línea de tiempo de los contratos situados por zona"
          aria-valuetext={label}
          style={{ flex: 1, accentColor: 'var(--civic)' }}
        />
      </div>
      <div
        style={{
          marginTop: 2,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
        }}
      >
        <span
          className="mono"
          style={{ fontSize: 'var(--fs-micro)', fontWeight: 700, color: '#0B0F19' }}
        >
          {label}
        </span>
        <span style={{ fontSize: 'var(--fs-micro)', color: 'rgba(11,15,25,.62)' }}>
          {t('map.money.accum')}
        </span>
      </div>
      <MoneyCoverage snapshot={snapshot} />
    </div>
  )
}
