/**
 * El chip «Hoy» de la cabecera de la portada: uno, con el tiempo, el aire y el
 * metro dentro.
 *
 * Antes eran tres pastillas seguidas, y la revisión de la lámina lo llamaba por
 * su nombre: tres entradas compitiendo en la misma fila y ninguna ganando. Ahora
 * hay una, y el detalle va entero dentro, en tres secciones con nombre.
 *
 * El panel no cuelga de la tira que se desliza, y eso se fija aquí: la tira
 * lleva `overflow-x: auto` para poder deslizarse en estrecho, y una caja con
 * overflow distinto de visible recorta a todo descendiente cuyo bloque
 * contenedor esté dentro de ella (CSS 2.1 §11.1.1), que es lo que hacía que el
 * detalle no se viera NUNCA. Un panel recortado conserva su rectángulo, así que
 * medirlo con getBoundingClientRect no lo delata: lo delata mirar quién contiene
 * a quién. La otra mitad —que en la página haya píxeles ahí— la mide el e2e con
 * elementFromPoint.
 *
 * El patrón es el desplegable de la APG: aria-expanded + aria-controls, el panel
 * en el DOM aunque esté oculto, y Escape cierra esté donde esté el foco.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'

import { Vivo } from '../../src/variants/direction-d/Vivo'
import { CATALOGUE, LocaleProvider } from '../../src/i18n'

/** Open-Meteo y el horario del metro, servidos por URL y no por ruta exacta:
 *  las dos primeras llevan query, y fijarla aquí ataría la prueba a los
 *  parámetros que el hook pida hoy. */
