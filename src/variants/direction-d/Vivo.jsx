import { useEffect, useRef, useState } from 'react'
import { useLiveWeather, describeWmo } from '../../hooks/useLiveWeather'
import { useNextMetro } from '../../hooks/useNextMetro'
import { useMetroSchedule } from '../../hooks/useMetroSchedule'
import { useAirQuality, describeAqi } from '../../hooks/useAirQuality'
import { METRO_COLOR } from '../../components/LiveCity/shared'
import { readableInk } from '../../lib/contrast'
import { useT } from '../../i18n'
import { rellena } from '../../lib/formatters'
import { metroDeLaPortada, VIGENCIA } from '../../lib/metro-portada'
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
 * Es UN chip —«Hoy»— y no tres: tres pastillas seguidas en la misma fila
 * competían entre ellas y no ganaba ninguna. El detalle va entero dentro, en tres
 * secciones con nombre, y cada sección dice de dónde sale su dato.
 *
 * Una fuente sin lectura no pinta ni cifra ni sección, y eso incluye a la que
 * contesta 200 con algo inservible: `useLiveWeather` y `useAirQuality` devuelven
 * `data: null` ante un error, pero ante un cuerpo bien formado SIN lectura dejan
 * los campos a `null`, y «🌤 °» o «AQI – —» se leen como una medición. Así que la
 * temperatura pide `tempC` y el aire `eaqi`. El metro no depende de la red
 * —`useNextMetro` es puro—, de modo que ese tramo está siempre; y cuando falta la
 * temperatura el texto se compone con OTRA cadena del catálogo, porque rellenar a
 * medias la de siempre dejaría «{t}» escrito en la cabecera.
 */
