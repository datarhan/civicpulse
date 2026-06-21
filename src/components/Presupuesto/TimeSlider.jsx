import { useEffect, useRef, useState } from 'react'
import { fmtDateShort } from '../../lib/formatters'

export default function TimeSlider({ min, max, value, onChange }) {
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
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8 }}>
      <button
        onClick={() => {
          if (value >= max) onChange(min)
          setPlaying((p) => !p)
        }}
        aria-label={playing ? 'Pausar línea de tiempo' : 'Reproducir línea de tiempo'}
        style={{ all: 'unset', cursor: 'pointer', fontSize: 16 }}
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
        aria-label="Línea de tiempo del gasto situado"
        aria-valuetext={label}
        style={{ flex: 1 }}
      />
      <span className="mono" style={{ fontSize: 11, width: 92, textAlign: 'right' }}>
        {label}
      </span>
    </div>
  )
}
