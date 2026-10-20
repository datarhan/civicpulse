import { describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

import { installFetchMock } from '../setup/mockFetch'
import Cobertura from '../../src/pages/Cobertura'
import { CATALOGUE } from '../../src/i18n'

/**
 * Lo que /laboratorio/cobertura rotulaba de más, medido el 19-10-2026 sobre la
 * página publicada:
 *
 *   1. «SIN CORPUS QUE CONSULTAR 2074». Esa casilla cuenta las filas a las que
 *      el verificador no les lanzó NINGÚN comparador —ninguna traía importe, y
 *      su tipo no tiene comparador por objeto—, no las que no tienen corpus:
 *      el padrón, el paro, las votaciones y las actas de pleno están
 *      publicados en este mismo sitio. Y la página remataba que un tipo sin
 *      corpus es «hoy, imposible de comprobar aquí».
 *   2. «Declaraciones que dependen» de un documento, cuando lo que se cuenta es
 *      qué filas NOMBRAN ese tipo de documento, por su léxico.
 *   3. «DECLARACIONES PUBLICADAS 5112»: filas de extracción, con 291 que repiten
 *      el literal de otra de su sesión; y sin separador de miles.
 *
 * Cifras grandes y distintas entre sí, para que el separador se vea y ninguna
 * se confunda con otra.
 */
const CELDA = { total: 5112, sinCorpus: 2074, comprobadoSinHallar: 2167, noConsta: 871 }
const MANIFIESTO = {
  generatedAt: '2026-10-19T00:00:00.000Z',
  version: '1',
  plenos: [],
  totals: {
    items: 5112,
    literalesDistintos: 4821,
    plenos: 24,
    byVerdict: { 'sin-datos': 5086, parcial: 16, verificado: 10 },
    cobertura: {
      porTipo: { afirmacion_numerica: CELDA },
      porTema: { fiscal: CELDA },
      corpus: { tenders: 1645 },
      porClaseDocumental: {
        porClase: { acta: 3, 'informe-tecnico': 1203 },
        sinDocumento: 1779,
        apartadas: 40,
        total: 2074,
      },
    },
    retenidas: {},
    retenidasSinProcedencia: 0,
    sinDatosPorque: { sinCorpus: 2074, comprobadoSinHallar: 2141, noConsta: 871 },
  },
}

function pintar(manifiesto = MANIFIESTO) {
  installFetchMock({
    '/data/pleno-claims/index.json': manifiesto,
    '/data/solicitudes-acceso.json': { version: 1, generatedAt: null, items: [] },
  })
  return render(
    <MemoryRouter>
      <Cobertura />
    </MemoryRouter>,
  )
}

async function cifraBajo(rotulo) {
  const etiqueta = await screen.findByText(rotulo)
  return etiqueta.nextElementSibling?.textContent
}

describe('/laboratorio/cobertura · el rótulo dice lo que se mide', () => {
  it('la casilla sin anotaciones dice que no se lanzó ningún comparador', async () => {
    const { container } = pintar()
    expect(await cifraBajo('NINGÚN COMPARADOR SE LANZÓ')).toBe('2.074')
    expect(container.textContent).not.toMatch(/sin corpus que consultar/i)
    expect(container.textContent).not.toMatch(/imposible de comprobar/i)
  })

  it('dice que hay corpus publicados que ningún comparador lee todavía', async () => {
    const { container } = pintar()
    await screen.findByText('NINGÚN COMPARADOR SE LANZÓ')
    for (const corpus of [/padrón/, /paro/, /votaciones/, /actas de pleno/]) {
      expect(container.textContent).toMatch(corpus)
    }
  })

  it('las cifras de la cabecera llevan separador de miles', async () => {
    pintar()
    expect(await cifraBajo('FILAS DE EXTRACCIÓN PUBLICADAS')).toBe('5.112')
    expect(await cifraBajo('COTEJADAS CONTRA ALGÚN CORPUS')).toBe('2.167')
    expect(await cifraBajo('NO CONSTA QUÉ SE CONSULTÓ')).toBe('871')
  })

  it('dice cuántos literales distintos son las filas', async () => {
    const { container } = pintar()
    await screen.findByText('FILAS DE EXTRACCIÓN PUBLICADAS')
    expect(container.textContent).toMatch(/4\.821 literales distintos/)
  })

  it('sin el recuento de literales no se inventa uno', async () => {
    const sin = { ...MANIFIESTO, totals: { ...MANIFIESTO.totals } }
    delete sin.totals.literalesDistintos
    const { container } = pintar(sin)
    await screen.findByText('FILAS DE EXTRACCIÓN PUBLICADAS')
    expect(container.textContent).not.toMatch(/literales distintos/)
  })

  it('las tablas llevan separador de miles y la columna nueva', async () => {
    pintar()
    const tabla = (await screen.findByRole('heading', { name: 'Por tipo de declaración' }))
      .parentElement
    expect(within(tabla).getByRole('columnheader', { name: 'Sin comparador' })).toBeTruthy()
    const celdas = within(within(tabla).getAllByRole('row')[1])
      .getAllByRole('cell')
      .map((c) => c.textContent)
    expect(celdas.slice(1, 5)).toEqual(['5.112', '2.167', '2.074', '871'])
  })

  it('/declaraciones y /plenos dicen lo mismo en los dos idiomas', () => {
    // La casilla viaja a otras dos páginas por el catálogo: «Sin corpus que
    // consultar», «no tenían corpus donde buscar», y sus versiones en valencià.
    const CLAVES = [
      'declaraciones.filter.sinCorpus',
      'declaraciones.split.sinCorpus',
      'plenos.indice.decl.sinCorpus',
    ]
    let evaluadas = 0
    for (const locale of ['es', 'ca']) {
      for (const k of CLAVES) {
        const texto = CATALOGUE[locale][k]
        expect(texto, `${locale}:${k}`).toMatch(/comparador/i)
        expect(texto, `${locale}:${k}`).not.toMatch(/corpus/i)
        evaluadas += 1
      }
      // Y el párrafo que lo explica ya no dice que «aún no tenemos ese corpus».
      expect(CATALOGUE[locale]['declaraciones.split.cuerpo']).toMatch(/comparador/i)
      expect(CATALOGUE[locale]['declaraciones.split.cuerpo']).not.toMatch(
        /no tenemos ese corpus|no tenim eixe corpus/i,
      )
    }
    expect(evaluadas).toBe(6)
  })

  it('la columna de documentos cuenta las que NOMBRAN el tipo, no las que dependen', async () => {
    const { container } = pintar()
    const cabecera = await screen.findByRole('columnheader', {
      name: 'Declaraciones que nombran ese tipo de documento',
    })
    expect(cabecera).toBeTruthy()
    expect(container.textContent).not.toMatch(/Declaraciones que dependen/)
    const fila = screen.getByRole('row', { name: /Informes técnicos/ })
    expect(within(fila).getAllByRole('cell')[1].textContent).toBe('1.203')
  })
})
