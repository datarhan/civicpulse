import { afterEach, describe, expect, it } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'

import { LocaleProvider } from '../../src/i18n'
import { IndiceExperta } from '../../src/components/IndiceSecciones'
import { SeccionExperta } from '../../src/components/Lecturas'
import { IndicePieza, SecHead } from '../../src/components/reportajes/Pieza'

/**
 * El índice de las páginas largas. Sale de `IndicePieza`, que leía el DOM una vez
 * al montar: en un reportaje basta, y en una página que carga sus datos después
 * salía vacío. Se mide lo que un lector puede pulsar, no que el componente exista.
 */
const pagina = (hijos) =>
  render(
    <LocaleProvider>
      <div className="cp-page">
        <IndiceExperta />
        {hijos}
      </div>
    </LocaleProvider>,
  )

const seccion = (id, titulo, cuerpo = <p>dato</p>) => (
  <SeccionExperta key={id} id={id} titulo={titulo}>
    {cuerpo}
  </SeccionExperta>
)

const TRES = [seccion('a', 'Alfa'), seccion('b', 'Beta'), seccion('c', 'Gamma')]

const abre = (c) => {
  const d = c.querySelector('details')
  d.open = true
  fireEvent(d, new Event('toggle'))
  return d
}

afterEach(() => localStorage.clear())

describe('IndiceExperta', () => {
  it('dice cuántos apartados hay y lista, en orden, las secciones de la página', async () => {
    const { container: c } = pagina(TRES)
    await waitFor(() => expect(c.querySelector('summary')?.textContent).toContain('3 apartados'))
    abre(c)
    const enlaces = await screen.findAllByRole('link')
    expect(enlaces.map((a) => [a.textContent, a.getAttribute('href')])).toEqual([
      ['Alfa', '#a'],
      ['Beta', '#b'],
      ['Gamma', '#c'],
    ])
  })

  it('cerrado, la lista no está en el DOM: cada título saldría dos veces', async () => {
    const { container: c } = pagina(TRES)
    await waitFor(() => expect(c.querySelector('details')).toBeTruthy())
    expect(c.querySelector('ol')).toBeNull()
    expect(screen.queryAllByRole('link')).toHaveLength(0)
  })

  it('no ofrece una sección vacía: sería un enlace a nada', async () => {
    const { container: c } = pagina([...TRES, seccion('d', 'Delta', null)])
    await waitFor(() => expect(c.querySelector('summary')?.textContent).toContain('3 apartados'))
    abre(c)
    const enlaces = await screen.findAllByRole('link')
    expect(enlaces.map((a) => a.getAttribute('href'))).not.toContain('#d')
  })

  it('con menos de tres no se pinta', async () => {
    const { container: c } = pagina([seccion('a', 'Alfa'), seccion('b', 'Beta')])
    await new Promise((r) => setTimeout(r, 20))
    expect(c.querySelector('details')).toBeNull()
  })

  it('aparece cuando llegan los datos, sin volver a montar', async () => {
    const vacias = [
      seccion('a', 'Alfa', null),
      seccion('b', 'Beta', null),
      seccion('c', 'Gamma', null),
    ]
    const envuelta = (hijos) => (
      <LocaleProvider>
        <div className="cp-page">
          <IndiceExperta />
          {hijos}
        </div>
      </LocaleProvider>
    )
    const { container: c, rerender } = render(envuelta(vacias))
    await new Promise((r) => setTimeout(r, 20))
    expect(c.querySelector('details'), 'sin datos no hay nada que indexar').toBeNull()
    rerender(envuelta(TRES))
    await waitFor(() => expect(c.querySelector('summary')?.textContent).toContain('3 apartados'))
  })

  it('se cierra al elegir un apartado, para no tapar el destino', async () => {
    const { container: c } = pagina(TRES)
    await waitFor(() => expect(c.querySelector('details')).toBeTruthy())
    const d = abre(c)
    const [primero] = await screen.findAllByRole('link')
    fireEvent.click(primero)
    expect(d.open).toBe(false)
  })

  it('se cierra con Escape y al pulsar fuera', async () => {
    const { container: c } = pagina(TRES)
    await waitFor(() => expect(c.querySelector('details')).toBeTruthy())
    const d = abre(c)
    await screen.findAllByRole('link')
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(d.open).toBe(false)

    abre(c)
    await screen.findAllByRole('link')
    fireEvent.pointerDown(document.body)
    expect(d.open).toBe(false)
  })

  it('no se imprime', async () => {
    const { container: c } = pagina(TRES)
    await waitFor(() => expect(c.querySelector('details')).toBeTruthy())
    expect(c.querySelector('nav')?.hasAttribute('data-print-hide')).toBe(true)
  })
})

describe('IndicePieza, sobre el mismo componente', () => {
  const pieza = (extra = null) => (
    <LocaleProvider>
      <div className="cp-page">
        <IndicePieza />
        <SecHead num="01" kicker="k" title="Uno" />
        <SecHead num="02" kicker="k" title="Dos" />
        <SecHead num="03" kicker="k" title="Tres" />
        {extra}
      </div>
    </LocaleProvider>
  )

  it('sigue numerando sus apartados', async () => {
    const { container: c } = render(pieza())
    await waitFor(() => expect(c.querySelector('summary')?.textContent).toContain('En esta pieza'))
    abre(c)
    const enlaces = await screen.findAllByRole('link')
    expect(enlaces.map((a) => a.textContent)).toEqual(['01Uno', '02Dos', '03Tres'])
  })

  it('no va pegado, y elegir un apartado no lo cierra: es una lista larga que se recorre', async () => {
    const { container: c } = render(pieza())
    await waitFor(() => expect(c.querySelector('details')).toBeTruthy())
    expect(c.querySelector('.cp-indice-pegado')).toBeNull()
    const d = abre(c)
    const [primero] = await screen.findAllByRole('link')
    fireEvent.click(primero)
    expect(d.open).toBe(true)
  })
})
