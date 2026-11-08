import { afterEach, describe, expect, it } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'

import { LocaleProvider } from '../../src/i18n'
import { invalidateSnapshots } from '../../src/lib/snapshot-store'
import ContractorLeaderboard from '../../src/components/Presupuesto/ContractorLeaderboard'
import { installFetchMock } from '../setup/mockFetch'

/**
 * La pestaña «¿Quién recibe el dinero?» colocaba séptima a una empresa por una
 * parcela que le había COMPRADO al Ayuntamiento: 1,66 M€ que entraron en la caja
 * municipal, publicados como si hubieran salido. Lo señaló la lectura independiente
 * del «En breve» de /contratos, que enlaza a esta lista. El importe se queda en la
 * lista y en las sumas, las mismas de /gestion y la portada; lo que cambia es que
 * la fila dice en qué sentido fue el dinero.
 */
const fila = (id, assignee, title, finalAmountNoTaxes) => ({
  id,
  status: 'awarded',
  assignee,
  title,
  finalAmountNoTaxes,
})

const pinta = async (contracts, tenders = []) => {
  installFetchMock({ '/data/entities.json': { companies: [] } })
  const { container } = render(
    <LocaleProvider>
      <ContractorLeaderboard contracts={contracts} tenders={tenders} />
    </LocaleProvider>,
  )
  await waitFor(() => expect(container.querySelector('[data-resumen-adjudicatarios]')).toBeTruthy())
  return container
}

afterEach(() => {
  localStorage.clear()
  invalidateSnapshots()
})

describe('¿Quién recibe el dinero?', () => {
  const contratos = [
    fila('1', 'OBRAS SA', 'Obras de la calle Mayor', 5000),
    fila('2', 'NAVES SL', 'Enajenación de la parcela 1-10 del Sector Casanova', 3000),
    fila('3', 'MIXTA SL', 'Enajenación de la parcela 7', 1000),
    fila('4', 'MIXTA SL', 'Limpieza de colegios', 1000),
  ]

  it('la fila de quien sólo compró dice que pagó, y las demás no', async () => {
    const c = await pinta(contratos)
    const marcadas = [...c.querySelectorAll('[data-compra-al-ayuntamiento]')]
    expect(marcadas).toHaveLength(1)
    expect(marcadas[0].closest('button').textContent).toContain('NAVES SL')
    expect(marcadas[0].textContent).toMatch(/pagó, no cobró/)
  })

  it('el importe de la venta sigue en la lista', async () => {
    await pinta(contratos)
    expect(screen.getByText('NAVES SL', { exact: false })).toBeTruthy()
  })

  it('dice cuántas ventas lleva dentro, y que es lo adjudicado', async () => {
    const c = await pinta(contratos)
    const resumen = c.querySelector('[data-resumen-adjudicatarios]').textContent
    expect(resumen).toContain('Es lo adjudicado, no lo pagado.')
    expect(resumen).toContain('Incluye 2 ventas de parcelas')
  })

  it('una licitación titulada como venta cuenta aunque el lote no lo diga', async () => {
    const lote = { ...fila('5', 'LOTE SL', 'Lote 3', 900), permalink: 'x' }
    const c = await pinta([lote], [{ permalink: 'x', title: 'Enajenación de la parcela 9' }])
    expect(c.querySelectorAll('[data-compra-al-ayuntamiento]')).toHaveLength(1)
  })

  it('sin ventas no se menciona ninguna', async () => {
    const c = await pinta([fila('1', 'OBRAS SA', 'Obras de la calle Mayor', 5000)])
    expect(c.querySelector('[data-compra-al-ayuntamiento]')).toBeNull()
    expect(c.querySelector('[data-resumen-adjudicatarios]').textContent).not.toMatch(/ventas/)
  })

  it('con pocos adjudicatarios no dice «las cinco primeras»', async () => {
    const c = await pinta(contratos)
    expect(c.querySelector('[data-resumen-adjudicatarios]').textContent).not.toMatch(/cinco/)
  })
})
