/**
 * `npm run "$s"` — la orden que el mapa no sabía leer.
 *
 * `scrape-all.sh` no invoca sus raspadores por su nombre: los mete en un array
 * de bash y los recorre. El escaneo léxico buscaba `npm run <literal>`, así que
 * las 35 órdenes del bucle desaparecían mientras los `npm run check:x` de más
 * abajo —esos sí literales— salían dibujados.
 *
 * El efecto no era cosmético. «Qué guiones corren solos» es la pregunta más
 * accionable que este mapa contesta, y la contestaba al revés: los raspadores
 * que SÍ corren cada noche figuraban como si no los llamara nadie.
 *
 * La ligadura está en el texto —`for s in "${SCRAPERS[@]}"` y, más abajo,
 * `npm run "$s"`—, así que esto se DERIVA. No se adivina.
 */
import { describe, it, expect } from 'vitest'
import { ENTRADAS_VACIAS, construirGrafoApp } from '../src/scraper/app-graph'

const FUENTE = [
  'SCRAPERS=(',
  '  scrape:boe',
  '  scrape:bop',
  ')',
  '# Una tabla que sólo sirve para preguntar si algo está en ella.',
  'BEST_EFFORT=(',
  '  scrape:boe',
  ')',
  'es_best_effort() {',
  '  for x in "${BEST_EFFORT[@]}"; do [ "$x" = "$1" ] && return 0; done',
  '  return 1',
  '}',
  'for s in "${SCRAPERS[@]}"; do',
  '  if npm run "$s"; then echo ok; fi',
  'done',
  'npm run check:json',
].join('\n')

const entradas = {
  ...ENTRADAS_VACIAS,
  orquestadores: [{ ruta: 'scripts/scrape-all.sh', fuente: FUENTE }],
  comandos: {
    'scrape:boe': 'npx tsx scripts/scrape-boe.ts',
    'scrape:bop': 'npx tsx scripts/scrape-bop.ts',
    'check:json': 'npx tsx scripts/check-json.ts',
  },
  scripts: [
    { ruta: 'scripts/scrape-boe.ts', fuente: "writeFileSync(resolve(D,'boe.json'), x)" },
    { ruta: 'scripts/scrape-bop.ts', fuente: "writeFileSync(resolve(D,'bop.json'), x)" },
    { ruta: 'scripts/check-json.ts', fuente: 'const x = 1' },
  ],
  snapshots: [
    { nombre: 'boe.json', bytes: 10, generatedAt: null, source: null },
    { nombre: 'bop.json', bytes: 10, generatedAt: null, source: null },
  ],
}

describe('app-graph · el bucle sobre un array de bash', () => {
  it('sigue `npm run "$s"` hasta cada elemento del array que recorre', () => {
    const grafo = construirGrafoApp(entradas)
    for (const g of ['scrape-boe.ts', 'scrape-bop.ts']) {
      expect(grafo.aristas).toContainEqual({
        de: 'proceso:scrape-all.sh',
        a: `script:${g}`,
        tipo: 'programa',
        origen: 'derivada',
      })
    }
  })

  it('no deja de ver las órdenes literales del mismo fichero', () => {
    const grafo = construirGrafoApp(entradas)
    expect(grafo.aristas).toContainEqual({
      de: 'proceso:scrape-all.sh',
      a: 'script:check-json.ts',
      tipo: 'programa',
      origen: 'derivada',
    })
  })

  it('un array que sólo se consulta NO programa nada', () => {
    // `BEST_EFFORT` se recorre para preguntar si un nombre está dentro. Su
    // bucle no ejecuta: no hay `npm run "$x"`. Si esta regla se afloja, el mapa
    // dirá que scrape-all.sh «programa» lo que en realidad sólo consulta.
    const grafo = construirGrafoApp({
      ...entradas,
      orquestadores: [
        {
          ruta: 'scripts/solo-consulta.sh',
          fuente: [
            'BEST_EFFORT=(',
            '  scrape:boe',
            ')',
            'for x in "${BEST_EFFORT[@]}"; do [ "$x" = "$1" ] && return 0; done',
          ].join('\n'),
        },
      ],
    })
    expect(grafo.aristas.filter((a) => a.de === 'proceso:solo-consulta.sh')).toEqual([])
  })

  it('control: sin el array declarado, el bucle no inventa destinos', () => {
    const grafo = construirGrafoApp({
      ...entradas,
      orquestadores: [
        {
          ruta: 'scripts/sin-array.sh',
          fuente: 'for s in "${VENIDO_DE_FUERA[@]}"; do npm run "$s"; done',
        },
      ],
    })
    expect(grafo.aristas.filter((a) => a.de === 'proceso:sin-array.sh')).toEqual([])
  })
})

