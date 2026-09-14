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
import { fireEvent, render, screen, waitFor } from '@testing-library/react'

import { Vivo } from '../../src/variants/direction-d/Vivo'
import { CATALOGUE, LocaleProvider } from '../../src/i18n'
import { detectorDeCastellano, loQueSeLee, SOLO_CASTELLANO } from '../setup/castellano'

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

/**
 * El chip, con la cabecera ya pintada después de que contesten sus TRES fuentes
 * —bien o mal—.
 *
 * `findByRole` devuelve en cuanto existe el botón, y eso ocurre en el primer
 * pintado: el metro transcrito es cálculo puro, así que el chip sale enseguida
 * con la plantilla «sin tiempo», antes de que Open-Meteo y el horario contesten.
 * Comprobar ahí la temperatura, el aire o el GTFS es comprobar una pantalla que
 * aún no ha llegado, y el resultado dependía de si el render con los datos caía
 * antes o después de la aserción — con la suite entera en marcha, a veces caía
 * después. Medido retrasando 150 ms las respuestas del banco: caían cuatro
 * pruebas de este fichero (la temperatura, las tres secciones, la serie del aire
 * y el GTFS en vigor).
 *
 * Esperar a la temperatura habría arreglado las que la esperan, y no las que
 * comprueban que algo NO se pinta. Una ausencia afirmada en el primer pintado se
 * cumple sola, pase lo que pase después: con las respuestas retrasadas, «sin
 * tiempo ni aire» y «un 200 vacío no pinta cifra» seguían en verde sin haber
 * visto llegar nada, y ahí no hay nada positivo a lo que esperar. Por eso se
 * espera a que la cabecera deje de decir que carga (`data-vivo-cargando`, en
 * `Vivo.jsx`), y sólo entonces se afirma lo que haya que afirmar, en las dos
 * direcciones.
 */
async function chipAsentado(idioma = 'es') {
  const b = await chipHoy(idioma)
  await waitFor(() =>
    expect(
      document.querySelector('.cp-vivo'),
      'la cabecera sigue esperando a alguna de sus tres fuentes',
    ).not.toHaveAttribute('data-vivo-cargando'),
  )
  return b
}

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
    const b = await chipAsentado()
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
    const b = await chipAsentado()
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
    const b = await chipAsentado()
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
    //
    // Asentado, no en el primer pintado: ahí no hay «°» ni sección del tiempo
    // tanto si el 500 se maneja bien como si se maneja mal.
    globalThis.fetch = vi.fn(async () => new Response('nope', { status: 500 }))
    render(<Vivo />)
    const b = await chipAsentado()
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
    const b = await chipAsentado()
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
    // pasaba sin que el arreglo estuviera puesto. Y se afirma con el horario ya
    // cargado, por la misma razón: antes de que llegue, «no pinta 06:06» se
    // cumple sin que haya GTFS ninguno entre el que elegir.
    vi.setSystemTime(new Date('2026-09-14T05:00:00'))
    globalThis.fetch = sirveLoVivo({ validThrough: '2025-12-31' })
    render(<Vivo />)
    const b = await chipAsentado()
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
    const b = await chipAsentado()
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
    // Reloj de verdad, dicho aquí y no heredado: este bloque no congela nada.
    // (Se escribió creyendo que el «Hui · L9 851 min» de la suite completa era
    // un reloj falso heredado del bloque de arriba. No lo era: ese bloque
    // restaura el suyo en cada `afterEach` y cada fichero corre aislado. Era la
    // aserción, hecha antes de que llegara el tiempo, que es lo que espera ahora
    // `chipAsentado`.)
    vi.useRealTimers()
  })

  it('el chip, el cielo y la banda del aire salen traducidos', async () => {
    // El código 2 del clima que sirve el banco es «Parcialment ennuvolat», y el
    // EAQI 24 cae en «Raonable». Ninguna de las dos se parece a su castellano,
    // así que esto no puede pasar por casualidad.
    pinta('ca')
    const b = await chipAsentado('ca')
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
    const b = await chipAsentado('es')
    expect(b.textContent).toContain('Hoy · 21°')
    fireEvent.click(b)
    const panel = panelDe(b)
    expect(panel.textContent).toContain(CATALOGUE.es['vivo.aqi.razonable'])
    expect(panel.textContent).not.toContain(CATALOGUE.ca['vivo.aqi.razonable'])
  })
})

