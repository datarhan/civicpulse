/**
 * Lo único de este despiece que toca el disco.
 *
 * `src/scraper/app-graph.ts` decide qué es una arista; esto sólo le pone el
 * texto delante. La frontera está donde está para que la lógica se pueda probar
 * sin montar medio repositorio, y para que ningún `node:fs` acabe dentro del
 * bundle del navegador.
 *
 * No recorre subdirectorios a posta. `scripts/lib` son ayudantes y no pasos de
 * la tubería; `public/data/pleno-transcripts/` son 47 corpus, no snapshots. Un
 * barrido recursivo los metería a todos en el dibujo y lo volvería ilegible sin
 * añadir una sola relación que explique un dato.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { construirGrafoRutas } from './route-graph'
import { referenciasDelNavegador, repartir } from '../../publication-denylist.js'
import { DEFAULT_EXPECTATIONS } from '../../src/scraper/snapshot-cadence'
import type {
  BotDeclarado,
  ColeccionPresente,
  CronDeclarado,
  EntradaRutas,
  EntradasGrafo,
  FlujoDeclarado,
  SnapshotPresente,
} from '../../src/scraper/app-graph'

/** Por encima de esto no se parsea el JSON: `pleno-claims-verified.json` pesa 9,5 MB. */
const LIMITE_PARSEO = 4 * 1024 * 1024

function hojasDe(dir: string, extension: RegExp): string[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter((e) => extension.test(e))
    .map((e) => join(dir, e))
    .filter((p) => statSync(p).isFile())
    .sort()
}

function leerFuentes(root: string, dir: string, extension: RegExp) {
  return hojasDe(resolve(root, dir), extension).map((p) => ({
    ruta: relative(root, p),
    fuente: readFileSync(p, 'utf8'),
  }))
}

/** El primer `https?://` de un bloque `source`, sea cadena o sea objeto. */
function urlDe(source: unknown): string | null {
  if (typeof source === 'string') return source
  if (source && typeof source === 'object') {
    for (const v of Object.values(source as Record<string, unknown>)) {
      if (typeof v === 'string' && /^https?:\/\//.test(v)) return v
    }
  }
  return null
}

function leerSnapshots(root: string): SnapshotPresente[] {
  const dir = resolve(root, 'public/data')
  return hojasDe(dir, /\.json$/).map((p) => {
    const bytes = statSync(p).size
    const nombre = relative(dir, p)
    if (bytes > LIMITE_PARSEO) {
      // Ni se parsea ni se finge que se sabe: `generatedAt` se saca del
      // encabezado si asoma, y `source` se declara desconocida.
      const cabeza = readFileSync(p, 'utf8').slice(0, 8192)
      const m = /"generatedAt"\s*:\s*"([^"]+)"/.exec(cabeza)
      return { nombre, bytes, generatedAt: m ? m[1] : null, source: null }
    }
    try {
      const doc = JSON.parse(readFileSync(p, 'utf8')) as Record<string, unknown>
      const gen = doc.generatedAt ?? doc.composedAt
      return {
        nombre,
        bytes,
        generatedAt: typeof gen === 'string' ? gen : null,
        source: urlDe(doc.source),
      }
    } catch {
      // Un JSON ilegible es un hecho del repositorio, no un motivo para
      // reventar el despiece entero. `check:json` es quien grita por eso.
      return { nombre, bytes, generatedAt: null, source: null }
    }
  })
}

/**
 * Los subdirectorios de `public/data` que contienen ficheros, como una pieza
 * cada uno.
 *
 * Antes esto no bajaba a subdirectorios y el mapa dibujaba 117 snapshots donde
 * hay 165 ficheros publicados: fuera quedaban `pleno-claims/` (23 trozos por
 * pleno) y `journalist-reports/` (21 informes sobre concejales con nombre y
 * apellidos), que están entre lo más comprometido del repositorio.
 *
 * Un directorio sin un solo `.json` NO es una colección de datos:
 * `pleno-transcripts/` son 47 `.txt` y `photos/` son imágenes.
 */
