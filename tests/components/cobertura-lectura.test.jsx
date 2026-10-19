import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

import { installFetchMock } from '../setup/mockFetch'
import Cobertura from '../../src/pages/Cobertura'
import { CATALOGUE } from '../../src/i18n'
import {
  MOTIVOS_DE_RETENCION,
  MOTIVO_DE_RETENCION_ETIQUETA,
} from '../../src/scraper/claim-public-gate'

/**
 * Lo que /laboratorio/cobertura le decía al lector y no era cierto, medido
 * sobre la página publicada el 19-10-2026:
 *
 *   1. que la puerta editorial retiene «por dos motivos distintos», cuando la
 *      mayor parte de lo retenido eran acusaciones opinativas y acusaciones de
 *      hecho que sí nombran un corpus sin un dato detrás;
 *   2. unas píldoras de pasadas que sumaban 563 al lado de un «no consta» de
 *      871, con un texto que daba a entender que eran las mismas filas;
 *   3. los temas y los corpus por su identificador (`medio-ambiente`,
 *      `tenders`) habiendo rótulo en el catálogo;
 *   4. «Todavía no lo hemos pedido» mientras el registro de solicitudes cargaba,
 *      o si no se podía leer;
 *   5. el día de hoy en UTC, que entre las 22:00 y las 24:00 de Madrid es ayer.
 *
 * Cifras distintas entre sí a propósito, para que ninguna se confunda con otra.
 */
const CELDA = { total: 40, sinCorpus: 11, comprobadoSinHallar: 16, noConsta: 13 }
const POR_MOTIVO = {
  'sin-procedencia': 2,
  retirada: 0,
  contradicho: 0,
  'acusacion-opinativa': 1202,
  'acusacion-cotejada-sin-respaldo': 1051,
  'acusacion-sin-corpus': 147,
  'acusacion-no-consta': 304,
}
const MANIFIESTO = {
  generatedAt: '2026-10-19T00:00:00.000Z',
  version: '1',
  plenos: [],
  totals: {
    items: 40,
    plenos: 1,
    byVerdict: { 'sin-datos': 40 },
    cobertura: {
      porTipo: { afirmacion_numerica: CELDA },
      porTema: {
        'medio-ambiente': { total: 30, sinCorpus: 8, comprobadoSinHallar: 12, noConsta: 10 },
        other: { total: 10, sinCorpus: 3, comprobadoSinHallar: 4, noConsta: 3 },
      },
      corpus: { tenders: 16, bdns: 5, 'verdict-engine': 6, 'curator-downgrade': 3 },
      pasadas: {
        porMarca: {
          'verdict-engine': { filas: 10, noConsta: 10 },
          'curator-downgrade': { filas: 3, noConsta: 3 },
          'curator-upgrade': { filas: 7, noConsta: 0 },
        },
        filas: 20,
        noConsta: 13,
        noConstaSinMarca: 0,
      },
      porClaseDocumental: { porClase: { acta: 4 }, sinDocumento: 7, total: 11 },
    },
    retenidas: { acusacion_publica: 2704, cita_convenio: 2 },
    retenidasPorMotivo: POR_MOTIVO,
    retenidasSinProcedencia: 2,
    retiradas: {},
    sinDatosPorque: { sinCorpus: 11, comprobadoSinHallar: 16, noConsta: 13 },
  },
}

const REGISTRO_VACIO = { version: 1, generatedAt: null, items: [] }

function pintar(solicitudes = REGISTRO_VACIO) {
  installFetchMock({
    '/data/pleno-claims/index.json': MANIFIESTO,
    '/data/solicitudes-acceso.json': solicitudes,
  })
  return render(
    <MemoryRouter>
      <Cobertura />
    </MemoryRouter>,
  )
}

/** La tarjeta del universo, por su título. */
async function tarjetaDelUniverso() {
  return (await screen.findByRole('heading', { name: 'De qué universo habla esto' })).parentElement
}

afterEach(() => {
  vi.useRealTimers()
})

describe('/laboratorio/cobertura · por qué retiene la puerta, contado', () => {
  it('no recita «dos motivos»: lista los del manifiesto con su cifra', async () => {
    pintar()
    const tarjeta = await tarjetaDelUniverso()
    expect(tarjeta.textContent).not.toMatch(/dos motivos/)
    const items = within(tarjeta)
      .getAllByRole('listitem')
      .map((li) => li.textContent)
    let evaluados = 0
    for (const motivo of MOTIVOS_DE_RETENCION) {
      const n = POR_MOTIVO[motivo]
      const linea = items.find((t) => t.includes(MOTIVO_DE_RETENCION_ETIQUETA[motivo]))
      if (n === 0) {
        // Un motivo a cero no ocupa una línea: no hay nada retenido por él.
        expect(linea, motivo).toBeUndefined()
        continue
      }
      expect(linea, motivo).toBeDefined()
      expect(linea).toContain(n.toLocaleString('es-ES'))
      evaluados += 1
    }
    expect(evaluados).toBe(5)
  })

  it('el total que dice retener es la suma del reparto, no una cifra aparte', async () => {
    pintar()
    const tarjeta = await tarjetaDelUniverso()
    const total = Object.values(POR_MOTIVO).reduce((a, n) => a + n, 0)
    expect(tarjeta.textContent).toContain(total.toLocaleString('es-ES'))
  })

  it('sin reparto en el manifiesto lo dice, y no inventa motivos', async () => {
    const { retenidasPorMotivo: _fuera, ...sinReparto } = MANIFIESTO.totals
    installFetchMock({
      '/data/pleno-claims/index.json': { ...MANIFIESTO, totals: sinReparto },
      '/data/solicitudes-acceso.json': REGISTRO_VACIO,
    })
    render(
      <MemoryRouter>
        <Cobertura />
      </MemoryRouter>,
    )
    const tarjeta = await tarjetaDelUniverso()
    expect(tarjeta.textContent).toMatch(/no trae por qué/)
    for (const motivo of MOTIVOS_DE_RETENCION) {
      expect(tarjeta.textContent).not.toContain(MOTIVO_DE_RETENCION_ETIQUETA[motivo])
    }
  })
})

