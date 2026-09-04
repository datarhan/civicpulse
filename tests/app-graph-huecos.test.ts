/**
 * Los huecos que el mapa declaraba en vez de cerrar.
 *
 * La versión anterior era honesta —decía dónde estaba ciega— y eso es la mitad
 * del trabajo. Esta cierra lo que se puede derivar y deja declarado sólo lo que
 * de verdad no se puede:
 *
 * · 48 ficheros publicados en subdirectorios (`pleno-claims/` 23,
 *   `journalist-reports/` 21, `reportajes/` 4) que el mapa no dibujaba.
 * · ~60 relaciones que el escaneo VE y cuyo verbo no sabe decir. Antes
 *   desaparecían; ahora existen con el verbo que sí se sabe: `nombra`.
 * · El SQL del bot, que vive en `bot/src/db/` y no en el servicio que lo llama.
 */
import { describe, it, expect } from 'vitest'
import { construirGrafoApp, ENTRADAS_VACIAS } from '../src/scraper/app-graph'

describe('app-graph · las colecciones publicadas', () => {
  const entradas = {
    ...ENTRADAS_VACIAS,
    colecciones: [{ nombre: 'pleno-claims/', ficheros: 23, bytes: 900_000, generatedAt: null }],
    scripts: [
      {
        ruta: 'scripts/chunk-pleno-claims.ts',
        fuente: "const D = resolve('public/data/pleno-claims')",
      },
    ],
    hooks: [
      { ruta: 'src/hooks/usePlenoClaims.js', fuente: 'fetch(`/data/pleno-claims/${id}.json`)' },
    ],
    rutas: {
      rutas: ['/plenos/:id'],
      rutasPorSnapshot: {},
      paginaPorRuta: { '/plenos/:id': 'src/pages/PlenoDetalle.jsx' },
      snapshotsDe: {},
      rutasPorFichero: { 'src/hooks/usePlenoClaims.js': ['/plenos/:id'] },
      importa: {},
    },
  }

  it('dibuja el directorio como una pieza, con cuántos ficheros tiene', () => {
    const grafo = construirGrafoApp(entradas)
    const n = grafo.nodos.find((x) => x.id === 'snapshot:pleno-claims/')
    expect(n?.publicado).toBe(true)
    expect(n?.ruta).toBe('public/data/pleno-claims/')
    expect(n?.detalle).toMatch(/23/)
  })

  it('el hook que los carga cuelga de la colección, y llega a su ruta', () => {
    const grafo = construirGrafoApp(entradas)
    expect(grafo.aristas).toContainEqual({
      de: 'snapshot:pleno-claims/',
      a: 'hook:usePlenoClaims.js',
      tipo: 'sirve',
      origen: 'derivada',
    })
    const abajo = new Map<string, string[]>()
    for (const a of grafo.aristas) abajo.set(a.de, [...(abajo.get(a.de) ?? []), a.a])
    const visto = new Set(['snapshot:pleno-claims/'])
    for (const id of visto) for (const n of abajo.get(id) ?? []) visto.add(n)
    expect([...visto]).toContain('ruta:/plenos/:id')
  })

  it('el guion que nombra el directorio queda ligado a él', () => {
    const grafo = construirGrafoApp(entradas)
    expect(
      grafo.aristas.some(
        (a) => a.de === 'script:chunk-pleno-claims.ts' && a.a === 'snapshot:pleno-claims/',
      ),
    ).toBe(true)
  })

  it('control: sin colecciones no aparece ninguna pieza de directorio', () => {
    const grafo = construirGrafoApp({ ...entradas, colecciones: [] })
    expect(grafo.nodos.map((n) => n.id)).not.toContain('snapshot:pleno-claims/')
  })
})

describe('app-graph · «lo nombra» es un cuarto verbo, no un silencio', () => {
  // `check-vocabulary.ts` lleva una tabla `['boe.json', ['items']]` y
  // `draft-finding.ts` liga `const FINDINGS = resolve('public/data/…')` y lo usa
  // por un ayudante local. El escaneo VE el fichero y no sabe si lo lee o lo
  // escribe. Antes la relación desaparecía entera; ahora existe con el verbo
  // que sí se sabe. Ensanchar el escáner para adivinar el verbo sería justo lo
  // que este repositorio tiene prohibido.
  const entradas = {
    ...ENTRADAS_VACIAS,
    scripts: [
      { ruta: 'scripts/check-vocabulary.ts', fuente: "const TABLA = [['boe.json', ['items']]]" },
    ],
    snapshots: [{ nombre: 'boe.json', bytes: 10, generatedAt: null, source: null }],
  }

  it('dibuja la relación con el verbo que se sabe', () => {
    const grafo = construirGrafoApp(entradas)
    expect(grafo.aristas).toContainEqual({
      de: 'script:check-vocabulary.ts',
      a: 'snapshot:boe.json',
      tipo: 'nombra',
      origen: 'derivada',
    })
  })

  it('y NO la disfraza de escritura ni de lectura', () => {
    const grafo = construirGrafoApp(entradas)
    const suyas = grafo.aristas.filter(
      (a) => a.de.startsWith('script:') || a.a.startsWith('script:'),
    )
    expect(suyas.map((a) => a.tipo)).not.toContain('escribe')
    expect(suyas.map((a) => a.tipo)).not.toContain('lee')
  })

  it('control: una escritura que SÍ se ata sigue siendo una escritura', () => {
    const grafo = construirGrafoApp({
      ...ENTRADAS_VACIAS,
      scripts: [
        {
          ruta: 'scripts/scrape-boe.ts',
          fuente: "const O = resolve(D, 'boe.json')\nwriteFileSync(O, x)",
        },
      ],
      snapshots: [{ nombre: 'boe.json', bytes: 10, generatedAt: null, source: null }],
    })
    expect(grafo.aristas.map((a) => a.tipo)).toContain('escribe')
    expect(grafo.aristas.map((a) => a.tipo)).not.toContain('nombra')
  })
})

