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
 * El recorrido del grafo vive en `lib/route-graph.ts`, compartido con
 * `routes-for-changes.ts`: las dos preguntas —qué rutas DESCRIBEN un snapshot y
 * qué rutas TOCA un push— son el mismo grafo, y dos copias del mismo recorrido
 * es el duplicado que aquí se arregla en una y sigue mintiendo en la otra.
 *
 * El resultado se escribe en .claude/hooks/prosa-map.json y lo lee el hook, que
 * así no tiene que analizar nada en cada edición. Una prueba regenera el mapa y
 * lo compara con el committeado: si el código cambia y el mapa no, la suite se
 * pone roja en vez de que el recordatorio empiece a mentir en silencio.
 *
 * Usage: npm run build:prose-map [-- --check]
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { construirGrafoRutas } from './lib/route-graph'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const SRC = join(ROOT, 'src')
const OUT = join(ROOT, '.claude/hooks/prosa-map.json')

function main() {
  const { rutasPorSnapshot } = construirGrafoRutas(SRC)

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
