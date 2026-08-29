import { describe, it, expect } from 'vitest'
import { resolve } from 'node:path'
import { readFileSync } from 'node:fs'
import { construirGrafoRutas, rutasPublicas } from '../scripts/lib/route-graph'

/**
 * La portada tiene que estar en el grafo de rutas.
 *
 * No lo estuvo nunca. `construirGrafoRutas` siembra desde
 * `<Route path="…" element={<X/>}>`, y `App.jsx` resuelve `/` ANTES de llegar a
 * `<Routes>`, con un `if (onLanding) return <DirectionD/>`. Así que la página
 * más visitada del sitio quedaba fuera de `rutas`, fuera de `rutasPublicas()`,
 * fuera del barrido nocturno y fuera de `check:surfaces` — que informaba «31 de
 * 31 al día» sobre un conjunto que no la contenía. En los 144 KB de
 * `review-sweep.log`, desde el 13 de agosto, no hay ni una línea de `/`.
 *
 * Y tampoco estaba limpia: una pasada a mano del 25 de agosto dejó dos
 * señalamientos vivos que ninguna guarda podía ver.
 *
 * Esta prueba es la que convierte «se dejó de reconocer el patrón» en ruido de
 * una vez, en lugar de en un silencio de dieciséis días.
 */

const grafo = construirGrafoRutas(resolve(__dirname, '..', 'src'))
const publicas = rutasPublicas(grafo)

describe('el grafo de rutas', () => {
  // Anti-hueco: sin esto, un grafo vacío pasaría las de abajo por no tener
  // nada que contradecir.
  it('monta muchas rutas, no un puñado', () => {
    expect(grafo.rutas.length).toBeGreaterThan(20)
  })

  it('incluye la portada entre las públicas', () => {
    expect(
      publicas,
      'si `/` desaparece de aquí, el barrido lector deja de leer la portada y ' +
        'el gate sigue diciendo que va al día',
    ).toContain('/')
  })

  it('sirve la portada con el módulo que App.jsx pinta en esa rama', () => {
    const modulo = grafo.paginaPorRuta.get('/')
    expect(modulo, 'la portada no tiene módulo de página').toBeTruthy()

    // Derivado, no apuntado: se lee de App.jsx cuál es el componente de la
    // rama de portada y se comprueba que el grafo resolvió ESE fichero. Así
    // renombrar DirectionD no rompe la prueba, pero perderlo sí.
    const app = readFileSync(resolve(__dirname, '..', 'src', 'App.jsx'), 'utf8')
    const rama = app.slice(app.indexOf('if (onLanding) {'))
    const componente = [...rama.matchAll(/<(\w+)\s*\/>/g)]
      .map((m) => m[1])
      .find((n) => new RegExp(`const\\s+${n}\\s*=[^\\n]*?import\\(`).test(app))
    expect(componente, 'App.jsx ya no pinta un módulo cargado con import() en `/`').toBeTruthy()
    expect(modulo).toContain(String(componente))
  })

  // Una ruta en la lista que no alcanza ningún dato es una arista hueca: la
  // revisión la leería, pero `remind-stale-copy` y `routes-for-changes`
  // seguirían sin llegar a ella cuando su dato se mueva.
  it('conecta la portada con los snapshots que lee', () => {
    const suyos = [...grafo.rutasPorSnapshot.entries()]
      .filter(([, rutas]) => rutas.has('/'))
      .map(([snap]) => snap)
    expect(suyos.length, 'la portada no alcanza ningún snapshot').toBeGreaterThan(5)
  })
})
