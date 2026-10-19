import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'

import { OutletScoreboard, TrustIndicators } from '../../src/pages/Laboratorio'

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
 *
 * Y el divisor es lo COTEJADO, no todo lo extraído. El 19-10-2026 la fila del
 * Ayuntamiento decía «0 % · 0 de 26 afirm.», y 21 de esas 26 no se habían buscado
 * en ningún dato (`checkedAgainst: []`): se leía «se miraron 26 y ninguna
 * cuadra». Las cotejadas eran 5. La celda dice ahora las dos cosas.
 */
const vacio = { verificado: 0, parcial: 0, contradicho: 0, 'sin-datos': 0, 'promesa-repetida': 0 }
// La forma que publica press-trust.json: `checkedClaims` es el divisor.
const fila = (outlet, articleCount, verdictCounts, checkedClaims) => ({
  outlet,
  outletHost: null,
  articleCount,
  verdictCounts: { ...vacio, ...verdictCounts },
  checkedClaims,
  verifiedRatio: checkedClaims === 0 ? null : (verdictCounts.verificado ?? 0) / checkedClaims,
  contradictedRatio: null,
})

describe('OutletScoreboard — el divisor del porcentaje va en la celda', () => {
  it('el Ayuntamiento el 19-10-2026: «0 de 5 cotejadas» y las 21 sin cotejar, aparte', () => {
    render(
      <OutletScoreboard
        outlets={[fila('Ayuntamiento de Riba-roja de Túria', 17, { 'sin-datos': 26 }, 5)]}
      />,
    )
    expect(screen.getByText('0%')).toBeTruthy()
    expect(screen.getByText('0 de 5 cotejadas')).toBeTruthy()
    expect(screen.getByText('21 sin cotejar')).toBeTruthy()
    expect(screen.queryByText(/de 26/)).toBeNull()
    expect(screen.getByText('17')).toBeTruthy()
  })

  it('afirmaciones sin ninguna cotejada: «—», no «0 %», y cuántas quedan sin cotejar', () => {
    // elperiodic.com el 19-10-2026: 2 afirmaciones, las 2 con `checkedAgainst: []`.
    render(<OutletScoreboard outlets={[fila('elperiodic.com', 2, { 'sin-datos': 2 }, 0)]} />)
    expect(screen.queryByText('0%')).toBeNull()
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('2 sin cotejar')).toBeTruthy()
    expect(screen.queryByText(/de 0/)).toBeNull()
  })

  it('un medio sin afirmaciones no lleva divisor: «—» y nada debajo', () => {
    render(<OutletScoreboard outlets={[fila('boletinbien', 3, {}, 0)]} />)
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(1)
    expect(screen.queryByText(/cotej/)).toBeNull()
  })

  it('el numerador es el de verificado, no la suma de lo resuelto', () => {
    render(
      <OutletScoreboard
        outlets={[fila('Levante-EMV', 5, { verificado: 1, parcial: 2, 'sin-datos': 1 }, 4)]}
      />,
    )
    expect(screen.getByText('25%')).toBeTruthy()
    expect(screen.getByText('1 de 4 cotejadas')).toBeTruthy()
    expect(screen.queryByText(/sin cotejar/)).toBeNull()
  })

  it('la tabla ya no se llama «fiabilidad»: es una cobertura', () => {
    render(<OutletScoreboard outlets={[fila('boletinbien', 3, {}, 0)]} />)
    const tabla = screen.getByRole('table')
    expect(tabla.getAttribute('aria-label')).toMatch(/cobertura/i)
    expect(tabla.getAttribute('aria-label')).not.toMatch(/fiabilidad/i)
  })

  it('una administración lleva OFICIAL aunque no sea el Ayuntamiento de Riba-roja', () => {
    render(
      <OutletScoreboard
        outlets={[{ ...fila('Comunica GVA', 1, {}, 0), outletHost: 'comunica.gva.es' }]}
      />,
    )
    expect(screen.getByText('OFICIAL')).toBeTruthy()
  })
})

describe('TrustIndicators — «sin comprobar» dice qué no se comprobó', () => {
  const base = {
    localCoverage: true,
    datedArticle: true,
    municipalSourceMatch: null,
    corroboratedAcrossOutlets: null,
    factualClaimsPresent: null,
    opinionFraction: 0,
  }
  const chip = (texto) => screen.getByText(texto).closest('span[title]')

  it('cada indicador nulo pinta «–» con su propio motivo', () => {
    render(<TrustIndicators indicators={base} />)
    for (const t of ['Cobertura cruzada', 'Afirmaciones contrastables'])
      expect(chip(t).textContent).toMatch(/–/)
    expect(chip('Cobertura cruzada').getAttribute('title')).toMatch(/otro medio/)
    expect(chip('Cobertura cruzada').getAttribute('title')).not.toMatch(/datos municipales/)
    expect(chip('Afirmaciones contrastables').getAttribute('title')).toMatch(/extractor/)
    expect(chip('Coincide con datos municipales').getAttribute('title')).toMatch(
      /datos municipales/,
    )
  })
})
