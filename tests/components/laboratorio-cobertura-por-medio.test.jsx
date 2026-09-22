import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'

import { OutletScoreboard } from '../../src/pages/Laboratorio'

/**
 * La tabla por medio de /laboratorio se rotulaba «Tabla de fiabilidad» y ponía,
 * para el Ayuntamiento, «18 · 0 % · —». Un lector divide el 0 % entre los 18
 * artículos de al lado y concluye que el Ayuntamiento no acierta nunca. El
 * divisor real, medido el 22-09-2026 en press-trust.json, eran 39
 * afirmaciones sacadas de 5 de esos 18 artículos, las 39 «sin-datos» —sin
 * registro municipal contra el que comprobarlas—, y los otros 13 artículos
 * llevan en la misma página la marca «sin claims auditados».
 *
 * La tarjeta de KPI de arriba ya tuvo el mismo defecto y lo arregló poniendo
 * el divisor en el pie («0 de 58 claims»). La tabla nunca lo recibió. Son dos
 * cifras ciertas sin puente, y aquí se tiende el puente: el divisor va en la
 * celda, y «fiabilidad» deja de ser el nombre de una cobertura.
 */
const fila = (outlet, articleCount, verdictCounts) => {
  const total = Object.values(verdictCounts).reduce((a, b) => a + b, 0)
  return {
    outlet,
    articleCount,
    verdictCounts,
    verifiedRatio: total === 0 ? null : verdictCounts.verificado / total,
    contradictedRatio:
      verdictCounts.verificado + verdictCounts.contradicho === 0
        ? null
        : verdictCounts.contradicho / total,
  }
}
const vacio = { verificado: 0, parcial: 0, contradicho: 0, 'sin-datos': 0, 'promesa-repetida': 0 }

describe('OutletScoreboard — el divisor del porcentaje va en la celda', () => {
  it('«0 %» lleva debajo «0 de 39 afirm.», no los 18 artículos de al lado', () => {
    render(
      <OutletScoreboard
        outlets={[fila('Ayuntamiento de Riba-roja de Túria', 18, { ...vacio, 'sin-datos': 39 })]}
      />,
    )
    expect(screen.getByText('0%')).toBeTruthy()
    expect(screen.getByText('0 de 39 afirm.')).toBeTruthy()
    expect(screen.getByText('18')).toBeTruthy()
  })

  it('un medio sin afirmaciones no lleva divisor: «—» y nada debajo', () => {
    render(<OutletScoreboard outlets={[fila('boletinbien', 3, vacio)]} />)
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(1)
    expect(screen.queryByText(/de 0 afirm\./)).toBeNull()
  })

  it('el numerador es el de verificado, no la suma de lo resuelto', () => {
    render(
      <OutletScoreboard
        outlets={[fila('Levante-EMV', 5, { ...vacio, verificado: 1, parcial: 2, 'sin-datos': 1 })]}
      />,
    )
    expect(screen.getByText('25%')).toBeTruthy()
    expect(screen.getByText('1 de 4 afirm.')).toBeTruthy()
  })

  it('la tabla ya no se llama «fiabilidad»: es una cobertura', () => {
    render(<OutletScoreboard outlets={[fila('boletinbien', 3, vacio)]} />)
    const tabla = screen.getByRole('table')
    expect(tabla.getAttribute('aria-label')).toMatch(/cobertura/i)
    expect(tabla.getAttribute('aria-label')).not.toMatch(/fiabilidad/i)
  })
})