/**
 * El panel ENTERO en valencià: ningún rótulo, valor ni pie en castellano (#19).
 *
 * Al mudar al catálogo las etiquetas del tiempo y del aire, el resto del panel
 * quedó a medio traducir: «Sensación térmica», «Humedad», «Próximo tren»,
 * «Fuente», el aviso del mapa, los pies de Open-Meteo. Y lo que una lista de
 * rótulos no habría visto: el pie del metro lo arma una función que no está en
 * el JSX (`fuenteDelHorario`), y «Hacia València», «(terminus)» o el «ahora» de
 * la espera son VALORES, no rótulos.
 *
 * Así que la prueba no enumera cadenas. Pinta el mismo panel, con los mismos
 * datos y a la misma hora, en castellano y en valencià, y compara lo que se lee
 * posición a posición. Lo que se lee IGUAL en los dos idiomas es, o un dato que
 * no se traduce —una cifra, una unidad, una sigla—, o algo que no ha pasado por
 * el catálogo. Un rótulo nuevo escrito a mano cae aquí sin que nadie tenga que
 * acordarse de añadirlo a ninguna lista.
 *
 * Y una segunda mirada, porque la primera tiene un punto ciego que se midió: una
 * cadena que pega un trozo traducido a otro en castellano se lee DISTINTA en los
 * dos idiomas y pasaba. Con el pie de REFERENCIA reescrito a mano —«Horari
 * transcrit de fgv.es (2026) · horario de REFERENCIA, no vigente…», con el
 * nombre ya traducido delante— la comparación salió en verde. Así que además se
 * buscan, dentro de cada texto valenciano, las palabras que sólo usa el
 * castellano del catálogo («horario», «vigente», «hacia»), sacadas del propio
 * catálogo y no escritas aquí.
 *
 * No basta con que las claves existan: el catálogo cae al castellano cuando
 * falta una, así que una traducción olvidada no rompe nada, se lee castellano
 * en medio de la página valenciana y la suite sigue en verde.
 */
