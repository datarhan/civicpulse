/**
 * Dónde vive de verdad un fichero que un guion nombra.
 *
 * `analyseScriptIo` devuelve BASENAMES: su cabecera dice que
 * «public/data/<name>.json» es el único espacio de nombres del que habla, y su
 * consumidor original —`check:data-graph`— sólo compara contra ficheros
 * publicados, así que la ambigüedad nunca le costó nada. Aquí sí cuesta: este
 * despiece dibujó nueve ficheros de `editorial/` —el directorio que está
 * ignorado por git PRECISAMENTE porque guarda prosa de máquina sin revisar
 * sobre personas vivas— como si estuvieran en `public/data/`, que es decir
 * PUBLICADO. Es la regla más cara de este repositorio, del revés.
 *
 * De ahí las cuatro salidas, no dos: publicado, interno (existe y se sabe
 * dónde), ambiguo (el nombre casa con varios ficheros y unirlos sería inventar
 * una relación) e inexistente (el escaneo devolvió ruido).
 */
import { describe, it, expect } from 'vitest'
import { construirGrafoApp, ENTRADAS_VACIAS } from '../src/scraper/app-graph'

const escribe = (ruta: string, nombre: string) => ({
  ruta,
  fuente: `const OUT = resolve(D, '${nombre}')\nwriteFileSync(OUT, x)`,
})

describe('app-graph · dónde vive el fichero', () => {
  it('un nombre que NO está en public/data no se dibuja como publicado', () => {
    const grafo = construirGrafoApp({
      ...ENTRADAS_VACIAS,
      scripts: [escribe('scripts/push-curation-queue.ts', 'curation-decisions.json')],
      ficheros: { 'curation-decisions.json': ['editorial/curation-decisions.json'] },
    })
    const n = grafo.nodos.find((x) => x.id === 'snapshot:curation-decisions.json')
    expect(n).toBeDefined()
    expect(n?.ruta).toBe('editorial/curation-decisions.json')
    expect(n?.publicado).toBe(false)
  })

  it('un nombre que SÍ está en public/data se dibuja publicado y con su ruta', () => {
    const grafo = construirGrafoApp({
      ...ENTRADAS_VACIAS,
      scripts: [escribe('scripts/scrape-padron.ts', 'padron.json')],
      snapshots: [{ nombre: 'padron.json', bytes: 10, generatedAt: null, source: null }],
    })
    const n = grafo.nodos.find((x) => x.id === 'snapshot:padron.json')
    expect(n?.ruta).toBe('public/data/padron.json')
    expect(n?.publicado).toBe(true)
  })

  it('dos guiones que nombran el mismo basename ambiguo NO quedan unidos', () => {
    // `index.json` es `.voiceprints/index.json` para el enrolamiento de voces y
    // `public/data/pleno-claims/index.json` para el manifiesto publicado. Un
    // solo nodo ataba la herramienta de voces al manifiesto legal.
    const grafo = construirGrafoApp({
      ...ENTRADAS_VACIAS,
      scripts: [
        escribe('scripts/enroll-voice.ts', 'index.json'),
        escribe('scripts/check-solicitudes.ts', 'index.json'),
      ],
      ficheros: {
        'index.json': ['.voiceprints/index.json', 'public/data/pleno-claims/index.json'],
      },
    })
    const tocados = grafo.aristas.filter((a) => a.de.startsWith('script:')).map((a) => a.a)
    expect(new Set(tocados).size).toBe(2)
    for (const id of tocados) {
      const n = grafo.nodos.find((x) => x.id === id)
      expect(n?.publicado).toBe(false)
      expect(n?.detalle ?? '').toMatch(/ambig/i)
    }
  })

  it('un nombre que no corresponde a ningún fichero no se dibuja, y se declara', () => {
    // `check-data-graph.ts` lleva el marcador `// data-graph: reads ${p}`
    // DENTRO de una plantilla, en su propio mensaje de error. El escaneo se lee
    // a sí mismo y devuelve basura.
    const grafo = construirGrafoApp({
      ...ENTRADAS_VACIAS,
      scripts: [escribe('scripts/check-data-graph.ts', 'no-existe-en-ningun-sitio.json')],
    })
    expect(grafo.nodos.map((n) => n.id)).not.toContain('snapshot:no-existe-en-ningun-sitio.json')
    expect(grafo.averias.noMedido.map((x) => x.motivo).join(' ')).toMatch(
      /no-existe-en-ningun-sitio/,
    )
  })

  it('control: sin la resolución, el caso publicado seguiría pasando', () => {
    // Sin este control, una implementación que devolviera SIEMPRE «no lo
    // dibujo» pasaría las tres pruebas de arriba.
    const grafo = construirGrafoApp({
      ...ENTRADAS_VACIAS,
      scripts: [escribe('scripts/scrape-padron.ts', 'padron.json')],
      snapshots: [{ nombre: 'padron.json', bytes: 10, generatedAt: null, source: null }],
    })
    expect(grafo.aristas.length).toBeGreaterThan(0)
  })
})

