/**
 * Qué rutas alcanza cada fichero del front, calculado del código.
 *
 * Vivía dentro de `build-prose-map.ts`, que lo usaba para una sola pregunta —qué
 * rutas describen cada snapshot— y ahora hay una segunda: qué rutas puede haber
 * roto ESTE push. Las dos necesitan el mismo grafo, y dos copias del mismo
 * recorrido de imports es exactamente el duplicado que este repositorio ya ha
 * pagado varias veces (una copia se arregla, la otra sigue mintiendo).
 *
 * Tres pasos, los mismos de siempre:
 *
 *   1. cada módulo declara sus snapshots como literal `/data/x.json`, más los
 *      que DESCRIBE sin cargar vía el marcador `prosa-describe:`
 *   2. se sigue el grafo de imports de src/ —una página llega a `useBudget` a
 *      través de un componente, no siempre de forma directa—
 *   3. App.jsx liga cada `<Route path>` con su módulo de página
 *
 * Módulo puro salvo por la lectura de src/: no toca red y no escribe nada.
 */
import { RUTAS_CON_ESTADO } from '../../src/scraper/reader-review'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

/**
 * Todos los ficheros de código bajo un directorio, HOJAS DE ESTILO INCLUIDAS.
 *
 * El filtro era sólo `.jsx?/.tsx?`, así que `src/index.css` —donde viven los
 * tokens, el bloque `html.dark`, las media queries del armazón y las rejillas de
 * media docena de páginas— no aparecía en el grafo y no mapeaba a NINGUNA ruta.
 * Un push que reescribiera la hoja global no disparaba ninguna revisión de
 * superficies. Medido el 26-08-2026: se reescribió a fondo y el gancho no leyó
 * una sola página por ese motivo.
 */
/**
 * Los ficheros cuyo TEXTO se escanea: imports y referencias a `/data/*.json`.
 *
 * Sin `.css` a propósito, y medido. Al arreglar el punto ciego de la hoja
 * global la tentación es meterla aquí; no sirve de nada. `alcanzaEstatico`
 * añade el nodo que RESUELVE, esté o no en este listado, así que `index.css`
 * llega a sus treinta rutas igual —comprobado con el filtro puesto y quitado, y
 * da 30 las dos veces—. Lo que faltaba era la arista de EFECTO (`import
 * './index.css'`, sin `from`), y ésa vive en el regex de abajo. Un `.css` aquí
 * sería código inerte con un comentario atribuyéndose el arreglo.
 */
export function ficheros(dir: string, acc: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e)
    if (statSync(p).isDirectory()) ficheros(p, acc)
    else if (/\.(jsx?|tsx?)$/.test(p)) acc.push(p)
  }
  return acc
}

/** Resuelve un import relativo a un fichero real. */
export function resolverImport(desde: string, spec: string): string | null {
  if (!spec.startsWith('.')) return null
  const base = resolve(dirname(desde), spec)
  for (const cand of [
    base,
    `${base}.js`,
    `${base}.jsx`,
    `${base}.ts`,
    `${base}.tsx`,
    join(base, 'index.js'),
    join(base, 'index.jsx'),
  ]) {
    try {
      if (statSync(cand).isFile()) return cand
    } catch {
      /* siguiente candidato */
    }
  }
  return null
}