describe('app-graph · el SQL del bot vive en bot/src/db', () => {
  // `snapshot.ts` —el servicio que arma el export— no tiene una sola sentencia
  // SQL: importa `listRecentQuejas` de `db/queries.ts`. Sin la capa de datos
  // dibujada, la pieza que de verdad lee las tablas no salía.
  const entradas = {
    ...ENTRADAS_VACIAS,
    bot: {
      comandos: [],
      servicios: ['snapshot.ts'],
      datos: ['queries.ts'],
      fuentes: {
        'bot/src/services/snapshot.ts': "import { listRecentQuejas } from '../db/queries.ts'",
        'bot/src/db/queries.ts': 'db.prepare("SELECT * FROM quejas ORDER BY id")',
      },
      tablas: ['quejas'],
      exporta: null,
    },
  }

  it('dibuja la capa de datos y le cuelga la tabla', () => {
    const grafo = construirGrafoApp(entradas)
    expect(grafo.nodos.map((n) => n.id)).toContain('proceso:bot/db/queries.ts')
    expect(grafo.aristas).toContainEqual({
      de: 'snapshot:quejas (SQLite)',
      a: 'proceso:bot/db/queries.ts',
      tipo: 'lee',
      origen: 'derivada',
    })
  })

  it('y liga el servicio que la importa', () => {
    const grafo = construirGrafoApp(entradas)
    expect(grafo.aristas).toContainEqual({
      de: 'proceso:bot/db/queries.ts',
      a: 'proceso:bot/services/snapshot.ts',
      tipo: 'alimenta',
      origen: 'derivada',
    })
  })
})

describe('app-graph · «ninguna página lo lee» sigue la cadena del front, no la del back', () => {
  // Con la comprobación a UN salto, una colección que llega a su ruta por el
  // hook salía señalada. Con el cierre transitivo entero pasaría lo contrario y
  // sería peor: `pleno-claims-verified.json` (9,5 MB) lo lee
  // `chunk-pleno-claims.ts`, que escribe los trozos que sí se publican — y ese
  // camino diría «una página lo lee» de un fichero que ninguna página carga.
  // La cadena que cuenta es la del navegador: hook, vista, ruta.
  const base = {
    ...ENTRADAS_VACIAS,
    colecciones: [{ nombre: 'pleno-claims/', ficheros: 23, bytes: 10, generatedAt: null }],
    hooks: [
      { ruta: 'src/hooks/usePlenoClaims.js', fuente: 'fetch(`/data/pleno-claims/${id}.json`)' },
    ],
    snapshots: [
      { nombre: 'pleno-claims-verified.json', bytes: 10, generatedAt: null, source: null },
    ],
    scripts: [
      {
        ruta: 'scripts/chunk-pleno-claims.ts',
        fuente:
          "const IN = resolve(D, 'pleno-claims-verified.json')\n" +
          "const d = JSON.parse(readFileSync(IN, 'utf8'))\n" +
          "const OUT = resolve('public/data/pleno-claims')",
      },
    ],
    rutas: {
      rutas: ['/plenos/:id'],
      rutasPorSnapshot: {},
      paginaPorRuta: { '/plenos/:id': 'src/pages/PlenoDetalle.jsx' },
      snapshotsDe: {},
      rutasPorFichero: { 'src/hooks/usePlenoClaims.js': ['/plenos/:id'] },
      importa: {},
    },
  }

  it('la colección que llega por su hook NO se señala', () => {
    const grafo = construirGrafoApp(base)
    const señalados = grafo.averias.averias
      .filter((a) => a.codigo === 'sin-superficie')
      .map((a) => a.nodo)
    expect(señalados).not.toContain('snapshot:pleno-claims/')
  })

  it('el fichero que sólo alcanza una ruta pasando por un guion SÍ se señala', () => {
    const grafo = construirGrafoApp(base)
    const señalados = grafo.averias.averias
      .filter((a) => a.codigo === 'sin-superficie')
      .map((a) => a.nodo)
    expect(señalados).toContain('snapshot:pleno-claims-verified.json')
  })
})