describe('app-graph · un guion cuyo escaneo no ató sus escrituras no es un proceso', () => {
  // `scrape-asociaciones.ts` liga la ruta con dos argumentos antes de la
  // cadena, así que `analyseScriptIo` VE `asociaciones.json` y no lo sabe
  // clasificar. Bajarlo a la banda «no escribe nada» es plegar «no lo pude
  // leer» dentro de «no hay nada», que es el defecto que este repositorio
  // tiene nombre propio.
  const OPACO = "const p = construir(D, 'asociaciones.json')\nwriteFileSync(p, x)"

  it('se queda en el carril de guion, no baja a proceso', () => {
    const grafo = construirGrafoApp({
      ...ENTRADAS_VACIAS,
      scripts: [{ ruta: 'scripts/scrape-asociaciones.ts', fuente: OPACO }],
      snapshots: [{ nombre: 'asociaciones.json', bytes: 10, generatedAt: null, source: null }],
    })
    const n = grafo.nodos.find((x) => x.id === 'script:scrape-asociaciones.ts')
    expect(n?.carril).toBe('script')
  })

  it('control: uno que de verdad no escribe nada SÍ baja a proceso', () => {
    const grafo = construirGrafoApp({
      ...ENTRADAS_VACIAS,
      scripts: [
        {
          ruta: 'scripts/check-sparse.ts',
          fuente:
            "const IN = resolve(D, 'padron.json')\nconst d = JSON.parse(readFileSync(IN, 'utf8'))",
        },
      ],
      snapshots: [{ nombre: 'padron.json', bytes: 10, generatedAt: null, source: null }],
    })
    const n = grafo.nodos.find((x) => x.id === 'script:check-sparse.ts')
    expect(n?.carril).toBe('proceso')
  })
})

describe('app-graph · un fichero, un nodo', () => {
  // Diez guiones de shell existían DOS veces: `proceso:scrape-all.sh`, con
  // todos sus pasos colgando, y `script:scrape-all.sh`, un muñón vacío. Los
  // seis crones apuntaban al muñón, así que `com.civicpulse.hallazgos` —la
  // tubería de las 09:30, la que transcribe, extrae y auto-cura hallazgos sobre
  // concejales con nombre y apellidos— alcanzaba DOS nodos. El rastro, que es
  // la función principal de esta página, moría en el primer salto.
  const entradas = {
    ...ENTRADAS_VACIAS,
    comandos: {
      'pipeline:x': 'bash scripts/hallazgos-pipeline.sh',
      paso: 'npx tsx scripts/paso.ts',
    },
    orquestadores: [{ ruta: 'scripts/hallazgos-pipeline.sh', fuente: 'npm run paso' }],
    scripts: [
      { ruta: 'scripts/paso.ts', fuente: "const O = resolve(D, 'x.json')\nwriteFileSync(O, y)" },
    ],
    snapshots: [{ nombre: 'x.json', bytes: 10, generatedAt: null, source: null }],
    crones: [
      {
        etiqueta: 'com.civicpulse.hallazgos',
        fichero: 'scripts/com.civicpulse.hallazgos.plist',
        programa: 'scripts/hallazgos-pipeline.sh',
        hora: 9,
        minuto: 30,
        log: null,
      },
    ],
  }

  it('el cron apunta al orquestador de verdad, no a un muñón con el mismo nombre', () => {
    const grafo = construirGrafoApp(entradas)
    const conEsaRuta = grafo.nodos.filter((n) => n.ruta === 'scripts/hallazgos-pipeline.sh')
    expect(conEsaRuta).toHaveLength(1)
    expect(grafo.aristas).toContainEqual({
      de: 'proceso:com.civicpulse.hallazgos',
      a: 'proceso:hallazgos-pipeline.sh',
      tipo: 'programa',
      origen: 'declarada',
    })
  })

  it('y el rastro llega desde el cron hasta el snapshot', () => {
    const grafo = construirGrafoApp(entradas)
    const abajo = new Map<string, string[]>()
    for (const a of grafo.aristas) abajo.set(a.de, [...(abajo.get(a.de) ?? []), a.a])
    const visto = new Set(['proceso:com.civicpulse.hallazgos'])
    for (const id of visto) for (const n of abajo.get(id) ?? []) visto.add(n)
    expect([...visto]).toContain('snapshot:x.json')
  })

  it('un guion que sólo nombra un cron, y que nadie leyó, no se declara analizado', () => {
    const grafo = construirGrafoApp({
      ...ENTRADAS_VACIAS,
      crones: [
        {
          etiqueta: 'com.x',
          fichero: 'scripts/com.x.plist',
          programa: 'scripts/jamas-leido.sh',
          hora: 1,
          minuto: 0,
          log: null,
        },
      ],
    })
    const n = grafo.nodos.find((x) => x.ruta === 'scripts/jamas-leido.sh')
    expect(n?.analizado).toBe(false)
  })
})

