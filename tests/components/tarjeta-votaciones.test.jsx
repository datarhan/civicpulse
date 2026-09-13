/**
 * La tarjeta de /plenos publicaba «2 registros y 1 desglose retirados» —tres—
 * mientras /datos, que suma todos los alcances, publicaba cuatro del mismo
 * fichero. La causa fue nombrar dos alcances a mano en el camino del dato, y
 * nadie renderizaba esta tarjeta en una prueba: el arreglo de la librería podía
 * deshacerse aquí, en el sitio exacto donde vivía el defecto, con la batería
 * entera en verde.
 *
 * Lo que se fija es el INVARIANTE ENTRE PÁGINAS: las cifras de la frase suman
 * lo que suma `stats.retracted`. Así la prueba no depende de qué alcances
 * existan hoy, y un cuarto entra solo.
 */
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

import { TarjetaVotaciones } from '../../src/components/plenos/TarjetaVotaciones'
import { RETRACTION_SCOPES } from '../../src/scraper/pleno-votes'

const votos = (retiradas) => ({
  total: 4,
  aprobado: 3,
  rechazado: 1,
  sesiones: 1,
  lista: ['aprobado', 'aprobado', 'aprobado', 'rechazado'],
  retiradas,
})

function monta(retiradas) {
  return render(
    <MemoryRouter>
      <TarjetaVotaciones votos={votos(retiradas)} total={3} />
    </MemoryRouter>,
  )
}

/** La frase de las retiradas, que la tarjeta pone en negrita y cierra con punto. */
function frasePublicada(container) {
  return [...container.querySelectorAll('strong')]
    .map((s) => (s.textContent ?? '').replace(/\.$/, ''))
    .find((t) => /retirad/.test(t))
}

const suma = (o) => Object.values(o).reduce((s, n) => s + n, 0)
const cifras = (texto) => [...texto.matchAll(/\d+/g)].map((m) => Number(m[0]))

describe('la tarjeta de votaciones publica todas las retiradas, no dos alcances', () => {
  it('las cifras de la frase suman lo mismo que stats.retracted', () => {
    const retiradas = { record: 2, breakdown: 1, plazo: 1 }
    const { container } = monta(retiradas)
    const frase = frasePublicada(container)
    expect(frase, 'la tarjeta no publica ninguna frase de retiradas').toBeTruthy()
    // El invariante que se rompió: /datos decía 4 y esta tarjeta 3.
    expect(cifras(frase).reduce((s, n) => s + n, 0)).toBe(suma(retiradas))
    expect(cifras(frase)).toHaveLength(Object.keys(retiradas).length)
  })

  it('cualquier alcance del modelo cuenta, uno por uno', () => {
    // Derivado del enum: con un alcance nuevo esta prueba lo exige sin tocarla.
    const retiradas = Object.fromEntries(RETRACTION_SCOPES.map((s, i) => [s, i + 1]))
    const { container } = monta(retiradas)
    const frase = frasePublicada(container)
    expect(cifras(frase).reduce((s, n) => s + n, 0)).toBe(suma(retiradas))
  })

  it('sin retiradas no hay frase, y la tarjeta sigue ahí (ablación)', () => {
    const { container } = monta(Object.fromEntries(RETRACTION_SCOPES.map((s) => [s, 0])))
    expect(frasePublicada(container)).toBeUndefined()
    // Lo que desaparece es la salvedad, no la tarjeta: si esto falla, la
    // aserción de arriba no probaría nada.
    expect(screen.getByText(/De 4 votaciones registradas/)).toBeTruthy()
  })

  it('un alcance que la instantánea no trae no se inventa', () => {
    const { container } = monta({ plazo: 1 })
    expect(frasePublicada(container)).toBe('1 plazo retirado')
  })
})
