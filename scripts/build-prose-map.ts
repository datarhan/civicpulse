#!/usr/bin/env tsx
/**
 * Deriva qué rutas describen cada snapshot, en vez de mantenerlo a mano.
 *
 * El recordatorio de prosa vieja nació con una tabla escrita a mano, y una
 * tabla escrita a mano es exactamente lo que este repositorio ya sabe que se
 * queda vieja: CLAUDE.md lo dice de la lista de comandos —«la lista drifted
 * from reality every time it was tried»— y la propia avería que el hook
 * persigue es una frase que dejó de coincidir con su dato. Un control contra el
 * desfase que se desfasa solo no vale nada.
 *
 * Así que se calcula del código:
 *
 *   1. cada hook de src/hooks declara su snapshot como literal `/data/x.json`
 *   2. se sigue el grafo de imports de src/ hasta ver qué módulos alcanzan cada
 *      hook —una página llega a `useBudget` a través de un componente, no
 *      siempre de forma directa—
 *   3. App.jsx liga cada `<Route path>` con su módulo de página
 *
 * El resultado se escribe en .claude/hooks/prosa-map.json y lo lee el hook, que
 * así no tiene que analizar nada en cada edición. Una prueba regenera el mapa y
 * lo compara con el committeado: si el código cambia y el mapa no, la suite se
 * pone roja en vez de que el recordatorio empiece a mentir en silencio.
 *
 * Usage: npm run build:prose-map [-- --check]
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const SRC = join(ROOT, 'src')
const OUT = join(ROOT, '.claude/hooks/prosa-map.json')

/** Todos los ficheros de código bajo src/. */
function ficheros(dir: string, acc: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e)
    if (statSync(p).isDirectory()) ficheros(p, acc)
    else if (/\.(jsx?|tsx?)$/.test(p)) acc.push(p)
  }
  return acc
}

/** Resuelve un import relativo a un fichero real de src/. */
function resolver(desde: string, spec: string): string | null {
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

function main() {
  const todos = ficheros(SRC)
  const texto = new Map(todos.map((f) => [f, readFileSync(f, 'utf8')]))

  // 1. módulo → snapshots que menciona literalmente
  //
  //    …más los que DESCRIBE sin cargar. `/metodologia` explica en prosa lo que
  //    dicen `indicadores.json` y `dea.json` sin leer ninguno de los dos, así
  //    que el recordatorio no se disparaba justo en el documento que es el
  //    contrato editorial publicado. El marcador
  //    `/* prosa-describe: indicadores.json, dea.json */` lo declara.
  //
  //    Sí, es una lista escrita a mano; la diferencia con la tabla central que
  //    esto vino a sustituir es que vive DENTRO del fichero que contiene la
  //    prosa, así que no puede alejarse de lo que describe sin que alguien la
  //    esté mirando. Y `--check` sigue rojo si diverge.
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

  // 2. grafo de imports
  const importa = new Map<string, string[]>()
  for (const [f, t] of texto) {
    const specs = [...t.matchAll(/from\s+['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g)]
      .map((m) => m[1] ?? m[2])
      .filter(Boolean)
    importa.set(
      f,
      specs.map((s) => resolver(f, s)).filter((x): x is string => Boolean(x)),
    )
  }

  /** Snapshots que un módulo alcanza, directa o transitivamente. */
  const cache = new Map<string, Set<string>>()
  function alcanza(f: string, viendo = new Set<string>()): Set<string> {
    if (cache.has(f)) return cache.get(f)!
    if (viendo.has(f)) return new Set() // ciclo de imports: corta y sigue
    viendo.add(f)
    const out = new Set(snapshotsDe.get(f) ?? [])
    for (const dep of importa.get(f) ?? []) {
      for (const s of alcanza(dep, viendo)) out.add(s)
    }
    viendo.delete(f)
    cache.set(f, out)
    return out
  }

  // 3. rutas → módulo de página, leyendo App.jsx
  const app = readFileSync(join(SRC, 'App.jsx'), 'utf8')
  const componenteDe = new Map<string, string>()
  for (const m of app.matchAll(/const\s+(\w+)\s*=[^\n]*?import\(\s*['"]([^'"]+)['"]\s*\)/g)) {
    const destino = resolver(join(SRC, 'App.jsx'), m[2])
    if (destino) componenteDe.set(m[1], destino)
  }
  const rutasPorSnapshot = new Map<string, Set<string>>()
  for (const m of app.matchAll(/<Route\s+path="([^"]+)"\s+element=\{<(\w+)/g)) {
    const [, ruta, comp] = m
    const fichero = componenteDe.get(comp)
    if (!fichero || ruta === '*') continue
    for (const snap of alcanza(fichero)) {
      const set = rutasPorSnapshot.get(snap) ?? new Set()
      set.add(ruta)
      rutasPorSnapshot.set(snap, set)
    }
  }

  // Se probó propagar linaje —un snapshot que alimenta a otro hereda sus
  // rutas, para que tocar pmp.json avisara de /eficiencia aunque ninguna página
  // lo lea directamente— y se descartó: los scripts de comprobación MENCIONAN
  // muchos snapshots sin derivar unos de otros, así que la propagación acababa
  // dando las 29 rutas a los 76 ficheros. Un aviso que nombra todo no señala
  // nada, y un mapa borroso es peor que uno preciso con un hueco conocido.
  //
  // El hueco además está cubierto por otro lado: tocar pmp.json obliga a
  // recomputar indicadores.json, y eso sí dispara; y si alguien no recomputa,
  // check:indicadores recalcula desde el origen y se pone rojo.

  const mapa = {
    _comentario:
      'Generado por scripts/build-prose-map.ts — no editar a mano. ' +
      'tests/stale-copy-paths.test.js falla si el código cambia y esto no.',
    generadoDe: relative(ROOT, SRC),
    snapshots: Object.fromEntries(
      [...rutasPorSnapshot.entries()]
        .map(([snap, rutas]) => [snap, [...rutas].sort()] as const)
        .sort(([a], [b]) => a.localeCompare(b)),
    ),
  }
  const json = JSON.stringify(mapa, null, 2) + '\n'

  if (process.argv.includes('--check')) {
    const actual = readFileSync(OUT, 'utf8')
    if (actual !== json) {
      console.error('[prose-map] el mapa committeado no coincide con el código')
      process.exit(1)
    }
    console.log(`[prose-map] al día · ${Object.keys(mapa.snapshots).length} snapshots`)
    return
  }

  writeFileSync(OUT, json)
  console.log(
    `[prose-map] ${Object.keys(mapa.snapshots).length} snapshots con rutas que los describen → ${relative(ROOT, OUT)}`,
  )
}

main()
