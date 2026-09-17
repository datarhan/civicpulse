/**
 * Pintar un escenario en un idioma y leerlo cuando ya no se mueve: la mitad de
 * cada guarda bilingüe.
 *
 * Vivía copiado dentro de `portada-valencia.test.jsx`, y la ficha de una queja lo
 * copió otra vez. A la tercera página ya eran tres maneras de esperar y de contar
 * lo pedido sin servir, así que vive aquí. No es una prueba (vitest sólo recoge
 * `*.test.*`): lo importan las pruebas.
 *
 * Un escenario es:
 *   - `nombre`: lo que se lee en el fallo.
 *   - `fetch`: `{ ruta: json }`, lo único que la página recibe. Todo lo servido
 *     tiene que llegar a «listo», y lo que la página pide sin estar aquí se
 *     devuelve en `pedidasSinServir`: la lista se vigila en los dos sentidos.
 *   - `pinta()`: el árbol, dentro de `MemoryRouter` y `LocaleProvider`.
 *   - `ruta` (opcional): la URL inicial del router, para las páginas con `:id`.
 *   - `listo(container)`: que la rama que el escenario abre ya está pintada.
 *   - `faltanAdrede` (opcional): rutas que el escenario no sirve a propósito.
 *   - `interactua(container)` (opcional): lo que hay que pulsar; devuelve más
 *     piezas leídas, que van detrás de las de la carga.
 */
import type { ReactElement } from 'react'
import { expect } from 'vitest'
import { render, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

import { LocaleProvider } from '../../src/i18n'
import { invalidateSnapshots, peekSnapshot } from '../../src/lib/snapshot-store'
import { installFetchMock } from './mockFetch'
import { lectura } from './castellano'

/** Los datos del último pintado: si el siguiente trae otros, la caché se vacía. */
let ultimoMapa: Record<string, unknown> | null = null

export interface Escenario {
  nombre: string
  fetch?: Record<string, unknown>
  pinta: () => ReactElement
  ruta?: string
  listo: (container: HTMLElement) => boolean
  faltanAdrede?: string[]
  interactua?: (container: HTMLElement) => Promise<string[]> | string[]
}

export async function pintaYLee(
  escenario: Escenario,
  idioma: 'es' | 'ca',
  { lee = lectura }: { lee?: (container: HTMLElement) => string[] } = {},
): Promise<{ piezas: string[]; pedidasSinServir: string[] }> {
  // La caché de instantáneas vive lo que la sesión, y el setup sólo la vacía entre
  // pruebas: una prueba que pinte dos escenarios leería en el segundo lo del primero.
  // Se vacía sólo cuando cambian los datos. Pintar el mismo escenario en el otro
  // idioma reutiliza lo ya servido, como hacía la guarda de la portada antes de
  // compartir esto: vaciarla también ahí obligaba a la segunda pasada a volver a
  // pedirlo todo, y con la suite entera en paralelo la columna editorial se quedó
  // quieta con un bloque sin pintar —medido: 226 piezas en castellano, 188 en
  // valencià—.
  const mapa = escenario.fetch ?? {}
  if (mapa !== ultimoMapa) {
    invalidateSnapshots()
    ultimoMapa = mapa
  }
  localStorage.setItem('cp:lang', idioma)
  const fetchFn = installFetchMock(mapa)
  const { container, unmount } = render(
    <MemoryRouter initialEntries={escenario.ruta ? [escenario.ruta] : undefined}>
      <LocaleProvider>{escenario.pinta()}</LocaleProvider>
    </MemoryRouter>,
  )
  const rutas = Object.keys(mapa)
  let previa: string[] | null = null
  await waitFor(
    () => {
      const sinLlegar = rutas.filter((r) => peekSnapshot(r)?.status !== 'ready')
      expect(sinLlegar, `${escenario.nombre} (${idioma}): datos sin llegar`).toEqual([])
      expect(
        escenario.listo(container),
        `${escenario.nombre} (${idioma}): no ha pintado su rama`,
      ).toBe(true)
      const ahora = lee(container)
      const quieta = previa !== null && JSON.stringify(ahora) === JSON.stringify(previa)
      previa = ahora
      expect(quieta, `${escenario.nombre} (${idioma}): la lectura todavía se mueve`).toBe(true)
    },
    { timeout: 15000 },
  )
  const pedidasSinServir = [
    ...new Set(fetchFn.mock.calls.map(([u]) => String(u).replace(/^https?:\/\/[^/]+/, ''))),
  ].filter(
    (p) => p.startsWith('/data/') && !(p in mapa) && !(escenario.faltanAdrede ?? []).includes(p),
  )
  const extra = escenario.interactua ? await escenario.interactua(container) : []
  unmount()
  return { piezas: [...previa, ...extra], pedidasSinServir }
}
