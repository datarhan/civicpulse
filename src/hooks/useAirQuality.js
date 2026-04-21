// @ts-check
import { useEffect, useState } from 'react'

/**
 * Live air quality for Riba-roja de Túria via Open-Meteo's air-quality API.
 *
 *   https://open-meteo.com/en/docs/air-quality-api
 *
 * No API key, CORS-open, CC-BY. Updates hourly upstream; we refresh
 * every 15 minutes client-side to stay a touch ahead.
 *
 * `european_aqi` is the standard 0-100+ band used by the EEA:
 *   0–20 bueno · 20–40 razonable · 40–60 moderada · 60–80 mala ·
 *   80–100 muy mala · >100 extremadamente mala
 */

const LAT = 39.5439
const LNG = -0.5711
const URL =
  `https://air-quality-api.open-meteo.com/v1/air-quality` +
  `?latitude=${LAT}&longitude=${LNG}` +
  `&current=pm2_5,pm10,nitrogen_dioxide,ozone,european_aqi` +
  `&timezone=Europe%2FMadrid`

const REFRESH_MS = 15 * 60 * 1000

/** EAQI band → Spanish label + tone. Thresholds per EEA guidelines. */
export function describeAqi(eaqi) {
  if (eaqi == null || Number.isNaN(eaqi)) return { label: '—', tone: 'neutral', color: '#64748B' }
  if (eaqi <= 20) return { label: 'Buena',           tone: 'ok',   color: '#15803D' }
  if (eaqi <= 40) return { label: 'Razonable',       tone: 'ok',   color: '#65A30D' }
  if (eaqi <= 60) return { label: 'Moderada',        tone: 'warn', color: '#CA8A04' }
  if (eaqi <= 80) return { label: 'Mala',            tone: 'warn', color: '#EA580C' }
  if (eaqi <= 100) return { label: 'Muy mala',       tone: 'crit', color: '#DC2626' }
  return { label: 'Extremadamente mala', tone: 'crit', color: '#7F1D1D' }
}

export function useAirQuality() {
  const [state, setState] = useState({ loading: true, error: null, data: null })

  useEffect(() => {
    let alive = true
    let timer

    const fetchOnce = async () => {
      try {
        const r = await fetch(URL, { cache: 'no-store' })
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        const raw = await r.json()
        if (!alive) return
        const cur = raw.current || {}
        setState({
          loading: false,
          error: null,
          data: {
            eaqi: typeof cur.european_aqi === 'number' ? Math.round(cur.european_aqi) : null,
            pm25: typeof cur.pm2_5 === 'number' ? cur.pm2_5 : null,
            pm10: typeof cur.pm10 === 'number' ? cur.pm10 : null,
            no2:  typeof cur.nitrogen_dioxide === 'number' ? cur.nitrogen_dioxide : null,
            ozone: typeof cur.ozone === 'number' ? cur.ozone : null,
            fetchedAt: new Date().toISOString(),
          },
        })
      } catch (err) {
        if (!alive) return
        setState({ loading: false, error: err instanceof Error ? err.message : String(err), data: null })
      }
    }

    fetchOnce()
    timer = setInterval(fetchOnce, REFRESH_MS)
    return () => {
      alive = false
      clearInterval(timer)
    }
  }, [])

  return state
}
