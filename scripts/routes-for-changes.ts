#!/usr/bin/env tsx
/**
 * Qué rutas puede haber cambiado este push.
 *
 * El gancho de pre-push decidía SI correr mirando los ficheros tocados, y luego
 * revisaba el conjunto por defecto —seis rutas fijas— con un presupuesto de 60
 * segundos. Como una ruta cuesta del orden de un minuto, cada push leía una, y
 * la rotación por «menos recientemente revisada» tardaba media docena de pushes
 * en dar la vuelta. El resultado medido: los tres defectos de /hallazgos de hoy
 * los encontró una pasada completa a mano, no el gancho.
 *
 * Revisar «todas las rutas» en cada push no es la solución: son veintitantas y
 * media hora de reloj, y un gancho que tarda media hora es un gancho que la
 * gente saltará con --no-verify. La cobertura que sí se puede exigir siempre es
 * OTRA: todas las rutas que ESTE push puede haber roto. Casi siempre son una o
 * dos y caben de sobra; cuando alguien toca `i18n.jsx` o el armazón, son todas,
 * y entonces el gancho lo dice en voz alta en vez de leer una y callarse.
 *
 * Sale del mismo grafo que `build-prose-map.ts` —imports reales, rutas reales de
 * App.jsx—, no de una lista escrita a mano que se quedaría vieja.
 *
 *   npx tsx scripts/routes-for-changes.ts src/pages/Eficiencia.jsx
 *   git diff --name-only origin/main...HEAD | npx tsx scripts/routes-for-changes.ts --stdin
 *   … --json   → { rutas, sinRuta, totalRutas }
 *
 * TRES puntos en ese rango. Con dos, `git diff` compara las dos PUNTAS y todo
 * lo que haya avanzado main entra como si lo hubiera cambiado tu rama: medido,
 * 10 rutas donde eran 2. Este ejemplo tenía dos y el gancho de pre-push lo
 * copió tal cual.
 */
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { construirGrafoRutas, rutasPublicas } from './lib/route-graph'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const SRC = join(ROOT, 'src')

