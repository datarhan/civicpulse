import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'

import { EspecificacionCard } from '../../src/components/frontera/EspecificacionCard'

/**
 * La frase de cobertura de cada cesta en /laboratorio/frontera.
 *
 * Decía «Se caen 21 que lo prestan por concesión u otro modo, 10 que no
 * declaran el coste y 1 que no declaran la unidad física»: el verbo iba en
 * plural también detrás de un 1, porque cada motivo sólo tenía una forma. Y con
 * todas las unidades dentro habría pintado «Se caen .», una frase sin sujeto.
 */

const cesta = (excluidas, incluidas = 24) => ({
  id: 'prueba',
  titulo: 'Cesta de prueba',
  porQue: 'Una cesta para probar la frase de cobertura de su tarjeta, sin puntuación que pintar.',
  estado: 'insuficiente',
  motivoEstado: 'Sin puntuación en esta prueba.',
  cobertura: { banda: 56, incluidas, excluidas },
  gradosLibertad: { n: incluidas, salidas: 3, minimo: 12, cumple: true },
  propia: null,
  distribucion: null,
})

const cobertura = (excluidas, incluidas) => {
  const { container } = render(<EspecificacionCard e={cesta(excluidas, incluidas)} />)
  const p = [...container.querySelectorAll('p')].find((x) =>
    /municipios de la banda/.test(x.textContent),
  )
  return p.textContent.replace(/\s+/g, ' ').trim()
}

describe('EspecificacionCard · quién se queda fuera', () => {
  it('con un 1, el verbo en singular', () => {
    expect(
      cobertura({ 'modo-no-directa': 21, 'coste-no-declarado': 10, 'unidad-no-declarada': 1 }),
    ).toBe(
      '24 de 56 municipios de la banda. Se caen 21 que lo prestan por concesión u otro modo, 10 que no declaran el coste y 1 que no declara la unidad física.',
    )
  })

  it('si sólo se cae uno, «se cae»', () => {
    expect(cobertura({ 'coste-no-declarado': 1 }, 55)).toBe(
      '55 de 56 municipios de la banda. Se cae 1 que no declara el coste.',
    )
  })

  it('cada motivo tiene sus dos formas', () => {
    const t = cobertura(
      {
        'sin-filas': 1,
        'no-se-presta': 1,
        'modo-no-directa': 1,
        'coste-no-declarado': 2,
        'unidad-no-declarada': 3,
      },
      48,
    )
    expect(t).toContain('1 que no aparece en la entrega')
    expect(t).toContain('1 que declara que no presta el servicio')
    expect(t).toContain('1 que lo presta por concesión u otro modo')
    expect(t).toContain('2 que no declaran el coste')
    expect(t).toContain('3 que no declaran la unidad física')
  })

  it('sin nadie fuera no hay «se caen» que colgar', () => {
    expect(cobertura({ 'coste-no-declarado': 0 }, 56)).toBe('56 de 56 municipios de la banda.')
  })
})
