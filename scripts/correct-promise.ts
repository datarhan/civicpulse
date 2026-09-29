#!/usr/bin/env tsx
/**
 * Corrige la cita de una promesa publicada, o la retira, dejando constancia.
 *
 *   npm run corregir-promesa -- cita <id> "<cita>" --motivo "<…>" --editor "<…>"
 *        [--fuente <url>] [--editorial "<quien publica la fuente nueva>"]
 *   npm run corregir-promesa -- retirar <id> --motivo "<…>" --editor "<…>"
 *
 * `cita` no escribe nada hasta comprobarlo en la red: baja la fuente (la nueva,
 * si se da; si es una redirección de Google News, la del medio), y la cita
 * tiene que estar en la página LITERALMENTE —sin la tolerancia del 90 % que usa
 * la puerta automática— y ser palabras del partido: entre comillas en un medio,
 * o el texto del propio Ayuntamiento en su web (`quoteIsPartyWords`). Es la
 * misma regla que desde el 28-09-2026 exige el auto-curador, aplicada a mano.
 *
 * `retirar` saca la tarjeta del registro y deja en `retractions[]` su huella,
 * no su texto. El motivo no puede repetir la cita retirada.
 *
 * Las dos reescriben el fichero tal y como se leyó, mueven el sello y validan
 * el fichero entero antes de escribir (ver src/scraper/promise-corrections.ts).
 */
import { readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DATA_GRAPH } from '../src/scraper/data-graph'
import { withQuoteCorrection, withRetraction } from '../src/scraper/promise-corrections'
import {
  defaultGroundingFetch,
  isGoogleNewsUrl,
  normalizeForMatch,
  quoteIsPartyWords,
  resolveGoogleNewsUrl,
  stripHtml,
} from '../src/scraper/promise-grounding'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PROMISES = join(__dirname, '..', 'public/data/promises.json')

function uso(): never {
  console.error(`Uso:
  npm run corregir-promesa -- cita <id> "<cita>" --motivo "<…>" --editor "<…>" [--fuente <url>] [--editorial "<…>"]
  npm run corregir-promesa -- retirar <id> --motivo "<…>" --editor "<…>"`)
  process.exit(2)
}

function opcion(args: string[], nombre: string): string | undefined {
  const i = args.indexOf(nombre)
  return i >= 0 ? args[i + 1] : undefined
}

/** Baja la página y dice si la cita está, literal, y en boca del partido. */
async function comprobarEnLaFuente(url: string, cita: string) {
  let objetivo = url
  if (isGoogleNewsUrl(url)) objetivo = (await resolveGoogleNewsUrl(url)) ?? url
  const res = await defaultGroundingFetch(objetivo)
  if (!res.ok)
    return { final: res.url, literal: false, delPartido: false, motivo: 'la página no respondió' }
  const texto = stripHtml(await res.text())
  const literal = normalizeForMatch(texto).includes(normalizeForMatch(cita))
  const delPartido = literal && quoteIsPartyWords(cita, texto, res.url)
  return { final: res.url, literal, delPartido, motivo: '' }
}

async function main() {
  const [accion, id, ...resto] = process.argv.slice(2)
  if (!id || (accion !== 'cita' && accion !== 'retirar')) uso()
  const motivo = opcion(resto, '--motivo')
  const editor = opcion(resto, '--editor')
  if (!motivo || !editor) uso()
  const raw = await readFile(PROMISES, 'utf8')
  const ahora = new Date()

  let json: string
  if (accion === 'retirar') {
    json = withRetraction(raw, id, { reason: motivo, editor }, ahora)
    console.log(`[corregir-promesa] «${id}» retirada; queda su huella en retractions[].`)
  } else {
    const cita = resto[0]
    if (!cita || cita.startsWith('--')) uso()
    const fuente = opcion(resto, '--fuente')
    const editorial = opcion(resto, '--editorial')
    const actual = (
      JSON.parse(raw) as { items: Array<{ id: string; source: { url: string } }> }
    ).items.find((p) => p.id === id)
    if (!actual) throw new Error(`no hay ninguna promesa con id «${id}»`)
    const url = fuente ?? actual.source.url
    const c = await comprobarEnLaFuente(url, cita)
    if (!c.literal || !c.delPartido) {
      console.error(
        `[corregir-promesa] no se escribió nada: en ${c.final} ` +
          (c.motivo ||
            (!c.literal
              ? 'la cita no está literal'
              : 'la cita está, pero no entre comillas ni en una página del Ayuntamiento')),
      )
      process.exit(1)
    }
    json = withQuoteCorrection(
      raw,
      id,
      { quote: cita, sourceUrl: fuente, publisher: editorial },
      { reason: motivo, editor },
      ahora,
    )
    console.log(`[corregir-promesa] «${id}»: cita comprobada en ${c.final} y corregida.`)
  }
  await writeFile(PROMISES, json)
  const derivan = DATA_GRAPH.filter(
    (n) => n.tier === 'derived' && n.reads.includes('promises.json'),
  )
  console.log(
    `[corregir-promesa] Antes de comitear: \`npm run refresh\` (${derivan.map((n) => n.id).join(', ')}) ` +
      'y, si retiraste alguna, `npm run scrape:promise-suggestions` sin --llm y `npm run check:relations`.',
  )
}

main().catch((err) => {
  console.error('[corregir-promesa] no se escribió nada:', err instanceof Error ? err.message : err)
  process.exit(1)
})
