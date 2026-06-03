// @ts-check
import { useJsonFetch } from './useJsonFetch'

export function useSpainTicker() {
  return useJsonFetch('/data/spain-ticker.json')
}

export function formatEur(value, { maximumFractionDigits = 3 } = {}) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—'
  return value.toLocaleString('es-ES', {
    minimumFractionDigits: 2,
    maximumFractionDigits,
  })
}

export function formatPct(value, { digits = 2 } = {}) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—'
  const sign = value >= 0 ? '+' : ''
  return `${sign}${value.toFixed(digits)}%`
}

export function signArrow(value) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value === 0) return ''
  return value > 0 ? '▲' : '▼'
}

/**
 * For citizens, a rising price is bad news. Map raw delta sign to a Pill tone
 * with citizen-benefit semantics (up = warn/crit, down = ok).
 */
export function citizenTone(delta) {
  if (typeof delta !== 'number' || !Number.isFinite(delta)) return 'neutral'
  if (delta > 3) return 'crit'
  if (delta > 0.5) return 'warn'
  if (delta < -0.5) return 'ok'
  return 'neutral'
}
