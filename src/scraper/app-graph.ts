/**
 * El despiece: qué piezas tiene esta aplicación y cómo se enganchan.
 *
 * Módulo PURO. No lee ficheros, no toca la red y no importa `node:*` — quien
 * lee el repositorio es `scripts/lib/app-graph-io.ts`, que le pasa el texto ya
 * leído. La separación no es estética: este fichero decide qué es una arista y
 * qué no, y eso es justo lo que hay que poder probar sin montar medio disco.
 * (Y un `node:fs` aquí acabaría dentro del bundle del navegador, que es el
 * motivo por el que `claim-verdicts.ts` existe aparte.)
 *
 * Las aristas se DERIVAN del código siempre que se pueda, porque una lista
 * escrita a mano dentro de un mapa del código se queda vieja ella sola — el
 * chiste que este repositorio ya ha contado dos veces (`build-prose-map` nació
 * con nueve entradas donde el código tenía sesenta y cuatro).
 */
import { analyseScriptIo } from './script-io'

export type Carril =
  | 'fuente'
  | 'script'
  | 'parser'
  | 'snapshot'
  | 'hook'
  | 'vista'
  | 'ruta'
  | 'proceso'

/**
 * Toda arista apunta en el SENTIDO EN QUE CORRE EL DATO, no en el de la llamada.
 * Un script que lee `tenders.json` produce `tenders.json → script`, porque el
 * dibujo va de la fuente a la pantalla y una flecha que vuelve del script al
 * fichero se lee como si el script lo escribiera. El tipo dice el mecanismo;
 * la dirección dice el flujo.
 */
export type TipoArista =
  | 'lee'
  | 'escribe'
  | 'sirve'
  | 'alimenta'
  | 'monta'
  | 'importa'
  | 'programa'
  /**
   * El escaneo VE el fichero en el texto del guion y NO sabe decir si lo lee o
   * lo escribe: `check-vocabulary.ts` lo lleva en una tabla, `draft-finding.ts`
   * lo usa por un ayudante local. Antes la relación desaparecía entera —unas
   * sesenta— y una ausencia se lee igual que una inexistencia. Ensanchar el
   * escáner hasta adivinar el verbo es justo lo que este repositorio tiene
   * prohibido; declarar el verbo que sí se sabe, no.
   *
   * (Aquí vivían `vigila` y `firma`: dos valores del tipo que nadie producía.
   * Un vocabulario sin emisor, dentro de un mapa que presume de derivado, es
   * una lista a mano.)
   */
  | 'nombra'

/** Cómo sabemos que la arista existe. El lector tiene derecho a saberlo. */
export type OrigenArista = 'derivada' | 'declarada' | 'marcador'

export interface FicheroFuente {
  /** Ruta relativa a la raíz del repositorio. */
  ruta: string
  fuente: string
}

export interface SnapshotPresente {
  nombre: string
  bytes: number
  generatedAt: string | null
  source: string | null
}

/**
 * Un subdirectorio publicado, como pieza única.
 *
 * `public/data/pleno-claims/` son veintitrés trozos por pleno y
 * `journalist-reports/` veintiún informes: cuarenta y ocho ficheros que este
 * mapa no dibujaba. Van como UNA pieza y no como cuarenta y ocho porque el
 * código los direcciona por plantilla —`${plenoId}.json`, `${slug}.json`—, así
 * que «cuál» no se deriva, y porque comparten productor y consumidor: cuarenta
 * y ocho nodos idénticos son cuarenta y ocho veces las aristas y ni un dato más.
 */
export interface ColeccionPresente {
  /** Con la barra puesta: `pleno-claims/`. */
  nombre: string
  ficheros: number
  bytes: number
  generatedAt: string | null
}

/**
 * Lo que `scripts/lib/route-graph.ts` ya calcula del front, serializado.
 *
 * Las claves de `snapshotsDe` son rutas RELATIVAS a la raíz: `construirGrafoRutas`
 * las devuelve absolutas y quien lee el repositorio las convierte, para que este
 * módulo no tenga que saber dónde está montado el proyecto.
 */
export interface EntradaRutas {
  rutas: string[]
  /** snapshot → rutas que lo cargan o lo describen. */
  rutasPorSnapshot: Record<string, string[]>
  /** ruta → módulo de página que la sirve. */
  paginaPorRuta: Record<string, string>
  /** fichero de src/ → snapshots que nombra DIRECTAMENTE. */
  snapshotsDe: Record<string, string[]>
  /** fichero de src/ → rutas cuyo módulo de página lo alcanza. */
  rutasPorFichero: Record<string, string[]>
  /** fichero de src/ → ficheros que importa, resueltos. */
  importa: Record<string, string[]>
}

/** Un agente de launchd, leído de su propio plist. */
export interface CronDeclarado {
  etiqueta: string
  hora: number | null
  minuto: number | null
  /** El plist: el fichero PROPIO del cron, distinto del que ejecuta. */
  fichero: string
  /** Ruta relativa del programa que ejecuta. */
  programa: string
  log: string | null
}

/** Un flujo de GitHub Actions. */
export interface FlujoDeclarado {
  fichero: string
  nombre: string
  /** `null` cuando no tiene horario: se dispara por push, issue o a mano. */
  cron: string | null
  /** Guiones de `package.json` que ejecuta. */
  ejecuta: string[]
}

/**
 * El bot de Telegram, que es una tubería propia y no un nodo.
 *
 * `null` cuando no se ha leído. Lo que entra por aquí es el mensaje de una
 * persona, y es el ÚNICO sitio por donde entran datos personales al sistema.
 */
export interface BotDeclarado {
  comandos: string[]
  servicios: string[]
  /**
   * `bot/src/db/*.ts`. Aquí vive el SQL de verdad: `snapshot.ts` no tiene una
   * sola sentencia, importa `listRecentQuejas` de `db/queries.ts`. Sin esta
   * capa, la pieza que lee las tablas no salía en el mapa.
   */
  datos: string[]
  /**
   * Ruta relativa → texto, de cada comando, cada servicio y cada fichero de
   * la capa de datos. Es lo que permite
   * DERIVAR qué tabla toca cada pieza en vez de suponerlo: la primera versión
   * colgaba las cinco tablas de `export.ts` con `origen: 'declarada'`, y
   * `export.ts` tiene treinta y una líneas y delega en `snapshot.ts`.
   */
  fuentes: Record<string, string>
  /** Las tablas de su SQLite. */
  tablas: string[]
  /** El snapshot que su export acaba alimentando, si lo hay. */
  exporta: string | null
}

