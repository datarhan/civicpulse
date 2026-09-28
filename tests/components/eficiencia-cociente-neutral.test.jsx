import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import ServicioDetalle from '../../src/pages/ServicioDetalle'
import { CoberturaEficiencia } from '../../src/components/eficiencia/CoberturaEficiencia'
import { SALVEDAD_DENOMINADOR_CONGELADO } from '../../src/scraper/indicadores'
import { installFetchMock } from '../setup/mockFetch'

/**
 * Con el denominador congelado, el cociente sigue al coste: sube cuando sube y
 * baja cuando baja. /eficiencia decía en cuatro sitios que «puede subir sin que
 * el servicio haya cambiado», también sobre la basura de Riba-roja, cuyo €/t
 * BAJA de 78,22 a 66,94 con las mismas 11.059,41 t. La frase no era falsa como
 * posibilidad, pero junto a una serie que baja deja entender lo contrario de lo
 * que la tarjeta enseña. Verificación del barrido lector del 28-09-2026; la
 * misma corrección que #148 hizo en /laboratorio/frontera.
 */
const publicado = JSON.parse(readFileSync(resolve('public/data/indicadores.json'), 'utf8'))
const RESIDUOS = 'a1621-coste-unitario'

describe('CoberturaEficiencia — la nota de los denominadores congelados', () => {
  it('no le pone dirección al cociente', () => {
    const { container } = render(
      <MemoryRouter>
        <CoberturaEficiencia
          universe={publicado.universe}
          cobertura={publicado.cobertura}
          anioBase={publicado.anioBase}
          indicadores={publicado.indicadores}
        />
      </MemoryRouter>,
    )
    const texto = container.textContent
    // Midió algo: con el dato publicado la nota se pinta.
    expect(texto).toMatch(/no vuelve a medir/)
    expect(texto).not.toMatch(/puede subir/)
    expect(texto).toMatch(/puede moverse sin que el servicio haya cambiado/)
  })
})

/** La ficha de la basura, con la mitad congelada que se le pida. */
function conMitad(num, den) {
  const snap = structuredClone(publicado)
  const i = snap.indicadores.find((x) => x.id === RESIDUOS)
  i.declaracion.numerador = { ...i.declaracion.numerador, congelada: num, desde: num ? 2019 : null }
  i.declaracion.denominador = {
    ...i.declaracion.denominador,
    congelada: den,
    desde: den ? 2019 : null,
  }
  return snap
}

async function tarjetaDeclaracion(snap) {
  installFetchMock({ '/data/indicadores.json': snap })
  render(
    <MemoryRouter initialEntries={[`/eficiencia/${RESIDUOS}`]}>
      <Routes>
        <Route path="/eficiencia/:id" element={<ServicioDetalle />} />
      </Routes>
    </MemoryRouter>,
  )
  const rotulo = await screen.findByText('Sobre la declaración')
  return rotulo.parentElement.textContent
}

describe('ServicioDetalle — «Sobre la declaración», según qué mitad se quedó parada', () => {
  it('con el denominador congelado dice que el cociente sigue al coste, sin dirección', async () => {
    // Es el estado publicado de la basura: la premisa, medida.
    const i = publicado.indicadores.find((x) => x.id === RESIDUOS)
    expect(i.declaracion.denominador.congelada).toBe(true)
    expect(i.declaracion.numerador.congelada).toBe(false)
    const texto = await tarjetaDeclaracion(publicado)
    expect(texto).toMatch(/cantidad sin remedir desde/)
    expect(texto).toContain(SALVEDAD_DENOMINADOR_CONGELADO)
    expect(texto).not.toMatch(/puede subir/)
  })

  it('con el coste congelado no dice que nadie volvió a medir el denominador', async () => {
    const texto = await tarjetaDeclaracion(conMitad(true, false))
    expect(texto).toMatch(/coste sin actualizar desde 2019/)
    expect(texto).not.toMatch(/nadie ha vuelto a medir el denominador/)
  })

  it('con las dos congeladas tampoco: el cociente no se mueve, es viejo', async () => {
    const texto = await tarjetaDeclaracion(conMitad(true, true))
    expect(texto).toMatch(/ni coste ni cantidad se remiden desde 2019/)
    expect(texto).not.toMatch(/nadie ha vuelto a medir el denominador/)
  })
})
