#!/usr/bin/env tsx
/**
 * Corrige la cita de una promesa publicada, o la retira, o fija o quita su
 * plazo, dejando constancia.
 *
 *   npm run corregir-promesa -- cita <id> "<cita>" --motivo "<…>" --editor "<…>"
 *        [--fuente <url>] [--editorial "<quien publica la fuente nueva>"] [--dry-run]
 *   npm run corregir-promesa -- retirar <id> --motivo "<…>" --editor "<…>" [--dry-run]
 *   npm run corregir-promesa -- plazo <id> <AAAA-MM-DD|AAAA-MM> --fuente "<fragmento literal de la cita>"
 *        --motivo "<…>" --editor "<nombre y apellidos>" [--dry-run]
 *   npm run corregir-promesa -- quitar-plazo <id> --motivo "<…>" --editor "<…>" [--dry-run]
 *
 * `cita` no escribe nada hasta comprobarlo en la red: baja la fuente (la nueva,
 * si se da; si es una redirección de Google News, la del medio), y la cita
 * tiene que estar en la página LITERALMENTE —sin la tolerancia del 90 % que usa
 * la puerta automática— y ser palabras del partido: entre comillas en un medio,
 * o el texto del propio Ayuntamiento en su web (`quoteIsPartyWords`), que sólo
 * es del partido de la alcaldía (`partyOwnsCouncilText`, desde el 18-10-2026).
 * Es la misma regla que exige el auto-curador, aplicada a mano.
 *
 * `retirar` saca la tarjeta del registro y deja en `retractions[]` su huella,
 * no su texto. El motivo no puede repetir la cita retirada.
 *
 * `plazo` fija el `dueBy` de una promesa —lo único que deja a /departamentos
 * llamarla «vencida»— y `quitar-plazo` lo quita. Un día se publica tal cual; un
 * mes (`2026-09`), como su último día (regla `fin-de-mes`, `resolveDueBy` en
 * promises.ts, descrita en /metodologia). Aquí `--fuente` no es una URL: son
 * las palabras de la cita publicada que sostienen el plazo, copiadas tal cual,
 * y si no están literalmente en la cita no se escribe nada. Fijar lo firma una
 * persona con nombre y apellido (`rechazoDeFirma`); quitar, también la cuenta
 * de rol. Las dos se niegan durante la veda electoral (`frozenUntil`) y dejan
 * en `dueByLog` quién, cuándo, de qué a qué, por qué y sobre qué palabras.
 * Ninguna baja nada de la red: el fragmento se coteja con la cita publicada,
 * que ya pasó la comprobación de `cita` o la del auto-curador.
 *
 * Todas reescriben el fichero tal y como se leyó, mueven el sello y validan
 * el fichero entero antes de escribir (ver src/scraper/promise-corrections.ts).
 * Con `--dry-run` hacen todo eso y no escriben: dicen lo que habrían escrito.
 *
 * `--editor` acepta la cuenta de rol (salvo en `plazo`) y rechaza, antes de leer
 * nada y de bajar ninguna fuente, el hueco de una orden copiada sin rellenar
 * —el `<…>` de arriba— (`rechazoDeMarcador`, src/scraper/firma-de-persona.ts).
 */
import { readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DATA_GRAPH } from '../src/scraper/data-graph'
import { rechazoDeFirma, rechazoDeMarcador } from '../src/scraper/firma-de-persona'
import {
  withDueBy,
  withoutDueBy,
  withQuoteCorrection,
  withRetraction,
} from '../src/scraper/promise-corrections'
import {
  defaultGroundingFetch,
  isGoogleNewsUrl,
  normalizeForMatch,
  partyOwnsCouncilText,
  quoteIsPartyWords,
  resolveGoogleNewsUrl,
  stripHtml,
} from '../src/scraper/promise-grounding'
import { isFrozen, resolveDueBy } from '../src/scraper/promises'
import type { OfficialsDoc } from '../src/scraper/corporation-seats'
import { rechazarOpcionesDesconocidas, type OpcionesAdmitidas } from '../src/scraper/opciones-cli'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PROMISES = join(__dirname, '..', 'public/data/promises.json')
const OFFICIALS = join(__dirname, '..', 'public/data/officials.json')

