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
 *   git diff --name-only origin/main..HEAD | npx tsx scripts/routes-for-changes.ts --stdin
 *   … --json   → { rutas, sinRuta, totalRutas }
 */
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { construirGrafoRutas } from './lib/route-graph'

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
  const rutas = new Set<string>()
  const sinRuta: string[] = []
  for (const e of entradas) {
    const r = rutasDeFichero(e, grafo)
    if (r.length === 0) sinRuta.push(e)
    for (const x of r) rutas.add(x)
  }

  const ordenadas = [...rutas].sort()
  if (json) {
    console.log(
      JSON.stringify(
        { rutas: ordenadas, sinRuta, totalRutas: grafo.rutas.length, entradas: entradas.length },
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
