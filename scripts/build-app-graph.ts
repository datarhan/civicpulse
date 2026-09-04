#!/usr/bin/env tsx
/**
 * despiece — el mapa de esta aplicación, sacado del código.
 *
 *   npm run despiece              resumen por pantalla + .despiece/despiece.json
 *   npm run despiece -- --json    el grafo por la salida estándar
 *   npm run despiece -- --md      el manual en texto → .despiece/despiece.md
 *
 * Escribe en `.despiece/`, que está en .gitignore, y NUNCA bajo `public/`:
 * Vite copia `public/` entero dentro de `dist/` y lo que se despliega es
 * `dist/`, así que un fichero ahí es fetchable por URL lo enlace una página o
 * no. «No renderizado» no es «no publicado» — eso ya costó 24 borradores sin
 * revisar accesibles durante semanas.
 *
 * El parte de pantalla cuenta APARTE los guiones que no se pudieron leer. Un
 * mapa que presenta un escaneo fallido como un nodo sin dependencias se lee
 * como un todo-correcto, que es la clase de defecto más cara de este
 * repositorio.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { construirGrafoApp } from '../src/scraper/app-graph'
import { renderManual } from '../src/scraper/app-graph-md'
import { leerEntradas } from './lib/app-graph-io'

const ROOT = resolve(fileURLToPath(import.meta.url), '../..')
const SALIDA = resolve(ROOT, '.despiece')

function main(): void {
  const argv = process.argv.slice(2)
  const grafo = construirGrafoApp(leerEntradas(ROOT))

  if (argv.includes('--json')) {
    process.stdout.write(`${JSON.stringify(grafo, null, 2)}\n`)
    return
  }

  mkdirSync(SALIDA, { recursive: true })

  if (argv.includes('--md')) {
    const destino = resolve(SALIDA, 'despiece.md')
    writeFileSync(destino, renderManual(grafo))
    process.stdout.write(`[despiece] manual → ${destino}\n`)
    return
  }

  const destino = resolve(SALIDA, 'despiece.json')
  writeFileSync(destino, `${JSON.stringify(grafo, null, 2)}\n`)

  const { stats } = grafo
  const dominios = new Set(grafo.nodos.map((n) => n.dominio).filter(Boolean)).size

  process.stdout.write(`[despiece] ${grafo.nodos.length} piezas · ${stats.aristas} relaciones\n`)
  for (const [carril, n] of Object.entries(stats.porCarril)) {
    if (n > 0) process.stdout.write(`  ${carril.padEnd(9)} ${String(n).padStart(4)}\n`)
  }
  process.stdout.write(`  ${'dominios'.padEnd(9)} ${String(dominios).padStart(4)}\n`)
  process.stdout.write(
    `[despiece] guiones leídos ${stats.scriptsAnalizados} · ` +
      `NO leídos ${stats.scriptsSinAnalizar} (sus relaciones faltan, no son cero)\n`,
  )
  const porCodigo = new Map<string, number>()
  for (const a of grafo.averias.averias) porCodigo.set(a.codigo, (porCodigo.get(a.codigo) ?? 0) + 1)
  if (porCodigo.size > 0) {
    process.stdout.write(
      `[despiece] averías: ${[...porCodigo].map(([c, n]) => `${c} ${n}`).join(' · ')}\n`,
    )
  }
  // Aparte de las averías y siempre, aunque sea cero: es la línea que impide
  // leer «no encontré nada» como «está limpio».
  process.stdout.write(
    `[despiece] no medido: ${grafo.averias.noMedido.length} comprobación(es) que no se pudieron hacer\n`,
  )
  process.stdout.write(`[despiece] grafo → ${destino}\n`)
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  main()
}
