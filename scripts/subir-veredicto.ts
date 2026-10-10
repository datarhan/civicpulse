#!/usr/bin/env tsx
/**
 * subir-veredicto — la subida firmada: una persona sube el veredicto de una
 * declaración, con el registro que lo sostiene y un resumen que escribe ella; o
 * retira una subida suya.
 *
 *   npm run subir-veredicto -- <claimId> <parcial|verificado> \
 *       --evidencia '<enlace del registro>' [--lote <n> | --punto <n>] [--evidencia '<otro>' …] \
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
 *  · cada `--evidencia` tiene que estar en el corpus (`registroDeLaSubida`), y
 *    la fila la escribe el registro: un contrato (con `--lote` si el enlace lleva
 *    a varios), una convocatoria de la BDNS o, desde el 10-10-2026, un punto del
 *    orden del día de un pleno (`--punto`);
 *  · un orden del día posterior a la declaración no la sostiene, y una
 *    declaración con cifra no llega a `verificado` si ningún registro citado dice
 *    un importe (`comprobarRegistrosConLaDeclaracion`);
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
import { rechazoDeFirma } from '../src/scraper/firma-de-persona'
import {
  comprobarRegistrosConLaDeclaracion,
  registroDeLaSubida,
  retirarSubida,
  subirVeredicto,
  type EvidenciaPedida,
} from '../src/scraper/subida-firmada'
import type { Overlay } from '../src/scraper/verified-merge'
import {
  compuestaSoloEsta,
  congeladoHasta,
  constaEnSuSesion,
  declaracionEn,
  leerComposicion,
  resumenesDeMaquina,
} from './lib/antes-de-firmar'
import { OVERLAY, rebuildVerified } from './verified-rebuild'

const TENDERS = resolve('public/data/tenders.json')
const BDNS = resolve('public/data/bdns.json')
const AGENDAS = resolve('public/data/plenos-agendas.json')

const VEREDICTOS_DE_SUBIDA = ['parcial', 'verificado']

const USO =
  'uso: npm run subir-veredicto -- <claimId> <parcial|verificado> \\\n' +
  "         --evidencia '<enlace del registro>' [--lote <n> | --punto <n>] [--evidencia '<otro>' …] \\\n" +
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
    } else if (a === '--punto') {
      const n = Number(argv[++i])
      const ultima = o.evidencias[o.evidencias.length - 1]
      if (!ultima) o.errores.push('--punto va detrás de la --evidencia cuya sesión elige')
      else if (ultima.punto != null) o.errores.push('cada --evidencia lleva como mucho un --punto')
      else if (!Number.isInteger(n) || n < 1)
        o.errores.push(`--punto «${argv[i]}»: un número de punto del orden del día, 1 o más`)
      else ultima.punto = n
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

function leerJson(path: string, que: string): unknown {
  if (!existsSync(path)) salir(1, `falta ${path} (${que})`)
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch (err) {
    salir(1, `${path} no se deja leer: ${(err as Error).message}`)
  }
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

  const c = leerComposicion(salir, 'Subir')
  const { enBase, enPublicado } = declaracionEn(c, claimId, salir)

  const stamp = new Date().toISOString()
  let nuevo: Overlay
  try {
    if (o.retirar) {
      nuevo = retirarSubida(c.capas.overlay, { claimId, motivo: escrito, editor: o.editor }, stamp)
    } else {
      // La misma pregunta que la puerta de publicación, con sus mismos textos.
      if (!constaEnSuSesion(enPublicado)) {
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
        // Sin él, una sesión no está en el corpus: lo dice `registroDeLaSubida`.
        agendas: existsSync(AGENDAS) ? leerJson(AGENDAS, 'los órdenes del día') : null,
      }
      const registros = o.evidencias.map((pedida) => registroDeLaSubida(pedida, corpus))
      comprobarRegistrosConLaDeclaracion(
        registros,
        {
          fecha: enPublicado.claim.plenoDate ?? null,
          conImporte: enPublicado.claim.entities?.amountEuros != null,
        },
        o.veredicto as ClaimVerdict,
      )
      const evidencia: ClaimEvidence[] = registros.map((r) => r.fila)
      nuevo = subirVeredicto(
        c.capas.overlay,
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
          resumenesDeMaquina: resumenesDeMaquina(claimId, enBase, c.capas.overlay, '[subir]'),
        },
        stamp,
      )
    }
  } catch (err) {
    salir(1, `rechazado: ${(err as Error).message}`)
  }

  // El alcance: recomponer con el overlay nuevo sólo puede cambiar esta
  // declaración. Cualquier otra fila que se moviera la republicaría esta firma.
  const compuestas = compuestaSoloEsta(c, nuevo, claimId, salir)

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
