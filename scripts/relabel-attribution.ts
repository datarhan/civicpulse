#!/usr/bin/env tsx
/**
 * relabel-attribution — firmar el grupo de quien habla en una declaración, o
 * retirar esa firma.
 *
 *   npm run relabel-attribution -- <claimId> --grupo PSOE --segundos 4016-4095 \
 *       --motivo "<cómo se sabe quién habla>" --editor "<Nombre Apellido>" [--dry-run]
 *   npm run relabel-attribution -- --retirar <claimId> \
 *       --motivo "<por qué se retira>" --editor "<Nombre Apellido>" [--dry-run]
 *
 * Escribe `pleno-claim-relabels.json` y recompone, como `reclassify-claim` y
 * `reanchor-claim` con sus estratos. Las reglas y su porqué están en
 * src/scraper/atribucion-firmada.ts; el diseño y las decisiones del operador, en
 * docs/superpowers/specs/2026-10-04-atribucion-firmada-design.md.
 *
 * Antes de leer nada, la firma: una persona, con su nombre. Ni la cuenta de rol
 * ni el hueco de una orden preparada (`rechazoDeFirma`).
 *
 * Antes de escribir:
 *  · con la suspensión electoral activa (`frozenUntil`) no se firma nada nuevo;
 *    retirar una firma, sí;
 *  · sin la composición de officials.json no se firma ni se retira nada;
 *  · lo publicado tiene que ser la composición de la base en disco
 *    (`cotejarCompose` = `coincide`), y recomponer sólo puede cambiar esta
 *    declaración: si moviera otra, firmar republicaría también lo que nadie ha
 *    mirado, que es lo que le pasó a una recomposición de #218;
 *  · el tramo tiene que contener las palabras de la declaración en alguna
 *    transcripción de la sesión.
 *
 * El motivo de una retirada no se guarda en ningún dato: el registro es el
 * commit, como en `retract-attribution`.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

import {
  firmarAtribucion,
  fuenteDelTramo,
  retirarAtribucionFirmada,
  type AtribucionesFirmadas,
} from '../src/scraper/atribucion-firmada'
import { rechazoDeFirma } from '../src/scraper/firma-de-persona'
import { isFrozen } from '../src/scraper/promises'
import { formatTimecode } from '../src/scraper/quote-reanchor'
import { cotejarCompose, type VerifiedItem } from '../src/scraper/verified-merge'
import {
  BASE,
  RELABELS,
  VERIFIED,
  cargarCapas,
  componer,
  escanosEnDisco,
  rebuildVerified,
  textosDeLaSesion,
  type Capas,
} from './verified-rebuild'

const PROMISES = resolve('public/data/promises.json')

const USO =
  'uso: npm run relabel-attribution -- <claimId> --grupo <grupo> --segundos <desde>-<hasta> \\\n' +
  '         --motivo "<cómo se sabe quién habla>" --editor "<Nombre Apellido>" [--dry-run]\n' +
  '     npm run relabel-attribution -- --retirar <claimId> --motivo "<…>" --editor "<…>" [--dry-run]\n'

interface Orden {
  claimId?: string
  retirar: boolean
  grupo?: string
  segundos?: string
  motivo?: string
  editor?: string
  dryRun: boolean
}

function parse(argv: string[]): Orden {
  const o: Orden = { retirar: false, dryRun: false }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--retirar') {
      o.retirar = true
      o.claimId = argv[++i]
    } else if (a === '--grupo') o.grupo = argv[++i]
    else if (a === '--segundos') o.segundos = argv[++i]
    else if (a === '--motivo') o.motivo = argv[++i]
    else if (a === '--editor') o.editor = argv[++i]
    else if (a === '--dry-run') o.dryRun = true
    else if (!a.startsWith('--') && o.claimId === undefined) o.claimId = a
  }
  return o
}

function salir(codigo: number, mensaje: string): never {
  process.stderr.write(`[relabel] ${mensaje}\n`)
  process.exit(codigo)
}

/**
 * Hasta cuándo dura la suspensión electoral, o `null` si no la hay. Como en
 * `promote-report`: un promises.json que falta o no se deja leer es «no
 * congelado», nunca un fallo.
 */
