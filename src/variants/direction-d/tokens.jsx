import { useEffect, useState } from 'react'

const RIBA_ROJA_CENTER = [39.5439, -0.5711]

const SERIF = "'Fraunces', Georgia, serif"
const SANS = "'Outfit', system-ui, -apple-system, sans-serif"
const MONO = "'DM Mono', ui-monospace, monospace"

const PALETTE = {
  bg: '#FAF8F2',
  paper: '#FFFFFF',
  ink: '#0B0F19',
  ink80: 'rgba(11,15,25,.82)',
  ink60: 'rgba(11,15,25,.68)',
  ink50: 'rgba(11,15,25,.65)',
  ink40: 'rgba(11,15,25,.60)',
  rule: '#1F1F1F',
  hair: '#DCD7C8',
  civic: '#2463EB',
  accent: '#B0291F',
  accent2: '#1E3A8A',
  ok: '#16A34A',
  warn: '#D97706',
  crit: '#DC2626',
  amber: '#B45309',
}

function fmtClock(d) {
  return d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
}

function fmtDateLong(d) {
  return d.toLocaleDateString('es-ES', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

function useClock(intervalMs = 30000) {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])
  return now
}
export { RIBA_ROJA_CENTER, SERIF, SANS, MONO, PALETTE, fmtClock, fmtDateLong, useClock }