function sirveLoVivo({ validThrough = '2026-12-31' } = {}) {
  const clima = {
    current: {
      temperature_2m: 21.4,
      apparent_temperature: 20.8,
      weather_code: 2,
      relative_humidity_2m: 54,
      wind_speed_10m: 12.2,
    },
    daily: {
      temperature_2m_min: [14.1, 13.2],
      temperature_2m_max: [26.3, 25.1],
      precipitation_probability_max: [10],
      sunrise: ['2026-09-13T07:41'],
      sunset: ['2026-09-13T20:29'],
    },
  }
  const aire = {
    current: { european_aqi: 24, pm2_5: 7.1, pm10: 12.4, nitrogen_dioxide: 8.2, ozone: 61.3 },
    hourly: { pm2_5: Array.from({ length: 30 }, (_, i) => 5 + (i % 4)) },
  }
  const horario = {
    generatedAt: '2026-09-13T00:00:00.000Z',
    source: { feed: 'Metrovalencia (FGV) GTFS static' },
    validThrough,
    stops: {
      'riba-roja-de-turia': {
        id: 'riba-roja-de-turia',
        label: 'Riba-roja de Túria',
        line: 'L9',
        lines: {
          L9: {
            directions: [
              {
                heading: 'València',
                departures: {
                  weekday: ['06:06', '06:36', '23:36'],
                  saturday: ['07:06'],
                  sunday: ['07:36'],
                },
              },
            ],
          },
        },
      },
    },
  }
  return vi.fn(async (input) => {
    const url = String(input)
    const cuerpo = url.includes('air-quality')
      ? aire
      : url.includes('open-meteo')
        ? clima
        : url.includes('metro-schedule')
          ? horario
          : {}
    return new Response(JSON.stringify(cuerpo), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  })
}

const panelDe = (boton) => document.getElementById(boton.getAttribute('aria-controls'))
/** La tira que se desliza: la que recorta si algo cuelga de ella. */
const tira = () => document.querySelector('[data-vivo-tira]')
const chipHoy = (idioma = 'es') =>
  screen.findByRole('button', { name: CATALOGUE[idioma]['vivo.hoy.aria'] })

describe('Vivo — el chip «Hoy» y su detalle', () => {
  beforeEach(() => {
    globalThis.fetch = sirveLoVivo()
    // Con `shouldAdvanceTime` para que las esperas de RTL no se queden colgadas
    // cuando una prueba congela el reloj.
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date('2026-09-14T12:14:00'))
  })

  afterEach(() => {
    // Si una prueba falla después de congelar el reloj, dejarlo congelado
    // envenena las siguientes: restaurar va en afterEach, no al final del test.
    vi.useRealTimers()
  })

  it('es UN chip, cerrado, y dice qué panel abre', async () => {
    render(<Vivo />)
    const b = await chipHoy()
    expect(b).toHaveAttribute('aria-expanded', 'false')
    // El botón controla un panel que EXISTE: un aria-controls colgante es un
    // botón que no dice qué abre.
    expect(panelDe(b), 'el panel de «Hoy»').not.toBeNull()
    expect(panelDe(b)).not.toBeVisible()
    // Y es uno solo: los tres de antes competían en la misma fila.
    expect(document.querySelectorAll('.cp-vivo-chip')).toHaveLength(1)
  })

  it('el chip dice la temperatura y los minutos, sin dejar ningún hueco escrito', async () => {
    render(<Vivo />)
    const b = await chipHoy()
    expect(b.textContent).toContain('Hoy · 21° · L9 ')
    expect(b.textContent).toMatch(/L9 \d+ min/)
    // La comprobación que importa: una llave sin sustituir es lo que /empleo
    // publicó una vez («sobre 24 de {total} ofertas»).
    expect(b.textContent, 'llega un hueco sin rellenar al lector').not.toContain('{')
  })

  it('el panel NO cuelga de la tira que se desliza', async () => {
    // La prueba de que el recorte no puede volver: si el panel vuelve a estar
    // dentro de la tira, esto se cae aunque en pantalla parezca correcto.
    render(<Vivo />)
    const b = await chipHoy()
    fireEvent.click(b)
    const panel = panelDe(b)
    expect(panel).toBeVisible()
    expect(tira(), 'la tira deslizante').not.toBeNull()
    expect(tira().contains(panel), 'el panel cuelga de la tira: volvería a recortarse').toBe(false)
  })

  it('pulsar otra vez cierra: el chip alterna', async () => {
    // Con tres chips esto era «abrir uno cierra el anterior». Con uno, la
    // garantía que queda —y que sigue importando— es que el mismo botón cierra
    // lo que abrió, en vez de dejar el panel colgado.
    render(<Vivo />)
    const b = await chipHoy()
    fireEvent.click(b)
    expect(b).toHaveAttribute('aria-expanded', 'true')
    fireEvent.click(b)
    expect(b).toHaveAttribute('aria-expanded', 'false')
    expect(panelDe(b)).not.toBeVisible()
  })

  it('el detalle trae las tres secciones, cada una con su nombre', async () => {
    // Juntar tres chips en uno no puede perder lo que decían: cada fuente tiene
    // su sección con nombre, que es lo que un lector de pantalla anuncia al
    // entrar. Cerradas no cuentan: `hidden` las saca del árbol de accesibilidad.
    render(<Vivo />)
    const b = await chipHoy()
    expect(screen.queryAllByRole('group'), 'cerrado no hay secciones').toHaveLength(0)
    fireEvent.click(b)
    for (const clave of ['vivo.hoy.tiempo', 'vivo.hoy.aire', 'vivo.hoy.metro']) {
      expect(
        screen.getByRole('group', { name: CATALOGUE.es[clave] }),
        `falta la sección ${clave}`,
      ).toBeInTheDocument()
    }
  })

  it('Escape cierra y devuelve el foco al chip', async () => {
    render(<Vivo />)
    const b = await chipHoy()
    fireEvent.click(b)
    // Pinchar un botón en un navegador LO ENFOCA; `fireEvent.click` no mueve el
    // foco, así que aquí se enfoca a mano. Sin esto la prueba estaría midiendo
    // una situación que en pantalla no ocurre.
    b.focus()
    fireEvent.keyDown(panelDe(b), { key: 'Escape' })
    expect(b).toHaveAttribute('aria-expanded', 'false')
    expect(document.activeElement).toBe(b)
  })

  it('Escape cierra aunque el foco se haya quedado en el body', async () => {
    // El defecto que esto fija, y que no veía ninguna prueba: con un `onKeyDown`
    // de React en el envoltorio, la tecla sólo llega si el evento BURBUJEA desde
    // el nodo enfocado. Quien abre el detalle y pincha su texto —un div, no
    // enfocable— deja el foco en el body, que no cuelga del envoltorio, así que
    // Escape no cerraba nada. En Safari es peor: un clic no enfoca al botón, y
    // entonces no cerraba ni abriendo y pulsando Escape. El oyente va en
    // `document`, como el de la barra de secciones.
    render(<Vivo />)
    const b = await chipHoy()
    fireEvent.click(b)
    b.blur()
    expect(document.activeElement).toBe(document.body)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(b).toHaveAttribute('aria-expanded', 'false')
    expect(panelDe(b)).not.toBeVisible()
  })

  it('la sección del aire trae su serie de PM₂.₅', async () => {
    render(<Vivo />)
    const b = await chipHoy()
    fireEvent.click(b)
    const panel = panelDe(b)
    expect(panel.textContent).toContain('PM₂.₅')
    // La chispa de las últimas 24 h es contenido publicado, no adorno: si se cae
    // al reorganizar la cabecera, esto lo dice.
    expect(panel.querySelector('svg path'), 'la serie de PM₂.₅').not.toBeNull()
  })

  it('sin tiempo ni aire, el chip no dice «°» y esas secciones no se pintan', async () => {
    // Los hooks devuelven data: null ante cualquier fallo, y la cabecera no
    // publica un cero que parezca una medición. El metro sigue: es cálculo puro.
    globalThis.fetch = vi.fn(async () => new Response('nope', { status: 500 }))
    render(<Vivo />)
    const b = await chipHoy()
    expect(b.textContent).toContain('Hoy · L9 ')
    expect(b.textContent, 'un grado sin temperatura detrás').not.toContain('°')
    expect(b.textContent).not.toContain('{')
    fireEvent.click(b)
    expect(screen.queryByRole('group', { name: CATALOGUE.es['vivo.hoy.tiempo'] })).toBeNull()
    expect(screen.queryByRole('group', { name: CATALOGUE.es['vivo.hoy.aire'] })).toBeNull()
    expect(screen.getByRole('group', { name: CATALOGUE.es['vivo.hoy.metro'] })).toBeInTheDocument()
  })

  it('un 200 con el cuerpo vacío tampoco pinta cifra: un «°» a secas no es una medición', async () => {
    // Un fallo no es lo único que deja sin dato. Los hooks devuelven `data: null`
    // ante un error, pero ante un 200 con un cuerpo bien formado y SIN lectura
    // —un renombre en la API, que Open-Meteo ya hizo una vez con `current`, o un
    // intermediario que contesta «{}»— dejan todos los campos a `null`, y el chip
    // pintaba «🌤 °» como si fuera una medida. Un centinela no es un valor.
    globalThis.fetch = vi.fn(async () => new Response('{}', { status: 200 }))
    render(<Vivo />)
    const b = await chipHoy()
    expect(b.textContent).not.toContain('°')
    expect(b.textContent).toContain('Hoy · L9 ')
  })

  it('el metro publica el horario EN VIGOR, no el GTFS caducado', async () => {
    // El defecto que estaba publicado: la cabecera prefería el GTFS por el mero
    // hecho de que trajera salida, y el feed de FGV declara `validThrough:
    // 2025-12-31` desde hace meses.
    //
    // El reloj va CONGELADO a las 05:00 de un lunes a propósito. A esa hora las
    // dos fuentes dan horas distintas —la transcripción 05:51, el GTFS del banco
    // 06:06— y por eso las dos aserciones significan algo. Con el reloj de verdad
    // la negativa se cumplía sola: medido, 06:06 sólo es la siguiente salida del
    // banco durante una hora de las veinticuatro, así que por la tarde la prueba
    // pasaba sin que el arreglo estuviera puesto.
    vi.setSystemTime(new Date('2026-09-14T05:00:00'))
    globalThis.fetch = sirveLoVivo({ validThrough: '2025-12-31' })
    render(<Vivo />)
    const b = await chipHoy()
    fireEvent.click(b)
    const panel = panelDe(b)
    expect(panel.textContent, 'no se está pintando la hora en vigor').toContain('05:51')
    expect(panel.textContent, 'se está pintando la hora del GTFS caducado').not.toContain('06:06')
    expect(panel.textContent).toContain('válido hasta 2026-12-31')
  })

  it('y cuando el GTFS SÍ está en vigor, manda el GTFS (el control)', async () => {
    // La ablación de la prueba de arriba: si «no pinta 06:06» se cumpliera sola,
    // aquí tampoco aparecería. Y sin este control, preferir siempre la
    // transcripción pasaría por arreglo, y el día que FGV republique seguiríamos
    // leyendo una tabla escrita a mano.
    vi.setSystemTime(new Date('2026-09-14T05:00:00'))
    globalThis.fetch = sirveLoVivo({ validThrough: '2027-06-30' })
    render(<Vivo />)
    const b = await chipHoy()
    fireEvent.click(b)
    const panel = panelDe(b)
    expect(panel.textContent, 'el GTFS en vigor tendría que mandar').toContain('06:06')
    expect(panel.textContent).not.toContain('05:51')
    expect(panel.textContent).toContain('FGV GTFS')
  })
})