function leerColecciones(root: string): ColeccionPresente[] {
  const dir = resolve(root, 'public/data')
  if (!existsSync(dir)) return []
  const salida: ColeccionPresente[] = []
  for (const e of readdirSync(dir).sort()) {
    const p = join(dir, e)
    if (!statSync(p).isDirectory()) continue
    // CUALQUIER hoja, no sólo `.json`. Con el filtro puesto, de los siete
    // directorios publicados salían tres: se quedaban fuera las 44
    // transcripciones de pleno (.txt), las fotos de concejales y las fotos
    // anonimizadas de quejas (.jpg) y los briefs del agente (.md). Un mapa que
    // existe para sostener «todo lo que está bajo public/ se publica» no puede
    // aplicarle a esa regla un filtro por extensión.
    const hojas = hojasDe(p, /./)
    if (hojas.length === 0) continue
    let bytes = 0
    let masReciente = 0
    for (const h of hojas) {
      const st = statSync(h)
      bytes += st.size
      masReciente = Math.max(masReciente, st.mtimeMs)
    }
    salida.push({
      nombre: `${e}/`,
      ficheros: hojas.length,
      bytes,
      generatedAt: new Date(masReciente).toISOString(),
    })
  }
  return salida
}

/**
 * Qué colecciones nombra el CONTENIDO de cada snapshot publicado.
 *
 * `quejas.json` lleva `photo: "/data/quejas-photos/q-x.jpg"`: la referencia al
 * directorio no está en ninguna línea de código, viaja en el dato. Se busca
 * sólo el prefijo de las colecciones que ya se conocen —no se sale a inventar
 * rutas— y se para en el primer acierto por fichero.
 */
function leerReferenciasEnDatos(
  root: string,
  colecciones: ColeccionPresente[],
): Record<string, string[]> {
  const salida: Record<string, string[]> = {}
  if (colecciones.length === 0) return salida
  const dir = resolve(root, 'public/data')
  if (!existsSync(dir)) return salida
  const hojas = readdirSync(dir).filter((e) => e.endsWith('.json'))
  for (const c of colecciones) {
    const aguja = `/data/${c.nombre}`
    const portadores: string[] = []
    for (const h of hojas) {
      let texto: string
      try {
        texto = readFileSync(join(dir, h), 'utf8')
      } catch {
        continue
      }
      if (texto.includes(aguja)) portadores.push(h)
    }
    if (portadores.length) salida[c.nombre] = portadores
  }
  return salida
}

/**
 * Lo que la guarda de publicación retirará de `dist/`, calculado con SUS
 * funciones y no con una copia. Duplicar la regla aquí sería tener dos
 * versiones de «qué se publica» que se separan a la primera de cambio.
 *
 * Se juzga sobre `public/`, no sobre `dist/`, porque el despiece se genera sin
 * compilar; el veredicto que manda sigue siendo el del artefacto, y de eso se
 * ocupa `tests/publication-denylist.test.ts`.
 */