/** Rutas que toca un fichero cambiado. Vacío = ninguna página lo alcanza. */
export function rutasDeFichero(
  ruta: string,
  grafo: ReturnType<typeof construirGrafoRutas>,
): string[] {
  const limpia = ruta.trim().replace(/^\.\//, '')
  if (!limpia) return []

  // Un snapshot: lo alcanzan las páginas que lo cargan o lo describen.
  const snap = /^public\/data\/([\w-]+\.json)$/.exec(limpia)
  if (snap) return [...(grafo.rutasPorSnapshot.get(snap[1]) ?? [])]

  // Un módulo del front: lo alcanzan las páginas que lo importan, directa o
  // transitivamente. `src/i18n.jsx` sale con las veintitantas, y es correcto.
  if (limpia.startsWith('src/')) {
    return [...(grafo.rutasPorFichero.get(resolve(ROOT, limpia)) ?? [])]
  }

  return []
}

/** Lo que el gancho necesita saber de un diff: qué rutas, y en qué orden. */
export interface Centralidad {
  /** Rutas públicas alcanzadas, YA ORDENADAS. Directas primero. */
  rutas: string[]
  detalle: { ruta: string; ficheros: number; peso: number; directa: boolean }[]
  /** Cuántas de las primeras son directas. Es el N de `--rotate-desde`. */
  directas: number
  /** Entradas que no alcanzan ninguna ruta. */
  sinRuta: string[]
}

/**
 * Ordena las rutas que tocan unos ficheros cambiados, por centralidad.
 *
 * Vive fuera de `main()` a propósito: una guarda de orden que no se puede
 * ejercitar —ni ver fallar— no es una guarda. `tests/routes-for-changes.test.ts`
 * le rompe la centralidad y comprueba que el orden deja de acertar.
 */
export function ordenarPorCentralidad(
  entradas: string[],
  grafo: ReturnType<typeof construirGrafoRutas>,
): Centralidad {
  // Sólo lo que existe en producción: pedir /curator daba un NO MONTADA en
  // cada push que tocara algo que la página del curador importa.
  const publicas = new Set(rutasPublicas(grafo))
  // LA CENTRALIDAD NO SE TIRA.
  //
  // Antes esto era un `Set` y la multiplicidad se perdía en el `add`. Medido
  // sobre el push del 26-08-2026: `src/i18n.jsx`, tocado de refilón, generó
  // DIECISÉIS de las diecinueve rutas, y los veinticuatro ficheros del rediseño
  // real generaron dos. Planas, indistinguibles, y el lector de la puerta rápida
  // —que sólo da para una ruta— leyó una de las dieciséis.
  //
  // Se conservan dos señales, y ninguna es una heurística:
  //
  //   `directa`  cambió el propio módulo de página de esa ruta. Exacto: sale de
  //              `paginaPorRuta`, que el grafo ya calculaba.
  //   `peso`     suma de 1/(rutas que alcanza cada fichero cambiado). Un fichero
  //              que llega a dos rutas aporta 0,5 a cada una; la hoja global,
  //              que llega a treinta, aporta 0,03 a todas. Es fan-out inverso:
  //              cuanto más específico es un cambio, más señala.
  const cuenta = new Map<string, number>()
  const peso = new Map<string, number>()
  const directa = new Set<string>()
  const paginas = new Map([...grafo.paginaPorRuta].map(([r, f]) => [f, r]))
  const sinRuta: string[] = []
  for (const e of entradas) {
    const r = rutasDeFichero(e, grafo).filter((x) => publicas.has(x))
    if (rutasDeFichero(e, grafo).length === 0) sinRuta.push(e)
    const propia = paginas.get(resolve(ROOT, e.trim().replace(/^\.\//, '')))
    if (propia && publicas.has(propia)) directa.add(propia)
    for (const x of r) {
      cuenta.set(x, (cuenta.get(x) ?? 0) + 1)
      peso.set(x, (peso.get(x) ?? 0) + 1 / r.length)
    }
  }

  // Directas primero; dentro de cada grupo, por peso. El desempate alfabético
  // existe para que dos ejecuciones sobre el mismo diff den el mismo orden.
  const ordenadas = [...cuenta.keys()].sort((a, b) => {
    const d = Number(directa.has(b)) - Number(directa.has(a))
    if (d !== 0) return d
    const w = (peso.get(b) ?? 0) - (peso.get(a) ?? 0)
    if (Math.abs(w) > 1e-9) return w
    return a.localeCompare(b)
  })

  return {
    rutas: ordenadas,
    detalle: ordenadas.map((r) => ({
      ruta: r,
      ficheros: cuenta.get(r) ?? 0,
      peso: Number((peso.get(r) ?? 0).toFixed(4)),
      directa: directa.has(r),
    })),
    directas: ordenadas.filter((r) => directa.has(r)).length,
    sinRuta,
  }
}

function main() {
  const argv = process.argv.slice(2)
  const json = argv.includes('--json')
  const desdeStdin = argv.includes('--stdin')
  const rutasArg = argv.filter((a) => !a.startsWith('--'))
  const entradas = desdeStdin
    ? readFileSync(0, 'utf8')
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean)
    : rutasArg

  const grafo = construirGrafoRutas(SRC)
  const { rutas: ordenadas, detalle, directas, sinRuta } = ordenarPorCentralidad(entradas, grafo)

  if (json) {
    console.log(
      JSON.stringify(
        {
          rutas: ordenadas,
          detalle,
          directas,
          sinRuta,
          totalRutas: grafo.rutas.length,
          entradas: entradas.length,
        },
        null,
        2,
      ),
    )
    return
  }
  for (const r of ordenadas) console.log(r)
}

// Sólo cuando se ejecuta como CLI: el módulo lo importa una prueba.
if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  main()
}
