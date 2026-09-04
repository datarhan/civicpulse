#!/usr/bin/env tsx
/**
 * check:despiece — ¿sigue el mapa describiendo esta aplicación?
 *
 * Dos cosas, y las dos con su suelo:
 *
 *   1. QUE EL GRAFO MIDIÓ ALGO. Un extractor que dejara de reconocer el
 *      repositorio devolvería listas vacías y un dibujo en blanco, y sin un
 *      suelo eso pasa por «no hay problemas». Se exige un mínimo por carril.
 *   2. QUE LAS NOTAS SIGUEN DESCRIBIENDO LO QUE DICEN. Cuatro desenlaces, no
 *      dos: `coincide`, `movido` (avisa), `huerfana` (rompe) y `sin-nota` (se
 *      cuenta). Doblar «no lo encontré» dentro de «coincide» sería que la
 *      guarda imprimiera su propio visto bueno.
 *
 * Sale 1 sólo con una nota huérfana o con un suelo roto. Un aviso que puede
 * tumbar un build es un aviso que alguien acaba apagando.
 */
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { construirGrafoApp } from '../src/scraper/app-graph'
import { NOTAS, verificarNotas } from '../src/scraper/app-graph-notas'
import { sha256Short } from '../src/scraper/hash'
import { leerEntradas } from './lib/app-graph-io'

const ROOT = resolve(fileURLToPath(import.meta.url), '../..')

/** Suelos por carril. Deliberadamente holgados: fijan que HAY, no cuánto. */
const SUELOS: Record<string, number> = {
  script: 80,
  parser: 100,
  snapshot: 60,
  hook: 40,
  ruta: 20,
  proceso: 40,
}

function main(): void {
  const comoJson = process.argv.includes('--json')
  const grafo = construirGrafoApp(leerEntradas(ROOT))
  const problemas: string[] = []

  for (const [carril, suelo] of Object.entries(SUELOS)) {
    const n = grafo.stats.porCarril[carril as keyof typeof grafo.stats.porCarril] ?? 0
    if (n < suelo) problemas.push(`carril ${carril}: ${n} nodos, por debajo del suelo ${suelo}`)
  }
  if (grafo.stats.aristas < 600) {
    problemas.push(`sólo ${grafo.stats.aristas} relaciones: el extractor ha dejado de ver algo`)
  }

  const hashDe = (ruta: string): string | null => {
    const p = resolve(ROOT, ruta)
    return existsSync(p) ? sha256Short(readFileSync(p, 'utf8')) : null
  }
  const resultados = verificarNotas(NOTAS, grafo, hashDe)
  const huerfanas = resultados.filter((r) => r.desenlace === 'huerfana')
  const movidas = resultados.filter((r) => r.desenlace === 'movido')
  const sinNota = grafo.nodos.length - NOTAS.length

  if (comoJson) {
    process.stdout.write(
      `${JSON.stringify({ problemas, resultados, sinNota, stats: grafo.stats }, null, 2)}\n`,
    )
  } else {
    process.stdout.write(
      `[despiece] ${grafo.nodos.length} piezas · ${grafo.stats.aristas} relaciones\n`,
    )
    process.stdout.write(
      `[despiece] notas: ${resultados.length - huerfanas.length - movidas.length} coinciden · ` +
        `${movidas.length} movidas · ${huerfanas.length} huérfanas · ${sinNota} sin nota\n`,
    )
    for (const m of movidas) process.stdout.write(`  MOVIDA   ${m.nodo} — ${m.detalle}\n`)
    for (const h of huerfanas) process.stdout.write(`  HUÉRFANA ${h.nodo} — ${h.detalle}\n`)
    for (const p of problemas) process.stdout.write(`  SUELO    ${p}\n`)
  }

  if (huerfanas.length > 0 || problemas.length > 0) process.exit(1)
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  main()
}
