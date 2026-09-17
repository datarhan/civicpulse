/**
 * Las dos cosas que la portada decía mal en «últimas adjudicaciones», ambas
 * vistas por un lector el 16-09-2026 y ninguna visible para una prueba de datos
 * —los números eran correctos.
 *
 * 1. El enlace no lleva a la fila. Gobierto sirve `contratos` con UNA FILA POR
 *    LOTE y todas las hermanas llevan el deeplink del expediente ENTERO. La
 *    portada publicaba «UE casco 5 · 6.900 €» y «UE vella 6 · 20.251 €» con el
 *    mismo enlace, el del expediente 106/2025, cuya única cifra visible es
 *    53.409,63 € de presupuesto base. Tres cifras ciertas y ninguna decía de
 *    qué era.
 *
 * 2. En el hueco del adjudicatario iba el órgano de CONTRATACIÓN. `contractor`
 *    vale «Ayuntamiento de Riba-roja de Túria» en las 812 filas del snapshot,
 *    así que la portada nombraba al comprador como si fuera quien cobra, y su
 *    propio respaldo —«Sin adjudicatario»— no podía saltar jamás. El
 *    explorador de /presupuesto y las fichas de contrato ya leían `assignee`.
 *    Un respaldo inalcanzable es la pista: el campo que se lee no es el que se
 *    quería leer.
 */
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

import { LiveContracts } from '../../src/variants/direction-d/blocks/FeedBlocks'
import { installFetchMock } from '../setup/mockFetch'
import { CATALOGUE, DEFAULT_LOCALE } from '../../src/i18n'

const FICHA = 'https://contrataciondelestado.es/wps/poc?uri=deeplink:detalle_licitacion&idEvl=AAA'
const OTRA = 'https://contrataciondelestado.es/wps/poc?uri=deeplink:detalle_licitacion&idEvl=BBB'
const ORGANO = 'Ayuntamiento de Riba-roja de Túria'
/** Del catálogo, no escrito a mano: si la frase se retoca, la prueba la sigue. */
const SIN_ADJUDICATARIO = CATALOGUE[DEFAULT_LOCALE]['landing.contratos.sinAdjudicatario']

const fila = (over = {}) => ({
  id: 'c-1',
  title: 'Contrato de prueba del banco de pruebas',
  assignee: 'EMPRESA ADJUDICATARIA, S.L.',
  contractor: ORGANO,
  permalink: OTRA,
  awardDate: '2026-09-08',
  status: 'awarded',
  finalAmountNoTaxes: 6900,
  contractType: 'services',
  duration: 730,
  batchNumber: 0,
  ...over,
})

function monta(filas, licitaciones = []) {
  installFetchMock({
    '/data/tenders.json': {
      generatedAt: '2026-09-16T00:00:00.000Z',
      stats: { awardedContracts: filas.length, awardedTotalEuros: 124033832 },
      contracts: filas,
      tenders: licitaciones,
      top: { recentAwarded: filas },
    },
  })
  return render(
    <MemoryRouter>
      <LiveContracts />
    </MemoryRouter>,
  )
}

/** Los tres lotes del expediente 106/2025, como los sirve Gobierto. */
const LOTES = [
  fila({ id: '5106848', title: 'UE casco 5', permalink: FICHA, batchNumber: 1 }),
  fila({
    id: '5106848#1',
    title: 'UE vella 6',
    permalink: FICHA,
    batchNumber: 2,
    finalAmountNoTaxes: 20250.89,
    assignee: 'XÚQUER-ARQING, S.L.',
  }),
]
/** La licitación homónima: es ella quien declara que los lotes son TRES. */
const LICITACION = {
  id: '5106848',
  permalink: FICHA,
  documentNumber: '106/2025',
  numberOfBatches: 3,
  initialAmountNoTaxes: 53409.63,
}

describe('portada · una fila que es un lote dice que el enlace abre el expediente', () => {
  it('nombra el lote, el expediente y el presupuesto base que se leerá al otro lado', async () => {
    monta(LOTES, [LICITACION])
    const nota = await screen.findByText(/Lote 1 de 3/)
    expect(nota.textContent).toContain('106/2025')
    // Al céntimo y sin notación compacta: existe para casarse con lo que
    // PLACSP imprime, «53.409,63 Euros». Un «53 mil €» no se casa con nada.
    expect(nota.textContent).toContain('53.409,63')
    expect(nota.textContent).toMatch(/expediente entero/)
  })

  it('el TOTAL sale de la licitación, no de cuántas filas tengamos', async () => {
    // Éste es el gate de honestidad: van dos filas y la fuente declara tres
    // lotes. Contar las filas daría «lote 1 de 2», que es falso, y lo sería en
    // silencio. Es el mismo error que inventarse un denominador.
    monta(LOTES, [LICITACION])
    const nota = await screen.findByText(/Lote 1 de/)
    expect(nota.textContent).toContain('de 3')
    expect(nota.textContent).not.toContain('de 2')
  })

  it('sin licitación que lo declare no se inventa el total ni el presupuesto', async () => {
    monta(LOTES, [])
    const nota = await screen.findByText(/^Lote 1\b/)
    expect(nota.textContent).not.toMatch(/de \d/)
    expect(nota.textContent).not.toMatch(/presupuesto base/)
    expect(nota.textContent).toMatch(/expediente entero/)
  })

  it('una fila cuyo enlace sólo es suyo NO lleva la salvedad (control)', async () => {
    monta([fila({ batchNumber: 1 })], [LICITACION])
    // La fila está pintada: lo que falta es la salvedad, no el bloque. Y
    // `batchNumber: 1` está puesto a propósito —la fuente lo trae a 1 en
    // cientos de contratos de lote único— para fijar que la marca la decide el
    // enlace compartido, no el campo.
    await screen.findByText(/Contrato de prueba del banco de pruebas/)
    expect(screen.queryByText(/expediente entero/)).toBeNull()
  })
})

describe('portada · en el hueco del adjudicatario va la empresa', () => {
  it('imprime el adjudicatario y NO el órgano de contratación', async () => {
    monta([fila()], [])
    await screen.findByText('EMPRESA ADJUDICATARIA, S.L.')
    expect(
      screen.queryByText(ORGANO),
      'la portada vuelve a publicar al comprador en el sitio de quien cobra',
    ).toBeNull()
  })

  it('sin adjudicatario lo dice, en vez de rellenar el hueco con el comprador', async () => {
    // El respaldo tiene que poder saltar. Mientras se leía `contractor` —un
    // valor constante en las 812 filas— era código inalcanzable.
    monta([fila({ assignee: null })], [])
    await screen.findByText(SIN_ADJUDICATARIO)
    expect(screen.queryByText(ORGANO)).toBeNull()
  })
})
