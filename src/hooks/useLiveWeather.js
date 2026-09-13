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
  `&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m,relative_humidity_2m` +
  `&daily=temperature_2m_min,temperature_2m_max,precipitation_probability_max,sunrise,sunset` +
  `&timezone=Europe%2FMadrid&forecast_days=2`

const REFRESH_MS = 10 * 60 * 1000

/**
 * WMO weather codes → emoji + CATALOGUE KEY. Not exhaustive; unknown codes fall
 * back to the catch-all sun+cloud icon and `vivo.wmo.variable`.
 *
 * Las etiquetas vivían aquí escritas en castellano, así que la portada en
 * valencià las pintaba en castellano también: el catálogo sólo traduce lo que
 * pasa por él, y estas cadenas nunca entraron. Ahora se devuelve la clave y
 * traduce quien pinta. Las claves son `vivo.wmo.<código>`, sin hueco ninguno,
 * para poder buscarlas por código.
 */
const WMO = {
  0: ['☀️', 'vivo.wmo.0'],
  1: ['🌤', 'vivo.wmo.1'],
  2: ['⛅', 'vivo.wmo.2'],
  3: ['☁️', 'vivo.wmo.3'],
  45: ['🌫', 'vivo.wmo.45'],
  48: ['🌫', 'vivo.wmo.48'],
  51: ['🌦', 'vivo.wmo.51'],
  53: ['🌦', 'vivo.wmo.53'],
  55: ['🌧', 'vivo.wmo.55'],
  61: ['🌦', 'vivo.wmo.61'],
  63: ['🌧', 'vivo.wmo.63'],
  65: ['🌧', 'vivo.wmo.65'],
  71: ['🌨', 'vivo.wmo.71'],
  73: ['🌨', 'vivo.wmo.73'],
  75: ['❄️', 'vivo.wmo.75'],
  80: ['🌦', 'vivo.wmo.80'],
  81: ['🌧', 'vivo.wmo.81'],
  82: ['⛈', 'vivo.wmo.82'],
  95: ['⛈', 'vivo.wmo.95'],
  96: ['⛈', 'vivo.wmo.96'],
}

/** @returns {[string, string]} emoji y clave de catálogo, nunca una frase. */
export function describeWmo(code) {
  return WMO[code] || ['🌤', 'vivo.wmo.variable']
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
            feelsLikeC:
              typeof cur.apparent_temperature === 'number'
                ? Math.round(cur.apparent_temperature)
                : null,
            weatherCode: typeof cur.weather_code === 'number' ? cur.weather_code : null,
            humidity:
              typeof cur.relative_humidity_2m === 'number' ? cur.relative_humidity_2m : null,
            windKmh: typeof cur.wind_speed_10m === 'number' ? Math.round(cur.wind_speed_10m) : null,
            todayMin: daily.temperature_2m_min?.[0] ?? null,
            todayMax: daily.temperature_2m_max?.[0] ?? null,
            tomorrowMin: daily.temperature_2m_min?.[1] ?? null,
            tomorrowMax: daily.temperature_2m_max?.[1] ?? null,
            precipProbMax: daily.precipitation_probability_max?.[0] ?? null,
            sunriseIso: daily.sunrise?.[0] ?? null,
            sunsetIso: daily.sunset?.[0] ?? null,
            fetchedAt: new Date().toISOString(),
          },
        })
      } catch (err) {
        if (!alive) return
        // Treat every failure as "don't render" — never show a stale or
        // wrong-looking value to citizens reading the map.
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
