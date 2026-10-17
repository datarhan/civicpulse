/**
 * La línea de cobertura de la portada cuenta lo que pintan sus chinchetas.
 * Las chinchetas salen de las asignaciones con `place` (`placeAmountsAt`), cuyo
 * total es `universe.situatedAmount`; la línea imprimía `locatedAmount`, el de
 * las ZONAS de /presupuesto, y se quedaba en un tercio de lo pintado.
 */
import { describe, expect, it, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import { LocaleProvider } from '../../src/i18n'
import { MoneyCoverage } from '../../src/components/LiveCity/controls/MoneyCoverage'
import CoverageMeter from '../../src/components/Presupuesto/CoverageMeter'

afterEach(cleanup)

// Intl compacta «6 M €» con un espacio duro entre la cifra, la M y el euro; de
// ahí `\s` en las expresiones, y `\b` para que «16 M €» no pase por «6 M €».
const pinta = (nodo) => render(<LocaleProvider>{nodo}</LocaleProvider>).container

const universe = {
  totalAmount: 100e6,
  locatedAmount: 2e6,
  situatedAmount: 6e6,
  dateMin: '2018-01-01',
  dateMax: '2025-01-01',
  totalDateMin: '2017-07-06',
  totalDateMax: '2026-10-08',
}

describe('MoneyCoverage', () => {
  it('imprime lo situado, no lo zonificado', () => {
    const t = pinta(<MoneyCoverage snapshot={{ universe }} />).textContent
    expect(t).toMatch(/\b6\sM\s?€/)
    expect(t).not.toMatch(/\b2\sM\s?€/)
    expect(t).toMatch(/6%/)
  })
  it('el periodo es el del denominador', () => {
    const t = pinta(<MoneyCoverage snapshot={{ universe }} />).textContent
    expect(t).toMatch(/2017.2026/)
  })
  it('sin situatedAmount no dice nada', () => {
    const c = pinta(<MoneyCoverage snapshot={{ universe: { ...universe, situatedAmount: 0 } }} />)
    expect(c.textContent).toBe('')
  })
  it('un snapshot viejo sin totalDate* cae en dateMin/dateMax', () => {
    const { totalDateMin, totalDateMax, ...viejo } = universe
    const t = pinta(<MoneyCoverage snapshot={{ universe: viejo }} />).textContent
    expect(t).toMatch(/2018.2025/)
  })
})

describe('CoverageMeter', () => {
  it('sigue contando zonas, con el periodo del denominador', () => {
    const t = pinta(<CoverageMeter universe={universe} zones={[]} />).textContent
    expect(t).toMatch(/2017/)
    expect(t).toMatch(/2026/)
    expect(t).toMatch(/\b2\sM\s?€/)
    expect(t).not.toMatch(/\b6\sM\s?€/)
  })
})
