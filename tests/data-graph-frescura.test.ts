import { describe, it, expect } from 'vitest'
import { DATA_GRAPH, stalenessInputs, type DataNode } from '../src/scraper/data-graph'
import { stalenessOf, describeStaleness } from '../src/scraper/built-from'

/**
 * Lo que está COMMITEADO, ¿sigue siendo lo que sus entradas producen?
 *
 * `built-from.ts` y `data-graph.ts` tenían pruebas de sobra —hashes, staleness,
 * orden topológico— y todas sobre fixtures sintéticos. Ninguna miraba
 * `public/data`. O sea que el mecanismo estaba impecable y nadie comprobaba que
 * se estuviera USANDO sobre los ficheros que se publican.
 *
 * Lo que se coló por ahí, durante al menos cinco días seguidos y a diario:
 * `plenos-agendas.json` lo escriben TRES pasos —el raspado, `compute:dept-stats`
 * (que le mete `plazosVencidosCount` y `deptCoverage`) y `refresh` (que le pone
 * el `builtFrom`)—, y el raspado reescribe el fichero entero. Dos cron locales
 * ejecutaban sólo el raspado y comiteaban: cada mañana la nocturna de CI
 * publicaba el fichero completo a las 05:20 y los cron lo dejaban pelado a las
 * 06:5x y a las 11:1x. Unas dieciocho horas de cada día, el sitio servía un
 * snapshot sin `plazosVencidosCount`, y como los dos consumidores hacen
 * `?? 0` y luego `> 0`, el aviso de compromisos vencidos DESAPARECÍA de la
 * portada y del tícker sin que nada se pusiera rojo.
 *
 * Esta guarda es la que faltaba, y es de grafo, no de fichero: recorre los
 * nodos derivados que el propio `DATA_GRAPH` declara, así que un nodo nuevo
 * queda vigilado el día que se añade, sin tocar este fichero.
 *
 * Se comprueba FRESCURA, no la mera presencia de `builtFrom`. Las dos cosas
 * fallan distinto: sin `builtFrom` es «lo reescribió alguien que no deriva», y
 * con un `builtFrom` viejo es «una entrada se movió y nadie reconstruyó». Las
 * dos publican una cifra que ya no se deduce de lo que hay al lado, y las dos
 * se arreglan igual — `npm run refresh` —, que es lo que dice el mensaje.
 */

import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

const derivados: DataNode[] = DATA_GRAPH.filter((n) => n.tier === 'derived')

describe('los nodos derivados que se publican están al día', () => {
  it('mide algo: el grafo declara nodos derivados con entradas', () => {
    expect(derivados.length).toBeGreaterThan(0)
    // Un nodo sin entradas de staleness no se puede juzgar: si TODOS fueran
    // así, el bucle de abajo pasaría sin comprobar nada.
    expect(derivados.some((n) => stalenessInputs(n).length > 0)).toBe(true)
  })

  for (const nodo of derivados) {
    it(`${nodo.id} está fresco`, () => {
      const s = stalenessOf(nodo)
      expect(
        s.stale,
        `${describeStaleness(nodo, s)}\n` +
          `  Lo publicado ya no es lo que sus entradas producen.\n` +
          `  Arréglalo con: npm run refresh   (reconstruye ${nodo.command})\n` +
          `  Si esto salta tras un raspado, el raspador reescribió el fichero y\n` +
          `  se llevó por delante lo que derivó otro paso: la tubería que lo\n` +
          `  llamó tiene que ejecutar «npm run refresh» antes de comitear.`,
      ).toBe(false)
    })
  }
})

// ─── Y las salidas hermanas ─────────────────────────────────────────────────
//
// `stalenessOf` juzga por `node.id`, que es lo correcto: es quien decide si hay
// que reconstruir. Pero `refresh` sellaba SÓLO ese fichero, así que un nodo con
// varias salidas publicaba las demás sin `builtFrom` — press-coverage-gaps.json
// y press-triangulation.json llevaban así desde que existen. La guarda medía lo
// que refresh prometía en vez de lo que debe prometer.

describe('cada salida de un nodo derivado lleva su procedencia', () => {
  const salidas = derivados.flatMap((n) => n.writes.map((w) => ({ nodo: n.id, fichero: w })))

  it('mide algo: hay nodos con más de una salida', () => {
    expect(salidas.length).toBeGreaterThan(derivados.length)
  })

  for (const { nodo, fichero } of salidas) {
    it(`${fichero} lleva builtFrom`, () => {
      const path = resolve('public/data', fichero)
      if (!existsSync(path)) return // una salida secundaria puede no producirse
      const doc = JSON.parse(readFileSync(path, 'utf8'))
      expect(
        doc?.builtFrom,
        `${fichero} lo escribe ${nodo} y se publica sin decir de qué salió — npm run refresh`,
      ).toBeTruthy()
    })
  }
})