describe('app-graph · el bot llega hasta el sitio', () => {
  // Éste es el único sitio por donde entran datos personales al sistema, y el
  // rastro se cortaba en la tabla de SQLite: `Telegram` alcanzaba veinte nodos
  // y ninguno era `quejas.json`. Además `leerBot` leía los dieciséis servicios
  // —`photo-anonymize`, `process-photos`, `export`— y el grafo los tiraba: sólo
  // se usaban para contar en una frase.
  const entradas = {
    ...ENTRADAS_VACIAS,
    bot: {
      comandos: ['queja.ts'],
      servicios: ['export.ts', 'photo-anonymize.ts'],
      datos: [],
      fuentes: {},
      tablas: ['quejas'],
      exporta: 'quejas.json',
    },
    flujos: [
      {
        fichero: '.github/workflows/pull-quejas.yml',
        nombre: 'pull quejas',
        cron: '0 4 * * *',
        ejecuta: [],
      },
    ],
    snapshots: [{ nombre: 'quejas.json', bytes: 10, generatedAt: null, source: null }],
    rutas: {
      rutas: ['/quejas'],
      rutasPorSnapshot: { 'quejas.json': ['/quejas'] },
      paginaPorRuta: {},
      snapshotsDe: {},
      rutasPorFichero: {},
      importa: {},
    },
  }

  it('dibuja los servicios del bot, no sólo cuántos son', () => {
    const grafo = construirGrafoApp(entradas)
    const ids = grafo.nodos.map((n) => n.id)
    expect(ids).toContain('proceso:bot/services/photo-anonymize.ts')
    expect(grafo.nodos.find((n) => n.id === 'proceso:bot/services/photo-anonymize.ts')?.clase).toBe(
      'servicio-bot',
    )
  })

  it('el rastro va del vecino a la página, pasando por la tabla y el export', () => {
    const grafo = construirGrafoApp(entradas)
    const abajo = new Map<string, string[]>()
    for (const a of grafo.aristas) abajo.set(a.de, [...(abajo.get(a.de) ?? []), a.a])
    const visto = new Set(['fuente:Telegram'])
    for (const id of visto) for (const n of abajo.get(id) ?? []) visto.add(n)
    expect([...visto]).toContain('snapshot:quejas (SQLite)')
    expect([...visto]).toContain('proceso:bot/services/export.ts')
    expect([...visto]).toContain('snapshot:quejas.json')
    expect([...visto]).toContain('ruta:/quejas')
  })
})

