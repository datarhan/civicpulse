import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ComoSeLee } from '../src/components/eficiencia/ComoSeLee'
import { COMO_SE_LEE } from '../src/scraper/indicador-lectura'
import { SERVICIOS } from '../src/scraper/indicador-registry'

/**
 * La cabecera «Cómo se lee un coste unitario» y las trece tarjetas dicen la
 * misma frase por escalón. Este test comprueba que la dicen desde el MISMO
 * sitio.
 *
 * El modo de fallo nº1 de docs/DATA_INTEGRITY.md es una copia a mano de una
 * forma que ya existía: seis tests transcribieron una enumeración y siguieron
 * verdes mientras producción no casaba con nada. Aquí la tentación es idéntica
 * y más barata todavía —son tres frases de texto corrido, se pegan en un
 * segundo—, y el resultado sería una cabecera que sigue explicando la regla de
 * antes mientras las tarjetas ya explican otra. Nadie lo vería: las dos
 * versiones se leen bien por separado.
 *
 * Así que se renderiza el bloque de verdad y se compara su texto contra la
 * constante, carácter a carácter.
 */

/** Un indicador mínimo con el escalón que se quiere poner en juego. */
const conTier = (tier, id) => ({
  id,
  tier,
  valor: 1,
  etiqueta: id,
  unidad: '€/x',
})

describe('«Cómo se lee un coste unitario» no tiene copia propia del texto', () => {
  it('mide algo: el registro declara de verdad los escalones que este test usa', () => {
    const tiersDelRegistro = new Set(Object.values(SERVICIOS).map((s) => s.tier))
    expect(tiersDelRegistro.size).toBeGreaterThan(1)
    for (const t of ['input', 'carga', 'output']) {
      expect(tiersDelRegistro.has(t), `el registro ya no usa el escalón ${t}`).toBe(true)
    }
  })

  it('imprime la frase de COMO_SE_LEE, literal, para cada escalón en juego', () => {
    render(
      <ComoSeLee
        indicadores={[conTier('input', 'a'), conTier('carga', 'b'), conTier('output', 'c')]}
      />,
    )
    for (const tier of ['input', 'carga', 'output']) {
      expect(
        screen.getByText(COMO_SE_LEE[tier]),
        `la cabecera no imprime la frase de ${tier} tal cual`,
      ).toBeTruthy()
    }
  })

  it('no enseña un escalón que la página no tiene: sólo los que están en juego', () => {
    render(<ComoSeLee indicadores={[conTier('carga', 'a')]} />)
    expect(screen.getByText(COMO_SE_LEE.carga)).toBeTruthy()
    expect(screen.queryByText(COMO_SE_LEE.input)).toBeNull()
    expect(screen.queryByText(COMO_SE_LEE.output)).toBeNull()
  })

  it('una ficha bloqueada no pone su escalón en juego: no hay cociente que leer', () => {
    const { container } = render(
      <ComoSeLee indicadores={[{ id: 'x', tier: 'output', valor: null }]} />,
    )
    expect(container.textContent).toBe('')
  })
})
