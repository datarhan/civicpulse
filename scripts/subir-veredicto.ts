#!/usr/bin/env tsx
/**
 * subir-veredicto — la subida firmada: una persona sube el veredicto de una
 * declaración, con el registro que lo sostiene y un resumen que escribe ella; o
 * retira una subida suya.
 *
 *   npm run subir-veredicto -- <claimId> <parcial|verificado> \
 *       --evidencia '<enlace del registro>' [--lote <n>] [--evidencia '<otro>' …] \
 *       --resumen-de <fichero> --editor "<Nombre Apellido>" [--dry-run]
 *   npm run subir-veredicto -- --retirar <claimId> \
 *       --motivo-de <fichero> --editor "<Nombre Apellido>" [--dry-run]
 *
 * (`--resumen "<texto>"` y `--motivo "<texto>"` también valen; el fichero existe
 * porque el bash 3.2 de macOS rompe `$(cat <<…)` cuando el texto lleva
 * paréntesis.)
 *
 * Escribe una entrada `curator-upgrade` en `pleno-claims-overlay.json` y
 * recompone, como `downgrade-verdict`. Las reglas y su porqué están en
 * src/scraper/subida-firmada.ts; el diseño y las decisiones del operador, en
 * docs/superpowers/specs/2026-10-04-subida-firmada-design.md. Modelada en
 * `relabel-attribution` (#229).
 *
 * Antes de leer nada, la firma: una persona, con su nombre. Ni la cuenta de rol
 * ni el hueco de una orden preparada (`rechazoDeFirma`).
 *
 * Antes de escribir:
 *  · con la suspensión electoral activa (`frozenUntil`) no se sube nada;
 *    retirar una subida, sí;
 *  · lo publicado tiene que ser la composición de la base en disco
 *    (`cotejarCompose` = `coincide`), y recomponer sólo puede cambiar esta
 *    declaración: si moviera otra, subir republicaría también lo que nadie ha
 *    mirado;
 *  · la declaración tiene que constar en alguna transcripción de su sesión: la
 *    que no consta la retiene la puerta (`idsSinProcedencia`, la misma pregunta
 *    que hace `chunk-pleno-claims`);
 *  · cada `--evidencia` tiene que estar en el corpus (`evidenciaDelRegistro`), y
 *    la fila la escribe el registro;
 *  · el resumen no puede ser el de una máquina: el de la base, el de una entrada
 *    del overlay que no firmó una persona, o la propuesta de NLI de esa
 *    declaración si la cola está en disco.
 *
 * Nunca corre sola: no la llama ningún runner, cron ni nocturna.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { etiquetaVerificador } from '../src/lib/claim-provenance.js'
import { RESUMENES_RETIRADOS } from '../src/lib/resumenes-retirados.js'
import type { ClaimVerdict } from '../src/scraper/claim-verdicts'
import type { ClaimEvidence } from '../src/scraper/claim-verifier'
import { COLA_SUGERENCIAS_NLI } from '../src/scraper/entrada-de-pasada'
import { claseDeFirma, rechazoDeFirma } from '../src/scraper/firma-de-persona'
import { isFrozen } from '../src/scraper/promises'
import {
  evidenciaDelRegistro,
  retirarSubida,
  subirVeredicto,
  type EvidenciaPedida,
} from '../src/scraper/subida-firmada'
import { cotejarCompose, type Overlay, type VerifiedItem } from '../src/scraper/verified-merge'
import { idsSinProcedencia } from './chunk-pleno-claims'
import { loadSupersededTexts, TRANSCRIPTS_DIR } from './lib/transcript-corpus'
import {
  BASE,
  OVERLAY,
  VERIFIED,
  cargarCapas,
  componer,
  declaracionesCambiadas,
  rebuildVerified,
  type Capas,
} from './verified-rebuild'

const PROMISES = resolve('public/data/promises.json')
const TENDERS = resolve('public/data/tenders.json')
const BDNS = resolve('public/data/bdns.json')
const COLA_NLI = resolve(COLA_SUGERENCIAS_NLI)

const VEREDICTOS_DE_SUBIDA = ['parcial', 'verificado']

const USO =
  'uso: npm run subir-veredicto -- <claimId> <parcial|verificado> \\\n' +
  "         --evidencia '<enlace del registro>' [--lote <n>] [--evidencia '<otro>' …] \\\n" +
  '         --resumen-de <fichero> --editor "<Nombre Apellido>" [--dry-run]\n' +
  '     npm run subir-veredicto -- --retirar <claimId> --motivo-de <fichero> \\\n' +
  '         --editor "<Nombre Apellido>" [--dry-run]\n'

interface Orden {
  claimId?: string
  veredicto?: string
  retirar: boolean
  evidencias: EvidenciaPedida[]
  resumen?: string
  resumenDe?: string
  motivo?: string
  motivoDe?: string
  editor?: string
  dryRun: boolean
  /** Lo que no se ha podido leer de la orden: se dice antes de leer nada más. */
  errores: string[]
}