describe('app-graph · el paso que se invoca por su fichero', () => {
  // `press-lab-pipeline.sh` no usa `npm run`: pasa cada paso a una función de
  // shell —`step "verify:press-claims" "…" npx tsx scripts/verify-press-claims.ts`—
  // que lo ejecuta con reintentos y presupuesto. Sus siete pasos corren cada día
  // a las 10:15 y el mapa decía que no los llamaba nadie.
  it('sigue `npx tsx scripts/<x>.ts` hasta el guion', () => {
    const grafo = construirGrafoApp({
      ...ENTRADAS_VACIAS,
      orquestadores: [
        {
          ruta: 'scripts/press-lab-pipeline.sh',
          fuente: 'step "verify:press" "" npx tsx scripts/verify-press-claims.ts',
        },
      ],
      scripts: [{ ruta: 'scripts/verify-press-claims.ts', fuente: 'const x = 1' }],
    })
    expect(grafo.aristas).toContainEqual({
      de: 'proceso:press-lab-pipeline.sh',
      a: 'script:verify-press-claims.ts',
      tipo: 'programa',
      origen: 'derivada',
    })
  })
})

describe('app-graph · un comentario no ejecuta nada', () => {
  // La cabecera de `scrape-all.sh` dice, con todas las letras, «DELIBERATELY
  // ABSENT: scrape:coste-efectivo», y explica por qué: son 45 MB contra una
  // administración pública para un dato que cambia una vez al año. El mapa leía
  // esa frase y dibujaba justo la arista que el comentario niega.
  //
  // Este repositorio ya pagó este defecto una vez, en `route-graph.ts`, donde
  // leer comentarios como declaraciones daba 34 rutas a `padron.json` en vez de 2.
  const fuente = [
    '# DELIBERATELY ABSENT: scrape:coste-efectivo.',
    '# Run it by hand when a new entrega lands: npm run scrape:coste-efectivo',
    'npm run scrape:boe',
  ].join('\n')

  const entradas = {
    ...ENTRADAS_VACIAS,
    orquestadores: [{ ruta: 'scripts/scrape-all.sh', fuente }],
    comandos: {
      'scrape:coste-efectivo': 'npx tsx scripts/scrape-coste-efectivo.ts',
      'scrape:boe': 'npx tsx scripts/scrape-boe.ts',
    },
    scripts: [
      { ruta: 'scripts/scrape-coste-efectivo.ts', fuente: 'const x = 1' },
      { ruta: 'scripts/scrape-boe.ts', fuente: 'const x = 1' },
    ],
  }

  it('no programa lo que sólo aparece en una línea de comentario', () => {
    const grafo = construirGrafoApp(entradas)
    expect(grafo.aristas.map((a) => a.a)).not.toContain('script:scrape-coste-efectivo.ts')
  })

  it('control: la orden real del mismo fichero sigue dibujada', () => {
    const grafo = construirGrafoApp(entradas)
    expect(grafo.aristas).toContainEqual({
      de: 'proceso:scrape-all.sh',
      a: 'script:scrape-boe.ts',
      tipo: 'programa',
      origen: 'derivada',
    })
  })
})

