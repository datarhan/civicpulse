import { useEffect, useRef, useState } from 'react'
import { useLiveWeather, describeWmo } from '../../hooks/useLiveWeather'
import { useNextMetro } from '../../hooks/useNextMetro'
import { useMetroSchedule } from '../../hooks/useMetroSchedule'
import { useAirQuality, describeAqi } from '../../hooks/useAirQuality'
import { METRO_COLOR } from '../../components/LiveCity/shared'
import { readableInk } from '../../lib/contrast'
import { useT } from '../../i18n'
import { MONO, PALETTE, SANS } from './tokens'
import { estiloVivo } from './vivo.css.js'

/**
 * El tiempo, el aire y el metro de la cabecera, con su detalle.
 *
 * Sale de `Topbar.jsx` por una razón de estructura: allí el panel colgaba de la
 * propia tira, y la tira lleva `overflow-x` para deslizarse en estrecho, así que
 * el detalle quedaba recortado a la altura de la fila y NO SE VEÍA NUNCA. Aquí
 * el panel es hermano de la tira, dentro de un envoltorio que está posicionado y
 * no se desliza; `vivo.css.js` cuenta el porqué y hace el cambio de ancla en
 * estrecho.
 *
 * El patrón es el desplegable de la APG, el mismo que la barra de secciones:
 * botón con `aria-expanded` y `aria-controls`, el panel en el DOM aunque esté
 * oculto, Escape cierra y devuelve el foco al chip que abrió.
 *
 * Una fuente que falla no pinta su chip. Los tres hooks devuelven `data: null`
 * ante cualquier fallo, y la cabecera prefiere no decir nada a publicar un «0°»
 * o un «—°» que se lea como una medición.
 */
