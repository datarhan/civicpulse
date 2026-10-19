import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { construirGrafoRutas } from '../scripts/lib/route-graph'

/**
 * Las formas de layout que App.jsx todavía no usa, sobre un App.jsx de juguete.
 *
 * `routes-for-changes.test.ts` fija el caso real —el armazón de reportajes— y
 * eso sólo prueba UN bloque, sin anidar, con hijos de una línea y de varias.
 * Lo que la cabecera de `layoutsSinRuta` promete además —un layout dentro de
 * otro, el cierre que devuelve el control al nivel de fuera, una ruta con
 * `path` e hijos que NO es layout— no lo ejercita nada del sitio, y una promesa
 * sin prueba es la que se rompe sin ruido.
 */

let dir: string
let grafo: ReturnType<typeof construirGrafoRutas>
const de = (f: string) => [...(grafo.rutasPorFichero.get(resolve(dir, f)) ?? [])].sort()

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'route-graph-layout-'))
  mkdirSync(join(dir, 'pages'))
  for (const n of ['Fuera', 'Dentro', 'Interior', 'Despues', 'Padre', 'Hijo', 'Exterior']) {
    writeFileSync(join(dir, 'pages', `${n}.jsx`), `export default function ${n}() {}\n`)
  }
  writeFileSync(join(dir, 'pages', 'Compartido.jsx'), 'export const x = 1\n')
  writeFileSync(
    join(dir, 'pages', 'Interno.jsx'),
    "import { x } from './Compartido'\nexport default function Interno() { return x }\n",
  )
  writeFileSync(
    join(dir, 'App.jsx'),
    [
      "const Fuera = lazy(() => import('./pages/Fuera'))",
      "const Dentro = lazy(() => import('./pages/Dentro'))",
      "const Interior = lazy(() => import('./pages/Interior'))",
      "const Despues = lazy(() => import('./pages/Despues'))",
      "const Padre = lazy(() => import('./pages/Padre'))",
      "const Hijo = lazy(() => import('./pages/Hijo'))",
      "const Exterior = lazy(() => import('./pages/Exterior'))",
      "const Interno = lazy(() => import('./pages/Interno'))",
      'export default function App() {',
      '  return (',
      '    <Routes>',
      '      <Route path="/fuera" element={<Fuera />} />',
      '      <Route element={<Exterior />}>',
      '        <Route path="/dentro" element={<Dentro />} />',
      '        {/* un comentario que nombra el cierre, </Route>, no cierra nada */}',
      '        <Route element={<Interno />}>',
      '          <Route',
      '            path="/interior"',
      '            element={<Interior />}',
      '          />',
      '        </Route>',
      '      </Route>',
      '      <Route path="/padre" element={<Padre />}>',
      '        <Route path="/padre/hijo" element={<Hijo />} />',
      '      </Route>',
      '      <Route path="/despues" element={<Despues />} />',
      '    </Routes>',
      '  )',
      '}',
      '',
    ].join('\n'),
  )
  grafo = construirGrafoRutas(dir)
})

afterAll(() => rmSync(dir, { recursive: true, force: true }))

describe('layoutsSinRuta, sobre las formas que el sitio aún no usa', () => {
  it('premisa: las seis rutas con path están montadas, y ningún layout', () => {
    expect(grafo.rutas).toEqual(
      ['/despues', '/dentro', '/fuera', '/interior', '/padre/hijo', '/padre'].sort(),
    )
  })

  it('un layout alcanza todo lo que envuelve, anidado incluido', () => {
    // El `</Route>` del comentario, leído como código, cerraría el exterior
    // tras /dentro y le quitaría /interior.
    expect(de('pages/Exterior.jsx')).toEqual(['/dentro', '/interior'])
  })

  it('el interior sólo lo suyo, y lo que importa viaja con él', () => {
    expect(de('pages/Interno.jsx')).toEqual(['/interior'])
    expect(de('pages/Compartido.jsx')).toEqual(['/interior'])
  })

  it('EL CONTROL: el cierre devuelve el control, y una ruta con path no es layout', () => {
    // Si el `</Route>` no casara, /padre/hijo y /despues caerían dentro del
    // exterior. Y Padre, que tiene `path`, se queda con su ruta y no se lleva
    // la del hijo: sus hijos podrían ser relativos y no se resuelven aquí.
    expect(de('pages/Padre.jsx')).toEqual(['/padre'])
    expect(de('pages/Despues.jsx')).toEqual(['/despues'])
    expect(de('pages/Fuera.jsx')).toEqual(['/fuera'])
  })
})
