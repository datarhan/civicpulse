/**
 * Un `.jsx` corre con DOM y con lo que `tests/setup/setup-dom.ts` le monta.
 *
 * La otra mitad de `tests/entorno-por-extension.test.ts`. Sin esto, un reparto
 * que dejara a los componentes sin DOM saldría igual de rápido, y sólo se vería
 * por sus 180 ficheros en rojo; pero uno que dejara de limpiar entre pruebas no
 * se vería en ninguno: cada prueba encontraría el DOM de la anterior, y las que
 * buscan «no hay X» pasarían o fallarían por el orden.
 */
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

describe('entorno de un .jsx: DOM', () => {
  it('monta un componente, y los comparadores de jest-dom están', () => {
    render(<p>hola</p>)
    expect(screen.getByText('hola')).toBeInTheDocument()
  })

  it('y la prueba siguiente no hereda lo que montó la anterior', () => {
    expect(document.body.textContent).toBe('')
  })
})