export function Vivo() {
  const t = useT()
  const { data: weather } = useLiveWeather()
  const fallbackMetro = useNextMetro()
  const { findNext } = useMetroSchedule()
  const { data: air } = useAirQuality()
  const [abierto, setAbierto] = useState(null)
  const [nowTick, setNowTick] = useState(() => Date.now())
  const envoltorio = useRef(null)
  const chips = useRef({})

  useEffect(() => {
    const id = setInterval(() => setNowTick(Date.now()), 15_000)
    return () => clearInterval(id)
  }, [])

  // Horario del metro: el GTFS cuando trae la salida de Riba-roja, y si no la
  // tabla transcrita. (Cuál de los dos manda —y que ninguno se anuncie como
  // «tiempo real»— es el asunto del chip «Hoy», que llega después.)
  const gtfsRibaRoja = findNext('riba-roja-de-turia', new Date(nowTick))
  const gtfsNext = gtfsRibaRoja?.departures.find((d) => d.line === 'L9' && d.heading === 'València')
  const metro = gtfsNext
    ? {
        stationName: 'Riba-roja de Túria',
        departureLabel: gtfsNext.label,
        minutesAway: gtfsNext.minutesAway,
        afterMidnight: gtfsNext.afterMidnight,
        heading: 'València',
        scheduleValidUntil: gtfsRibaRoja.validThrough,
        scheduleSource: 'FGV GTFS',
      }
    : fallbackMetro

  // Pulsar fuera cierra. Un pointerdown DENTRO del envoltorio no es «irse».
  useEffect(() => {
    if (!abierto) return
    const fuera = (e) => {
      if (!envoltorio.current?.contains(e.target)) setAbierto(null)
    }
    window.addEventListener('mousedown', fuera)
    return () => window.removeEventListener('mousedown', fuera)
  }, [abierto])

  if (!weather && !metro && !air) return null

  const [emoji, wmoLabel] = weather ? describeWmo(weather.weatherCode) : ['', '']
  const aqi = air ? describeAqi(air.eaqi) : null

  const alterna = (id) => setAbierto((previo) => (previo === id ? null : id))
  // Escape cierra y devuelve el foco al chip: quien abrió con el teclado no se
  // queda sin sitio en la página.
  const onKeyDown = (e) => {
    if (e.key !== 'Escape' || !abierto) return
    const chip = chips.current[abierto]
    setAbierto(null)
    // El foco vuelve al chip cuando el Escape viene de DENTRO —de la tira o del
    // panel—, que es lo que hace quien está leyendo el detalle. Se mira el
    // origen del evento y no `document.activeElement`: pulsar Escape sobre el
    // panel sin haber tabulado a nada deja el foco en el body, y con esa
    // comprobación el chip no lo recuperaba nunca.
    if (chip && envoltorio.current?.contains(e.target)) chip.focus()
  }

  const idPanel = (id) => `vivo-panel-${id}`
  const chip = (id, aria, contenido) => (
    <button
      type="button"
      ref={(el) => {
        chips.current[id] = el
      }}
      className="cp-vivo-chip"
      aria-expanded={abierto === id}
      aria-controls={idPanel(id)}
      aria-label={t(aria)}
      onClick={() => alterna(id)}
    >
      {contenido}
    </button>
  )

  const panel = (id, titulo, cuerpo, fuente) => (
    <div
      id={idPanel(id)}
      className="cp-vivo-panel"
      role="group"
      aria-label={titulo}
      hidden={abierto !== id}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 8,
        }}
      >
        <div style={{ fontSize: 'var(--fs-aux)', fontWeight: 700, color: PALETTE.ink }}>
          {titulo}
        </div>
        <button
          type="button"
          aria-label={t('vivo.cerrar')}
          onClick={() => {
            setAbierto(null)
            chips.current[id]?.focus()
          }}
          style={{
            width: 22,
            height: 22,
            borderRadius: 'var(--r-input)',
            display: 'grid',
            placeItems: 'center',
            color: PALETTE.ink50,
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
          }}
        >
          ×
        </button>
      </div>
      {cuerpo}
      <div className="cp-vivo-fuente">{fuente}</div>
    </div>
  )

  const separador = <span className="cp-vivo-sep" aria-hidden />

  return (
    <div className="cp-vivo" ref={envoltorio} onKeyDown={onKeyDown}>
      <style>{estiloVivo}</style>
      <div className="cp-vivo-tira" data-vivo-tira>
        {weather &&
          chip(
            'clima',
            'vivo.clima.aria',
            <>
              <span style={{ fontSize: 'var(--fs-body)', lineHeight: 1 }} aria-hidden="true">
                {emoji}
              </span>
              <span
                className="mono"
                style={{ fontSize: 'var(--fs-meta)', fontWeight: 700, color: PALETTE.ink }}
              >
                {weather.tempC}°
              </span>
              {weather.todayMin != null && weather.todayMax != null && (
                <span
                  className="mono"
                  style={{ fontSize: 'var(--fs-micro)', color: PALETTE.ink50 }}
                >
                  {Math.round(weather.todayMin)}°/{Math.round(weather.todayMax)}°
                </span>
              )}
            </>,
          )}

        {air && aqi && weather && separador}
        {air &&
          aqi &&
          chip(
            'aire',
            'vivo.aire.aria',
            <>
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: aqi.color,
                  flexShrink: 0,
                }}
                aria-hidden="true"
              />
              <span
                className="mono"
                style={{ fontSize: 'var(--fs-micro)', fontWeight: 700, color: PALETTE.ink }}
              >
                AQI {air.eaqi ?? '–'}
              </span>
              <span style={{ fontSize: 'var(--fs-micro)', color: PALETTE.ink50 }}>{aqi.label}</span>
            </>,
          )}

        {metro && (weather || air) && separador}
        {metro &&
          chip(
            'metro',
            'vivo.metro.aria',
            <>
              <span
                style={{
                  width: 18,
                  height: 18,
                  borderRadius: '50%',
                  background: METRO_COLOR,
                  // El marrón de la L9 es de FGV; el blanco encima da 3,69:1, así
                  // que se voltea la tinta y se queda el relleno de marca.
                  color: readableInk(METRO_COLOR),
                  display: 'grid',
                  placeItems: 'center',
                  fontFamily: MONO,
                  fontSize: 'var(--fs-micro)',
                  fontWeight: 800,
                  flexShrink: 0,
                }}
                aria-hidden="true"
              >
                L9
              </span>
              <span className="mono" style={{ fontSize: 'var(--fs-micro)', color: PALETTE.ink50 }}>
                → {metro.heading || 'València'}
              </span>
              <span className="mono" style={{ fontSize: 'var(--fs-meta)', fontWeight: 700 }}>
                {metro.departureLabel}
              </span>
              <span className="mono" style={{ fontSize: 'var(--fs-micro)', color: PALETTE.ink50 }}>
                {metro.minutesAway === 0 ? 'ahora' : `${metro.minutesAway} min`}
                {metro.afterMidnight ? ' (mañana)' : ''}
              </span>
            </>,
          )}
      </div>

      {/* Los paneles son HERMANOS de la tira, no descendientes: es lo que hace
          que se vean. Siguen en el DOM cerrados, que es el patrón de la APG. */}
      {weather &&
        panel(
          'clima',
          `${emoji} ${wmoLabel}`,
          <>
            {weather.tempC != null && (
              <Fila
                k="Temperatura"
                v={`${weather.tempC}° ${
                  weather.todayMin != null && weather.todayMax != null
                    ? `(${Math.round(weather.todayMin)}°/${Math.round(weather.todayMax)}°)`
                    : ''
                }`}
              />
            )}
            {weather.feelsLikeC != null && (
              <Fila k="Sensación térmica" v={`${weather.feelsLikeC}°`} />
            )}
            {weather.humidity != null && <Fila k="Humedad" v={`${weather.humidity}%`} />}
            {weather.windKmh != null && <Fila k="Viento" v={`${weather.windKmh} km/h`} />}
            {weather.precipProbMax != null && (
              <Fila k="Prob. lluvia (hoy)" v={`${weather.precipProbMax}%`} />
            )}
            {weather.sunriseIso && <Fila k="Amanece" v={`↑ ${horaLocal(weather.sunriseIso)}`} />}
            {weather.sunsetIso && <Fila k="Anochece" v={`↓ ${horaLocal(weather.sunsetIso)}`} />}
            {weather.tomorrowMin != null && weather.tomorrowMax != null && (
              <Fila
                k="Mañana"
                v={`${Math.round(weather.tomorrowMin)}° / ${Math.round(weather.tomorrowMax)}°`}
              />
            )}
          </>,
          'Open-Meteo · actualizado cada 10 min',
        )}

      {air &&
        aqi &&
        panel(
          'aire',
          `${t('vivo.aire.titulo')} · ${aqi.label}`,
          <>
            <Fila k="EAQI" v={`${air.eaqi ?? '—'} · ${aqi.label}`} />
            {air.pm25 != null && <Fila k="PM₂.₅" v={`${air.pm25.toFixed(1)} µg/m³`} />}
            {air.pm10 != null && <Fila k="PM₁₀" v={`${air.pm10.toFixed(1)} µg/m³`} />}
            {air.no2 != null && <Fila k="NO₂" v={`${air.no2.toFixed(1)} µg/m³`} />}
            {air.ozone != null && <Fila k="O₃" v={`${air.ozone.toFixed(1)} µg/m³`} />}
            {Array.isArray(air.pm25Last24h) && air.pm25Last24h.length > 4 && (
              <div style={{ padding: '8px 0 2px' }}>
                <div
                  style={{
                    fontSize: 'var(--fs-micro)',
                    color: PALETTE.ink50,
                    marginBottom: 4,
                    letterSpacing: '.06em',
                    textTransform: 'uppercase',
                    fontFamily: MONO,
                  }}
                >
                  PM₂.₅ · últimas 24 h
                </div>
                <Chispa values={air.pm25Last24h} color={aqi.color} width={260} height={36} />
              </div>
            )}
          </>,
          'Open-Meteo Air Quality · EAQI (EEA) · actualizado cada 15 min',
        )}

      {metro &&
        panel(
          'metro',
          `${t('vivo.metro.titulo')} · ${metro.stationName}`,
          <>
            <Fila
              k="Próximo tren"
              v={`${metro.departureLabel}${metro.afterMidnight ? ' (mañana)' : ''}`}
            />
            <Fila k="Faltan" v={metro.minutesAway === 0 ? 'ahora' : `${metro.minutesAway} min`} />
            <Fila k="Sentido" v={`Hacia ${metro.heading || 'València'}`} />
            <Fila k="Estación" v={`${metro.stationName} (terminus)`} />
          </>,
          fuenteDelHorario(metro),
        )}
    </div>
  )
}

