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

// Las cifras no son redondas a propósito: con 6e6, el ICU de una máquina imprime
// «6 M €» y el de CI «6,0 M €», y la prueba pasaba en una y fallaba en otra. Con
// 6,1e6 los dos imprimen «6,1 M €». Entre la cifra, la M y el euro puede ir un
// espacio duro, uno estrecho o ninguno; `\b` impide que «16,1» pase por «6,1».
const M = (cifra) => new RegExp(`\\b${cifra}[\\s\\u00a0\\u202f]?M[\\s\\u00a0\\u202f]?€`)
const pinta = (nodo) => render(<LocaleProvider>{nodo}</LocaleProvider>).container

const universe = {
  totalAmount: 100e6,
  locatedAmount: 2.2e6,
  situatedAmount: 6.1e6,
  dateMin: '2018-01-01',
  dateMax: '2025-01-01',
  totalDateMin: '2017-07-06',
  totalDateMax: '2026-10-08',
}

describe('MoneyCoverage', () => {
  it('imprime lo situado, no lo zonificado', () => {
    const t = pinta(<MoneyCoverage snapshot={{ universe }} />).textContent
    expect(t).toMatch(M('6,1'))
    expect(t).not.toMatch(M('2,2'))
    expect(t).toMatch(/6,1\s?%/)
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
    expect(t).toMatch(/\b2[\s\u00a0\u202f]?M[\s\u00a0\u202f]?€/)
    expect(t).not.toMatch(/\b6(,1)?[\s\u00a0\u202f]?M[\s\u00a0\u202f]?€/)
  })
})