function uso(): never {
  console.error(`Uso:
  npm run corregir-promesa -- cita <id> "<cita>" --motivo "<…>" --editor "<…>" [--fuente <url>] [--editorial "<…>"] [--dry-run]
  npm run corregir-promesa -- retirar <id> --motivo "<…>" --editor "<…>" [--dry-run]
  npm run corregir-promesa -- plazo <id> <AAAA-MM-DD|AAAA-MM> --fuente "<fragmento literal de la cita>" --motivo "<…>" --editor "<nombre y apellidos>" [--dry-run]
  npm run corregir-promesa -- quitar-plazo <id> --motivo "<…>" --editor "<…>" [--dry-run]

  En «plazo», un mes (AAAA-MM) se publica como su último día.`)
  process.exit(2)
}

/**
 * Lo que admite cada vía. Una opción de otra vía se rechaza como desconocida:
 * `--fuente` es una URL en `cita` y un fragmento en `plazo`, y en `retirar` o
 * `quitar-plazo` no significa nada —antes se ignoraba en silencio—.
 */
const OPCIONES: Record<string, OpcionesAdmitidas> = {
  cita: { conValor: ['--motivo', '--editor', '--fuente', '--editorial'], banderas: ['--dry-run'] },
  retirar: { conValor: ['--motivo', '--editor'], banderas: ['--dry-run'] },
  plazo: { conValor: ['--motivo', '--editor', '--fuente'], banderas: ['--dry-run'] },
  'quitar-plazo': { conValor: ['--motivo', '--editor'], banderas: ['--dry-run'] },
}
/** Con una vía que no existe, lo que admite alguna; luego `uso()`. */
const TODAS: OpcionesAdmitidas = {
  conValor: [...new Set(Object.values(OPCIONES).flatMap((o) => o.conValor ?? []))],
  banderas: ['--dry-run'],
}

function opcion(args: string[], nombre: string): string | undefined {
  const i = args.indexOf(nombre)
  return i >= 0 ? args[i + 1] : undefined
}

/**
 * Baja la página y dice si la cita está, literal, y en boca del partido. En la
 * web del Ayuntamiento, además, que el partido de la ficha sea el de la
 * alcaldía; sin listado de la corporación no se puede saber, y no se escribe.
 */
async function comprobarEnLaFuente(
  url: string,
  cita: string,
  promesa: { party: string; madeAt: string },
) {
  let objetivo = url
  if (isGoogleNewsUrl(url)) objetivo = (await resolveGoogleNewsUrl(url)) ?? url
  const res = await defaultGroundingFetch(objetivo)
  if (!res.ok)
    return { final: res.url, literal: false, delPartido: false, motivo: 'la página no respondió' }
  const texto = stripHtml(await res.text())
  const literal = normalizeForMatch(texto).includes(normalizeForMatch(cita))
  const enSuBoca = literal && quoteIsPartyWords(cita, texto, res.url)
  const officials = await readFile(OFFICIALS, 'utf8')
    .then((r) => JSON.parse(r) as OfficialsDoc)
    .catch(() => null)
  if (enSuBoca && !partyOwnsCouncilText(res.url, promesa.party, promesa.madeAt, officials))
    return {
      final: res.url,
      literal,
      delPartido: false,
      motivo:
        `la cita es texto del Ayuntamiento, y «${promesa.party}» no es el partido de la ` +
        'alcaldía según public/data/officials.json (o el listado no lo dice)',
    }
  return { final: res.url, literal, delPartido: enSuBoca, motivo: '' }
}