describe('app-graph · la página que carga el dato ella misma', () => {
  // `PlenoDetalle.jsx` hace `fetch(`/data/pleno-transcripts/${plenoId}.txt`)`
  // sin pasar por un hook, y `/metodologia` documenta ese directorio como
  // público a propósito. El mapa sólo miraba `src/hooks/`, así que marcaba las
  // 63 transcripciones como «se publica y ninguna página lo lee».
  //
  // Importa cuál de las dos averías es: `sin-superficie` es la que invita a
  // BORRAR un fichero. Una falsa ahí no es ruido, es una instrucción errónea.
  const entradas = {
    ...ENTRADAS_VACIAS,
    colecciones: [{ nombre: 'pleno-transcripts/', ficheros: 63, bytes: 10, generatedAt: null }],
    vistas: [
      {
        ruta: 'src/pages/PlenoDetalle.jsx',
        fuente: 'fetch(`/data/pleno-transcripts/${plenoId}.txt`)',
      },
    ],
    rutas: {
      rutas: ['/plenos/:id'],
      rutasPorSnapshot: {},
      paginaPorRuta: { '/plenos/:id': 'src/pages/PlenoDetalle.jsx' },
      snapshotsDe: {},
      rutasPorFichero: {},
      importa: {},
    },
  }

  it('cuelga la colección de la vista que la carga', () => {
    const grafo = construirGrafoApp(entradas)
    expect(grafo.aristas).toContainEqual({
      de: 'snapshot:pleno-transcripts/',
      a: 'vista:PlenoDetalle.jsx',
      tipo: 'sirve',
      origen: 'derivada',
    })
  })

  it('y deja de decir que ninguna página lo lee', () => {
    const grafo = construirGrafoApp(entradas)
    const señalados = grafo.averias.averias
      .filter((a) => a.codigo === 'sin-superficie')
      .map((a) => a.nodo)
    expect(señalados).not.toContain('snapshot:pleno-transcripts/')
  })

  it('control: sin la vista, la colección SÍ se señala', () => {
    const grafo = construirGrafoApp({ ...entradas, vistas: [] })
    const señalados = grafo.averias.averias
      .filter((a) => a.codigo === 'sin-superficie')
      .map((a) => a.nodo)
    expect(señalados).toContain('snapshot:pleno-transcripts/')
  })
})

describe('app-graph · la referencia que viaja dentro del dato', () => {
  // Las fotos de queja se sirven porque el bot escribe
  // `photo: "/data/quejas-photos/q-xxxx.jpg"` DENTRO de `quejas.json`, y
  // `QuejaDetail.jsx` pinta ese campo. En el código no hay ni una línea que
  // nombre el directorio: la referencia viaja en el dato.
  //
  // El mapa lo marcaba «se publica y ninguna página lo lee» del directorio más
  // sensible del repositorio. Y `sin-superficie` es justo la avería que invita
  // a borrar.
  const entradas = {
    ...ENTRADAS_VACIAS,
    colecciones: [{ nombre: 'quejas-photos/', ficheros: 1, bytes: 70160, generatedAt: null }],
    snapshots: [{ nombre: 'quejas.json', bytes: 10, generatedAt: null, source: null }],
    referenciasEnDatos: { 'quejas-photos/': ['quejas.json'] },
    hooks: [{ ruta: 'src/hooks/useQuejas.js', fuente: "useJsonFetch('/data/quejas.json')" }],
    rutas: {
      rutas: ['/quejas/:id'],
      rutasPorSnapshot: {},
      paginaPorRuta: { '/quejas/:id': 'src/pages/QuejaDetail.jsx' },
      snapshotsDe: { 'src/hooks/useQuejas.js': ['quejas.json'] },
      rutasPorFichero: { 'src/hooks/useQuejas.js': ['/quejas/:id'] },
      importa: {},
    },
  }

  it('cuelga la colección del snapshot que lleva su URL', () => {
    const grafo = construirGrafoApp(entradas)
    expect(grafo.aristas).toContainEqual({
      de: 'snapshot:quejas-photos/',
      a: 'snapshot:quejas.json',
      tipo: 'sirve',
      origen: 'derivada',
    })
  })

  it('y deja de decir que ninguna página la lee', () => {
    const grafo = construirGrafoApp(entradas)
    const señalados = grafo.averias.averias
      .filter((a) => a.codigo === 'sin-superficie')
      .map((a) => a.nodo)
    expect(señalados).not.toContain('snapshot:quejas-photos/')
  })

  it('control: si el snapshot que la nombra no llega a ninguna página, SÍ se señala', () => {
    const grafo = construirGrafoApp({
      ...entradas,
      hooks: [],
      rutas: { ...entradas.rutas, snapshotsDe: {}, rutasPorFichero: {} },
    })
    const señalados = grafo.averias.averias
      .filter((a) => a.codigo === 'sin-superficie')
      .map((a) => a.nodo)
    expect(señalados).toContain('snapshot:quejas-photos/')
  })
})

