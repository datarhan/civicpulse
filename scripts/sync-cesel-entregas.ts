#!/usr/bin/env tsx
/**
 * sync:cesel-entregas — enseña a la lista de entregas lo que el ministerio ya
 * publica.
 *
 * `check:cesel-entregas` detecta que hay una entrega nueva; esto la incorpora.
 * Son dos comandos y no uno a propósito: la guarda tiene que poder correr todas
 * las noches sin escribir nada, y la escritura sólo pasa dentro de la ventana de
 * noviembre, con una PR delante.
 *
 * Sin este paso la automatización no sirve de nada: `fetch:cesel-ccaa` recorre
 * `ENTREGAS`, así que una entrega que no esté en la lista no se descarga por
 * mucho que el desplegable la ofrezca.
 *
 * NO baja datos ni toca `public/`. Sólo reescribe el mapa id→ejercicio de
 * `src/scraper/cesel-entregas.ts`, y sale 0 sin escribir si no hay nada nuevo.
 *
 * Usage: npm run sync:cesel-entregas [-- --dry-run]
 */
import { readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  ENTREGAS,
  CONSULTA_URL,
  parseEntregasDisponibles,
  reescribirEntregas,
} from '../src/scraper/cesel-entregas'

const __dirname = dirname(fileURLToPath(import.meta.url))
const MODULO = join(__dirname, '../src/scraper/cesel-entregas.ts')

const UA = 'CivicPulse/1.0 (monitor cívico Riba-roja; +https://github.com/datarhan/civicpulse)'
const DRY = process.argv.includes('--dry-run')

async function main() {
  const res = await fetch(CONSULTA_URL, {
    headers: { 'User-Agent': UA, Accept: 'text/html,*/*' },
    signal: AbortSignal.timeout(60_000),
  })
  if (!res.ok) throw new Error(`[sync-cesel] HTTP ${res.status} en la consulta`)

  const vivas = parseEntregasDisponibles(await res.text())
  // Un desplegable vacío es «no pude leer», nunca «el ministerio retiró todo».
  // Sin esta puerta, un rediseño de la página vaciaría la lista de entregas de
  // un plumazo y el commit parecería legítimo.
  if (!Object.keys(vivas).length) {
    throw new Error('[sync-cesel] la consulta respondió sin desplegable ddlEntrega — no se escribe')
  }

  const antes = Object.values(ENTREGAS).sort((a, b) => a - b)
  const ahora = Object.values(vivas).sort((a, b) => a - b)
  const nuevas = ahora.filter((a) => !antes.includes(a))
  const idas = antes.filter((a) => !ahora.includes(a))

  console.log(
    `[sync-cesel] desplegable: ${ahora.length} entregas (${ahora[0]}–${ahora[ahora.length - 1]}) · ` +
      `repositorio: ${antes.length}`,
  )

  if (!nuevas.length && !idas.length) {
    console.log('[sync-cesel] nada que añadir — la lista ya coincide')
    return
  }
  if (nuevas.length) console.log(`[sync-cesel] entregas nuevas: ${nuevas.join(', ')}`)
  if (idas.length) {
    // Que el ministerio retire una entrega es raro y grave: cambia lo que el
    // sitio puede seguir citando. Se dice, no se aplica en silencio.
    console.warn(`[sync-cesel] AVISO: el desplegable ya no ofrece ${idas.join(', ')}`)
  }

  const fuente = await readFile(MODULO, 'utf8')
  const nuevo = reescribirEntregas(fuente, vivas)
  if (nuevo === fuente) {
    console.log('[sync-cesel] el literal ya estaba al día')
    return
  }
  if (DRY) {
    console.log('[sync-cesel] --dry-run: no se escribe')
    return
  }
  await writeFile(MODULO, nuevo)
  console.log(`[sync-cesel] ✓ ENTREGAS actualizado en ${MODULO}`)
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