async function main() {
  const argv = process.argv.slice(2)
  // Antes de leer nada: una opción que esta vía no conoce no se ignora
  // (src/scraper/opciones-cli.ts).
  const via = Object.hasOwn(OPCIONES, argv[0] ?? '') ? OPCIONES[argv[0]] : TODAS
  rechazarOpcionesDesconocidas('corregir-promesa', via, argv)
  const [accion, id, ...resto] = argv
  if (!id || !Object.hasOwn(OPCIONES, accion)) uso()
  const motivo = opcion(resto, '--motivo')
  const editor = opcion(resto, '--editor')
  if (!motivo || !editor) uso()
  const enSeco = resto.includes('--dry-run')
  // Antes de leer nada: el hueco no firma una corrección, una retirada ni un
  // plazo. Sólo el hueco; la cuenta de rol, sí (`rechazoDeMarcador`)… salvo al
  // fijar un plazo, que es una afirmación nueva sobre un partido con nombre y
  // la firma una persona (`rechazoDeFirma`).
  const hueco = rechazoDeMarcador(editor) ?? (accion === 'plazo' ? rechazoDeFirma(editor) : null)
  if (hueco) {
    console.error(`[corregir-promesa] --editor: ${hueco}`)
    process.exit(2)
  }
  // También antes de leer: la fecha y el fragmento de `plazo`.
  let plazo: { texto: string; fuente: string } | null = null
  if (accion === 'plazo') {
    const texto = resto[0]
    const fuente = opcion(resto, '--fuente')
    if (!texto || texto.startsWith('--') || !fuente) uso()
    try {
      resolveDueBy(texto)
    } catch (err) {
      console.error(`[corregir-promesa] ${err instanceof Error ? err.message : err}`)
      process.exit(2)
    }
    plazo = { texto, fuente }
  }

  const raw = await readFile(PROMISES, 'utf8')
  const ahora = new Date()

  let json: string
  let hecho: string
  if (accion === 'plazo' || accion === 'quitar-plazo') {
    const frozenUntil = (JSON.parse(raw) as { frozenUntil?: string | null }).frozenUntil ?? null
    if (isFrozen({ frozenUntil }, ahora)) {
      console.error(
        `[corregir-promesa] veda electoral (LOREG) hasta ${frozenUntil}: no se fija ni se quita ` +
          'ningún plazo. No se escribió nada.',
      )
      process.exit(3)
    }
  }
  if (accion === 'retirar') {
    json = withRetraction(raw, id, { reason: motivo, editor }, ahora)
    hecho = `«${id}» retirada; queda su huella en retractions[].`
  } else if (accion === 'plazo') {
    json = withDueBy(
      raw,
      id,
      { plazo: plazo!.texto, fuente: plazo!.fuente },
      { reason: motivo, editor },
      ahora,
    )
    const fila = (JSON.parse(json) as { items: Array<Record<string, unknown>> }).items.find(
      (p) => p.id === id,
    )!
    const ultimo = (
      fila.dueByLog as Array<{ from: { dueBy: string } | null; to: { rule: string } }>
    ).at(-1)!
    hecho =
      `«${id}»: plazo ${ultimo.from ? `${ultimo.from.dueBy} → ` : ''}${fila.dueBy} ` +
      `(regla ${ultimo.to.rule}), sobre «${fila.dueBySource}».`
  } else if (accion === 'quitar-plazo') {
    const antes = (JSON.parse(raw) as { items: Array<Record<string, unknown>> }).items.find(
      (p) => p.id === id,
    )
    json = withoutDueBy(raw, id, { reason: motivo, editor }, ahora)
    hecho = `«${id}»: plazo ${String(antes?.dueBy)} quitado.`
  } else {
    const cita = resto[0]
    if (!cita || cita.startsWith('--')) uso()
    const fuente = opcion(resto, '--fuente')
    const editorial = opcion(resto, '--editorial')
    const actual = (
      JSON.parse(raw) as {
        items: Array<{ id: string; party: string; madeAt: string; source: { url: string } }>
      }
    ).items.find((p) => p.id === id)
    if (!actual) throw new Error(`no hay ninguna promesa con id «${id}»`)
    const url = fuente ?? actual.source.url
    const c = await comprobarEnLaFuente(url, cita, actual)
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
    hecho = `«${id}»: cita comprobada en ${c.final} y corregida.`
  }
  if (enSeco) {
    console.log(`[corregir-promesa] --dry-run: no se escribió nada. Habría quedado así: ${hecho}`)
    return
  }
  await writeFile(PROMISES, json)
  console.log(`[corregir-promesa] ${hecho}`)
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