describe('app-graph · el hook no es un callejón sin salida', () => {
  // Los setenta y nueve hooks tenían CERO aristas de salida y las cuarenta y
  // una vistas, CERO de entrada. La cabecera de carriles de la página promete
  // `snapshot → hook → vista → ruta` y el grafo dibujaba tres hechos sueltos:
  // el hook moría, la vista salía de la nada y el snapshot saltaba directo a la
  // ruta. Pinchar `useTenders` no encendía nada aguas abajo.
  const entradas = {
    ...ENTRADAS_VACIAS,
    hooks: [{ ruta: 'src/hooks/useTenders.js', fuente: '' }],
    snapshots: [{ nombre: 'tenders.json', bytes: 10, generatedAt: null, source: null }],
    rutas: {
      rutas: ['/presupuesto'],
      rutasPorSnapshot: { 'tenders.json': ['/presupuesto'] },
      paginaPorRuta: { '/presupuesto': 'src/pages/Presupuesto.jsx' },
      snapshotsDe: { 'src/hooks/useTenders.js': ['tenders.json'] },
      rutasPorFichero: { 'src/hooks/useTenders.js': ['/presupuesto'] },
      importa: { 'src/pages/Presupuesto.jsx': ['src/hooks/useTenders.js'] },
    },
  }

  it('el hook alimenta la vista que lo importa', () => {
    const grafo = construirGrafoApp(entradas)
    expect(grafo.aristas).toContainEqual({
      de: 'hook:useTenders.js',
      a: 'vista:Presupuesto.jsx',
      tipo: 'sirve',
      origen: 'derivada',
    })
  })

  it('la cadena entera va del snapshot a la ruta pasando por el hook', () => {
    const grafo = construirGrafoApp(entradas)
    const abajo = new Map<string, string[]>()
    for (const a of grafo.aristas) abajo.set(a.de, [...(abajo.get(a.de) ?? []), a.a])
    const visto = new Set(['hook:useTenders.js'])
    for (const id of visto) for (const n of abajo.get(id) ?? []) visto.add(n)
    expect([...visto]).toContain('ruta:/presupuesto')
  })

  it('un hook que ninguna página monta no recibe una arista inventada', () => {
    const grafo = construirGrafoApp({
      ...entradas,
      rutas: { ...entradas.rutas, rutasPorFichero: {}, importa: {} },
    })
    expect(grafo.aristas.filter((a) => a.de === 'hook:useTenders.js')).toHaveLength(0)
  })
})

describe('app-graph · lo publicado que va agrupado', () => {
  // Los 23 ficheros de `pleno-claims/` y los 21 de `journalist-reports/` ya se
  // dibujan, pero como UNA pieza por directorio: el código los direcciona por
  // plantilla, así que cuál de ellos toca cada relación no se deriva. Que no se
  // derive es una cosa; callarlo, otra.
  it('declara cuántos ficheros van agrupados, y en qué carpetas', () => {
    const grafo = construirGrafoApp({
      ...ENTRADAS_VACIAS,
      snapshots: [{ nombre: 'padron.json', bytes: 10, generatedAt: null, source: null }],
      colecciones: [
        { nombre: 'pleno-claims/', ficheros: 2, bytes: 10, generatedAt: null },
        { nombre: 'journalist-reports/', ficheros: 1, bytes: 10, generatedAt: null },
      ],
    })
    const aviso = grafo.averias.noMedido.find((x) => x.codigo === 'fichero-dentro-de-coleccion')
    expect(aviso).toBeDefined()
    expect(aviso?.motivo).toMatch(/\b3\b/)
    expect(aviso?.motivo).toContain('pleno-claims/')
    expect(aviso?.motivo).toContain('journalist-reports/')
  })

  it('control: sin colecciones no inventa el aviso', () => {
    const grafo = construirGrafoApp({
      ...ENTRADAS_VACIAS,
      snapshots: [{ nombre: 'padron.json', bytes: 10, generatedAt: null, source: null }],
    })
    expect(grafo.averias.noMedido.some((x) => x.codigo === 'fichero-dentro-de-coleccion')).toBe(
      false,
    )
  })
})