export function Vivo() {
  const t = useT()
  const { data: weather, loading: cargandoTiempo } = useLiveWeather()
  const fallbackMetro = useNextMetro()
  const { findNext, loading: cargandoHorario } = useMetroSchedule()
  const { data: air, loading: cargandoAire } = useAirQuality()
  const [abierto, setAbierto] = useState(null)
  const [nowTick, setNowTick] = useState(() => Date.now())
  const envoltorio = useRef(null)
  const chips = useRef({})

  useEffect(() => {
    const id = setInterval(() => setNowTick(Date.now()), 15_000)
    return () => clearInterval(id)
  }, [])

  // Horario del metro: el que está EN VIGOR, que lo decide `metroDeLaPortada` y
  // no esta cabecera. Antes aquí se prefería el GTFS por el mero hecho de que
  // trajera salida, y el GTFS de FGV declara `validThrough: 2025-12-31`: se
  // publicaban las horas de un horario caducado con el descargo de otro debajo.
  const ahora = new Date(nowTick)
  const metro = metroDeLaPortada({
    gtfs: findNext('riba-roja-de-turia', ahora),
    transcripcion: fallbackMetro,
    ahora,
  })

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

  // Un 200 con el cuerpo vacío deja los campos a `null`, y una cifra que no
  // existe no se publica: sin `tempC` no hay temperatura en el chip ni sección
  // del tiempo en el panel, y sin `eaqi` lo mismo con el aire. El chip en sí sigue
  // ahí mientras quede algo que decir —el metro es cálculo puro y casi siempre
  // queda—, con la plantilla que corresponda a lo que sí hay.
  const hayClima = weather?.tempC != null
  const hayAire = air?.eaqi != null
  if (!hayClima && !metro && !hayAire) return null

  // Los dos describen con claves de catálogo, no con frases: traduce quien
  // pinta. Mientras las etiquetas vivían dentro de los hooks, la portada en
  // valencià las pintaba en castellano.
  const [emoji, claveWmo] = weather ? describeWmo(weather.weatherCode) : ['', '']
  const wmoLabel = claveWmo ? t(claveWmo) : ''
  const aqi = air ? describeAqi(air.eaqi) : null
  const bandaAire = aqi ? t(aqi.clave) : ''

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

  // El panel EN SÍ no lleva `role="group"`, igual que los de la barra de
  // secciones: el `aria-controls` del chip ya los relaciona y el título va
  // escrito dentro. Las tres SECCIONES de dentro sí lo llevan, porque agrupar es
  // exactamente lo que hacen y es lo que un lector de pantalla anuncia al entrar.
  //
  // Que eso sea seguro es reciente. `mobile.spec.ts` buscaba el PRIMER
  // [role="group"] del documento para medir la pila de controles del mapa, y esta
  // cabecera va antes que el mapa: acabó midiendo un panel oculto —rectángulo a
  // cero— y dos de sus cuatro aserciones se cumplían solas. Ahora se ancla en
  // `data-capa`, que no se traduce ni cambia de sitio, así que un grupo nuevo por
  // aquí ya no le mueve el ancla.
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
      {/* Sin pie, NADA de pie: `.cp-vivo-fuente` lleva borde superior y espacio
          propios, así que pintarlo vacío deja una raya y un hueco al final del
          panel. Desde que cada sección trae su fuente, este pie ya no tiene qué
          decir y tiene que desaparecer, no quedarse en blanco. */}
      {fuente ? <div className="cp-vivo-fuente">{fuente}</div> : null}
    </div>
  )

  // UN chip, no tres. La maqueta pedía una sola entrada —«Hoy»— porque tres
  // pastillas seguidas en la cabecera compiten entre ellas y ninguna gana: lo
  // que el lector quiere saber de un vistazo es si hace frío y cuándo pasa el
  // metro. El detalle sigue entero, dentro, en tres secciones con nombre.
  //
  // El texto se compone con `rellena` y con UNA PLANTILLA POR COMBINACIÓN, nunca
  // rellenando una a medias: dejar «{t}» o «{m}» sin sustituir es lo que /empleo
  // publicó una vez («sobre 24 de {total} ofertas»). Y son cuatro, no dos, porque
  // «el metro no falta nunca» es casi verdad y no verdad: `useNextMetro` es puro,
  // pero si algún día no hubiera salida, un `m: ''` pintaría «L9  » en la cabecera.
  //
  // La espera lleva su palabra, también del catálogo: el chip decía «L9 0 min»
  // donde el panel dice «ahora», y a las 22:52 «L9 419 min» sin contar que ese
  // tren es el primero de mañana.
  const espera = metro
    ? metro.minutesAway === 0
      ? t('vivo.hoy.ahora')
      : rellena(t(metro.afterMidnight ? 'vivo.hoy.manana' : 'vivo.hoy.espera'), {
          m: metro.minutesAway,
        })
    : null
  const textoChip = hayClima
    ? metro
      ? rellena(t('vivo.hoy.chip'), { t: weather.tempC, m: espera })
      : rellena(t('vivo.hoy.chip.sinMetro'), { t: weather.tempC })
    : metro
      ? rellena(t('vivo.hoy.chip.sinTiempo'), { m: espera })
      : t('vivo.hoy.chip.solo')

  /**
   * Una sección con nombre dentro del panel único, con su procedencia al pie.
   *
   * Quien decide si una sección existe es la guarda de su fuente en el sitio donde
   * se llama —`hayClima`, `hayAire`, `metro`—, no este ayudante: aquí el pie se
   * pinta siempre, porque una sección que llega hasta aquí tiene algo que contar y
   * de algún sitio ha salido.
   */
  const seccion = (etiqueta, filas, fuente) => (
    <div role="group" aria-label={etiqueta} style={{ marginBottom: 10 }}>
      <div
        style={{
          fontFamily: MONO,
          fontSize: 'var(--fs-micro)',
          letterSpacing: '.06em',
          textTransform: 'uppercase',
          color: PALETTE.ink50,
          marginBottom: 2,
        }}
      >
        {etiqueta}
      </div>
      {filas}
      <div className="cp-vivo-fuente" style={{ marginTop: 6, paddingTop: 6 }}>
        {fuente}
      </div>
    </div>
  )

  // Mientras alguna de las tres fuentes no ha contestado, la cabecera lo dice en
  // un atributo. No va para el lector de pantalla —un `aria-busy` podría esconder
  // el chip todo lo que Open-Meteo tarde, y Open-Meteo puede no contestar nunca—,
  // sino para quien COMPRUEBA la cabecera. El primer pintado llega antes que el
  // tiempo, el aire y el horario, así que una ausencia afirmada ahí («el chip no
  // pinta °») se cumple sola; con esto, «todavía no ha llegado» y «no ha llegado
  // nada» dejan de ser el mismo DOM.
  const cargando = cargandoTiempo || cargandoAire || cargandoHorario

  return (
    <div className="cp-vivo" ref={envoltorio} data-vivo-cargando={cargando ? '' : undefined}>
      <style>{estiloVivo}</style>
      <div className="cp-vivo-tira" data-vivo-tira>
        {chip(
          'hoy',
          'vivo.hoy.aria',
          <>
            {hayClima && (
              <span style={{ fontSize: 'var(--fs-body)', lineHeight: 1 }} aria-hidden="true">
                {emoji}
              </span>
            )}
            {/* El punto del aire va DENTRO del chip único, sin cifra: el número
                está en el detalle, y aquí sólo dice de un vistazo cómo está. */}
            {hayAire && (
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
            )}
            {/* El disco de la L9 se queda, y no por adorno: es la marca por la
                que se reconoce la línea, lleva el marrón de FGV y `readableInk`
                voltea la tinta encima porque el blanco sobre ese marrón da
                3,69:1. Perderlo al juntar los tres chips habría sido tirar una
                decisión de contraste ya tomada, callando. */}
            {metro && (
              <span
                style={{
                  width: 16,
                  height: 16,
                  borderRadius: '50%',
                  background: METRO_COLOR,
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
            )}
            <span
              className="mono"
              style={{ fontSize: 'var(--fs-meta)', fontWeight: 700, color: PALETTE.ink }}
            >
              {textoChip}
            </span>
          </>,
        )}
      </div>

      {/* El panel es HERMANO de la tira, no descendiente: es lo que hace que se
          vea. Sigue en el DOM cerrado, que es el patrón de la APG. Y dentro van
          tres secciones con nombre, que es lo que permite que una sola pastilla
          no pierda nada de lo que decían las tres. */}
      {panel(
        'hoy',
        t('vivo.hoy.titulo'),
        <>
          {hayClima &&
            seccion(
              t('vivo.hoy.tiempo'),
              <>
                <Fila k={`${emoji} ${wmoLabel}`} v={`${weather.tempC}°`} />
                {weather.todayMin != null && weather.todayMax != null && (
                  <Fila
                    k={t('vivo.fila.hoy')}
                    v={`${Math.round(weather.todayMin)}° / ${Math.round(weather.todayMax)}°`}
                  />
                )}
                {weather.feelsLikeC != null && (
                  <Fila k={t('vivo.fila.sensacion')} v={`${weather.feelsLikeC}°`} />
                )}
                {weather.humidity != null && (
                  <Fila k={t('vivo.fila.humedad')} v={`${weather.humidity}%`} />
                )}
                {weather.windKmh != null && (
                  <Fila k={t('vivo.fila.viento')} v={`${weather.windKmh} km/h`} />
                )}
                {weather.precipProbMax != null && (
                  <Fila k={t('vivo.fila.lluvia')} v={`${weather.precipProbMax}%`} />
                )}
                {weather.sunriseIso && (
                  <Fila k={t('vivo.fila.amanece')} v={`↑ ${horaLocal(weather.sunriseIso)}`} />
                )}
                {weather.sunsetIso && (
                  <Fila k={t('vivo.fila.anochece')} v={`↓ ${horaLocal(weather.sunsetIso)}`} />
                )}
                {weather.tomorrowMin != null && weather.tomorrowMax != null && (
                  <Fila
                    k={t('vivo.fila.manana')}
                    v={`${Math.round(weather.tomorrowMin)}° / ${Math.round(weather.tomorrowMax)}°`}
                  />
                )}
              </>,
              t('vivo.fuente.tiempo'),
            )}

          {hayAire &&
            seccion(
              t('vivo.hoy.aire'),
              <>
                <Fila k="EAQI" v={`${air.eaqi} · ${bandaAire}`} />
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
                      {t('vivo.aire.serie')}
                    </div>
                    <Chispa values={air.pm25Last24h} color={aqi.color} width={260} height={36} />
                  </div>
                )}
              </>,
              t('vivo.fuente.aire'),
            )}

          {metro &&
            seccion(
              t('vivo.hoy.metro'),
              <>
                <Fila
                  k={t('vivo.fila.proximo')}
                  v={
                    metro.afterMidnight
                      ? rellena(t('vivo.metro.manana'), { hora: metro.departureLabel })
                      : metro.departureLabel
                  }
                />
                <Fila
                  k={t('vivo.fila.faltan')}
                  v={
                    metro.minutesAway === 0
                      ? t('vivo.hoy.ahora')
                      : rellena(t('vivo.hoy.espera'), { m: metro.minutesAway })
                  }
                />
                <Fila
                  k={t('vivo.fila.sentido')}
                  v={rellena(t('vivo.metro.hacia'), { destino: metro.heading || 'València' })}
                />
                <Fila
                  k={t('vivo.fila.estacion')}
                  v={rellena(t('vivo.metro.estacion'), { estacion: metro.stationName })}
                />
                {/* La fuente, nombrada desde el origen que ganó. Venía de un
                    campo que traía el propio selector, y era una cadena en
                    castellano escrita dentro de un hook: en valencià se leía en
                    castellano, que es el defecto que este cambio arregla en el
                    tiempo y el aire. «FGV GTFS» no se traduce porque es el nombre
                    del feed. */}
                <Fila
                  k={t('vivo.fila.fuente')}
                  v={metro.origen === 'gtfs' ? 'FGV GTFS' : t('vivo.fuente.transcrita')}
                />
                {/* Las dos cosas de abajo venían del panel viejo y estaban
                    publicadas. Se mudan en vez de caerse por el camino: el aviso
                    del mapa sigue siendo verdad —las estaciones de L9 se pulsan—
                    y el enlace es lo único que permite ir al horario oficial
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
                  {t('vivo.metro.aviso')}
                </div>
                <div style={{ marginTop: 10 }}>
                  <a
                    href="https://www.metrovalencia.es"
                    target="_blank"
                    rel="noreferrer"
                    style={{ fontSize: 'var(--fs-meta)', color: PALETTE.civic }}
                  >
                    {t('vivo.metro.oficial')}
                  </a>
                </div>
              </>,
              fuenteDelHorario(metro, t),
            )}
        </>,
        // El pie del panel ya lo pone cada sección con su fuente: repetirlo aquí
        // sería decir dos veces de dónde sale el dato, y con una sola línea para
        // tres fuentes se diría mal.
        null,
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
 * El pie del horario: qué fuente se está publicando y si está en vigor.
 *
 * Las dos cosas vienen decididas de `metroDeLaPortada` —el origen y la vigencia—
 * y aquí sólo se escriben. Antes esta función daba por hecho que la fuente era
 * siempre la tabla transcrita y recalculaba la caducidad con su propio
 * `Date.now()`: llamaba «horario transcrito» a un feed en cuanto el GTFS podía
 * ganar, y eran dos sitios decidiendo lo mismo.
 *
 * Lo que no cambia es el motivo de fondo: «válido hasta 2025-12-31» impreso en
 * 2026 se lee como la garantía de un horario que caducó hace meses, así que un
 * horario fuera de vigencia se publica diciendo que es de REFERENCIA en vez de
 * citar una fecha ya pasada como si valiera.
 */
function fuenteDelHorario(metro, t) {
  // El pie nombra la fuente que se está publicando, no una fija: desde que
  // `metroDeLaPortada` puede elegir el GTFS, decir «horario transcrito» siempre
  // era llamar transcripción a un feed. Y la vigencia viene ya decidida por el
  // selector; recalcularla aquí con otro `Date.now()` serían dos sitios para una
  // sola regla, que es como en este repo se queda una rancia.
  //
  // Y las frases, del catálogo. Esta función no está en el JSX, así que un pase
  // que sólo mirase los rótulos de fila habría dejado el pie del metro entero en
  // castellano en la portada valenciana (#19). «FGV GTFS» no se traduce: es el
  // nombre del feed.
  const nombre = metro.origen === 'gtfs' ? 'FGV GTFS' : t('vivo.horario.transcrito')
  if (metro.vigencia === VIGENCIA.referencia) {
    const año = metro.validoHasta ? ` (${String(metro.validoHasta).slice(0, 4)})` : ''
    return rellena(t('vivo.horario.referencia'), { fuente: `${nombre}${año}` })
  }
  return rellena(t('vivo.horario.valido'), { fuente: nombre, fecha: metro.validoHasta })
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
