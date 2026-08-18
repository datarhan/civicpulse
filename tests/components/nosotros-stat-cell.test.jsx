import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { StatCell } from '../../src/pages/Nosotros'

/**
 * Una cifra que no existe se pinta como raya; no tira la página.
 *
 * `summarizeImpact` devuelve `contractsCount: null` cuando el snapshot de
 * contratación no trae su desglose —porque decir 0, o decir el total de filas,
 * sería peor que no decir nada— y este componente hacía `value.toLocaleString()`
 * a secas. Con `/data/tenders.json` caído, `useJsonFetch` deja `data: null`,
 * `loading: false`, y /nosotros entera reventaba con un TypeError.
 *
 * El test de `impact-stats` no podía verlo: prueba la función pura, que
 * devuelve el `null` correctamente. El hueco estaba en el único sitio donde
 * los dos se encuentran, que es el render — y por eso este caso vive aquí.
 */
describe('StatCell', () => {
  it('pinta la raya cuando no hay cifra, en vez de reventar', () => {
    const { container } = render(<StatCell value={null} label="contratos adjudicados" />)
    expect(container.textContent).toContain('—')
    expect(container.textContent).toContain('contratos adjudicados')
  })

  it('pinta la raya mientras carga', () => {
    const { container } = render(<StatCell value={699} label="x" loading />)
    expect(container.textContent).toContain('—')
    expect(container.textContent).not.toContain('699')
  })

  it('control positivo: con cifra, la pinta', () => {
    // Sin esto, un «pinta siempre la raya» pasaría los dos casos de arriba. Se
    // comprueban los dígitos y la ausencia de raya, no el separador de
    // millares: el ICU del entorno de test no lo aplica, y una aserción sobre
    // «1.699» estaría midiendo la build de Node, no este componente.
    const { container } = render(<StatCell value={1699} label="x" />)
    expect(container.textContent).toMatch(/1\.?699/)
    expect(container.textContent).not.toContain('—')
  })
})