export interface GrafoRutas {
  /** snapshot (`indicadores.json`) → rutas que lo cargan o lo describen. */
  rutasPorSnapshot: Map<string, Set<string>>
  /**
   * fichero absoluto → snapshots que ese fichero nombra DIRECTAMENTE.
   *
   * Lo transitivo (`rutasPorSnapshot`) contesta «qué páginas hablan de esto»,
   * que es lo que necesita el recordatorio de prosa vieja. Lo directo contesta
   * «quién lo carga», que es otra pregunta: sin ella el despiece sólo puede
   * dibujar el cierre —treinta rutas colgando de `index.css`— y no la arista
   * que de verdad explica el dato, `usePadron → padron.json`.
   */
  snapshotsDe: Map<string, Set<string>>
  /** fichero absoluto → ficheros que importa (estáticos + dinámicos), resueltos. */
  importa: Map<string, string[]>
  /** Igual, pero SÓLO por imports estáticos: lo que envuelve a todas las páginas. */
  importaEstatico: Map<string, string[]>
  /** fichero absoluto de src/ → rutas cuyo módulo de página lo alcanza. */
  rutasPorFichero: Map<string, Set<string>>
  /** Todas las rutas montadas en App.jsx, salvo el comodín. */
  rutas: string[]
  /** Ruta → el módulo de página que la sirve. */
  paginaPorRuta: Map<string, string>
}

/**
 * Rutas que existen en la build de producción y se pueden pedir tal cual.
 *
 * Fuera quedan dos clases, y las dos por motivo:
 *
 * · las que llevan `:` necesitan un id real, y elegir CUÁL es una decisión
 *   editorial (¿qué concejal representa a `/cargos/:slug`?). Sus índices entran.
 * · `/curator` no existe en producción —se excluye en dos sitios
 *   independientes— así que pedirla sólo da un NO MONTADA. El gancho de
 *   pre-push lo estaba haciendo en cada push que tocara algo que la página del
 *   curador importa.
 *
 * Vive aquí porque ya había tres copias de este filtro —review-surfaces,
 * check-surfaces y la que le faltaba a routes-for-changes— y una copia que se
 * arregla mientras las otras siguen mal es el duplicado favorito de este
 * repositorio.
 */
/**
 * Rutas montadas en desarrollo que NO existen en la compilación de producción.
 *
 * Estaba escrito a mano dentro del filtro de abajo, con un solo nombre. En
 * cuanto hubo una segunda —el despiece— la copia volvía a ser una copia: la
 * revisión lectora saldría a pedir una página que en producción devuelve el
 * comodín, y el gancho de pre-push lo haría en cada push que tocara algo que
 * esa página importa. Es exactamente el defecto que el comentario de abajo ya
 * describía para `/curator`.
 */
export const RUTAS_LOCALES: readonly string[] = ['/curator', '/despiece']

export function rutasPublicas(grafo: GrafoRutas): string[] {
  return grafo.rutas.filter((r) => !r.includes(':') && !RUTAS_LOCALES.includes(r))
}

/**
 * Todo lo que la revisión lectora debe cubrir: las rutas públicas MÁS las
 * claves con estado.
 *
 * Existe por lo mismo que `rutasPublicas` justo encima: la composición estaba
 * escrita dos veces —en `review-surfaces --all` y en `check-surfaces`— y una
 * clave que el barrido lee pero el parte no conoce nunca se reportaría rancia.
 * La prosa de las capas volvería a envejecer en silencio, que es exactamente
 * el agujero que estas claves vienen a tapar.
 */
export function rutasRevisables(grafo: GrafoRutas): string[] {
  return [...rutasPublicas(grafo), ...RUTAS_CON_ESTADO]
}

/**
 * Quita comentarios de bloque y líneas que son ÍNTEGRAMENTE comentario.
 *
 * Deliberadamente NO toca un `//` a media línea: `'https://x/data/y.json'` es
 * código, y recortar desde las barras se llevaría por delante una arista de
 * verdad. Con quitar los bloques `/* … *\/` y las líneas que empiezan por `//`
 * o `*` basta para lo único que hace falta: que la prosa no declare nada.
 */
function sinComentarios(t: string): string {
  return t
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .split('\n')
    .filter((l) => !/^\s*(\/\/|\*)/.test(l))
    .join('\n')
}

