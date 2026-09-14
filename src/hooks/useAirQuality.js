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
  `&hourly=pm2_5` +
  `&past_days=1&forecast_days=1` +
  `&timezone=Europe%2FMadrid`

const REFRESH_MS = 15 * 60 * 1000

/**
 * EAQI band → catalogue key + tone + colour. Thresholds per EEA guidelines.
 *
 * Devuelve `clave`, no `label`: la banda escrita aquí en castellano se pintaba
 * igual en la portada en valencià, porque el catálogo sólo traduce lo que pasa
 * por él. Y la ausencia de lectura tiene su propia clave en vez del «—» de
 * antes: un guion donde va una banda se lee como medición, y así se publicó un
 * chip «AQI – —» en la cabecera.
 *
 * @returns {{clave: string, tone: string, color: string}}
 */
export function describeAqi(eaqi) {
  if (typeof eaqi !== 'number' || !Number.isFinite(eaqi))
    return { clave: 'vivo.aqi.sinDato', tone: 'neutral', color: '#64748B' }
  if (eaqi <= 20) return { clave: 'vivo.aqi.buena', tone: 'ok', color: '#15803D' }
  if (eaqi <= 40) return { clave: 'vivo.aqi.razonable', tone: 'ok', color: '#65A30D' }
  if (eaqi <= 60) return { clave: 'vivo.aqi.moderada', tone: 'warn', color: '#CA8A04' }
  if (eaqi <= 80) return { clave: 'vivo.aqi.mala', tone: 'warn', color: '#EA580C' }
  if (eaqi <= 100) return { clave: 'vivo.aqi.muyMala', tone: 'crit', color: '#DC2626' }
  return { clave: 'vivo.aqi.extrema', tone: 'crit', color: '#7F1D1D' }
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
        const hourly = raw.hourly || {}
        // Trim hourly PM2.5 to the trailing 24 hours ending "now" so the
        // mini sparkline is always a rolling day, not a calendar-day slice.
        const pm25Series = Array.isArray(hourly.pm2_5) ? hourly.pm2_5.slice(-24) : []
        setState({
          loading: false,
          error: null,
          data: {
            eaqi: typeof cur.european_aqi === 'number' ? Math.round(cur.european_aqi) : null,
            pm25: typeof cur.pm2_5 === 'number' ? cur.pm2_5 : null,
            pm10: typeof cur.pm10 === 'number' ? cur.pm10 : null,
            no2: typeof cur.nitrogen_dioxide === 'number' ? cur.nitrogen_dioxide : null,
            ozone: typeof cur.ozone === 'number' ? cur.ozone : null,
            pm25Last24h: pm25Series,
            fetchedAt: new Date().toISOString(),
          },
        })
      } catch (err) {
        if (!alive) return
        setState({
          loading: false,
          error: err instanceof Error ? err.message : String(err),
          data: null,
        })
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