function Fila({ k, v }) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        gap: 12,
        padding: '3px 0',
        fontSize: 'var(--fs-meta)',
        borderBottom: `1px dashed ${PALETTE.hair}`,
        fontFamily: SANS,
      }}
    >
      <span style={{ color: PALETTE.ink50 }}>{k}</span>
      <span className="mono" style={{ color: PALETTE.ink, fontWeight: 600 }}>
        {v}
      </span>
    </div>
  )
}

/**
 * La serie de PM₂.₅ de las últimas 24 horas, en una chispa.
 *
 * Con menos de dos puntos no se dibuja: una línea de un punto no es una serie,
 * y una caja vacía se leería como «no hay contaminación» en vez de «no hay
 * datos». Viene del panel viejo, donde ya estaba publicada; se mueve con la
 * tira para que no se caiga por el camino.
 */
function Chispa({ values, color, width = 96, height = 18 }) {
  const nums = (values ?? []).filter((v) => typeof v === 'number' && Number.isFinite(v))
  if (nums.length < 2) return null
  const min = Math.min(...nums)
  const max = Math.max(...nums)
  const span = max - min || 1
  const paso = width / (nums.length - 1)
  const d = nums
    .map((v, i) => {
      const x = i * paso
      const y = height - ((v - min) / span) * (height - 2) - 1
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')
  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      style={{ display: 'block' }}
      aria-hidden="true"
    >
      <path d={d} fill="none" stroke={color} strokeWidth="1.4" opacity="0.85" />
    </svg>
  )
}

/**
 * «válido hasta 2025-12-31» impreso en 2026 se lee como la garantía de un
 * horario que caducó hace meses. FGV no ha republicado el GTFS, así que las
 * salidas son una REFERENCIA y se dice, en vez de citar una fecha ya pasada.
 */
function fuenteDelHorario(metro) {
  const vu = metro.scheduleValidUntil
  const caducado = vu && new Date(vu).getTime() < Date.now()
  return caducado
    ? `Horario de referencia FGV (${String(vu).slice(0, 4)}) · FGV no ha republicado; confirma en fgv.es`
    : `Horario transcrito de fgv.es · válido hasta ${vu}`
}

function horaLocal(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleTimeString('es-ES', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Madrid',
  })
}