export interface EntradasGrafo {
  bot: BotDeclarado | null
  /**
   * Los orquestadores en shell. Van aparte de `scripts` porque
   * `analyseScriptIo` es un escáner de JS/TS: pasarle bash y publicar el
   * resultado como «no se pudo leer» mezcla «este escáner no habla shell» con
   * «este guion construye sus rutas de forma rara», y el aviso de la página
   * cuenta lo segundo. Lo que SÍ se deriva de ellos es qué órdenes npm llaman.
   * El ORDEN de los pasos y sus condicionales no se derivan, y no se fingen.
   */
  orquestadores: FicheroFuente[]
  crones: CronDeclarado[]
  flujos: FlujoDeclarado[]
  /** El bloque `scripts` de package.json: nombre → orden. */
  comandos: Record<string, string>
  /**
   * Ficheros que escribe una persona, no un guion. `null` significa que la
   * lista NO se pudo cargar, y es distinto de la lista vacía: sin ella, «lo lee
   * una ruta y no lo escribe nadie» señalaría los dieciséis ficheros curados
   * del repositorio como defectos el primer día.
   */
  curados: string[] | null
  /**
   * Lo que la guarda de publicación RETIRA de `dist/` al compilar. «Todo lo que
   * está bajo `public/` se publica» tiene esta única excepción real, y sin ella
   * el mapa dice «se publica y nadie lo lee» de un fichero que el despliegue
   * quita.
   */
  denegados: string[]
  /**
   * Los ficheros con expectativa de frescura (`DEFAULT_EXPECTATIONS`). `null`
   * es «no se pudo leer el registro»: ni señalar los noventa y seis ni callar,
   * porque ninguna de las dos cosas se ha comprobado.
   */
  expectativas: string[] | null
  /**
   * Índice del repositorio: basename → rutas donde de verdad existe ese
   * fichero.
   *
   * `analyseScriptIo` devuelve BASENAMES —su cabecera dice que `public/data/`
   * es el único espacio de nombres del que habla— y este despiece los daba por
   * publicados. Nueve ficheros de `editorial/`, el directorio ignorado por git
   * porque guarda prosa sin revisar sobre personas vivas, salían dibujados
   * dentro de `public/data/`. Con el índice delante, un nombre se resuelve
   * contra el disco antes de afirmar dónde vive.
   */
  ficheros: Record<string, string[]>
  scripts: FicheroFuente[]
  /** Subdirectorios de `public/data` con ficheros dentro. */
  colecciones: ColeccionPresente[]
  parsers: FicheroFuente[]
  hooks: FicheroFuente[]
  /**
   * Las páginas, con su texto. Una página que hace su propio `fetch('/data/…')`
   * está haciendo el trabajo de un hook, y mirando sólo `src/hooks/` el mapa no
   * la veía: las 63 transcripciones de pleno salían como «ninguna página lo
   * lee» mientras `PlenoDetalle.jsx` las carga y `/metodologia` las documenta.
   */
  vistas: FicheroFuente[]
  /**
   * Las colecciones que un snapshot nombra DENTRO de su contenido, y quién las
   * nombra. El bot escribe `photo: "/data/quejas-photos/q-x.jpg"` en
   * `quejas.json` y la página pinta ese campo: en el código no hay una sola
   * línea con el nombre del directorio, así que sin esto el mapa decía «ninguna
   * página lo lee» del directorio más sensible que hay aquí.
   */
  referenciasEnDatos: Record<string, string[]>
  snapshots: SnapshotPresente[]
  rutas: EntradaRutas
}

export const ENTRADAS_VACIAS: EntradasGrafo = Object.freeze({
  bot: null,
  orquestadores: [],
  crones: [],
  flujos: [],
  comandos: {},
  curados: [],
  denegados: [],
  expectativas: [],
  ficheros: {},
  scripts: [],
  colecciones: [],
  parsers: [],
  hooks: [],
  vistas: [],
  referenciasEnDatos: {},
  snapshots: [],
  rutas: Object.freeze({
    rutas: [],
    rutasPorSnapshot: {},
    paginaPorRuta: {},
    snapshotsDe: {},
    rutasPorFichero: {},
    importa: {},
  }) as EntradaRutas,
})

export interface NodoApp {
  /** `<clase>:<nombre>` — estable entre ejecuciones. */
  id: string
  nombre: string
  ruta?: string
  /**
   * El carril donde se pinta. NO es lo mismo que el prefijo del `id`: un
   * `script:` que no escribe ningún snapshot es una guarda o un CLI de curador
   * y se va a la banda `proceso`, pero sigue siendo un guion y conserva su id.
   * El id dice QUÉ es; el carril, qué papel juega.
   */
  carril: Carril
  /**
   * La familia a la que pertenece, deducida de las aristas. `null` cuando el
   * nodo no cuelga de ninguna —una guarda, un CLI de curador, una ruta que
   * atraviesa medio sitio— y `null` es la respuesta, no un hueco que rellenar.
   */
  dominio: string | null
  /** Una línea de contexto propia del nodo: el horario de un cron, su disparo. */
  detalle?: string
  /**
   * Sólo en el carril de datos: si el fichero está bajo `public/` —es decir, si
   * Vercel lo sirve— o no. NO es decoración: `editorial/` está ignorado por git
   * a posta y dibujar sus colas de revisión como publicadas es afirmar lo
   * contrario de lo que pasa. `undefined` en los demás carriles.
   */
  publicado?: boolean
  /**
   * Qué clase de proceso es. Existe para que quien filtre —«enséñame lo que
   * corre solo»— no tenga que adivinarlo del prefijo de `detalle`, que es una
   * cadena de presentación y cambia cuando se reescribe la frase.
   */
  clase?: 'cron' | 'flujo' | 'orquestador' | 'comando-bot' | 'servicio-bot' | 'datos-bot'
  /**
   * `false` cuando no se pudo leer lo que este nodo toca. Un nodo sin analizar
   * se pinta «no leído», JAMÁS como una hoja limpia: un escaneo que no
   * encuentra nada en un script de 300 líneas no ha demostrado que el script no
   * tenga entradas.
   */
  analizado: boolean
}

export interface AristaApp {
  de: string
  a: string
  tipo: TipoArista
  origen: OrigenArista
}

/**
 * El parte del propio grafo.
 *
 * `scriptsSinAnalizar` va aparte de `scriptsAnalizados` y no sumado a él a
 * posta: «no lo pude leer» y «no tiene entradas» son hechos distintos, y
 * plegarlos en uno es exactamente el defecto que dejó a una pasada declarando
 * «re-juzgados 1017» sin haber hecho una sola llamada.
 */
export interface EstadisticasGrafo {
  porCarril: Record<Carril, number>
  aristas: number
  scriptsAnalizados: number
  scriptsSinAnalizar: number
}

export interface GrafoApp {
  nodos: NodoApp[]
  aristas: AristaApp[]
  stats: EstadisticasGrafo
  averias: ParteAverias
}

