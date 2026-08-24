#!/usr/bin/env tsx
/**
 * check:derivados — lo que está COMMITEADO, ¿sigue siendo lo que sus entradas
 * producen?
 *
 *   npm run check:derivados
 *   npm run check:derivados -- --json
 *
 * Entra en el digest de `monitor:health` por un motivo de sincronía, y es el
 * único sitio donde esta pregunta se puede contestar de verdad. `npm test`
 * también la hace (`tests/data-graph-frescura.test.ts`), pero en la nocturna
 * corre DESPUÉS de `scrape-all.sh`, que ya ha ejecutado `refresh` y ha curado el
 * destrozo antes de que nadie mire. El digest, en cambio, lee el árbol tal y
 * como lo dejaron los cron.
 *
 * Lo que se coló por ese hueco, a diario y durante al menos cinco días:
 * `plenos-agendas.json` lo escriben tres pasos —raspado, `compute:dept-stats`
 * (`plazosVencidosCount`, `deptCoverage`) y `refresh` (`builtFrom`)— y el
 * raspado reescribe el fichero entero. Dos cron locales raspaban y comiteaban
 * sin rederivar: la nocturna publicaba el fichero completo hacia las 05:20 y
 * los cron lo dejaban pelado a las 06:5x y a las 11:1x. Como los dos
 * consumidores hacen `?? 0` y luego `> 0`, el aviso de compromisos vencidos
 * desaparecía de la portada y del tícker sin que nada se pusiera rojo.
 *
 * Se mide FRESCURA, no la mera presencia de `builtFrom`: sin `builtFrom` es
 * «lo reescribió alguien que no deriva», con uno viejo es «una entrada se movió
 * y nadie reconstruyó», y las dos publican una cifra que ya no se deduce de lo
 * que tiene al lado. Se arreglan igual, y el mensaje lo dice.
 *
 * Anti-hueco: si recorre cero nodos sale 1. Un «todo al día» sobre un grafo
 * vacío es el gate que no mide nada.
 */
import { DATA_GRAPH, stalenessInputs } from '../src/scraper/data-graph'
import { stalenessOf, describeStaleness } from '../src/scraper/built-from'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

function main(): void {
  const asJson = process.argv.includes('--json')
  const derivados = DATA_GRAPH.filter((n) => n.tier === 'derived')

  const filas = derivados.map((n) => {
    const s = stalenessOf(n)
    return {
      id: n.id,
      command: n.command,
      entradas: stalenessInputs(n).length,
      rancio: s.stale,
      motivo: s.stale ? describeStaleness(n, s) : null,
    }
  })

  const rancios = filas.filter((f) => f.rancio)

  // Y las salidas HERMANAS. `stalenessOf` juzga por `node.id`, que es lo
  // correcto —es quien decide si hay que reconstruir—, pero un nodo con varias
  // salidas publicaba las demás sin `builtFrom` y esta guarda no las miraba:
  // medía lo que `refresh` prometía en vez de lo que debe prometer. Eran
  // press-coverage-gaps.json y press-triangulation.json, publicados sin decir
  // de qué salieron.
  const sinSello: Array<{ fichero: string; nodo: string }> = []
  for (const n of derivados) {
    for (const salida of n.writes) {
      if (salida === n.id) continue
      const path = resolve('public/data', salida)
      if (!existsSync(path)) continue
      let doc: { builtFrom?: unknown } | null = null
      try {
        doc = JSON.parse(readFileSync(path, 'utf8'))
      } catch {
        sinSello.push({ fichero: salida, nodo: n.id })
        continue
      }
      if (!doc?.builtFrom) sinSello.push({ fichero: salida, nodo: n.id })
    }
  }

  if (asJson) {
    process.stdout.write(
      JSON.stringify(
        { recorridos: filas.length, rancios: rancios.length, sinSello, filas },
        null,
        2,
      ) + '\n',
    )
  } else {
    process.stdout.write(
      `[check-derivados] ${filas.length} nodo(s) derivado(s) · ${rancios.length} rancio(s) · ` +
        `${sinSello.length} salida(s) hermana(s) sin sellar\n`,
    )
    // `✗` y un código CON GUION, los dos a propósito: `pickCheckDiagnosis` sólo
    // considera «renglón que explica qué falló» los que llevan ✗/ERROR/FATAL, y
    // sólo cuenta por tipo los códigos `[a-z]+-[a-z]+`. Sin las dos cosas el
    // digest se quedaba con las dos últimas líneas —el consejo— y mandaba al
    // móvil «ejecuta npm run refresh» sin decir QUÉ nodo. Es la avería del
    // 19-ago otra vez, y el picker existe justo para no repetirla.
    for (const f of rancios) {
      process.stdout.write(`  ✗ [derivado-rancio] ${f.motivo}\n`)
    }
    for (const x of sinSello) {
      process.stdout.write(
        `  ✗ [salida-sin-sellar] ${x.fichero} — la escribe ${x.nodo} y no lleva builtFrom\n`,
      )
    }
    if (rancios.length > 0 || sinSello.length > 0) {
      process.stdout.write(
        `  Lo publicado ya no es lo que sus entradas producen. Arréglalo con: npm run refresh\n` +
          `  Si esto sale tras un raspado, el raspador reescribió el fichero y se llevó por\n` +
          `  delante lo que derivó otro paso: la tubería que lo llamó debe ejecutar\n` +
          `  «npm run refresh» antes de comitear.\n`,
      )
    } else {
      process.stdout.write('[check-derivados] ✓ cada derivado publicado sale de sus entradas\n')
    }
  }

  if (filas.length === 0) {
    process.stderr.write('[check-derivados] cero nodos recorridos: no ha comprobado nada\n')
    process.exit(1)
  }
  process.exit(rancios.length + sinSello.length > 0 ? 1 : 0)
}

main()
