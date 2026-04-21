// @ts-check
import { useEffect, useState } from 'react'

/**
 * Live weather for Riba-roja de Túria via Open-Meteo.
 *
 *   https://open-meteo.com/en/docs
 *
 * No API key, CORS-open, CC-BY licence. Each browser fetches directly
 * (zero backend cost); we don't proxy. Refreshes every 10 minutes —
 * Open-Meteo updates its hourly forecast more often than that anyway, so
 * this is a sensible client-side interval.
 *
 * Returns `null` while loading or on any error (network, CORS, parse).
 * Callers render nothing when the hook is null — the map should stay
 * clean if the external API is down.
 */

const LAT = 39.5439
const LNG = -0.5711
const URL =
  `https://api.open-meteo.com/v1/forecast` +
  `?latitude=${LAT}&longitude=${LNG}` +
  `&current=temperature_2m,weather_code,wind_speed_10m,relative_humidity_2m` +
  `&daily=temperature_2m_min,temperature_2m_max,precipitation_probability_max` +
  `&timezone=Europe%2FMadrid&forecast_days=2`

const REFRESH_MS = 10 * 60 * 1000

/** WMO weather codes → emoji + short Spanish label. Not exhaustive; unknown
 *  codes fall back to the catch-all sun+cloud icon. */
const WMO = {
  0:  ['☀️',  'Despejado'],
  1:  ['🌤',  'Mayormente despejado'],
  2:  ['⛅',  'Parcialmente nublado'],
  3:  ['☁️',  'Nublado'],
  45: ['🌫',  'Niebla'],
  48: ['🌫',  'Niebla helada'],
  51: ['🌦',  'Llovizna ligera'],
  53: ['🌦',  'Llovizna'],
  55: ['🌧',  'Llovizna intensa'],
  61: ['🌦',  'Lluvia ligera'],
  63: ['🌧',  'Lluvia'],
  65: ['🌧',  'Lluvia intensa'],
  71: ['🌨',  'Nieve ligera'],
  73: ['🌨',  'Nieve'],
  75: ['❄️',  'Nieve intensa'],
  80: ['🌦',  'Chubascos'],
  81: ['🌧',  'Chubascos fuertes'],
  82: ['⛈',  'Aguacero violento'],
  95: ['⛈',  'Tormenta'],
  96: ['⛈',  'Tormenta con granizo'],
}

export function describeWmo(code) {
  return WMO[code] || ['🌤', 'Variable']
}

export function useLiveWeather() {
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
        const daily = raw.daily || {}
        setState({
          loading: false,
          error: null,
          data: {
            tempC: typeof cur.temperature_2m === 'number' ? Math.round(cur.temperature_2m) : null,
            weatherCode: typeof cur.weather_code === 'number' ? cur.weather_code : null,
            humidity: typeof cur.relative_humidity_2m === 'number' ? cur.relative_humidity_2m : null,
            windKmh: typeof cur.wind_speed_10m === 'number' ? Math.round(cur.wind_speed_10m) : null,
            todayMin: daily.temperature_2m_min?.[0] ?? null,
            todayMax: daily.temperature_2m_max?.[0] ?? null,
            tomorrowMin: daily.temperature_2m_min?.[1] ?? null,
            tomorrowMax: daily.temperature_2m_max?.[1] ?? null,
            precipProbMax: daily.precipitation_probability_max?.[0] ?? null,
            fetchedAt: new Date().toISOString(),
          },
        })
      } catch (err) {
        if (!alive) return
        // Treat every failure as "don't render" — never show a stale or
        // wrong-looking value to citizens reading the map.
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
