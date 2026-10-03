import { describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

import { installFetchMock } from '../setup/mockFetch'
import Cobertura from '../../src/pages/Cobertura'

/**
 * /laboratorio/cobertura partía lo publicado en dos: cotejadas contra algún
 * corpus y «sin corpus que consultar», y la segunda la sacaba por resta
 * (`total − conCorpus`). Una pasada que rehace el veredicto sustituye la lista
 * de lo consultado por su marca —el motor repasa candidatos, un curador lee un
 * contrato—, así que esas filas caían en «sin corpus» sin que nadie lo
 * afirmara: sólo quedaban fuera de la otra casilla. Son tres, y cada una se lee
 * del manifiesto, ninguna por diferencia.
 *
 * Cifras distintas a propósito, para que ninguna se confunda con otra: 20
 * publicadas, 7 con corpus, 5 sin, 8 de las que no consta. La resta daría 13.
 */
const CELDA = { total: 20, sinCorpus: 5, comprobadoSinHallar: 7, noConsta: 8 }
const MANIFIESTO = {
  generatedAt: '2026-09-30T00:00:00.000Z',
  version: '1',
  plenos: [],
  totals: {
    items: 20,
    plenos: 1,
    byVerdict: { 'sin-datos': 18, parcial: 2 },
    cobertura: {
      porTipo: { afirmacion_numerica: CELDA },
      porTema: { fiscal: CELDA },
      corpus: { tenders: 7, 'verdict-engine': 6, 'curator-downgrade': 2 },
      porClaseDocumental: { porClase: {}, sinDocumento: 5, total: 5 },
    },
    retenidas: {},
    retenidasSinProcedencia: 0,
    sinDatosPorque: { sinCorpus: 5, comprobadoSinHallar: 6, noConsta: 7 },
  },
}

function pintar() {
  installFetchMock({
    '/data/pleno-claims/index.json': MANIFIESTO,
    '/data/solicitudes-acceso.json': { version: 1, generatedAt: null, items: [] },
  })
  return render(
    <MemoryRouter>
      <Cobertura />
    </MemoryRouter>,
  )
}

/** La cifra que la tarjeta de resumen pone bajo `rotulo`. */
async function cifraBajo(rotulo) {
  const etiqueta = await screen.findByText(rotulo)
  return etiqueta.nextElementSibling?.textContent
}

describe('/laboratorio/cobertura · tres casillas, ninguna por resta', () => {
  it('«sin corpus que consultar» es la del manifiesto, no lo que falta para el total', async () => {
    pintar()
    expect(await cifraBajo('COTEJADAS CONTRA ALGÚN CORPUS')).toBe('7')
    expect(await cifraBajo('SIN CORPUS QUE CONSULTAR')).toBe('5')
    expect(await cifraBajo('NO CONSTA QUÉ SE CONSULTÓ')).toBe('8')
  })

  it('la tabla por tipo lleva la columna, con su cifra en la fila', async () => {
    pintar()
    const tabla = (await screen.findByRole('heading', { name: 'Por tipo de declaración' }))
      .parentElement
    expect(within(tabla).getByRole('columnheader', { name: 'No consta' })).toBeTruthy()
    const fila = within(tabla).getAllByRole('row')[1]
    const celdas = within(fila)
      .getAllByRole('cell')
      .map((c) => c.textContent)
    // Tipo · Total · Con corpus · Sin corpus · No consta · (barra)
    expect(celdas.slice(1, 5)).toEqual(['20', '7', '5', '8'])
  })
})
