import { describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

import { installFetchMock } from '../setup/mockFetch'
import Cobertura from '../../src/pages/Cobertura'
import { CLASES_PEDIBLES, CLASE_ETIQUETA } from '../../src/scraper/clase-documental'

/**
 * La tabla «Lo que hemos pedido» ponía `porClase[clase] ?? 0` en cada fila. Si
 * el manifiesto llega sin `porClaseDocumental` —el único que lo escribe,
 * `buildManifest`, siempre lo trae, así que esto sólo pasa cuando algo se
 * rompe—, la página publicaba «0 declaraciones que dependen» de cada documento:
 * un cero que significa «no se ha contado». Regla 3 de integridad: un centinela
 * nunca es un valor. Desde #256 `check:solicitudes` sale con 1 en ese caso
 * (`sin-cruce-documental`); la página, además, no tiene que inventar ceros.
 *
 * Dos casos que no se pueden confundir: sin el bloque, no consta; con el bloque
 * y sin la clase, el cero es cierto —se contó y ninguna la nombra—.
 */
const CELDA = { total: 20, sinCorpus: 5, comprobadoSinHallar: 7, noConsta: 8 }

function manifiesto(cobertura) {
  return {
    generatedAt: '2026-10-11T00:00:00.000Z',
    version: '1',
    plenos: [],
    totals: {
      items: 20,
      plenos: 1,
      byVerdict: { 'sin-datos': 18, parcial: 2 },
      cobertura: {
        porTipo: { afirmacion_numerica: CELDA },
        porTema: { fiscal: CELDA },
        corpus: { tenders: 7 },
        ...cobertura,
      },
      retenidas: {},
      retenidasSinProcedencia: 0,
      sinDatosPorque: { sinCorpus: 5, comprobadoSinHallar: 7, noConsta: 8 },
    },
  }
}

function pintar(cobertura) {
  installFetchMock({
    '/data/pleno-claims/index.json': manifiesto(cobertura),
    '/data/solicitudes-acceso.json': { version: 1, generatedAt: null, items: [] },
  })
  return render(
    <MemoryRouter>
      <Cobertura />
    </MemoryRouter>,
  )
}

/** La celda «Declaraciones que nombran ese tipo de documento» de cada clase pedible. */
async function cifrasPorClase() {
  const tabla = (
    await screen.findByRole('columnheader', {
      name: 'Declaraciones que nombran ese tipo de documento',
    })
  ).closest('table')
  const filas = within(tabla).getAllByRole('row').slice(1)
  // Que la prueba mire algo: una fila por clase, o no ha medido nada.
  expect(filas).toHaveLength(CLASES_PEDIBLES.length)
  return Object.fromEntries(
    filas.map((fila) => {
      const [doc, cifra] = within(fila).getAllByRole('cell')
      return [doc.textContent, cifra.textContent]
    }),
  )
}

describe('/laboratorio/cobertura · el cruce documental que falta no es un cero', () => {
  it('sin `porClaseDocumental`, ninguna fila pone 0', async () => {
    pintar({})
    const cifras = await cifrasPorClase()
    for (const clase of CLASES_PEDIBLES) {
      expect(cifras[CLASE_ETIQUETA[clase]]).not.toMatch(/^\s*\d+\s*$/)
      expect(cifras[CLASE_ETIQUETA[clase]]).toMatch(/no consta/i)
    }
  })

  it('sin `porClaseDocumental`, dice que no se ha podido calcular', async () => {
    pintar({})
    expect(
      await screen.findByText(/no es que no dependa ninguna.*no se ha podido calcular/i),
    ).toBeTruthy()
  })

  it('con `porClase` presente y la clase ausente, el cero es cierto', async () => {
    pintar({
      porClaseDocumental: { porClase: { expediente: 3 }, sinDocumento: 2, total: 5 },
    })
    const cifras = await cifrasPorClase()
    expect(cifras[CLASE_ETIQUETA.expediente]).toBe('3')
    expect(cifras[CLASE_ETIQUETA['informe-tecnico']]).toBe('0')
    expect(cifras[CLASE_ETIQUETA.acta]).toBe('0')
    expect(screen.queryByText(/no se ha podido calcular/i)).toBeNull()
  })
})