function congeladoHasta(): string | null {
  if (!existsSync(PROMISES)) return null
  try {
    const raw = JSON.parse(readFileSync(PROMISES, 'utf8')) as { frozenUntil?: string | null }
    const frozenUntil = raw.frozenUntil ?? null
    return isFrozen({ frozenUntil }) ? frozenUntil : null
  } catch {
    return null
  }
}

/** Los ids cuya fila compuesta difiere de la publicada, en cualquier byte. */
function cambiadas(publicadas: VerifiedItem[], compuestas: VerifiedItem[]): string[] {
  const antes = new Map(publicadas.map((it) => [it.claim.id, JSON.stringify(it)]))
  const out: string[] = []
  for (const it of compuestas)
    if (antes.get(it.claim.id) !== JSON.stringify(it)) out.push(it.claim.id)
  const ahora = new Set(compuestas.map((it) => it.claim.id))
  for (const id of antes.keys()) if (!ahora.has(id)) out.push(id)
  return out
}

const grupoDe = (it: VerifiedItem | undefined) => it?.claim.speakerGroup ?? 'sin grupo'

async function main() {
  const o = parse(process.argv.slice(2))

  // Antes de leer nada: quién firma.
  if (!o.editor) salir(2, '--editor es obligatorio: lo firma una persona, con su nombre')
  const firma = rechazoDeFirma(o.editor)
  if (firma) salir(2, `--editor: ${firma}`)

  const claimId = o.claimId
  if (!claimId) {
    process.stderr.write(USO)
    process.exit(2)
  }
  if (!o.motivo) salir(2, '--motivo es obligatorio')
  let desde = 0
  let hasta = 0
  if (!o.retirar) {
    if (!o.grupo || !o.segundos) {
      process.stderr.write(USO)
      process.exit(2)
    }
    const m = /^(\d+(?:\.\d+)?)-(\d+(?:\.\d+)?)$/.exec(o.segundos)
    if (!m)
      salir(2, `--segundos «${o.segundos}»: se escribe <desde>-<hasta>, en segundos (4016-4095)`)
    desde = Number(m[1])
    hasta = Number(m[2])

    const congelado = congeladoHasta()
    if (congelado) {
      salir(
        1,
        `LOREG: la suspensión electoral está activa hasta ${congelado}; no se firma ninguna ` +
          'atribución nueva (retirar una sí: --retirar). `npm run freeze:status`',
      )
    }
  }

  const escanos = escanosEnDisco()
  if (escanos === null) {
    salir(
      1,
      'officials.json no dice cuántos escaños tiene cada grupo: sin eso no se sabe qué grupo ' +
        'nombra a su concejal por eliminación, y no se firma ni se retira nada',
    )
  }
  if (!existsSync(BASE)) {
    salir(
      1,
      `falta la base (${BASE}), que está gitignorada: cópiala del checkout principal o ` +
        'regénerala con `npm run verify:pleno-claims -- --base-only`',
    )
  }
  if (!existsSync(VERIFIED)) salir(1, `falta ${VERIFIED}, que va comiteado`)

  const base = JSON.parse(readFileSync(BASE, 'utf8')) as {
    generatedAt?: string
    items: VerifiedItem[]
  }
  const publicado = JSON.parse(readFileSync(VERIFIED, 'utf8')) as {
    generatedAt?: string
    items: VerifiedItem[]
  }
  const cotejo = cotejarCompose({
    baseGeneratedAt: base.generatedAt ?? null,
    publicadoGeneratedAt: publicado.generatedAt ?? null,
  })
  if (cotejo.estado !== 'coincide') {
    salir(
      1,
      `lo publicado no es la composición de la base en disco (${cotejo.estado}): ${cotejo.motivo} ` +
        'Firmar ahora recompondría también eso, sin que nadie lo mirara.',
    )
  }

  let capas: Capas
  try {
    capas = cargarCapas()
  } catch (err) {
    salir(1, `los ficheros que se componen no validan: ${(err as Error).message}`)
  }

  const enBase = base.items.find((it) => it.claim.id === claimId)
  const enPublicado = publicado.items.find((it) => it.claim.id === claimId)
  if (!enBase) salir(1, `${claimId} no está en la base`)
  if (!enPublicado) salir(1, `${claimId} no está en lo publicado`)

  const stamp = new Date().toISOString()
  let firmadas: AtribucionesFirmadas
  try {
    if (o.retirar) {
      firmadas = retirarAtribucionFirmada(
        capas.firmadas,
        { claimId, motivo: o.motivo, editor: o.editor },
        stamp,
      )
    } else {
      const textos = textosDeLaSesion(enBase.claim.plenoId)
      const fuente = fuenteDelTramo(enPublicado.claim.verbatim, textos, { desde, hasta })
      if (fuente === null) {
        process.stderr.write(
          `[relabel] ${claimId}: transcripciones de ${enBase.claim.plenoId} leídas: ` +
            `${textos.map((t) => t.fuente).join(', ') || 'ninguna'}\n`,
        )
      }
      firmadas = firmarAtribucion(
        capas.firmadas,
        { claimId, grupo: o.grupo!, desde, hasta, motivo: o.motivo, editor: o.editor },
        {
          base: {
            speakerGroup: enBase.claim.speakerGroup ?? null,
            verbatim: enBase.claim.verbatim,
            speakerSlug: enBase.claim.speakerSlug ?? null,
          },
          publicada: { verbatim: enPublicado.claim.verbatim },
          fuente,
        },
        escanos,
        stamp,
      )
    }
  } catch (err) {
    salir(1, `rechazado: ${(err as Error).message}`)
  }

  // El alcance: recomponer con el fichero nuevo sólo puede cambiar esta
  // declaración. Cualquier otra fila que se moviera la republicaría esta firma.
  const { items: compuestas } = componer(base.items, { ...capas, firmadas })
  const ajenas = cambiadas(publicado.items, compuestas).filter((id) => id !== claimId)
  if (ajenas.length > 0) {
    salir(
      1,
      `recomponer movería ${ajenas.length} declaración(es) además de ${claimId} ` +
        `(${ajenas.slice(0, 5).join(', ')}${ajenas.length > 5 ? '…' : ''}): lo publicado no es ` +
        'sólo la composición de lo que hay en disco. Arréglalo antes, por su vía.',
    )
  }
  const despues = compuestas.find((it) => it.claim.id === claimId)
  process.stdout.write(
    `[relabel] ${claimId}: ${grupoDe(enPublicado)} → ${grupoDe(despues)}` +
      (o.retirar
        ? ' (se retira la firma)'
        : ` (firmado; ${desde}–${hasta} s, ${formatTimecode(desde)}–${formatTimecode(hasta)})`) +
      ' · ninguna otra declaración cambia\n',
  )
  if (!o.retirar) {
    process.stdout.write(JSON.stringify({ [claimId]: firmadas.entries[claimId] }, null, 2) + '\n')
  }
  if (o.dryRun) {
    process.stdout.write('[relabel] --dry-run: no se ha escrito nada\n')
    return
  }

  writeFileSync(RELABELS, JSON.stringify(firmadas, null, 2) + '\n')
  try {
    const r = await rebuildVerified({
      firmasRetiradas: o.retirar ? new Set([claimId]) : undefined,
    })
    process.stdout.write(
      `[relabel] escrito (${o.editor}) · ${r.firmadasApplied} atribución(es) firmada(s) ` +
        'aplicada(s) · sidecar + verified.json + trozos al día\n' +
        '  Queda `npm run refresh` (los nodos que leen verified.json) y\n' +
        '  `npm run check:claim-provenance`.' +
        (o.retirar
          ? '\n  El registro de la retirada es el commit: pon el motivo en su cuerpo.'
          : '') +
        '\n',
    )
  } catch (err) {
    salir(1, `fichero escrito pero la recomposición FALLÓ: ${(err as Error).message}`)
  }
}

main()