describe('Vivo — en valencià se lee en valencià', () => {
  // El motivo de mudar las etiquetas del tiempo y del aire al catálogo: vivían
  // escritas dentro de los hooks, así que la portada en valencià las pintaba en
  // castellano y nadie se enteraba, porque el catálogo cae al castellano cuando
  // falta una clave y aquí ni siquiera había clave que faltara.
  const pinta = (idioma) => {
    localStorage.setItem('cp:lang', idioma)
    globalThis.fetch = sirveLoVivo()
    return render(
      <LocaleProvider>
        <Vivo />
      </LocaleProvider>,
    )
  }

  beforeEach(() => {
    localStorage.clear()
  })

  it('el chip, el cielo y la banda del aire salen traducidos', async () => {
    // El código 2 del clima que sirve el banco es «Parcialment ennuvolat», y el
    // EAQI 24 cae en «Raonable». Ninguna de las dos se parece a su castellano,
    // así que esto no puede pasar por casualidad.
    pinta('ca')
    const b = await chipHoy('ca')
    expect(b.textContent).toContain('Hui · 21°')
    fireEvent.click(b)
    const panel = panelDe(b)
    expect(panel.textContent).toContain(CATALOGUE.ca['vivo.wmo.2'])
    expect(panel.textContent).toContain(CATALOGUE.ca['vivo.aqi.razonable'])
    expect(panel.textContent).not.toContain(CATALOGUE.es['vivo.aqi.razonable'])
  })

  it('y en castellano, en castellano (el control)', async () => {
    // Sin este control, «sale en valencià» lo cumpliría un componente que
    // pintara valencià siempre.
    pinta('es')
    const b = await chipHoy('es')
    expect(b.textContent).toContain('Hoy · 21°')
    fireEvent.click(b)
    const panel = panelDe(b)
    expect(panel.textContent).toContain(CATALOGUE.es['vivo.aqi.razonable'])
    expect(panel.textContent).not.toContain(CATALOGUE.ca['vivo.aqi.razonable'])
  })
})