/** El host de una URL, sin `new URL`: una fuente rara no debe reventar el mapa. */
function host(url: string): string | null {
  return /^https?:\/\/([^/?#]+)/.exec(url)?.[1] ?? null
}

/**
 * Los parsers que un script importa.
 *
 * Sólo se miran los specs que pasan por `/scraper/`. Casar por el nombre suelto
 * del módulo colgaría `./padron` —un ayudante local de `scripts/`— del parser
 * puro que no tiene nada que ver, y una arista inventada es peor que una
 * ausente: la ausente se nota.
 */
function parsersImportados(fuente: string, conocidos: Set<string>, hermanos = false): string[] {
  const out = new Set<string>()
  for (const m of fuente.matchAll(/from\s+['"]([^'"]+)['"]/g)) {
    const spec = m[1]
    // Entre parsers el import es `./normalize`, sin `/scraper/` por medio. Con
    // sólo la primera regla, las primitivas compartidas del repositorio
    // —`normalize.ts`, `hash.ts`, los identificadores estables sobre los que se
    // llavea todo— salían como que no las importa nadie.
    const hermano = hermanos && /^\.\/[\w.-]+$/.test(spec)
    if (!spec.includes('/scraper/') && !hermano) continue
    // La extensión puede venir puesta —`from '../src/scraper/consell-cv.ts'`—
    // y sin quitarla se buscaba `consell-cv.ts.ts`: cuatro guiones importaban
    // así y sus parsers salían como que no los llamaba nadie.
    const hoja = spec.slice(spec.lastIndexOf('/') + 1).replace(/\.(?:ts|tsx|js|jsx)$/, '')
    if (conocidos.has(`${hoja}.ts`)) out.add(`${hoja}.ts`)
  }
  return [...out]
}

/**
 * Las colecciones que un texto nombra: `public/data/pleno-claims/` en un guion,
 * `/data/pleno-claims/` en un hook. Se casa SÓLO contra las que existen en el
 * disco, para que un directorio inventado en un comentario no cree una pieza.
 */
/**
 * El texto sin las líneas que son ÍNTEGRAMENTE comentario.
 *
 * La cabecera de `scrape-all.sh` dice «DELIBERATELY ABSENT: scrape:coste-efectivo»
 * y explica por qué —45 MB contra una administración pública para un dato anual—.
 * Leyendo esa frase el mapa dibujaba justo la arista que el comentario niega.
 *
 * Recorta sólo la línea entera, nunca a media línea: un `#` puede ser el de
 * `${#fallos[@]}` y una URL lleva `//` en medio. Es la misma regla que
 * `route-graph.ts::sinComentarios`, donde leer prosa como declaración le daba a
 * `padron.json` 34 rutas en vez de 2.
 */
function sinComentarios(texto: string): string {
  return texto
    .split('\n')
    .filter((l) => !/^\s*(#|\/\/)/.test(l))
    .join('\n')
}

/**
 * Los guiones que un shell ejecuta nombrando su fichero.
 *
 * `press-lab-pipeline.sh` no usa `npm run`: pasa cada paso a una función suya
 * —`step "verify:press-claims" "" npx tsx scripts/verify-press-claims.ts`— que
 * lo corre con reintentos y presupuesto. Nombrar el fichero es evidencia MÁS
 * directa que la orden npm, no menos.
 */
function ficherosInvocados(texto: string): string[] {
  return [
    ...texto.matchAll(
      /\b(?:tsx|node|bash|sh)\s+(?:-{1,2}\S+\s+)*(scripts\/[\w.-]+\.(?:ts|sh|mjs|js))/g,
    ),
  ].map((m) => m[1])
}

/** Las órdenes `npm run <nombre>` escritas con su nombre delante. */
function ordenesLiterales(texto: string): string[] {
  return [...texto.matchAll(/npm run ([\w:-]+)/g)].map((m) => m[1])
}

/**
 * Las órdenes que un shell ejecuta recorriendo un array: `scrape-all.sh` mete
 * sus 35 raspadores en `SCRAPERS=(…)` y hace `npm run "$s"` dentro del bucle.
 * Buscar `npm run <literal>` no ve ni una.
 *
 * La ligadura está entera en el texto —la declaración del array, el `for` que
 * lo recorre y la variable que se ejecuta—, así que esto se deriva. Y se deriva
 * ESTRECHO a propósito: un array que sólo se recorre para preguntar si un
 * nombre está dentro (`BEST_EFFORT`, `LLM_STEPS`) no ejecuta nada, y sin exigir
 * el `npm run "$var"` del propio bucle el mapa diría que scrape-all.sh
 * «programa» justo los pasos que se salta.
 */
function ordenesDeArray(texto: string): string[] {
  const arrays = new Map<string, string[]>()
  for (const m of texto.matchAll(/^[ \t]*([A-Za-z_][A-Za-z0-9_]*)=\(([^)]*)\)/gm)) {
    const cuerpo = m[2]
      .split('\n')
      .map((l) => l.replace(/#.*$/, '').trim())
      .filter(Boolean)
      .flatMap((l) => l.split(/\s+/))
      .filter((x) => /^[\w:-]+$/.test(x))
    if (cuerpo.length) arrays.set(m[1], cuerpo)
  }

  const out: string[] = []
  for (const m of texto.matchAll(/\bfor\s+([A-Za-z_]\w*)\s+in\s+"?\$\{(\w+)\[@\]\}"?/g)) {
    const [, variable, array] = m
    const elementos = arrays.get(array)
    if (!elementos) continue
    // Sin una ejecución de la variable del bucle, el recorrido no programa nada.
    if (!new RegExp(`npm run\\s+"?\\$\\{?${variable}\\}?"?`).test(texto)) continue
    out.push(...elementos)
  }
  return out
}

function coleccionesEn(fuente: string, conocidas: ReadonlySet<string>): string[] {
  const out = new Set<string>()
  // La barra final es opcional: `resolve('public/data/pleno-claims')` nombra el
  // mismo directorio que `` `/data/pleno-claims/${id}.json` ``. El lookahead
  // impide que `public/data/padron.json` case como el directorio «padron».
  for (const m of fuente.matchAll(/(?:public)?\/?data\/([A-Za-z0-9_-]+)(?![\w.-])/g)) {
    if (conocidas.has(`${m[1]}/`)) out.add(`${m[1]}/`)
  }
  return [...out]
}

/** `scripts/scrape-padron.ts` → `scrape-padron.ts`. Sin `node:path`, a posta. */
function base(ruta: string): string {
  const corte = ruta.lastIndexOf('/')
  return corte === -1 ? ruta : ruta.slice(corte + 1)
}

/**
 * A partir de cuántos snapshots un hook deja de agrupar.
 *
 * `useLabHealth` lee unos cuarenta: es el inventario del sitio entero, no un
 * dominio, y usarlo para unir metería casi todo el repositorio en una bolsa. El
 * segundo hook más ancho lee nueve, así que el tope separa el inventario del
 * resto SIN nombrar a nadie — una lista con «useLabHealth» dentro se queda vieja
 * el día que ese fichero se renombre.
 *
 * Se exporta para que la prueba lo use en vez de repetir el número: una prueba
 * que restablece la constante deja de medirla.
 */
export const TOPE_HOOK_UNIFICADOR = 10

/** El flujo de CI cuyo nombre de fichero menciona un tema. */
function grafoTraePorFlujo(entradas: EntradasGrafo, tema: string): string | null {
  return entradas.flujos.find((f) => f.fichero.includes(tema))?.fichero ?? null
}

/** `padron.json` → `padron`. */
function tallo(nombre: string): string {
  return nombre.replace(/\.json$/, '')
}

/**
 * Qué dominio le toca a cada snapshot, deducido de las ARISTAS.
 *
 * Los nombres no valen, y está medido: la convención `scrape-<x>.ts → <x>.json`
 * deja 49 de 96 snapshots sin dominio —los curados no tienen guion que los
 * bautice— y cortar por el primer segmento parte familias de verdad
 * (`pleno`/`plenos` son trece ficheros). Así que union-find con tres reglas, en
 * este orden:
 *
 *   A. los escribe el mismo guion
 *   B. los lee el mismo hook (salvo los hooks-inventario, ver el tope de arriba)
 *   C. uno es prefijo del otro CON GUION (`pleno-votes` ⊂ `pleno-votes-suggestions`)
 *
 * La regla C va la última y es la más floja a posta: es la única que mira el
 * nombre. Y exige el guion, porque `pleno` es prefijo de `plenos` como cadena y
 * son cosas distintas.
 */
export function derivarDominios(entradas: EntradasGrafo): Map<string, string> {
  // Las colecciones entran en el universo con su tallo (`pleno-claims/` →
  // `pleno-claims`) para que la regla del prefijo las una a su familia. Sin
  // esto se quedaban sin dominio y desaparecían de la vista por familias, que
  // es donde se leen.
  const universo = new Set([
    ...entradas.snapshots.map((s) => tallo(s.nombre)),
    ...entradas.colecciones.map((c) => c.nombre.replace(/\/$/, '')),
  ])
  const escrituras: string[][] = []
  for (const s of entradas.scripts) {
    const w = analyseScriptIo(s.fuente).writes.map(tallo)
    for (const t of w) universo.add(t)
    if (w.length > 1) escrituras.push(w)
  }

  const padre = new Map<string, string>([...universo].map((t) => [t, t]))
  const busca = (x: string): string => {
    let r = x
    while (padre.get(r) !== r) r = padre.get(r) as string
    // Compresión de caminos: el mapa acaba plano y `busca` no vuelve a subir.
    let c = x
    while (padre.get(c) !== r) {
      const siguiente = padre.get(c) as string
      padre.set(c, r)
      c = siguiente
    }
    return r
  }
  /** Gana el tallo más corto; a igualdad, el alfabético. Así el nombre del
   *  dominio no depende del orden en que lleguen las uniones. */
  const une = (a: string, b: string): void => {
    const ra = busca(a)
    const rb = busca(b)
    if (ra === rb) return
    const [ganador, perdedor] =
      ra.length !== rb.length
        ? ra.length < rb.length
          ? [ra, rb]
          : [rb, ra]
        : ra < rb
          ? [ra, rb]
          : [rb, ra]
    padre.set(perdedor, ganador)
  }

  for (const grupo of escrituras) {
    for (let i = 1; i < grupo.length; i++) une(grupo[0], grupo[i])
  }

  for (const h of entradas.hooks) {
    const leidos = entradas.rutas.snapshotsDe[h.ruta] ?? []
    if (leidos.length < 2 || leidos.length > TOPE_HOOK_UNIFICADOR) continue
    const tallos = leidos.map(tallo).filter((t) => universo.has(t))
    for (let i = 1; i < tallos.length; i++) une(tallos[0], tallos[i])
  }

  const ordenados = [...universo].sort()
  for (const a of ordenados) {
    for (const b of ordenados) {
      if (a !== b && b.startsWith(`${a}-`)) une(a, b)
    }
  }

  const salida = new Map<string, string>()
  for (const t of universo) {
    salida.set(`${t}.json`, busca(t))
    salida.set(`${t}/`, busca(t))
  }
  return salida
}

export function construirGrafoApp(entradas: EntradasGrafo): GrafoApp {
  const nodos = new Map<string, NodoApp>()
  const aristas: AristaApp[] = []

  /** Ruta de fichero → id del nodo que ya la representa. Ver `guion`. */
  const porRuta = new Map<string, string>()

  const anota = (nodo: NodoApp): string => {
    if (!nodos.has(nodo.id)) {
      nodos.set(nodo.id, nodo)
      if (nodo.ruta && !porRuta.has(nodo.ruta)) porRuta.set(nodo.ruta, nodo.id)
    }
    return nodo.id
  }

  const publicados = new Set(entradas.snapshots.map((s) => s.nombre))
  const colecciones = new Set(entradas.colecciones.map((c) => c.nombre))
  /** Nombres que el escaneo devolvió y que no son ningún fichero del repositorio. */
  const sinFichero = new Set<string>()

  /**
   * Dónde vive de verdad el fichero que un guion nombra. Cuatro desenlaces, no
   * dos, porque `analyseScriptIo` devuelve basenames y un basename no dice
   * dónde está: publicado (`public/data/`), interno (existe, y se sabe dónde),
   * ambiguo (casa con varios ficheros y unirlos inventaría una relación) e
   * inexistente (ruido del escaneo).
   *
   * `null` significa «no lo dibujo», y queda anotado para que la página lo
   * diga en vez de callárselo.
   */
  const dato = (nombre: string, quienLoNombra: string): string | null => {
    if (colecciones.has(nombre)) return `snapshot:${nombre}`
    if (publicados.has(nombre)) {
      return anota({
        id: `snapshot:${nombre}`,
        carril: 'snapshot',
        nombre,
        ruta: `public/data/${nombre}`,
        dominio: null,
        publicado: true,
        analizado: true,
      })
    }
    const donde = entradas.ficheros[nombre] ?? []
    if (donde.length === 1) {
      return anota({
        id: `snapshot:${nombre}`,
        carril: 'snapshot',
        nombre,
        ruta: donde[0],
        dominio: null,
        publicado: donde[0].startsWith('public/'),
        detalle: donde[0].startsWith('editorial/')
          ? 'cola de trabajo en editorial/ · ignorada por git a posta, NO se publica'
          : 'fuera de public/ · no lo sirve el sitio',
        analizado: true,
      })
    }
    if (donde.length === 0) {
      sinFichero.add(nombre)
      return null
    }
    // Ambiguo: un nodo por guion que lo nombra. Un solo nodo ataba
    // `.voiceprints/index.json` al manifiesto publicado `pleno-claims/index.json`
    // —dos ficheros distintos— y esa arista no existe en ninguna parte.
    return anota({
      id: `snapshot:${nombre}#${quienLoNombra}`,
      carril: 'snapshot',
      nombre,
      dominio: null,
      publicado: false,
      detalle: `lo nombra ${quienLoNombra} · nombre ambiguo, casa con ${donde.length}: ${donde.slice(0, 3).join(', ')}`,
      analizado: false,
    })
  }

  /** El snapshot publicado, para quien ya sabe que lo está. */
  const snapshot = (nombre: string): string => dato(nombre, 'listado') as string
  /** Igual, pero admitiendo que el nombre no se resuelva. */
  const datoOpcional = (nombre: string, quien: string): string | null => dato(nombre, quien)

  for (const s of entradas.snapshots) {
    const destino = snapshot(s.nombre)
    // La fuente de arriba la DECLARA el propio fichero; no se deduce del
    // código. Por eso va con `origen: 'declarada'` y por eso un snapshot que no
    // la trae se queda sin nodo de fuente en vez de recibir uno adivinado.
    const h = s.source ? host(s.source) : null
    if (h) {
      const origen = anota({
        id: `fuente:${h}`,
        carril: 'fuente',
        nombre: h,
        dominio: null,
        analizado: true,
      })
      aristas.push({ de: origen, a: destino, tipo: 'alimenta', origen: 'declarada' })
    }
  }

  // Las colecciones: un subdirectorio publicado es una pieza. Van antes que los
  // guiones para que `dato()` las encuentre ya anotadas si alguien las nombra.
  for (const c of entradas.colecciones) {
    anota({
      id: `snapshot:${c.nombre}`,
      carril: 'snapshot',
      nombre: c.nombre,
      ruta: `public/data/${c.nombre}`,
      dominio: null,
      publicado: true,
      detalle: `${c.ficheros} ficheros · el código los direcciona por plantilla, así que van como una pieza`,
      analizado: true,
    })
  }

  const parsersConocidos = new Set(entradas.parsers.map((p) => base(p.ruta)))
  for (const p of entradas.parsers) {
    anota({
      id: `parser:${base(p.ruta)}`,
      carril: 'parser',
      nombre: base(p.ruta),
      ruta: p.ruta,
      dominio: null,
      analizado: true,
    })
  }
  // Los parsers se llaman entre ellos, y sin esta arista las primitivas
  // compartidas salían como que no las usa nadie: `normalize.ts` y
  // `hash.ts` son los identificadores estables sobre los que se llavea medio
  // repositorio, y el mapa los dibujaba sueltos.
  for (const p of entradas.parsers) {
    for (const hoja of parsersImportados(p.fuente, parsersConocidos, true)) {
      if (hoja === base(p.ruta)) continue
      aristas.push({
        de: `parser:${base(p.ruta)}`,
        a: `parser:${hoja}`,
        tipo: 'importa',
        origen: 'derivada',
      })
    }
  }

  let scriptsAnalizados = 0
  let scriptsSinAnalizar = 0

  for (const s of entradas.scripts) {
    const io = analyseScriptIo(s.fuente)
    if (io.analysed) scriptsAnalizados += 1
    else scriptsSinAnalizar += 1
    // Sólo se baja a la banda de procesos lo que SE PUDO leer Y quedó sin nada
    // suelto. `analysed: true` quiere decir «el escaneo corrió», no «el escaneo
    // lo entendió»: `scrape-asociaciones.ts` liga su ruta con dos argumentos
    // antes de la cadena, así que el escaneo VE `asociaciones.json` y no lo
    // sabe atar. Bajarlo a «no escribe nada» pliega «no lo pude leer» dentro de
    // «no hay nada», que es el defecto con nombre propio de este repositorio —y
    // ponía siete raspadores en la banda de las guardas.
    const sinAtar = io.unclassified ?? []
    const esProceso = io.analysed && io.writes.length === 0 && sinAtar.length === 0
    const id = anota({
      id: `script:${base(s.ruta)}`,
      carril: esProceso ? 'proceso' : 'script',
      nombre: base(s.ruta),
      ruta: s.ruta,
      dominio: null,
      detalle:
        !esProceso && io.writes.length === 0 && sinAtar.length > 0
          ? `el escaneo vio ${sinAtar.length} fichero(s) y no los supo atar a una llamada`
          : undefined,
      analizado: io.analysed,
    })
    for (const escrito of io.writes) {
      const destino = dato(escrito, base(s.ruta))
      if (destino) aristas.push({ de: id, a: destino, tipo: 'escribe', origen: 'derivada' })
    }
    for (const hoja of parsersImportados(s.fuente, parsersConocidos)) {
      aristas.push({ de: id, a: `parser:${hoja}`, tipo: 'importa', origen: 'derivada' })
    }
    for (const leido of io.reads) {
      // Un nodo que se relee a sí mismo (`compute:dept-stats` pliega sus
      // escalares dentro del propio fichero) no es una arista: sería un bucle
      // que el orden topológico tendría que deshacer después.
      if (io.writes.includes(leido)) continue
      const origen = dato(leido, base(s.ruta))
      if (origen) aristas.push({ de: origen, a: id, tipo: 'lee', origen: 'derivada' })
    }
    // Lo que el escaneo vio y no supo atar a un verbo, y las colecciones que el
    // texto nombra. Ninguna de las dos se disfraza de lectura ni de escritura.
    for (const suelto of new Set([...sinAtar, ...coleccionesEn(s.fuente, colecciones)])) {
      if (io.writes.includes(suelto) || io.reads.includes(suelto)) continue
      const destino = dato(suelto, base(s.ruta))
      if (destino) aristas.push({ de: id, a: destino, tipo: 'nombra', origen: 'derivada' })
    }
  }

  /** Ruta del fichero de hook → su id, para colgarle la salida más abajo. */
  const hooksPorRuta = new Map<string, string>()
  for (const h of entradas.hooks) {
    const id = anota({
      id: `hook:${base(h.ruta)}`,
      carril: 'hook',
      nombre: base(h.ruta),
      ruta: h.ruta,
      dominio: null,
      analizado: true,
    })
    for (const s of entradas.rutas.snapshotsDe[h.ruta] ?? []) {
      aristas.push({ de: snapshot(s), a: id, tipo: 'sirve', origen: 'derivada' })
    }
    // `construirGrafoRutas` sólo casa `/data/x.json` plano —medido: cero
    // snapshots con barra—, así que las colecciones se leen aquí. Un hook sólo
    // carga: la dirección SÍ se sabe.
    for (const c of coleccionesEn(h.fuente, colecciones)) {
      aristas.push({ de: `snapshot:${c}`, a: id, tipo: 'sirve', origen: 'derivada' })
    }
    hooksPorRuta.set(h.ruta, id)
  }

  // La colección cuya URL viaja dentro de otro snapshot. La dirección es la del
  // navegador: quien lee el snapshot puede pedir la hoja.
  for (const [coleccion, portadores] of Object.entries(entradas.referenciasEnDatos)) {
    for (const portador of portadores) {
      aristas.push({
        de: `snapshot:${coleccion}`,
        a: `snapshot:${portador}`,
        tipo: 'sirve',
        origen: 'derivada',
      })
    }
  }

  // Una página que carga el dato sin pasar por un hook. Sólo se atan las que
  // son módulo de una ruta: una arista hacia una vista que nadie monta sería
  // un extremo colgando.
  const modulosDePagina = new Set(Object.values(entradas.rutas.paginaPorRuta ?? {}))
  for (const v of entradas.vistas) {
    if (!modulosDePagina.has(v.ruta)) continue
    const id = `vista:${base(v.ruta)}`
    for (const c of coleccionesEn(v.fuente, colecciones)) {
      aristas.push({ de: `snapshot:${c}`, a: id, tipo: 'sirve', origen: 'derivada' })
    }
    for (const m of v.fuente.matchAll(/['"`]\/data\/([\w-]+\.json)['"`]/g)) {
      if (publicados.has(m[1]) || colecciones.has(m[1])) {
        aristas.push({ de: `snapshot:${m[1]}`, a: id, tipo: 'sirve', origen: 'derivada' })
      }
    }
  }

  /**
   * El nodo que un cron o un flujo ejecuta.
   *
   * Devuelve el que YA representa ese fichero antes de crear otro. Sin esta
   * consulta, diez guiones de shell existían dos veces —`proceso:scrape-all.sh`
   * con sus pasos colgando y `script:scrape-all.sh` vacío— y los seis crones
   * apuntaban al vacío: `com.civicpulse.hallazgos` alcanzaba dos nodos en vez
   * de la tubería entera. El rastro es la función principal de esta página y
   * moría en el primer salto.
   *
   * Un fichero que llega hasta aquí sin nodo previo es uno que NADIE leyó:
   * `analizado: false`, porque «lo nombra un cron» no es «se sabe qué hace».
   */
  const guion = (ruta: string): string => {
    const ya = porRuta.get(ruta)
    if (ya) return ya
    return anota({
      id: `script:${base(ruta)}`,
      carril: 'script',
      nombre: base(ruta),
      ruta,
      dominio: null,
      detalle: 'lo nombra un cron o un flujo · su texto no se ha leído',
      analizado: false,
    })
  }

  /** Las órdenes npm que un texto invoca, y el fichero detrás de cada una. */
  const programaOrdenes = (id: string, texto: string, origen: OrigenArista): void => {
    const vivo = sinComentarios(texto)
    const porOrden = [...ordenesLiterales(vivo), ...ordenesDeArray(vivo)]
      .map((orden) => entradas.comandos[orden])
      .filter((linea): linea is string => Boolean(linea))
      .map((linea) => /(scripts\/[\w.-]+\.(?:ts|sh|mjs))/.exec(linea)?.[1])
    for (const ruta of [...porOrden, ...ficherosInvocados(vivo)]) {
      if (!ruta) continue
      const destino = guion(ruta)
      // Un orquestador que nombra su PROPIA orden npm —en una línea de uso, o
      // reinvocándose por tramos— no es una relación: es el mismo nodo.
      if (destino === id) continue
      aristas.push({ de: id, a: destino, tipo: 'programa', origen })
    }
  }

  // Dos pasadas: primero TODOS los nodos, después sus aristas. Con una sola,
  // `scrape-all.sh` —que va antes por orden alfabético— resolvía
  // `verify-transcript-corpus.sh` con `guion()` y creaba un muñón que luego
  // ganaba la carrera al orquestador de verdad.
  const orquestadores = entradas.orquestadores.map((o) => ({
    fuente: o.fuente,
    id: anota({
      id: `proceso:${base(o.ruta)}`,
      carril: 'proceso',
      nombre: base(o.ruta),
      ruta: o.ruta,
      dominio: null,
      clase: 'orquestador',
      detalle: 'orquestador en shell · el ORDEN de sus pasos no se deriva',
      analizado: true,
    }),
  }))
  for (const o of orquestadores) programaOrdenes(o.id, o.fuente, 'derivada')

  for (const c of entradas.crones) {
    const id = anota({
      id: `proceso:${c.etiqueta}`,
      carril: 'proceso',
      nombre: c.etiqueta,
      // El fichero del cron es SU plist. Poner aquí el guion que ejecuta hacía
      // que dos nodos distintos declarasen el mismo fichero.
      ruta: c.fichero,
      dominio: null,
      clase: 'cron',
      detalle:
        c.hora === null
          ? 'launchd · sin horario declarado'
          : `launchd · ${String(c.hora).padStart(2, '0')}:${String(c.minuto ?? 0).padStart(2, '0')}`,
      analizado: true,
    })
    aristas.push({ de: id, a: guion(c.programa), tipo: 'programa', origen: 'declarada' })
  }

  for (const f of entradas.flujos) {
    const id = anota({
      id: `proceso:${base(f.fichero)}`,
      carril: 'proceso',
      nombre: base(f.fichero),
      ruta: f.fichero,
      dominio: null,
      // Sin horario NO significa que no corra: se dispara por push, por issue o
      // a mano. Decirlo es distinto de callarlo.
      clase: 'flujo',
      detalle: f.cron ? `Actions · cron ${f.cron}` : 'Actions · sin horario (push/issue/manual)',
      analizado: true,
    })
    // Sin la orden en package.json no se sabe qué fichero corre. Se queda sin
    // arista antes que con una inventada: una ausente se nota, una falsa no.
    programaOrdenes(id, f.ejecuta.map((o) => `npm run ${o}`).join('\n'), 'declarada')
  }

  if (entradas.bot) {
    const b = entradas.bot
    const vecino = anota({
      id: 'fuente:Telegram',
      carril: 'fuente',
      nombre: 'Telegram',
      dominio: 'quejas',
      detalle: 'un vecino con el móvil — la única entrada de datos personales',
      analizado: true,
    })
    const bot = anota({
      id: 'proceso:bot',
      carril: 'proceso',
      nombre: 'bot',
      ruta: 'bot/',
      dominio: 'quejas',
      detalle:
        `Fly.io · webhook · ${b.comandos.length} comandos · ${b.servicios.length} servicios · ` +
        'las fotos pasan por visión y mosaico y FALLAN CERRADO',
      analizado: true,
    })
    aristas.push({ de: vecino, a: bot, tipo: 'alimenta', origen: 'declarada' })

    /**
     * Qué tabla toca cada fichero del bot, leído de su propio SQL.
     *
     * `INSERT INTO t` / `UPDATE t` escriben; `FROM t` / `JOIN t` leen. Se casa
     * SÓLO contra los nombres de tabla que ya se conocen, porque el mismo
     * patrón dentro de la prosa de una cabecera da «from the», «from someone».
     */
    const tocan = new Map<string, { lee: Set<string>; escribe: Set<string> }>()
    const tablasConocidas = new Set(b.tablas)
    for (const [ruta, texto] of Object.entries(b.fuentes ?? {})) {
      const lee = new Set<string>()
      const escribe = new Set<string>()
      for (const m of texto.matchAll(/\b(?:insert\s+into|update)\s+([a-z_]+)/gi)) {
        if (tablasConocidas.has(m[1].toLowerCase())) escribe.add(m[1].toLowerCase())
      }
      for (const m of texto.matchAll(/\b(?:from|join)\s+([a-z_]+)/gi)) {
        if (tablasConocidas.has(m[1].toLowerCase())) lee.add(m[1].toLowerCase())
      }
      if (lee.size || escribe.size) tocan.set(ruta, { lee, escribe })
    }
    /** Tablas que alguna pieza concreta declara escribir. */
    const conEscritor = new Set<string>()
    for (const { escribe } of tocan.values()) for (const t of escribe) conEscritor.add(t)

    /** Cuelga de una pieza del bot las tablas que su propio SQL nombra. */
    const aristasDeTabla = (ruta: string, id: string): void => {
      const t = tocan.get(ruta)
      if (!t) return
      for (const tabla of t.escribe) {
        aristas.push({
          de: id,
          a: `snapshot:${tabla} (SQLite)`,
          tipo: 'escribe',
          origen: 'derivada',
        })
      }
      for (const tabla of t.lee) {
        if (t.escribe.has(tabla)) continue
        aristas.push({ de: `snapshot:${tabla} (SQLite)`, a: id, tipo: 'lee', origen: 'derivada' })
      }
    }

    for (const tabla of b.tablas) {
      // Las tablas del bot van en el carril de los datos con el sufijo puesto:
      // son el almacén, pero no son un snapshot publicado y confundirlos sería
      // decir que están en el sitio.
      const t = anota({
        id: `snapshot:${tabla} (SQLite)`,
        carril: 'snapshot',
        nombre: `${tabla} (SQLite)`,
        ruta: 'bot/data/',
        dominio: 'quejas',
        // El volumen vive en Fly.io, no en el sitio. Sin esta marca, la avería
        // «se publica y ninguna página lo lee» señalaba las cinco tablas.
        publicado: false,
        detalle: 'tabla del bot · se agrega a nivel de barrio antes de publicarse',
        analizado: true,
      })
      // Sólo cuelga del nodo genérico lo que ninguna pieza concreta reclama:
      // así una tabla no se queda huérfana y, a la vez, no se dibuja escrita
      // dos veces.
      if (!conEscritor.has(tabla)) {
        aristas.push({ de: bot, a: t, tipo: 'escribe', origen: 'declarada' })
      }
    }

    // Qué comando toca qué tabla NO se deriva, así que no se dibuja.
    for (const c of b.comandos) {
      const id = anota({
        id: `proceso:bot/commands/${c}`,
        carril: 'proceso',
        nombre: `/${c.replace(/\.ts$/, '')}`,
        ruta: `bot/src/commands/${c}`,
        dominio: 'quejas',
        clase: 'comando-bot',
        detalle: tocan.has(`bot/src/commands/${c}`)
          ? 'comando del bot'
          : 'comando del bot · su SQL no nombra ninguna tabla conocida',
        analizado: true,
      })
      aristas.push({ de: vecino, a: id, tipo: 'alimenta', origen: 'declarada' })
      aristasDeTabla(`bot/src/commands/${c}`, id)
    }

    // Los servicios, que son donde de verdad pasa algo con el dato personal:
    // `photo-anonymize` y `process-photos` son la anonimización que FALLA
    // CERRADO, y `export` es la puerta por la que el dato sale del bot. El
    // grafo los leía y sólo los contaba en una frase.
    const servicios = new Map<string, string>()
    for (const sv of b.servicios) {
      servicios.set(
        sv,
        anota({
          id: `proceso:bot/services/${sv}`,
          carril: 'proceso',
          nombre: sv.replace(/\.ts$/, ''),
          ruta: `bot/src/services/${sv}`,
          dominio: 'quejas',
          clase: 'servicio-bot',
          detalle: tocan.has(`bot/src/services/${sv}`)
            ? 'servicio del bot'
            : 'servicio del bot · su SQL no nombra ninguna tabla conocida',
          analizado: true,
        }),
      )
    }
    for (const [sv, id] of servicios) {
      aristas.push({ de: bot, a: id, tipo: 'alimenta', origen: 'declarada' })
      aristasDeTabla(`bot/src/services/${sv}`, id)
      // El servicio que escribe un directorio publicado. `process-photos.ts`
      // enmascara caras, matrículas y DNI y deja la hoja en
      // `public/data/quejas-photos/`: es la única tubería por la que entra aquí
      // un dato personal, y sin esta arista el mapa decía que a esa colección
      // «ningún guion la escribe».
      const fuenteSv = b.fuentes?.[`bot/src/services/${sv}`] ?? ''
      // `escribe` sólo si el fichero tiene una llamada de escritura.
      // `snapshot.ts` resuelve la URL de la foto con `existsSync` y no escribe
      // nada: llamar a eso «escribe» pondría al exportador como productor y
      // dejaría al paso de anonimizado —que es quien la produce— como uno más
      // que la menciona. Cuando no se sabe el verbo, el verbo es `nombra`.
      const escribeAlgo = /\b(?:writeFileSync|mkdirSync|createWriteStream|copyFileSync)\b/.test(
        fuenteSv,
      )
      for (const c of coleccionesEn(fuenteSv, colecciones)) {
        aristas.push({
          de: id,
          a: `snapshot:${c}`,
          tipo: escribeAlgo ? 'escribe' : 'nombra',
          origen: 'derivada',
        })
      }
    }

    // La capa de datos. `snapshot.ts` no tiene una sola sentencia SQL: importa
    // `listRecentQuejas` de `db/queries.ts`. Sin dibujarla, la pieza que de
    // verdad lee las tablas no salía y el mapa lo declaraba como no medido.
    for (const d of b.datos ?? []) {
      const id = anota({
        id: `proceso:bot/db/${d}`,
        carril: 'proceso',
        nombre: `db/${d.replace(/\.ts$/, '')}`,
        ruta: `bot/src/db/${d}`,
        dominio: 'quejas',
        clase: 'datos-bot',
        detalle: 'capa de datos del bot · aquí vive el SQL',
        analizado: true,
      })
      aristasDeTabla(`bot/src/db/${d}`, id)
      // Y quién la llama: el import es literal, así que la arista se deriva.
      for (const [ruta, texto] of Object.entries(b.fuentes ?? {})) {
        if (!new RegExp(`from\\s+['"\`][^'"\`]*db/${d.replace(/\.ts$/, '')}`).test(texto)) continue
        const consumidor = porRuta.get(ruta)
        if (consumidor && consumidor !== id) {
          aristas.push({ de: id, a: consumidor, tipo: 'alimenta', origen: 'derivada' })
        }
      }
    }

    // El puente al sitio, entero: la tabla sale del bot por su export, el flujo
    // se lo trae y lo deja en `public/data`. Sin los dos saltos de en medio,
    // `quejas.json` aparecía escrito de la nada y el rastro del vecino moría en
    // SQLite: veinte nodos y ninguno era una página.
    const exporta = servicios.get('export.ts')
    const destino = b.exporta ? datoOpcional(b.exporta, 'bot') : null
    if (destino) {
      const puente = grafoTraePorFlujo(entradas, 'quejas')
      if (puente) {
        const flujo = anota({
          id: `proceso:${base(puente)}`,
          carril: 'proceso',
          nombre: base(puente),
          ruta: puente,
          dominio: 'quejas',
          analizado: true,
        })
        if (exporta) {
          aristas.push({ de: exporta, a: flujo, tipo: 'alimenta', origen: 'declarada' })
        }
        aristas.push({ de: flujo, a: destino, tipo: 'escribe', origen: 'declarada' })
      } else if (exporta) {
        aristas.push({ de: exporta, a: destino, tipo: 'escribe', origen: 'declarada' })
      }
    }
  }

  for (const r of entradas.rutas.rutas) {
    anota({ id: `ruta:${r}`, carril: 'ruta', nombre: r, dominio: null, analizado: true })
  }
  for (const [r, pagina] of Object.entries(entradas.rutas.paginaPorRuta)) {
    const destino = anota({
      id: `ruta:${r}`,
      carril: 'ruta',
      nombre: r,
      dominio: null,
      analizado: true,
    })
    const vista = anota({
      id: `vista:${base(pagina)}`,
      carril: 'vista',
      nombre: base(pagina),
      ruta: pagina,
      dominio: null,
      analizado: true,
    })
    aristas.push({ de: vista, a: destino, tipo: 'monta', origen: 'derivada' })
  }
  for (const [nombre, suyas] of Object.entries(entradas.rutas.rutasPorSnapshot)) {
    for (const r of suyas) {
      const destino = anota({
        id: `ruta:${r}`,
        carril: 'ruta',
        nombre: r,
        dominio: null,
        analizado: true,
      })
      aristas.push({ de: snapshot(nombre), a: destino, tipo: 'alimenta', origen: 'derivada' })
    }
  }

  // La salida del hook, que faltaba entera. Los setenta y nueve hooks eran
  // callejones sin salida y las cuarenta y una vistas no tenían entrada: la
  // cabecera de carriles prometía `snapshot → hook → vista → ruta` y el grafo
  // dibujaba tres hechos sueltos. Primero la vista que lo importa —la respuesta
  // nítida— y, para los hooks que usa un componente compartido y no un módulo
  // de página, la ruta que lo alcanza; nunca las dos, que sería contar la misma
  // relación dos veces.
  const paginaDeRuta = new Map(
    Object.entries(entradas.rutas.paginaPorRuta).map(([r, p]) => [p, r] as const),
  )
  const cargaDatos = new Set(aristas.filter((a) => a.tipo === 'sirve').map((a) => a.a))
  for (const [ficheroHook, id] of hooksPorRuta) {
    let directas = 0
    for (const [modulo, importados] of Object.entries(entradas.rutas.importa)) {
      if (!importados.includes(ficheroHook)) continue
      if (!paginaDeRuta.has(modulo)) continue
      directas += 1
      aristas.push({ de: id, a: `vista:${base(modulo)}`, tipo: 'sirve', origen: 'derivada' })
    }
    // El respaldo es ALCANZABILIDAD, no lectura: `rutasPorFichero` es el cierre
    // del grafo de imports, que es lo que usa el gancho de pre-push para saber
    // qué rutas puede haber roto un cambio. Sirve para los once hooks que sólo
    // monta un componente compartido —las capas del mapa, la portada— y para
    // nadie más: dibujarlo también donde hay arista directa metía
    // `useTenders → /nosotros` con el mismo grosor que `useTenders → Presupuesto`,
    // y aplicarlo a la fontanería ponía `useHashScroll` en las cuarenta y una.
    if (directas > 0 || !cargaDatos.has(id)) continue
    for (const r of entradas.rutas.rutasPorFichero[ficheroHook] ?? []) {
      aristas.push({ de: id, a: `ruta:${r}`, tipo: 'alimenta', origen: 'derivada' })
    }
  }

  // El dominio se propaga POR LAS ARISTAS, en cascada: el snapshot lo sabe, el
  // guion lo hereda de lo que escribe, el hook de lo que le sirven y el parser
  // del guion que lo llama. Quien no tenga por dónde heredarlo se queda en
  // `null`, que es una respuesta y no un hueco.
  const dominios = derivarDominios(entradas)
  for (const n of nodos.values()) {
    // Sólo se rellena lo que viene vacío. El bot declara el dominio de sus
    // tablas al crearlas y el union-find no sabe nada de ellas: pisarlo las
    // dejaba huérfanas y desaparecían de su propia familia.
    if (n.carril === 'snapshot' && n.dominio === null) n.dominio = dominios.get(n.nombre) ?? null
  }
  /**
   * Hereda el dominio SÓLO si todos los donantes coinciden.
   *
   * Con «gana el primero», `retry.ts` y `snapshot-write.ts` —utilidades que usa
   * medio repositorio— acababan dentro de `press` porque un guion de prensa era
   * el primero por orden alfabético. Un nodo compartido no es de nadie, y decir
   * que lo es dibuja una frontera que no existe.
   */
  const heredar = (tipo: TipoArista, desde: 'de' | 'a'): void => {
    const candidatos = new Map<string, Set<string>>()
    for (const a of aristas) {
      if (a.tipo !== tipo) continue
      const receptor = nodos.get(desde === 'de' ? a.a : a.de)
      const donante = nodos.get(desde === 'de' ? a.de : a.a)
      if (!receptor || !donante || receptor.dominio !== null || donante.dominio === null) continue
      const vistos = candidatos.get(receptor.id) ?? new Set<string>()
      vistos.add(donante.dominio)
      candidatos.set(receptor.id, vistos)
    }
    for (const [id, vistos] of candidatos) {
      if (vistos.size !== 1) continue
      const receptor = nodos.get(id)
      if (receptor) receptor.dominio = [...vistos][0]
    }
  }
  heredar('escribe', 'a') // snapshot → su guion
  heredar('lee', 'de') // snapshot → el guion que lo lee
  heredar('sirve', 'de') // snapshot → hook
  heredar('importa', 'de') // guion → parser

  const porCarril = {
    fuente: 0,
    script: 0,
    parser: 0,
    snapshot: 0,
    hook: 0,
    vista: 0,
    ruta: 0,
    proceso: 0,
  } as Record<Carril, number>
  for (const n of nodos.values()) porCarril[n.carril] += 1

  // Una relación repetida no es dos relaciones. `scrape-all.sh` llama a
  // `npm run refresh` cuatro veces y el recuento de la portada las contaba
  // todas: la cifra que encabeza el mapa decía diecisiete relaciones de más.
  const vistas = new Set<string>()
  const unicas: AristaApp[] = []
  for (const a of aristas) {
    const clave = `${a.de}|${a.a}|${a.tipo}`
    if (vistas.has(clave)) continue
    vistas.add(clave)
    unicas.push(a)
  }

  // Lo que la compilación RETIRA de `dist/` no se publica. Va como pasada
  // final para que valga sea cual sea el sitio que creó el nodo: la regla es
  // «lo publicado es lo que queda en el artefacto», no «lo que hay en public/».
  const denegados = new Set(entradas.denegados)
  for (const n of nodos.values()) {
    if (n.carril !== 'snapshot' || !denegados.has(n.nombre)) continue
    n.publicado = false
    n.detalle = 'la guarda de publicación lo retira de dist/ · no se despliega'
  }

  const grafo: GrafoApp = {
    nodos: [...nodos.values()],
    aristas: unicas,
    stats: { porCarril, aristas: unicas.length, scriptsAnalizados, scriptsSinAnalizar },
    averias: { averias: [], noMedido: [] },
  }
  grafo.averias = detectarAverias(grafo, entradas)

  // Las colecciones se dibujan como UNA pieza. Lo que sigue sin derivarse es
  // CUÁL de sus ficheros toca cada relación, y eso se dice en vez de callarse:
  // el código los direcciona por plantilla (`${plenoId}.json`, `${slug}.json`),
  // así que la respuesta no está en el texto.
  const enColeccion = entradas.colecciones.reduce((a, c) => a + c.ficheros, 0)
  if (enColeccion > 0) {
    const detalle = entradas.colecciones.map((c) => `${c.nombre} (${c.ficheros})`).join(', ')
    grafo.averias.noMedido.push({
      codigo: 'fichero-dentro-de-coleccion',
      motivo:
        `${enColeccion} ficheros publicados van agrupados en su directorio —${detalle}—: ` +
        'qué relación toca cuál no se deriva, porque el código los direcciona por plantilla.',
    })
  }

  // Con la capa de datos dibujada, lo que queda sin derivar es el último
  // tramo: `queries.ts` declara las cuatro tablas y exporta veintitantas
  // funciones, y CUÁL de ellas usa cada servicio no se sigue. La cadena existe
  // —tabla → queries.ts → servicio—; la atribución fina, no.
  if (entradas.bot) {
    const capa = (entradas.bot.datos ?? []).length
    if (capa > 0) {
      grafo.averias.noMedido.push({
        codigo: 'tabla-por-funcion',
        motivo:
          `el SQL del bot vive en ${capa} fichero(s) de bot/src/db y sus tablas se atribuyen a ` +
          'esa capa, no a la función concreta que cada servicio importa: la cadena está, el ' +
          'último tramo no se deriva.',
      })
    }
  }

  for (const nombre of [...sinFichero].sort()) {
    grafo.averias.noMedido.push({
      codigo: 'sin-fichero',
      motivo: `${nombre}: un guion lo nombra y no corresponde a ningún fichero del repositorio; no se dibuja`,
    })
  }
  return grafo
}

/** Un punto débil MEDIDO. No es una opinión: cada uno nombra su comprobación. */
export interface Averia {
  codigo: 'sin-analizar' | 'sin-superficie' | 'sin-productor' | 'sin-expectativa'
  nodo: string
  detalle: string
}

export interface ParteAverias {
  averias: Averia[]
  /**
   * Comprobaciones que NO se pudieron hacer, con el motivo.
   *
   * Va separado de `averias` y se pinta aparte porque «no encontré nada» y «no
   * pude mirar» son hechos distintos, y confundirlos es cómo una guarda acaba
   * imprimiendo su propio visto bueno.
   */
  noMedido: { codigo: string; motivo: string }[]
}

export function detectarAverias(grafo: GrafoApp, entradas: EntradasGrafo): ParteAverias {
  const averias: Averia[] = []
  const noMedido: { codigo: string; motivo: string }[] = []

  for (const n of grafo.nodos) {
    if (n.carril === 'script' && !n.analizado) {
      averias.push({
        codigo: 'sin-analizar',
        nodo: n.id,
        detalle: 'construye sus rutas de una forma que el escaneo no sigue',
      })
    }
  }

  /**
   * Lo que llega a una página SIGUIENDO LA CADENA DEL NAVEGADOR: hook, vista,
   * ruta. Ni un salto, ni el cierre entero.
   *
   * A un salto, una colección que llega a su ruta por el hook salía señalada.
   * Con el cierre completo pasaría lo contrario, y sería peor:
   * `pleno-claims-verified.json` —9,5 MB— lo lee `chunk-pleno-claims.ts`, que
   * escribe los trozos que sí se publican, y ese camino diría «una página lo
   * lee» de un fichero que ninguna página carga. Un guion no es una página.
   */
  const DEL_FRONT = /^(hook|vista|ruta):/
  const siguientes = new Map<string, string[]>()
  const escrito = new Set<string>()
  for (const a of grafo.aristas) {
    // `sirve` entre dos snapshots es la referencia que viaja en el dato: quien
    // llega al portador puede pedir la hoja. Se propaga; un salto por un GUION
    // no, y por eso sigue sin propagarse (`chunk-pleno-claims.ts` diría que una
    // página lee los 9,5 MB que ninguna carga).
    const encadena = DEL_FRONT.test(a.a) || (a.tipo === 'sirve' && a.a.startsWith('snapshot:'))
    if (encadena) siguientes.set(a.de, [...(siguientes.get(a.de) ?? []), a.a])
    if (a.tipo === 'escribe') escrito.add(a.a)
  }
  const alcanzaRuta = new Set<string>()
  for (const n of grafo.nodos) {
    if (n.carril !== 'snapshot') continue
    const visto = new Set([n.id])
    for (const id of visto) for (const sig of siguientes.get(id) ?? []) visto.add(sig)
    if ([...visto].some((x) => x.startsWith('ruta:'))) alcanzaRuta.add(n.id)
  }

  for (const n of grafo.nodos) {
    // Sólo de lo PUBLICADO: «se publica y nadie lo lee» dicho de una tabla
    // SQLite del bot o de una cola de `editorial/` afirma lo contrario de lo
    // que pasa, y eran veintidós de treinta y siete avisos.
    if (n.carril !== 'snapshot' || n.publicado !== true) continue
    if (!alcanzaRuta.has(n.id)) {
      averias.push({
        codigo: 'sin-superficie',
        nodo: n.id,
        detalle: 'se publica y ninguna página lo lee',
      })
    }
  }

  if (entradas.curados === null) {
    noMedido.push({
      codigo: 'sin-productor',
      motivo:
        'no se pudo cargar la lista de ficheros curados; sin ella cada fichero ' +
        'que firma una persona parecería un snapshot sin productor',
    })
  } else {
    const curados = new Set(entradas.curados)
    // Lo que algún guion NOMBRA sin que el escaneo pudiera atarlo a una
    // escritura. `scrape-asociaciones.ts` liga su ruta con dos argumentos antes
    // de la cadena y el reconocedor no la sigue: el fichero SÍ tiene guion, y
    // decir «no lo escribe nadie» sería afirmar algo que no se ha comprobado.
    // Es la misma regla que hace que un guion ilegible no sea una hoja limpia,
    // un nivel más abajo.
    const vistoSinClasificar = new Set<string>()
    for (const s of entradas.scripts) {
      for (const p of analyseScriptIo(s.fuente).unclassified) vistoSinClasificar.add(p)
    }
    // Y lo mismo por la vía de la arista: si algún guion lo NOMBRA, hay guion.
    // Sin esto, `pleno-claims/` y `reportajes/` salían como «no los escribe
    // nadie» teniendo delante a `chunk-pleno-claims.ts`.
    for (const a of grafo.aristas) {
      if (a.tipo !== 'nombra') continue
      const n = grafo.nodos.find((x) => x.id === a.a)
      if (n) vistoSinClasificar.add(n.nombre)
    }
    for (const n of grafo.nodos) {
      if (n.carril !== 'snapshot') continue
      if (n.publicado !== true) continue
      if (!alcanzaRuta.has(n.id) || escrito.has(n.id) || curados.has(n.nombre)) continue
      if (vistoSinClasificar.has(n.nombre)) {
        noMedido.push({
          codigo: 'sin-productor',
          motivo:
            `${n.nombre}: un guion lo nombra, pero el escaneo no pudo atarlo a ` +
            'una llamada de escritura',
        })
        continue
      }
      averias.push({
        codigo: 'sin-productor',
        nodo: n.id,
        detalle: 'una página lo lee y ningún guion lo escribe',
      })
    }
  }

  // Quién vigila que esto no se quede quieto.
  //
  // Hoy no hay nada rancio —`check:cadence` da 45 de 45— y por eso es el
  // momento: la avería más cara aquí fue una nocturna que dejó de escribir en
  // silencio, y un fichero sin expectativa es uno del que nadie se enteraría.
  // Los CURADOS quedan fuera: los escribe una persona y envejecer es una
  // decisión suya, no un fallo.
  if (entradas.expectativas === null) {
    noMedido.push({
      codigo: 'sin-expectativa',
      motivo:
        'no se pudo leer el registro de expectativas de frescura; sin él, ni se ' +
        'puede señalar a nadie ni se puede decir que estén vigilados',
    })
  } else if (entradas.curados !== null) {
    const conExpectativa = new Set(entradas.expectativas)
    const curados = new Set(entradas.curados)
    for (const n of grafo.nodos) {
      if (n.carril !== 'snapshot' || n.publicado !== true) continue
      if (conExpectativa.has(n.nombre) || curados.has(n.nombre)) continue
      // Sin productor derivado no se sabe quién debería refrescarlo. Eso NO es
      // un visto bueno: `budget-execution.json` no tiene expectativa y lo
      // escribe la nocturna, sólo que el escaneo no ata su escritura. Saltarlo
      // en silencio lo dejaría fuera del recuento justo por no haberlo podido
      // leer.
      if (!escrito.has(n.id)) {
        noMedido.push({
          codigo: 'sin-expectativa',
          motivo:
            `${n.nombre}: nadie vigila su frescura y no se pudo derivar quién lo ` +
            'escribe, así que tampoco se sabe quién debería refrescarlo',
        })
        continue
      }
      averias.push({
        codigo: 'sin-expectativa',
        nodo: n.id,
        detalle: 'lo escribe una máquina y nadie vigila si se queda quieto',
      })
    }
  }

  return { averias, noMedido }
}
