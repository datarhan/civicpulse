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
 * oculto, Escape cierra esté donde esté el foco y lo devuelve al chip si estaba
 * dentro. Los oyentes van en `document`, como los de la barra: un `onKeyDown` de
 * React sólo salta si el evento BURBUJEA desde el nodo enfocado, y pinchar el
 * texto del panel deja el foco en el `body`, que no cuelga del envoltorio — con
 * lo que Escape no cerraba nada. En la prueba de unidad no se veía porque ahí el
 * evento se despacha sobre el panel, tenga el foco quien lo tenga.
 *
 * Una fuente que falla no pinta su chip, y tampoco una que contesta 200 con algo
 * inservible: `useLiveWeather` y `useAirQuality` devuelven `data: null` ante un
 * error, pero ante un cuerpo bien formado SIN lectura dejan los campos a `null`,
 * y «🌤 °» o «AQI – —» se leen como una medición. Así que el chip del tiempo pide
 * `tempC` y el del aire `eaqi`. El del metro no depende de la red: `useNextMetro`
 * es puro y siempre responde, así que ese se pinta siempre.
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
      }
    : fallbackMetro

  // Pulsar fuera cierra, y Escape también, esté donde esté el foco; si estaba
  // dentro, vuelve al chip que abrió. Los dos oyentes en `document` y con
  // `pointerdown`, igual que la barra de secciones: un `pointerdown` DENTRO del
  // envoltorio no es «irse».
  useEffect(() => {
    if (!abierto) return
    const fuera = (e) => {
      if (!envoltorio.current?.contains(e.target)) setAbierto(null)
    }
    const escape = (e) => {
      if (e.key !== 'Escape') return
      if (envoltorio.current?.contains(document.activeElement)) chips.current[abierto]?.focus()
      setAbierto(null)
    }
    document.addEventListener('pointerdown', fuera)
    document.addEventListener('keydown', escape)
    return () => {
      document.removeEventListener('pointerdown', fuera)
      document.removeEventListener('keydown', escape)
    }
  }, [abierto])

  // Un 200 con el cuerpo vacío deja los campos a `null`: sin cifra no hay chip,
  // ni panel que abrir desde un chip que no existe.
  const hayClima = weather?.tempC != null
  const hayAire = air?.eaqi != null
  if (!hayClima && !metro && !hayAire) return null

  const [emoji, wmoLabel] = weather ? describeWmo(weather.weatherCode) : ['', '']
  const aqi = air ? describeAqi(air.eaqi) : null

  const alterna = (id) => setAbierto((previo) => (previo === id ? null : id))

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

  // El panel no lleva `role="group"`, igual que los de la barra de secciones: el
  // `aria-controls` del chip ya los relaciona y el título va escrito dentro. Y
  // ponerlo rompía algo a distancia: `mobile.spec.ts` se anclaba en el PRIMER
  // [role="group"] del documento, y esta cabecera va antes que el mapa, así que
  // acabó midiendo este panel —oculto, con el rectángulo a cero— en lugar de la
  // pila de controles del mapa. Allí el ancla también está arreglada.
  const panel = (id, titulo, cuerpo, fuente) => (
    <div id={idPanel(id)} className="cp-vivo-panel" hidden={abierto !== id}>
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
    <div className="cp-vivo" ref={envoltorio}>
      <style>{estiloVivo}</style>
      <div className="cp-vivo-tira" data-vivo-tira>
        {hayClima &&
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

        {hayAire && hayClima && separador}
        {hayAire &&
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

        {metro && (hayClima || hayAire) && separador}
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
      {hayClima &&
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

      {hayAire &&
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
            <Fila k="Fuente" v="FGV · fgv.es" />
            {/* Las tres cosas de abajo venían del panel viejo y estaban
                publicadas. Se mudan con la tira en vez de caerse por el camino:
                el aviso del mapa sigue siendo verdad —las estaciones de L9 se
                pulsan— y el enlace es lo único que permite ir al horario oficial
                cuando el pie dice «confirma en fgv.es». */}
            <div
              style={{
                marginTop: 6,
                padding: '6px 8px',
                background: '#FFF7E6',
                border: '1px solid #F3D9A8',
                borderRadius: 'var(--r-input)',
                fontSize: 'var(--fs-micro)',
                color: '#7C4A00',
              }}
            >
              Pulsa cualquier estación de L9 en el mapa para ver los próximos trenes en ambos
              sentidos.
            </div>
            <div style={{ marginTop: 10 }}>
              <a
                href="https://www.metrovalencia.es"
                target="_blank"
                rel="noreferrer"
                style={{ fontSize: 'var(--fs-meta)', color: PALETTE.civic }}
              >
                Ver horario oficial →
              </a>
            </div>
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
