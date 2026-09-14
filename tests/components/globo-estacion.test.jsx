/**
 * El globo de estación del mapa pregunta por la VIGENCIA, no por la presencia.
 *
 * Antes hacía «si el GTFS contesta, el GTFS», que es exactamente lo que hacía la
 * cabecera hasta que `metroDeLaPortada` empezó a elegir por vigencia. Con las dos
 * reglas separadas el sitio se contradecía a sí mismo: el feed de FGV declara
 * `validThrough: 2025-12-31` desde que dejaron de republicarlo, así que a las
 * 22:55 de un laborable la cabecera decía 22:51 —de la tabla en vigor— y este
 * globo 23:02, del horario caducado. Y el panel de la cabecera manda al lector a
 * pulsar precisamente estas estaciones en el mapa.
 *
 * La estación se busca con `findMetroStation`, importada: copiar aquí la forma de
 * un `match` dejaría la prueba verde el día que esa forma cambie, que es la
 * primera regla de docs/DATA_INTEGRITY.md.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

import { StationSchedulePopup } from '../../src/components/LiveCity/popups/StationSchedulePopup'
import { findMetroStation } from '../../src/hooks/useNextMetro'
import { LocaleProvider } from '../../src/i18n'
import { detectorDeCastellano, loQueSeLee } from '../setup/castellano'

const NOMBRE = 'Riba-roja de Túria'
/** La firma de que se ha pintado el globo del GTFS y no el de la transcripción. */
const FIRMA_GTFS = /FGV GTFS/

