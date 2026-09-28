import { describe, expect, it } from 'vitest'
import { render, waitFor } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import Metodologia from '../../src/pages/Metodologia'
import { peekSnapshot } from '../../src/lib/snapshot-store'
import { installFetchMock } from '../setup/mockFetch'

/**
 * /metodologia#frontera escribía «veinte ayuntamientos» y «con veinte
 * observaciones» a mano, y las dos fronteras publicadas tienen 24
 * (`distribucion.n` de dea.json, Riba-roja incluida). El número de
 * observaciones se lee ahora del fichero; el de ayuntamientos se quita, porque
 * a cuántos terceros alcanza el conjunto de fronteras no se publica —es
 * justamente lo que la página se niega a nombrar—. Verificación del barrido
 * lector del 28-09-2026.
 */
const dea = JSON.parse(readFileSync(resolve('public/data/dea.json'), 'utf8'))
const tamanos = [
  ...new Set(dea.especificaciones.map((e) => e.distribucion?.n).filter(Number.isInteger)),
].sort((a, b) => a - b)

function monta(servido) {
  installFetchMock(servido ? { '/data/dea.json': servido } : {})
  const { container } = render(<Metodologia />)
  return () => container.querySelector('#frontera')?.textContent ?? ''
}

describe('/metodologia#frontera — el tamaño de la frontera sale de dea.json', () => {
  it('con el dato publicado dice cuántas observaciones hay, y no escribe veinte', async () => {
    expect(tamanos.length, 'dea.json no trae ninguna frontera publicada').toBeGreaterThan(0)
    const esperado =
      tamanos.length === 1
        ? `con ${tamanos[0]} observaciones`
        : `con entre ${tamanos[0]} y ${tamanos.at(-1)} observaciones`
    const texto = monta(dea)
    await waitFor(() => expect(texto()).toContain(esperado))
    expect(texto()).not.toMatch(/veinte (ayuntamientos|observaciones)/)
  })

  it('con fronteras de distinto tamaño da el intervalo', async () => {
    const texto = monta({
      ...dea,
      especificaciones: [
        { id: 'a', distribucion: { n: 31 } },
        { id: 'b', distribucion: { n: 24 } },
        { id: 'c', distribucion: null },
      ],
    })
    await waitFor(() => expect(texto()).toContain('con entre 24 y 31 observaciones'))
  })

  it('sin el fichero no se inventa un número', async () => {
    const texto = monta(null)
    // Un 404 queda como `missing` en el almacén; cualquier fallo, `error`. Las
    // dos son «se pidió y no hay dato»: la página ya decidió qué pintar.
    await waitFor(() =>
      expect(['missing', 'error']).toContain(peekSnapshot('/data/dea.json')?.status),
    )
    expect(texto()).toContain('con pocas observaciones')
    expect(texto()).not.toMatch(/con \d+ observaciones/)
  })
})

describe('/metodologia#eficiencia — el cociente congelado no tiene dirección', () => {
  it('dice que puede moverse, no que puede subir', () => {
    installFetchMock({})
    const { container } = render(<Metodologia />)
    const texto = container.querySelector('#eficiencia')?.textContent ?? ''
    // Midió algo: la sección está y habla del denominador que no se remide.
    expect(texto).toMatch(/casi nunca se vuelve a medir/)
    expect(texto).not.toMatch(/puede subir sin que el servicio haya cambiado/)
    expect(texto).toMatch(/puede moverse sin que el servicio haya cambiado/)
  })
})