function leerDenegados(root: string): string[] {
  const textos: string[] = []
  for (const carpeta of ['src/hooks', 'src/pages', 'src/components', 'src/lib']) {
    const base = resolve(root, carpeta)
    if (!existsSync(base)) continue
    const anda = (d: string): void => {
      for (const e of readdirSync(d, { withFileTypes: true })) {
        const p = join(d, e.name)
        if (e.isDirectory()) anda(p)
        else if (/\.(jsx?|tsx?)$/.test(e.name)) textos.push(readFileSync(p, 'utf8'))
      }
    }
    anda(base)
  }
  const referencias = referenciasDelNavegador(textos)

  const dir = resolve(root, 'public/data')
  if (!existsSync(dir)) return []
  const hojas: { rel: string; texto: string | null }[] = []
  const anda = (d: string): void => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name)
      if (e.isDirectory()) anda(p)
      else if (e.name.endsWith('.json')) {
        const rel = relative(resolve(root, 'public'), p)
        try {
          hojas.push({ rel, texto: readFileSync(p, 'utf8') })
        } catch {
          hojas.push({ rel, texto: null })
        }
      }
    }
  }
  anda(dir)
  const { denegar } = repartir({ hojas, referencias })
  // El grafo habla de nombres de fichero, no de rutas.
  return denegar.map((rel: string) => rel.replace(/^data\//, ''))
}

/** Los ficheros con expectativa de frescura. `null` si no se pudo leer. */
function leerExpectativas(): string[] | null {
  try {
    return DEFAULT_EXPECTATIONS.map((e) => e.file)
  } catch {
    return null
  }
}

function serializarRutas(root: string): EntradaRutas {
  const grafo = construirGrafoRutas(resolve(root, 'src'))
  const snapshotsDe: Record<string, string[]> = {}
  for (const [absoluto, snaps] of grafo.snapshotsDe) {
    snapshotsDe[relative(root, absoluto)] = [...snaps].sort()
  }
  const rutasPorSnapshot: Record<string, string[]> = {}
  for (const [snap, rutas] of grafo.rutasPorSnapshot) {
    rutasPorSnapshot[snap] = [...rutas].sort()
  }
  const paginaPorRuta: Record<string, string> = {}
  for (const [ruta, pagina] of grafo.paginaPorRuta) {
    paginaPorRuta[ruta] = relative(root, pagina)
  }
  const rutasPorFichero: Record<string, string[]> = {}
  for (const [absoluto, rs] of grafo.rutasPorFichero) {
    rutasPorFichero[relative(root, absoluto)] = [...rs].sort()
  }
  const importa: Record<string, string[]> = {}
  for (const [absoluto, destinos] of grafo.importa) {
    importa[relative(root, absoluto)] = destinos.map((d) => relative(root, d)).sort()
  }
  return {
    rutas: grafo.rutas,
    rutasPorSnapshot,
    paginaPorRuta,
    snapshotsDe,
    rutasPorFichero,
    importa,
  }
}

/**
 * Los ficheros que escribe una persona, leídos del gancho que ya los declara.
 *
 * `.claude/hooks/curated-paths.mjs` exporta `CURATED` —basename → CLI dueño— y
 * una prueba lo cuadra con `docs/DATA_SOURCES.md`. Se raspa en vez de
 * importarse porque este lector es síncrono y el gancho es ESM; el raspado es
 * léxico, como todo lo demás aquí.
 *
 * Devuelve `null` si el bloque no se reconoce. `null` NO es la lista vacía: sin
 * lista, la comprobación que la usa se declara no medida en vez de señalar como
 * defecto cada fichero que firma un curador.
 */
function leerCurados(root: string): string[] | null {
  const ruta = resolve(root, '.claude/hooks/curated-paths.mjs')
  if (!existsSync(ruta)) return null
  const texto = readFileSync(ruta, 'utf8')
  const bloque = /export const CURATED = \{([\s\S]*?)\n\}/.exec(texto)
  if (!bloque) return null
  const nombres = [...bloque[1].matchAll(/'([a-z0-9-]+\.json)'\s*:/g)].map((m) => m[1])
  return nombres.length > 0 ? [...new Set(nombres)] : null
}

/** El valor de una `<key>` en un plist. Sin librería: el fichero es plano. */
function clavePlist(texto: string, clave: string): string | null {
  const m = new RegExp(`<key>${clave}</key>\\s*<(string|integer)>([^<]*)</\\1>`).exec(texto)
  return m ? m[2] : null
}

/**
 * La flota local, leída de los plists que están EN EL REPOSITORIO.
 *
 * De los propios plists y nunca de una tabla a mano, por lo mismo que
 * `check-cron.ts`: una tabla escrita a mano dentro de un mapa contra el
 * descuido se queda vieja ella sola.
 */
function leerCrones(root: string): CronDeclarado[] {
  const dir = resolve(root, 'scripts')
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter((e) => /^com\.civicpulse\..*\.plist$/.test(e))
    .sort()
    .map((e) => {
      const texto = readFileSync(join(dir, e), 'utf8')
      const args = [...texto.matchAll(/<string>([^<]*)<\/string>/g)].map((m) => m[1])
      // El programa es el primer argumento que apunta a un fichero de scripts/.
      const programa = args.find((a) => /scripts\/[\w.-]+\.(sh|ts|mjs)$/.test(a))
      const hora = clavePlist(texto, 'Hour')
      const minuto = clavePlist(texto, 'Minute')
      return {
        etiqueta: clavePlist(texto, 'Label') ?? e.replace(/\.plist$/, ''),
        fichero: `scripts/${e}`,
        hora: hora === null ? null : Number(hora),
        minuto: minuto === null ? null : Number(minuto),
        programa: programa ? programa.slice(programa.indexOf('scripts/')) : '',
        log: clavePlist(texto, 'StandardOutPath'),
      }
    })
    .filter((c) => c.programa !== '')
}

/**
 * Los flujos de CI. Se raspan tres cosas —nombre, horario y qué órdenes npm
 * ejecuta— y nada más: el orden de los pasos y sus condicionales son bash y no
 * se derivan, así que no se fingen.
 */
function leerFlujos(root: string): FlujoDeclarado[] {
  const dir = resolve(root, '.github/workflows')
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter((e) => /\.ya?ml$/.test(e))
    .sort()
    .map((e) => {
      const texto = readFileSync(join(dir, e), 'utf8')
      const nombre = /^name:\s*(.+)$/m
        .exec(texto)?.[1]
        ?.trim()
        .replace(/^['"]|['"]$/g, '')
      const cron = /-\s*cron:\s*['"]?([^'"\n]+)['"]?/.exec(texto)?.[1]?.trim() ?? null
      const ejecuta = [...texto.matchAll(/npm run ([\w:-]+)/g)].map((m) => m[1])
      return {
        fichero: `.github/workflows/${e}`,
        nombre: nombre ?? e,
        cron,
        ejecuta: [...new Set(ejecuta)].sort(),
      }
    })
}

function leerComandos(root: string): Record<string, string> {
  const ruta = resolve(root, 'package.json')
  if (!existsSync(ruta)) return {}
  try {
    const pkg = JSON.parse(readFileSync(ruta, 'utf8')) as { scripts?: Record<string, string> }
    return pkg.scripts ?? {}
  } catch {
    return {}
  }
}

/**
 * El bot, leído de su propia estructura: un fichero por comando, uno por
 * servicio, y las tablas de sus `CREATE TABLE`. Nada de listas a mano.
 *
 * `null` si no hay `bot/` — quien clone sólo el sitio no debe ver medio bot
 * dibujado.
 */
function leerBot(root: string): BotDeclarado | null {
  const dir = resolve(root, 'bot/src')
  if (!existsSync(dir)) return null
  const nombres = (sub: string) =>
    existsSync(resolve(dir, sub))
      ? readdirSync(resolve(dir, sub))
          .filter((e) => e.endsWith('.ts'))
          .sort()
      : []
  const tablas = new Set<string>()
  const paraTablas = (d: string): void => {
    if (!existsSync(d)) return
    for (const e of readdirSync(d)) {
      const p = join(d, e)
      if (statSync(p).isDirectory()) paraTablas(p)
      // `.sql` incluido: el esquema del bot vive en `db/schema.sql`, no en un
      // `.ts`. Con el filtro sólo en `.ts` esto devolvía «cero tablas», que es
      // una afirmación falsa donde tocaba decir «no he mirado ahí».
      else if (e.endsWith('.ts') || e.endsWith('.sql')) {
        for (const m of readFileSync(p, 'utf8').matchAll(
          /CREATE TABLE (?:IF NOT EXISTS )?([a-z_]+)/gi,
        )) {
          tablas.add(m[1])
        }
      }
    }
  }
  paraTablas(dir)
  const fuentes: Record<string, string> = {}
  for (const sub of ['commands', 'services', 'db'] as const) {
    for (const e of nombres(sub)) {
      fuentes[`bot/src/${sub}/${e}`] = readFileSync(resolve(dir, sub, e), 'utf8')
    }
  }
  return {
    comandos: nombres('commands'),
    servicios: nombres('services'),
    datos: nombres('db'),
    fuentes,
    tablas: [...tablas].sort(),
    // El export del bot es lo que `pull-quejas.yml` deja en el sitio.
    exporta: existsSync(resolve(root, 'public/data/quejas.json')) ? 'quejas.json' : null,
  }
}

/**
 * Dónde vive cada fichero de datos del repositorio: basename → rutas.
 *
 * Existe porque `analyseScriptIo` devuelve BASENAMES. Su cabecera lo dice —
 * `public/data/<name>.json` es el único espacio de nombres del que habla— y a
 * su consumidor original, `check:data-graph`, la ambigüedad no le costaba nada
 * porque sólo compara contra ficheros publicados. A este despiece sí: daba por
 * publicados nueve ficheros de `editorial/`, que está ignorado por git
 * PRECISAMENTE porque guarda prosa de máquina sin revisar sobre personas vivas.
 *
 * Se indexan también los directorios, con la barra puesta, porque un marcador
 * `// data-graph: reads pleno-speaker-map/` nombra una carpeta y no un fichero.
 *
 * `.claude/worktrees` queda fuera: es una copia entera del repositorio y
 * volvería ambiguo cada nombre del índice.
 */
const NO_INDEXAR = new Set([
  'node_modules',
  '.git',
  'dist',
  'coverage',
  'playwright-report',
  'test-results',
  '.vercel',
  'worktrees',
])

function indexarFicheros(root: string): Record<string, string[]> {
  const indice: Record<string, string[]> = {}
  const apunta = (clave: string, ruta: string): void => {
    ;(indice[clave] ??= []).push(ruta)
  }
  const anda = (dir: string, hondo: number): void => {
    if (hondo > 8) return
    let entradas: string[]
    try {
      entradas = readdirSync(dir)
    } catch {
      return
    }
    for (const e of entradas) {
      if (NO_INDEXAR.has(e)) continue
      const p = join(dir, e)
      let esDir = false
      try {
        esDir = statSync(p).isDirectory()
      } catch {
        continue
      }
      if (esDir) {
        apunta(`${e}/`, `${relative(root, p)}/`)
        anda(p, hondo + 1)
      } else if (e.endsWith('.json')) {
        apunta(e, relative(root, p))
      }
    }
  }
  anda(resolve(root), 0)
  for (const k of Object.keys(indice)) indice[k].sort()
  return indice
}

export function leerEntradas(root: string): EntradasGrafo {
  const colecciones = leerColecciones(root)
  return {
    bot: leerBot(root),
    crones: leerCrones(root),
    flujos: leerFlujos(root),
    comandos: leerComandos(root),
    curados: leerCurados(root),
    ficheros: indexarFicheros(root),
    colecciones,
    orquestadores: leerFuentes(root, 'scripts', /\.sh$/),
    scripts: leerFuentes(root, 'scripts', /\.ts$/),
    parsers: leerFuentes(root, 'src/scraper', /\.ts$/),
    hooks: leerFuentes(root, 'src/hooks', /\.[jt]sx?$/),
    vistas: leerFuentes(root, 'src/pages', /\.[jt]sx?$/),
    referenciasEnDatos: leerReferenciasEnDatos(root, colecciones),
    denegados: leerDenegados(root),
    expectativas: leerExpectativas(),
    snapshots: leerSnapshots(root),
    rutas: serializarRutas(root),
  }
}