function sirveGtfs(validThrough) {
  return vi.fn(
    async () =>
      new Response(
        JSON.stringify({
          generatedAt: '2026-09-14T00:00:00.000Z',
          source: { feed: 'Metrovalencia (FGV) GTFS static' },
          validThrough,
          stops: {
            'riba-roja-de-turia': {
              id: 'riba-roja-de-turia',
              label: NOMBRE,
              line: 'L9',
              lines: {
                L9: {
                  directions: [
                    {
                      heading: 'València',
                      departures: {
                        weekday: ['06:06', '13:02', '23:36'],
                        saturday: ['07:06'],
                        sunday: ['07:36'],
                      },
                    },
                  ],
                },
              },
            },
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
  )
}

const pinta = () =>
  render(
    <StationSchedulePopup
      name={NOMBRE}
      match={findMetroStation(NOMBRE)}
      rawStation={{ name: NOMBRE }}
    />,
  )

describe('el globo de estación elige por vigencia', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    // Lunes, con el GTFS real ya caducado desde hace meses.
    vi.setSystemTime(new Date('2026-09-14T12:00:00'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('el ancla existe: la estación se encuentra por su nombre de OSM', () => {
    // Sin esto, un `match` nulo mandaría las dos pruebas de abajo por la MISMA
    // rama y el par dejaría de distinguir nada.
    expect(findMetroStation(NOMBRE)).not.toBeNull()
    expect(findMetroStation(NOMBRE).kind).toBe('l9')
  })

  it('con el GTFS caducado NO se pinta el globo del GTFS', async () => {
    globalThis.fetch = sirveGtfs('2025-12-31')
    const { container } = pinta()
    // Se deja resolver el fetch antes de mirar: si no, «no hay GTFS» lo cumpliría
    // el primer render, con los datos aún en camino.
    await vi.waitFor(() => expect(container.textContent.length).toBeGreaterThan(0))
    expect(screen.queryByText(FIRMA_GTFS), 'se está sirviendo el horario de 2025').toBeNull()
  })

  it('y con el GTFS en vigor SÍ (el control)', async () => {
    // La ablación: sin esto, «no pinta el GTFS» lo cumpliría un globo que no lo
    // pinte nunca, y entonces el mapa se quedaría sin el dato de la fuente el día
    // que FGV republique.
    globalThis.fetch = sirveGtfs('2027-06-30')
    pinta()
    expect(await screen.findByText(FIRMA_GTFS)).toBeInTheDocument()
  })
})

/**
 * El globo y la portada dicen lo mismo del mismo horario, y en valencià.
 *
 * Tres sitios del globo decidían la vigencia por su cuenta: el del GTFS leía
 * «AAAA-MM-DD» como la medianoche UTC, y las dos tablas transcritas (L9 y L2)
 * decían «válido hasta» sin mirar la fecha. Cada instante lleva su desfase, así
 * que el fichero significa lo mismo en el reloj de Madrid y en el UTC de la CI.
 */
describe('el globo dice lo que dice la portada, y en valencià', () => {
  afterEach(() => {
    vi.useRealTimers()
    localStorage.clear()
  })
  const alas = (iso) => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date(iso))
  }
  const estacion = (nombre) =>
    render(
      <StationSchedulePopup
        name={nombre}
        match={findMetroStation(nombre)}
        rawStation={{ name: nombre }}
      />,
    )

  it('el último día de validez, el GTFS dice «válido hasta», no «referencia»', async () => {
    alas('2026-09-14T12:00:00+02:00')
    globalThis.fetch = sirveGtfs('2026-09-14')
    pinta()
    const pie = await screen.findByText(FIRMA_GTFS)
    expect(pie.textContent).toContain('válido hasta 2026-09-14')
    expect(pie.textContent).not.toMatch(/referencia/i)
  })

  it('la tabla transcrita caducada es REFERENCIA, no «válido hasta»', async () => {
    alas('2027-01-15T12:00:00+01:00')
    globalThis.fetch = sirveGtfs('2025-12-31')
    const { container } = pinta()
    await vi.waitFor(() => expect(container.textContent).toMatch(/Horario transcrito/))
    expect(container.textContent).toMatch(/REFERENCIA/)
    expect(container.textContent).not.toMatch(/válido hasta/i)
  })

  it('y en vigor sigue diciendo «válido hasta» (el control)', async () => {
    alas('2026-09-14T12:00:00+02:00')
    globalThis.fetch = sirveGtfs('2025-12-31')
    const { container } = pinta()
    await vi.waitFor(() => expect(container.textContent).toMatch(/Horario transcrito/))
    expect(container.textContent).toContain('válido hasta 2026-12-31')
  })

  it('la L2 caducada tampoco se anuncia vigente', async () => {
    alas('2027-01-15T12:00:00+01:00')
    globalThis.fetch = sirveGtfs('2025-12-31') // no trae «el-clot»: la L2 va por su tabla
    const { container } = estacion('El Clot')
    await vi.waitFor(() => expect(container.textContent).toMatch(/horario aproximado/i))
    expect(container.textContent).toMatch(/REFERENCIA/)
    expect(container.textContent).not.toMatch(/válido hasta/i)
  })

  const { castellanoEn } = detectorDeCastellano([
    'FGV GTFS',
    'FGV',
    'L9',
    'L2',
    'min',
    'fgv.es',
    'metrovalencia.es',
    'Metrovalencia',
    'Adif',
    'Renfe Cercanías València',
  ])
  const RAMAS = [
    {
      rama: 'GTFS en vigor',
      nombre: 'Riba-roja de Túria',
      validThrough: '2027-06-30',
      marca: 'FGV GTFS',
    },
    {
      rama: 'tabla transcrita de L9',
      nombre: 'Riba-roja de Túria',
      validThrough: '2025-12-31',
      marca: 'fgv.es',
    },
    { rama: 'L2 aproximada', nombre: 'El Clot', validThrough: '2025-12-31', marca: 'L2' },
    {
      rama: 'estación de Adif',
      nombre: 'Estació de Riba-roja',
      validThrough: '2025-12-31',
      marca: 'Adif',
    },
  ]

  it.each(RAMAS)(
    '$rama: en valencià no queda castellano',
    async ({ nombre, validThrough, marca }) => {
      alas('2026-09-14T12:00:00+02:00')
      localStorage.setItem('cp:lang', 'ca')
      globalThis.fetch = sirveGtfs(validThrough)
      const { container } = render(
        <LocaleProvider>
          <StationSchedulePopup
            name={nombre}
            match={findMetroStation(nombre)}
            rawStation={{ name: nombre }}
          />
        </LocaleProvider>,
      )
      // Pintó SU rama: sin la marca, una rama que no se pintara pasaría sin comparar nada.
      await vi.waitFor(() => expect(container.textContent).toContain(marca))
      const texto = loQueSeLee(container).join(' · ')
      expect(texto.length, 'hay poco texto que leer').toBeGreaterThan(40)
      expect(castellanoEn(texto)).toEqual([])
    },
  )
})