/**
 * La ruta que `App.jsx` sirve SIN montar un `<Route>`, y el módulo que la pinta.
 *
 * Devuelve `null` si el patrón deja de reconocerse, para no romper a quien
 * consulta el grafo; quien lo convierte en ruido es la prueba, que es donde un
 * fallo así se ve una vez en vez de todos los días.
 */
function rutaDePortada(
  textoApp: string,
  componenteDe: Map<string, string>,
): { ruta: string; fichero: string } | null {
  const cond = textoApp.match(/const\s+(\w+)\s*=\s*location\.pathname\s*===\s*'([^']+)'/)
  if (!cond) return null
  const [, bandera, ruta] = cond
  const desde = textoApp.indexOf(`if (${bandera}) {`)
  if (desde === -1) return null
  // Hasta el `return (` de la rama que NO es la portada, o un trozo generoso.
  const corte = textoApp.indexOf('\n  return (', desde)
  const bloque = textoApp.slice(desde, corte === -1 ? desde + 800 : corte)
  for (const m of bloque.matchAll(/<(\w+)[\s/>]/g)) {
    const fichero = componenteDe.get(m[1])
    if (fichero) return { ruta, fichero }
  }
  return null
}

export function construirGrafoRutas(src: string): GrafoRutas {
  const todos = ficheros(src)
  const texto = new Map(todos.map((f) => [f, readFileSync(f, 'utf8')]))

  const snapshotsDe = new Map<string, Set<string>>()
  for (const [f, t] of texto) {
    // Sobre el texto SIN comentarios: un comentario que MENCIONA una ruta no la
    // DECLARA. Una línea de JSDoc que decía «acepta `promises.json` como
    // `/data/promises.json`» le colgó a promises.json ocho rutas que no hablan
    // de promesas, sólo porque el módulo lo importan catorce páginas. Es la
    // misma broma que ya se contó en `prepush-range.test.js`, que tuvo que
    // quitar comentarios antes de casar porque el comentario que explicaba la
    // regla citaba la forma equivocada.
    //
    // `prosa-describe:` sigue leyéndose del texto ÍNTEGRO, abajo: ésa es una
    // declaración deliberada y vive precisamente dentro de un comentario.
    const encontrados = [...sinComentarios(t).matchAll(/['"`]\/data\/([\w-]+\.json)['"`]/g)].map(
      (m) => m[1],
    )
    const declarados = [...t.matchAll(/prosa-describe:\s*([^*\n]+)/g)].flatMap((m) =>
      m[1]
        .split(',')
        .map((x) => x.trim())
        .filter((x) => /^[\w-]+\.json$/.test(x)),
    )
    if (encontrados.length || declarados.length) {
      snapshotsDe.set(f, new Set([...encontrados, ...declarados]))
    }
  }

  // Dos grafos de aristas, no uno.
  //
  // ESTÁTICAS: `from '…'` y el import de EFECTO `import './index.css'`, que no
  // lleva `from` y por eso la hoja global no entraba por ningún lado.
  // DINÁMICAS: `import('…')`, que en App.jsx es exactamente el mecanismo con el
  // que se cargan las páginas.
  //
  // La distinción es la que permite hablar del ARMAZÓN: lo que se alcanza desde
  // la entrada por aristas estáticas envuelve a todas las páginas; lo que se
  // alcanza por una dinámica ES una página.
  const importa = new Map<string, string[]>()
  const importaEstatico = new Map<string, string[]>()
  for (const [f, t] of texto) {
    const estaticos = [
      ...t.matchAll(/from\s+['"]([^'"]+)['"]|(?:^|\n)\s*import\s+['"]([^'"]+)['"]/g),
    ]
      .map((m) => m[1] ?? m[2])
      .filter(Boolean)
    const dinamicos = [...t.matchAll(/import\(\s*['"]([^'"]+)['"]\s*\)/g)]
      .map((m) => m[1])
      .filter(Boolean)
    const resolver = (specs: string[]) =>
      specs.map((s) => resolverImport(f, s)).filter((x): x is string => Boolean(x))
    importaEstatico.set(f, resolver(estaticos))
    importa.set(f, resolver([...estaticos, ...dinamicos]))
  }

  /** Snapshots que un módulo alcanza, directa o transitivamente. */
  const cacheSnap = new Map<string, Set<string>>()
  function alcanzaSnapshots(f: string, viendo = new Set<string>()): Set<string> {
    if (cacheSnap.has(f)) return cacheSnap.get(f)!
    if (viendo.has(f)) return new Set() // ciclo de imports: corta y sigue
    viendo.add(f)
    const out = new Set(snapshotsDe.get(f) ?? [])
    for (const dep of importa.get(f) ?? []) {
      for (const s of alcanzaSnapshots(dep, viendo)) out.add(s)
    }
    viendo.delete(f)
    cacheSnap.set(f, out)
    return out
  }

  /** Ficheros que un módulo alcanza, él incluido. */
  const cacheFich = new Map<string, Set<string>>()
  function alcanzaFicheros(f: string, viendo = new Set<string>()): Set<string> {
    if (cacheFich.has(f)) return cacheFich.get(f)!
    if (viendo.has(f)) return new Set()
    viendo.add(f)
    const out = new Set<string>([f])
    for (const dep of importa.get(f) ?? []) {
      for (const s of alcanzaFicheros(dep, viendo)) out.add(s)
    }
    viendo.delete(f)
    cacheFich.set(f, out)
    return out
  }

  /** Ficheros que un módulo alcanza SÓLO por imports estáticos, él incluido. */
  const cacheArmazon = new Map<string, Set<string>>()
  function alcanzaEstatico(f: string, viendo = new Set<string>()): Set<string> {
    if (cacheArmazon.has(f)) return cacheArmazon.get(f)!
    if (viendo.has(f)) return new Set()
    viendo.add(f)
    const out = new Set<string>([f])
    for (const dep of importaEstatico.get(f) ?? []) {
      for (const s of alcanzaEstatico(dep, viendo)) out.add(s)
    }
    viendo.delete(f)
    cacheArmazon.set(f, out)
    return out
  }

  const app = join(src, 'App.jsx')
  const textoApp = readFileSync(app, 'utf8')
  const componenteDe = new Map<string, string>()
  for (const m of textoApp.matchAll(/const\s+(\w+)\s*=[^\n]*?import\(\s*['"]([^'"]+)['"]\s*\)/g)) {
    const destino = resolverImport(app, m[2])
    if (destino) componenteDe.set(m[1], destino)
  }

  const rutasPorSnapshot = new Map<string, Set<string>>()
  const rutasPorFichero = new Map<string, Set<string>>()
  /** El módulo de página de cada ruta. El bucle ya lo sabía y lo tiraba. */
  const paginaPorRuta = new Map<string, string>()
  const rutas: string[] = []
  const montarRuta = (ruta: string, fichero: string): void => {
    rutas.push(ruta)
    paginaPorRuta.set(ruta, fichero)
    for (const snap of alcanzaSnapshots(fichero)) {
      const set = rutasPorSnapshot.get(snap) ?? new Set()
      set.add(ruta)
      rutasPorSnapshot.set(snap, set)
    }
    // App.jsx y el armazón que envuelve a TODAS las páginas alcanzan cada ruta;
    // eso no es un defecto del grafo, es la verdad: tocar `InnerShell` puede
    // romper las veintitantas.
    for (const fich of alcanzaFicheros(fichero)) {
      const set = rutasPorFichero.get(fich) ?? new Set()
      set.add(ruta)
      rutasPorFichero.set(fich, set)
    }
  }

  for (const m of textoApp.matchAll(/<Route\s+path="([^"]+)"\s+element=\{<(\w+)/g)) {
    const [, ruta, comp] = m
    const fichero = componenteDe.get(comp)
    if (!fichero || ruta === '*') continue
    montarRuta(ruta, fichero)
  }

  // LA PORTADA NO ES UN <Route>, así que este grafo no la veía — y como no la
  // veía, la revisión lectora no la ha leído NUNCA.
  //
  // `App.jsx` resuelve `/` antes de llegar a `<Routes>`: `if (onLanding) return
  // <DirectionD/>`. El bucle de arriba sólo mira `<Route path=…>`, o sea que la
  // página más visitada del sitio quedaba fuera de `rutas`, fuera de
  // `rutasPublicas()` y fuera del barrido nocturno. Medido: `review-sweep.log`,
  // 144 KB desde el 13 de agosto, no tiene ni una línea de `/`. El gate decía
  // «31 de 31 al día» sobre un conjunto que nunca la incluyó.
  //
  // Y no estaba limpia. Una pasada a mano del 25 de agosto dejó dos
  // señalamientos vivos en `.review-cache.json` que ninguna guarda podía ver,
  // uno de ellos `misleading`: «obra acumulada · 2,2 M€ de 123,7 M€», donde los
  // 123,7 M€ son el total a diez años de TODOS los tipos de contrato, no de
  // obra.
  //
  // Se deriva, no se apunta a mano: la bandera y su ruta salen del propio
  // `location.pathname === '…'`, y el módulo, del primer componente del bloque
  // que ya conoce el mapa de `import()`. Renombrar `DirectionD` no vuelve a
  // perder la portada; una tabla con su nombre dentro, sí.
  // `tests/route-graph-portada.test.ts` la fija por si el patrón cambia.
  const portada = rutaDePortada(textoApp, componenteDe)
  if (portada) montarRuta(portada.ruta, portada.fichero)

  // EL ARMAZÓN ALCANZA TODAS LAS RUTAS, y hasta ahora no alcanzaba ninguna.
  //
  // El bucle de arriba siembra desde los módulos de página, que App.jsx carga
  // con `import()`. Todo lo que App.jsx —y antes main.jsx— importan de forma
  // ESTÁTICA envuelve a las páginas en vez de colgar de una: la barra lateral,
  // la topbar, Cmd+K, el panel de ajustes, `useHashScroll`, `i18n`, y la hoja de
  // estilos global. Nada de eso aparecía en `rutasPorFichero`, así que un cambio
  // ahí devolvía CERO rutas y no disparaba revisión alguna.
  //
  // Medido el 26-08-2026, y las dos veces con un defecto real dentro:
  // `SubnavSecciones.jsx` y `useHashScroll.js` cayeron en `sinRuta` en el mismo
  // push en que el segundo estaba colocando los anclas 80 px por encima de donde
  // debía. El comentario de aquí al lado ya afirmaba que «tocar InnerShell puede
  // romper las veintitantas»; ahora es verdad y no una intención.
  //
  // Las semillas se RESUELVEN: todo lo demás en `rutasPorFichero` sale de
  // `resolverImport`, o sea absoluto, y quien consulta el mapa lo hace con un
  // `resolve(ROOT, …)`. Una semilla en la forma que trajo el llamante —`src`
  // relativo— sería una clave muerta: presente en el mapa y jamás encontrada.
  const entrada = resolve(src, 'main.jsx')
  const raiz = resolve(app)
  const armazon = new Set<string>([
    ...alcanzaEstatico(existsSync(entrada) ? entrada : raiz),
    ...alcanzaEstatico(raiz),
  ])
  const todasLasRutas = [...new Set(rutas)]
  for (const fich of armazon) {
    const set = rutasPorFichero.get(fich) ?? new Set()
    for (const r of todasLasRutas) set.add(r)
    rutasPorFichero.set(fich, set)
  }

  return {
    rutasPorSnapshot,
    rutasPorFichero,
    paginaPorRuta,
    snapshotsDe,
    importa,
    importaEstatico,
    rutas: todasLasRutas.sort(),
  }
}