function parse(argv: string[]): Orden {
  const o: Orden = { retirar: false, evidencias: [], dryRun: false, errores: [] }
  const posicionales: string[] = []
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--retirar') {
      o.retirar = true
      o.claimId = argv[++i]
    } else if (a === '--evidencia') {
      o.evidencias.push({ enlace: argv[++i] ?? '', lote: null })
    } else if (a === '--lote') {
      const n = Number(argv[++i])
      const ultima = o.evidencias[o.evidencias.length - 1]
      if (!ultima) o.errores.push('--lote va detrás de la --evidencia cuyo lote elige')
      else if (ultima.lote != null) o.errores.push('cada --evidencia lleva como mucho un --lote')
      else if (!Number.isInteger(n) || n < 1)
        o.errores.push(`--lote «${argv[i]}»: un número de lote, 1 o más`)
      else ultima.lote = n
    } else if (a === '--resumen') o.resumen = argv[++i]
    else if (a === '--resumen-de') o.resumenDe = argv[++i]
    else if (a === '--motivo') o.motivo = argv[++i]
    else if (a === '--motivo-de') o.motivoDe = argv[++i]
    else if (a === '--editor') o.editor = argv[++i]
    else if (a === '--dry-run') o.dryRun = true
    else if (a.startsWith('--')) o.errores.push(`opción desconocida: ${a}`)
    else posicionales.push(a)
  }
  if (o.retirar) {
    if (posicionales.length > 0)
      o.errores.push(`--retirar no lleva veredicto (${posicionales.join(' ')})`)
    if (o.evidencias.length > 0) o.errores.push('--retirar no cita registros: baja a lo que había')
    if (o.resumen != null || o.resumenDe != null) {
      o.errores.push('--retirar lleva su porqué en --motivo-de (o --motivo), no un resumen')
    }
  } else {
    ;[o.claimId, o.veredicto] = posicionales
    if (posicionales.length > 2) o.errores.push(`sobra: ${posicionales.slice(2).join(' ')}`)
    if (o.motivo != null || o.motivoDe != null) {
      o.errores.push(
        '--motivo sólo va con --retirar: lo que se publica de una subida es su resumen',
      )
    }
  }
  return o
}

function salir(codigo: number, mensaje: string): never {
  process.stderr.write(`[subir] ${mensaje}\n`)
  process.exit(codigo)
}

/** El texto de `--x` o el del fichero de `--x-de`, exactamente uno de los dos. */
function texto(nombre: string, enLinea: string | undefined, fichero: string | undefined): string {
  if (enLinea != null && fichero != null) {
    salir(2, `--${nombre} y --${nombre}-de a la vez: uno de los dos`)
  }
  if (fichero != null) {
    try {
      return readFileSync(resolve(fichero), 'utf8')
    } catch (err) {
      salir(2, `--${nombre}-de ${fichero}: no se puede leer (${(err as Error).message})`)
    }
  }
  if (enLinea == null) salir(2, `falta --${nombre}-de <fichero> (o --${nombre} "<texto>")`)
  return enLinea
}