describe('app-graph · «se publica y nadie lo lee» sólo de lo publicado', () => {
  // De treinta y siete avisos, veintidós eran ficheros que no están
  // publicados: colas de `editorial/`, las cinco tablas SQLite del bot y dos
  // directorios. Decir de una tabla del bot que «se publica y ninguna página la
  // lee» es afirmar lo contrario de lo que pasa —y es la mitad de la lista.
  it('no señala un fichero que no está bajo public/', () => {
    const grafo = construirGrafoApp({
      ...ENTRADAS_VACIAS,
      scripts: [
        {
          ruta: 'scripts/push-curation-queue.ts',
          fuente: "const O = resolve(D, 'curation-decisions.json')\nwriteFileSync(O, x)",
        },
      ],
      ficheros: { 'curation-decisions.json': ['editorial/curation-decisions.json'] },
    })
    expect(grafo.averias.averias.filter((a) => a.codigo === 'sin-superficie')).toHaveLength(0)
  })

  it('control: uno publicado que nadie lee SÍ se señala', () => {
    const grafo = construirGrafoApp({
      ...ENTRADAS_VACIAS,
      scripts: [
        {
          ruta: 'scripts/scrape-x.ts',
          fuente: "const O = resolve(D, 'huerfano.json')\nwriteFileSync(O, x)",
        },
      ],
      snapshots: [{ nombre: 'huerfano.json', bytes: 10, generatedAt: null, source: null }],
    })
    expect(grafo.averias.averias.map((a) => a.nodo)).toContain('snapshot:huerfano.json')
  })
})

describe('app-graph · el parser importado con extensión', () => {
  // `import { x } from '../src/scraper/consell-cv.ts'` —con `.ts` puesto— se
  // caía: el recorte del basename dejaba `consell-cv.ts` y luego se le añadía
  // otro `.ts`. Dieciséis parsers salían sin que nadie los importara.
  it('reconoce el import que trae la extensión puesta', () => {
    const grafo = construirGrafoApp({
      ...ENTRADAS_VACIAS,
      parsers: [{ ruta: 'src/scraper/consell-cv.ts', fuente: '' }],
      scripts: [
        {
          ruta: 'scripts/scrape-consell-cv.ts',
          fuente:
            "import {\n  a,\n} from '../src/scraper/consell-cv.ts'\nconst O = resolve(D, 'consell-cv.json')\nwriteFileSync(O, a)",
        },
      ],
      snapshots: [{ nombre: 'consell-cv.json', bytes: 10, generatedAt: null, source: null }],
    })
    expect(grafo.aristas).toContainEqual({
      de: 'script:scrape-consell-cv.ts',
      a: 'parser:consell-cv.ts',
      tipo: 'importa',
      origen: 'derivada',
    })
  })
})

describe('app-graph · qué tabla toca cada pieza del bot, derivado', () => {
  // La primera versión colgaba las CINCO tablas de `export.ts` y las cinco del
  // nodo `bot`, con `origen: 'declarada'` — que en este vocabulario quiere
  // decir «lo dice el fichero». No lo decía: era una suposición. `export.ts`
  // tiene treinta y una líneas y delega en `snapshot.ts`.
  const entradas = {
    ...ENTRADAS_VACIAS,
    bot: {
      comandos: ['queja.ts'],
      servicios: ['snapshot.ts'],
      datos: [],
      tablas: ['quejas', 'subscriptions'],
      exporta: null,
      fuentes: {
        'bot/src/commands/queja.ts': 'db.prepare("INSERT INTO quejas (id) VALUES (?)")',
        'bot/src/services/snapshot.ts': 'db.prepare("SELECT * FROM quejas WHERE estado = ?")',
      },
    },
  }

  it('deriva la escritura del INSERT y la lectura del SELECT', () => {
    const grafo = construirGrafoApp(entradas)
    expect(grafo.aristas).toContainEqual({
      de: 'proceso:bot/commands/queja.ts',
      a: 'snapshot:quejas (SQLite)',
      tipo: 'escribe',
      origen: 'derivada',
    })
    expect(grafo.aristas).toContainEqual({
      de: 'snapshot:quejas (SQLite)',
      a: 'proceso:bot/services/snapshot.ts',
      tipo: 'lee',
      origen: 'derivada',
    })
  })

  it('no inventa la tabla que ningún fichero nombra: la deja colgando del bot', () => {
    const grafo = construirGrafoApp(entradas)
    const suscripciones = grafo.aristas.filter((a) => a.a === 'snapshot:subscriptions (SQLite)')
    expect(suscripciones).toEqual([
      {
        de: 'proceso:bot',
        a: 'snapshot:subscriptions (SQLite)',
        tipo: 'escribe',
        origen: 'declarada',
      },
    ])
    // Y la que SÍ se derivó no se cuelga además del nodo genérico.
    expect(grafo.aristas).not.toContainEqual({
      de: 'proceso:bot',
      a: 'snapshot:quejas (SQLite)',
      tipo: 'escribe',
      origen: 'declarada',
    })
  })
})
