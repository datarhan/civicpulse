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
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

/** Todos los ficheros de código bajo un directorio. */
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
  /** fichero absoluto de src/ → rutas cuyo módulo de página lo alcanza. */
  rutasPorFichero: Map<string, Set<string>>
  /** Todas las rutas montadas en App.jsx, salvo el comodín. */
  rutas: string[]
}

export function construirGrafoRutas(src: string): GrafoRutas {
  const todos = ficheros(src)
  const texto = new Map(todos.map((f) => [f, readFileSync(f, 'utf8')]))

  const snapshotsDe = new Map<string, Set<string>>()
  for (const [f, t] of texto) {
    const encontrados = [...t.matchAll(/['"`]\/data\/([\w-]+\.json)['"`]/g)].map((m) => m[1])
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

  const importa = new Map<string, string[]>()
  for (const [f, t] of texto) {
    const specs = [...t.matchAll(/from\s+['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g)]
      .map((m) => m[1] ?? m[2])
      .filter(Boolean)
    importa.set(
      f,
      specs.map((s) => resolverImport(f, s)).filter((x): x is string => Boolean(x)),
    )
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

  const app = join(src, 'App.jsx')
  const textoApp = readFileSync(app, 'utf8')
  const componenteDe = new Map<string, string>()
  for (const m of textoApp.matchAll(/const\s+(\w+)\s*=[^\n]*?import\(\s*['"]([^'"]+)['"]\s*\)/g)) {
    const destino = resolverImport(app, m[2])
    if (destino) componenteDe.set(m[1], destino)
  }

  const rutasPorSnapshot = new Map<string, Set<string>>()
  const rutasPorFichero = new Map<string, Set<string>>()
  const rutas: string[] = []
  for (const m of textoApp.matchAll(/<Route\s+path="([^"]+)"\s+element=\{<(\w+)/g)) {
    const [, ruta, comp] = m
    const fichero = componenteDe.get(comp)
    if (!fichero || ruta === '*') continue
    rutas.push(ruta)
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

  return { rutasPorSnapshot, rutasPorFichero, rutas: [...new Set(rutas)].sort() }
}
