#!/usr/bin/env tsx
/**
 * Cambia el aviso editorial de /promesas (`legalNotice` en promises.json).
 *
 *   npm run aviso-promesas -- status            imprime el aviso vigente
 *   npm run aviso-promesas -- set "<texto>"     lo sustituye
 *
 * El aviso no tenía dueño. promises.json es un fichero curado —el guard de
 * escrituras niega editarlo a mano— y ninguno de sus CLIs (`reply`,
 * `freeze:set`, `freeze:clear`) tocaba este campo, así que corregirlo sólo se
 * podía hacer saltándose el validador. Hizo falta el 28-09-2026: la revisión
 * lectora señaló que el aviso decía «mediante fuentes primarias enlazadas»
 * encima de fichas que citaban prensa.
 *
 * Toca sólo `legalNotice` y el sello (`generatedAt`), y valida el fichero
 * entero antes de escribir (`withLegalNotice`), incluida la regla que impide
 * llamar «primarias» a unas fuentes que pueden ser noticias (`FUENTE_PRIMARIA`).
 * Un aviso idéntico al vigente no se escribe: mover el sello sin cambiar nada
 * haría que la página dijera «datos a hoy» de un fichero que no ha cambiado.
 *
 * El aviso forma parte del contrato editorial publicado: si cambia lo que
 * promete, /metodologia y /aviso-legal cambian en el mismo PR (CLAUDE.md).
 */
import { readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DATA_GRAPH } from '../src/scraper/data-graph'
import { withLegalNotice } from '../src/scraper/promises'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PROMISES = join(__dirname, '..', 'public/data/promises.json')

function uso(): never {
  console.error(`Uso:
  npm run aviso-promesas -- status            imprime el aviso vigente
  npm run aviso-promesas -- set "<texto>"     lo sustituye (valida el fichero entero)`)
  process.exit(2)
}

async function main() {
  const [accion, texto] = process.argv.slice(2)
  const raw = await readFile(PROMISES, 'utf8')
  // Sin validar: `status` tiene que poder enseñar también un aviso que el
  // validador ya no acepta, que es justo cuando alguien lo pregunta.
  const vigente = (JSON.parse(raw) as { legalNotice?: unknown }).legalNotice

  if (accion === 'status') {
    console.log(typeof vigente === 'string' ? vigente : '(sin aviso)')
    return
  }
  if (accion !== 'set' || !texto?.trim()) uso()

  if (vigente === texto.trim()) {
    console.log('[aviso] sin cambios: el aviso ya dice eso. No se escribe ni se mueve el sello.')
    return
  }

  // Lanza con el mensaje del validador si el aviso —o el fichero— no pasa.
  const json = withLegalNotice(raw, texto)
  await writeFile(PROMISES, json)
  console.log(`[aviso] antes:\n  ${String(vigente)}\n[aviso] ahora:\n  ${texto.trim()}`)
  console.log(
    '[aviso] Es parte del contrato editorial: si cambia lo que promete, /metodologia y ' +
      '/aviso-legal cambian en el mismo PR.',
  )
  // Quien deriva de promises.json guarda un hash del fichero ENTERO, así que
  // hasta un aviso lo deja viejo, y `data-graph-frescura` se pone roja en la CI
  // (pasó con el primer uso de este CLI, el 28-09-2026). La lista sale del
  // grafo, no de aquí.
  const derivan = DATA_GRAPH.filter((n) => n.tier === 'derived')
    .filter((n) => n.reads.includes('promises.json'))
    .map((n) => n.id)
  if (derivan.length) {
    console.log(
      `[aviso] ${derivan.join(', ')} derivan de promises.json: ` +
        '`npm run refresh` y comitéalos junto a este cambio.',
    )
  }
}

main().catch((err) => {
  console.error('[aviso] no se escribió nada:', err instanceof Error ? err.message : err)
  process.exit(1)
})