/**
 * Hasta cuándo dura la suspensión electoral, o `null` si no la hay. Como en
 * `relabel-attribution`: un promises.json que falta o no se deja leer es «no
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

function leerJson(path: string, que: string): unknown {
  if (!existsSync(path)) salir(1, `falta ${path} (${que})`)
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch (err) {
    salir(1, `${path} no se deja leer: ${(err as Error).message}`)
  }
}

/**
 * Lo que una máquina escribió sobre esta declaración y la persona no puede
 * firmar como suyo: el resumen de la base, el de una entrada del overlay que no
 * firmó una persona, y la propuesta de NLI si la cola está en disco. Una cola que
 * no se deja leer se dice: no cotejar contra ella no es cotejar y no hallar nada.
 */
function resumenesDeMaquina(claimId: string, base: VerifiedItem, overlay: Overlay): string[] {
  const out = [base.verification.summary]
  const entrada = overlay.entries[claimId]
  if (entrada && claseDeFirma(entrada.editor) !== 'persona') {
    out.push(entrada.verification.summary, entrada.reason ?? '')
  }
  if (existsSync(COLA_NLI)) {
    try {
      const cola = JSON.parse(readFileSync(COLA_NLI, 'utf8')) as {
        entries?: Record<string, { verification?: { summary?: string } }>
      }
      const propuesta = cola.entries?.[claimId]?.verification?.summary
      if (typeof propuesta === 'string') out.push(propuesta)
    } catch (err) {
      process.stderr.write(
        `[subir] AVISO: ${COLA_SUGERENCIAS_NLI} no se deja leer (${(err as Error).message}); ` +
          'el resumen no se ha cotejado con la propuesta de NLI\n',
      )
    }
  }
  return out.filter((t) => typeof t === 'string' && t.trim() !== '')
}