describe('Vivo — el panel entero en valencià, sin nada en castellano', () => {
  /**
   * Lo que puede leerse igual en los dos idiomas sin ser un olvido: contenido de
   * dato, que en esta casa se queda en su idioma (CLAUDE.md). Las siglas del
   * aire, la línea, el nombre del feed y las unidades. Es la lista de lo que NO
   * se traduce, que es corta y casi no cambia — no la de lo que sí.
   */
  const NO_SE_TRADUCE = [
    'EAQI',
    'PM₂.₅',
    'PM₁₀',
    'NO₂',
    'O₃',
    'FGV GTFS',
    'L9',
    'km/h',
    'µg/m³',
    'min',
  ]

  // El detector vive en tests/setup/castellano.js, que comparte con el bloque de
  // rendición de cuentas de la portada; aquí se ata a lo que este panel no traduce.
  const { sinTraducir, castellanoEn } = detectorDeCastellano(NO_SE_TRADUCE)

  /**
   * Cuatro horas, porque hay texto que sólo existe a según qué hora: la espera
   * «ahora», el tren «de mañana», el pie del GTFS y el de un horario que ya no
   * está en vigor. Cada escenario lleva la `marca` que demuestra que pintó su
   * rama: sin ella, uno que no la pintara pasaría sin haber comparado nada.
   */
  const ESCENARIOS = [
    {
      nombre: 'GTFS en vigor a mediodía',
      hora: '2026-09-14T12:14:00',
      validThrough: '2026-12-31',
      marca: 'FGV GTFS',
    },
    {
      nombre: 'el tren sale ahora',
      hora: '2026-09-14T06:06:00',
      validThrough: '2026-12-31',
      marca: `L9 ${CATALOGUE.es['vivo.hoy.ahora']}`,
    },
    {
      nombre: 'el próximo es de mañana, con la transcripción',
      hora: '2026-09-14T23:50:00',
      validThrough: '2026-12-31',
      marca: '05:51',
    },
    {
      nombre: 'ninguno en vigor: horario de referencia',
      hora: '2027-01-11T12:14:00',
      validThrough: '2025-12-31',
      marca: 'REFERENCIA',
    },
  ]

  beforeEach(() => {
    localStorage.clear()
    vi.useRealTimers()
  })

  afterEach(() => {
    // `setSystemTime` sin reloj falso sólo simula `Date`, y esto lo devuelve.
    vi.useRealTimers()
    localStorage.clear()
  })

  /** Lo que se lee en el chip y en su panel abierto, en un idioma y a una hora. */
  async function lee(idioma, { hora, validThrough }) {
    localStorage.setItem('cp:lang', idioma)
    vi.setSystemTime(new Date(hora))
    globalThis.fetch = sirveLoVivo({ validThrough })
    const vista = render(
      <LocaleProvider>
        <Vivo />
      </LocaleProvider>,
    )
    const b = await chipAsentado(idioma)
    fireEvent.click(b)
    const leido = [...loQueSeLee(b), ...loQueSeLee(panelDe(b))]
    vista.unmount()
    return leido
  }

  it('el detector distingue un rótulo sin traducir de un dato', () => {
    expect(sinTraducir([['Humedad', 'Humedad']])).toEqual(['Humedad'])
    expect(sinTraducir([['Humedad', 'Humitat']])).toEqual([])
    const datos = [
      '21°',
      '12 km/h',
      '7.1 µg/m³',
      '682 min',
      '↑ 07:41',
      'PM₂.₅',
      'FGV GTFS',
      'L9',
      '×',
    ]
    expect(sinTraducir(datos.map((d) => [d, d])), 'un dato no se traduce').toEqual([])
    // Igual en los dos idiomas, pero sale del catálogo: no es un olvido.
    const metro = [CATALOGUE.es['vivo.hoy.metro'], CATALOGUE.ca['vivo.hoy.metro']]
    expect(sinTraducir([metro])).toEqual([])
    // Y ni una sigla ni un nombre propio tapan la palabra que llevan al lado.
    expect(sinTraducir([['PM₂.₅ · últimas 24 h', 'PM₂.₅ · últimas 24 h']])).toHaveLength(1)
    expect(sinTraducir([['Hacia València', 'Hacia València']])).toHaveLength(1)
  })

  it('y ve el castellano pegado a un trozo traducido, que la comparación entera no ve', () => {
    // Mide algo: sin vocabulario que buscar, «no hay castellano» sería gratis.
    expect(SOLO_CASTELLANO.size).toBeGreaterThan(100)
    // El caso medido: el nombre ya en valencià delante y el resto escrito a mano.
    const mezcla = 'Horari transcrit de fgv.es (2026) · horario de REFERENCIA, no vigente'
    const suCastellano = mezcla.replace('Horari transcrit', 'Horario transcrito')
    expect(sinTraducir([[suCastellano, mezcla]]), 'la comparación entera no lo ve').toEqual([])
    expect(castellanoEn(mezcla)).toEqual(expect.arrayContaining(['horario', 'vigente']))
    // Y la traducción buena, con sus palabras compartidas, no da nada.
    const bien = CATALOGUE.ca['vivo.horario.referencia'].replace(
      '{fuente}',
      'Horari transcrit de fgv.es (2026)',
    )
    expect(castellanoEn(bien)).toEqual([])
    expect(castellanoEn('Cap a València · Riba-roja de Túria (final de línia)')).toEqual([])
  })

  it.each(ESCENARIOS)(
    '$nombre: en valencià no queda nada en castellano',
    async ({ marca, ...escenario }) => {
      const es = await lee('es', escenario)
      const ca = await lee('ca', escenario)
      expect(es.join(' · '), 'el escenario no ha pintado la rama que dice').toContain(marca)
      expect(es.length, 'hay poco texto que comparar').toBeGreaterThan(20)
      expect(ca.length, 'los dos idiomas no pintan la misma estructura').toBe(es.length)
      const pares = es.map((s, i) => [s, ca[i]])
      expect(sinTraducir(pares), 'se leen en castellano también en valencià').toEqual([])
      const mezclas = ca
        .map((s) => ({ s, castellano: castellanoEn(s) }))
        .filter((m) => m.castellano.length)
        .map((m) => `${m.s}  ←  ${m.castellano.join(', ')}`)
      expect(mezclas, 'palabras castellanas dentro de textos valencianos').toEqual([])
    },
  )
})
