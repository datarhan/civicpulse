/**
 * Las aristas DIRECTAS del grafo del front, y la lista de rutas locales.
 *
 * `construirGrafoRutas` ya calculaba las dos cosas y las tiraba: `snapshotsDe`
 * se quedaba dentro de un cierre y `/curator` estaba escrito a mano dentro del
 * filtro. El despiece necesita la primera para poder dibujar `useX → x.json` en
 * vez de sólo el cierre transitivo, y la segunda para no mandar a la revisión
 * lectora a leer una ruta que en producción no existe.
 */
import { describe, it, expect } from 'vitest'
import { resolve } from 'node:path'
import { construirGrafoRutas, rutasPublicas, RUTAS_LOCALES } from '../scripts/lib/route-graph'

const SRC = resolve(__dirname, '../src')

describe('route-graph · aristas directas', () => {
  const grafo = construirGrafoRutas(SRC)

  it('expone qué snapshots nombra cada fichero DIRECTAMENTE', () => {
    // Suelo: si esto devolviera un mapa vacío la prueba pasaría sin medir nada.
    expect(grafo.snapshotsDe.size).toBeGreaterThan(20)

    const padron = grafo.snapshotsDe.get(resolve(SRC, 'hooks/usePadron.js'))
    expect([...(padron ?? [])]).toContain('padron.json')
  })

  it('lo directo es un subconjunto de lo transitivo, nunca al revés', () => {
    const rutasDePadron = grafo.rutasPorSnapshot.get('padron.json')
    expect(rutasDePadron && rutasDePadron.size).toBeGreaterThan(0)
    // El hook nombra el snapshot; la página lo alcanza por imports. Si lo
    // directo trajera algo que lo transitivo no tiene, el grafo se contradice.
    for (const [fichero, snaps] of grafo.snapshotsDe) {
      for (const s of snaps) {
        if (!grafo.rutasPorFichero.has(fichero)) continue
        expect(grafo.rutasPorSnapshot.has(s)).toBe(true)
      }
    }
  })
})

describe('route-graph · rutas locales', () => {
  it('declara las rutas que no existen en producción', () => {
    expect(RUTAS_LOCALES).toContain('/curator')
  })

  it('rutasPublicas no devuelve ninguna ruta local', () => {
    const publicas = rutasPublicas(construirGrafoRutas(SRC))
    for (const local of RUTAS_LOCALES) expect(publicas).not.toContain(local)
  })
})