describe('/laboratorio/cobertura · las pasadas cuadran con «no consta»', () => {
  it('cada píldora cuenta las filas con su marca, no sólo las de la lista', async () => {
    pintar()
    const titulo = await screen.findByText('Pasadas de revisión (no son fuentes)')
    const tarjeta = titulo.parentElement
    // `corpus['verdict-engine']` es 6; las filas con su marca, 10.
    expect(tarjeta.textContent).toMatch(/verdict-engine\s*10/)
    expect(tarjeta.textContent).not.toMatch(/verdict-engine\s*6\b/)
  })

  it('el puente entre las píldoras y «no consta» se dice con cifras del manifiesto', async () => {
    pintar()
    const titulo = await screen.findByText('Pasadas de revisión (no son fuentes)')
    const texto = titulo.parentElement.textContent
    // 13 de «no consta», las 13 con marca; 7 filas con marca nombran además un corpus.
    expect(texto).toMatch(/13 declaraciones de «no consta»/)
    expect(texto).toMatch(/7 filas con marca/)
  })
})

describe('/laboratorio/cobertura · rótulos, no identificadores', () => {
  it('los temas con su nombre del catálogo', async () => {
    pintar()
    const tabla = (await screen.findByRole('heading', { name: 'Por tema' })).parentElement
    const filas = within(tabla)
      .getAllByRole('row')
      .slice(1)
      .map((r) => within(r).getAllByRole('cell')[0].textContent)
    expect(filas).toEqual([
      CATALOGUE.es['declaraciones.tema.medio-ambiente'],
      CATALOGUE.es['declaraciones.tema.other'],
    ])
  })

  it('los corpus con su nombre del catálogo', async () => {
    pintar()
    const titulo = await screen.findByRole('heading', { name: 'Contra qué se coteja' })
    const texto = titulo.parentElement.textContent
    expect(texto).toContain(CATALOGUE.es['ledger.corpus.tenders'])
    expect(texto).toContain(CATALOGUE.es['ledger.corpus.bdns'])
    expect(texto).not.toMatch(/\btenders\b/)
  })
})

describe('/laboratorio/cobertura · el registro de solicitudes', () => {
  /** El texto de la tarjeta de solicitudes, una vez pintada su tabla. */
  async function textoDeSolicitudes() {
    const cabecera = await screen.findByRole('columnheader', { name: 'Estado' })
    return cabecera.closest('table').textContent
  }

  it('mientras carga no dice «Todavía no lo hemos pedido»', async () => {
    installFetchMock({ '/data/pleno-claims/index.json': MANIFIESTO })
    const base = globalThis.fetch
    globalThis.fetch = vi.fn((input) =>
      String(input).includes('solicitudes-acceso') ? new Promise(() => {}) : base(input),
    )
    render(
      <MemoryRouter>
        <Cobertura />
      </MemoryRouter>,
    )
    const texto = await textoDeSolicitudes()
    expect(texto).not.toMatch(/Todavía no lo hemos pedido/)
    expect(texto).toMatch(/Cargando/)
  })

  it('si no se puede leer, dice que no consta en vez de «sin pedir»', async () => {
    installFetchMock({ '/data/pleno-claims/index.json': MANIFIESTO })
    const base = globalThis.fetch
    globalThis.fetch = vi.fn(async (input) =>
      String(input).includes('solicitudes-acceso')
        ? new Response('fallo', { status: 500 })
        : base(input),
    )
    render(
      <MemoryRouter>
        <Cobertura />
      </MemoryRouter>,
    )
    await screen.findByText(/No se ha podido leer el registro de solicitudes/)
    const texto = await textoDeSolicitudes()
    expect(texto).not.toMatch(/Todavía no lo hemos pedido/)
    expect(texto).not.toMatch(/sin pedir/)
    expect(texto).toMatch(/no consta/)
  })

  it('un registro vacío (404) sigue siendo «sin pedir»: es un registro, no un fallo', async () => {
    installFetchMock({ '/data/pleno-claims/index.json': MANIFIESTO })
    render(
      <MemoryRouter>
        <Cobertura />
      </MemoryRouter>,
    )
    await screen.findAllByText('Todavía no lo hemos pedido.')
  })

  it('el día de hoy es el de Madrid: a las 00:30 del 20, el plazo del 19 ya venció', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    // 22:30 UTC del 19 = 00:30 del 20 en Madrid (CEST, +02:00).
    vi.setSystemTime(new Date('2026-10-19T22:30:00.000Z'))
    pintar({
      version: 1,
      generatedAt: '2026-09-19T10:00:00.000Z',
      items: [
        {
          id: 'prueba-acta',
          clase: 'acta',
          titulo: 'prueba',
          presentadaEl: '2026-09-19',
          registro: 'prueba',
          respuesta: null,
          reclamacion: null,
        },
      ],
    })
    const texto = await textoDeSolicitudes()
    expect(texto).toMatch(/Venció el plazo el 2026-10-19/)
  })
})