async function main() {
  const o = parse(process.argv.slice(2))

  // Antes de leer nada: quién firma.
  if (!o.editor) salir(2, '--editor es obligatorio: lo firma una persona, con su nombre')
  const firma = rechazoDeFirma(o.editor)
  if (firma) salir(2, `--editor: ${firma}`)

  if (o.errores.length > 0) {
    process.stderr.write(USO)
    salir(2, o.errores.join('; '))
  }
  const claimId = o.claimId
  if (!claimId) {
    process.stderr.write(USO)
    process.exit(2)
  }
  if (!o.retirar) {
    if (!o.veredicto || !VEREDICTOS_DE_SUBIDA.includes(o.veredicto)) {
      process.stderr.write(USO)
      salir(2, `el veredicto se escribe parcial o verificado, no «${o.veredicto ?? ''}»`)
    }
    if (o.evidencias.length === 0) {
      salir(2, '--evidencia es obligatoria: la subida cita el registro que la sostiene')
    }
  }
  const escrito = o.retirar
    ? texto('motivo', o.motivo, o.motivoDe)
    : texto('resumen', o.resumen, o.resumenDe)

  if (!o.retirar) {
    const congelado = congeladoHasta()
    if (congelado) {
      salir(
        1,
        `LOREG: la suspensión electoral está activa hasta ${congelado}; no se sube ningún ` +
          'veredicto (retirar una subida sí: --retirar). `npm run freeze:status`',
      )
    }
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
        'Subir ahora recompondría también eso, sin que nadie lo mirara.',
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
  let nuevo: Overlay
  try {
    if (o.retirar) {
      nuevo = retirarSubida(capas.overlay, { claimId, motivo: escrito, editor: o.editor }, stamp)
    } else {
      // La misma pregunta que la puerta de publicación, con sus mismos textos.
      const sinProcedencia = idsSinProcedencia(
        [enPublicado],
        (plenoId) => {
          const p = resolve(TRANSCRIPTS_DIR, `${plenoId}.txt`)
          return existsSync(p) ? readFileSync(p, 'utf8') : null
        },
        (plenoId) => loadSupersededTexts(plenoId),
      )
      if (sinProcedencia.has(claimId)) {
        salir(
          1,
          `${claimId}: su literal no consta en ninguna transcripción de su sesión, y la puerta de ` +
            'publicación la retiene: subirla no publicaría nada que se pueda leer. Primero se ' +
            'reancla (`npm run triage:claim-reanchor`).',
        )
      }
      const corpus = {
        tenders: leerJson(TENDERS, 'los contratos'),
        bdns: leerJson(BDNS, 'las convocatorias de la BDNS'),
      }
      const evidencia: ClaimEvidence[] = []
      for (const pedida of o.evidencias) evidencia.push(evidenciaDelRegistro(pedida, corpus))
      nuevo = subirVeredicto(
        capas.overlay,
        {
          claimId,
          veredicto: o.veredicto as ClaimVerdict,
          evidencia,
          resumen: escrito,
          editor: o.editor,
        },
        {
          tipo: String(enPublicado.claim.type),
          publicado: enPublicado.verification.verdict,
          resumenesDeMaquina: resumenesDeMaquina(claimId, enBase, capas.overlay),
        },
        stamp,
      )
    }
  } catch (err) {
    salir(1, `rechazado: ${(err as Error).message}`)
  }

  // El alcance: recomponer con el overlay nuevo sólo puede cambiar esta
  // declaración. Cualquier otra fila que se moviera la republicaría esta firma.
  let compuestas: VerifiedItem[]
  try {
    compuestas = componer(base.items, { ...capas, overlay: nuevo }).items
  } catch (err) {
    salir(1, `rechazado al componer: ${(err as Error).message}`)
  }
  const ajenas = declaracionesCambiadas(publicado.items, compuestas).filter((id) => id !== claimId)
  if (ajenas.length > 0) {
    salir(
      1,
      `recomponer movería ${ajenas.length} declaración(es) además de ${claimId} ` +
        `(${ajenas.slice(0, 5).join(', ')}${ajenas.length > 5 ? '…' : ''}): lo publicado no es ` +
        'sólo la composición de lo que hay en disco. Arréglalo antes, por su vía.',
    )
  }

  const despues = compuestas.find((it) => it.claim.id === claimId)
  const antes = enPublicado.verification.verdict
  process.stdout.write(
    `[subir] ${claimId}: ${antes} → ${despues?.verification.verdict}` +
      (o.retirar ? ' (se retira la subida firmada)' : ` (firmado por ${o.editor})`) +
      ' · ninguna otra declaración cambia\n',
  )
  process.stdout.write(JSON.stringify({ [claimId]: nuevo.entries[claimId] }, null, 2) + '\n')
  if (despues) {
    process.stdout.write(
      `[subir] la tarjeta dirá: «Veredicto: ${etiquetaVerificador(despues.verification)}»\n`,
    )
  }
  const retirado = Object.prototype.hasOwnProperty.call(RESUMENES_RETIRADOS, claimId)
  if (o.dryRun) {
    process.stdout.write('[subir] --dry-run: no se ha escrito nada\n')
    return
  }

  writeFileSync(OVERLAY, JSON.stringify(nuevo, null, 2) + '\n')
  try {
    await rebuildVerified()
  } catch (err) {
    salir(1, `overlay escrito pero la recomposición FALLÓ: ${(err as Error).message}`)
  }
  process.stdout.write(
    `[subir] escrito (${o.editor}) · overlay + verified.json + trozos al día\n` +
      '  Queda `npm run refresh` (los nodos que leen verified.json), y\n' +
      '  `npm run check:veredictos` y `npm run check:claim-provenance`.\n' +
      (retirado
        ? `  ${claimId} está en src/lib/resumenes-retirados.js: su resumen ya no es el retirado,\n` +
          '  así que quítalo de la lista en el mismo commit (tests/claim-ledger-resumen.test.jsx lo pide).\n'
        : ''),
  )
}

main()