describe('app-graph · la colección que escribe el bot', () => {
  // Quien escribe `public/data/quejas-photos/` no es un guion de `scripts/`:
  // es `bot/src/services/process-photos.ts`, el paso que enmascara caras,
  // matrículas y DNI y que FALLA CERRADO. Sin esta arista el mapa decía «una
  // página lo lee y ningún guion lo escribe» de la única tubería del
  // repositorio por la que entra un dato personal.
  const entradas = {
    ...ENTRADAS_VACIAS,
    colecciones: [{ nombre: 'quejas-photos/', ficheros: 1, bytes: 70160, generatedAt: null }],
    bot: {
      comandos: [],
      servicios: ['process-photos.ts'],
      datos: [],
      fuentes: {
        'bot/src/services/process-photos.ts':
          "const photosDir = join(dirname(outPath), 'public/data/quejas-photos')\nwriteFileSync(p, buf)",
      },
      tablas: [],
      exporta: null,
    },
  }

  it('cuelga la colección del servicio del bot que la escribe', () => {
    const grafo = construirGrafoApp(entradas)
    expect(grafo.aristas).toContainEqual({
      de: 'proceso:bot/services/process-photos.ts',
      a: 'snapshot:quejas-photos/',
      tipo: 'escribe',
      origen: 'derivada',
    })
  })

  it('control: un servicio que no la nombra no la escribe', () => {
    const grafo = construirGrafoApp({
      ...entradas,
      bot: {
        ...entradas.bot,
        fuentes: { 'bot/src/services/process-photos.ts': 'const x = 1' },
      },
    })
    expect(grafo.aristas.filter((a) => a.tipo === 'escribe')).toEqual([])
  })

  it('el servicio que sólo la SONDEA no la escribe: la nombra', () => {
    // `snapshot.ts` no tiene una sola llamada de escritura — resuelve la URL con
    // `existsSync`. Llamar a eso «escribe» pondría al exportador como productor
    // de las fotos y dejaría al paso de anonimizado, que es quien las produce,
    // como uno más que las menciona.
    const grafo = construirGrafoApp({
      ...entradas,
      bot: {
        ...entradas.bot,
        servicios: ['snapshot.ts'],
        fuentes: {
          'bot/src/services/snapshot.ts':
            "return existsSync(join(dir, 'public/data/quejas-photos', s)) ? url : null",
        },
      },
    })
    expect(grafo.aristas).toContainEqual({
      de: 'proceso:bot/services/snapshot.ts',
      a: 'snapshot:quejas-photos/',
      tipo: 'nombra',
      origen: 'derivada',
    })
    expect(grafo.aristas.filter((a) => a.tipo === 'escribe')).toEqual([])
  })
})
