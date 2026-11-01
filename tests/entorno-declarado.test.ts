// @vitest-environment happy-dom
/**
 * Un `.ts` que declara su DOM lo recibe entero.
 *
 * Es la salida de `tests/entorno-por-extension.test.ts`: la que usan los ganchos
 * y lo demás que mira `window` desde un `.js` o un `.ts`. La declaración cambia
 * el entorno, pero los `setupFiles` son los del proyecto, así que `setup.ts` tiene
 * que mirar el entorno que le ha tocado y no la extensión: si mirara la extensión,
 * estas pruebas tendrían DOM y no tendrían limpieza ni comparadores.
 */
import { createElement } from 'react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

describe('entorno declarado en un .ts: DOM', () => {
  it('monta un componente, y los comparadores de jest-dom están', () => {
    render(createElement('p', null, 'hola'))
    expect(screen.getByText('hola')).toBeInTheDocument()
  })

  it('y la prueba siguiente no hereda lo que montó la anterior', () => {
    expect(document.body.textContent).toBe('')
  })
})
