/**
 * Lo que comprueban, antes de escribir, las CLIs con las que una persona firma
 * en el overlay de declaraciones: `subir-veredicto` (la subida firmada) y
 * `downgrade-verdict --amend-reason` (el motivo enmendado de una bajada y la
 * explicación firmada de una retractación del motor).
 *
 * Vivía dentro de `subir-veredicto`. La explicación firmada (10-10-2026,
 * docs/superpowers/specs/2026-10-10-explicacion-firmada-design.md) necesitaba
 * las mismas preguntas, y dos copias de una comprobación acaban separándose —es
 * lo que este repositorio ya ha contado de los enums y de las escalas—, así que
 * viven aquí. Cada función recibe `salir`, que imprime con el prefijo de la CLI y
 * sale con su código: el porqué de cada negativa lo lee la persona que firma.
 */
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { COLA_SUGERENCIAS_NLI } from '../../src/scraper/entrada-de-pasada'
import { claseDeFirma } from '../../src/scraper/firma-de-persona'
import { isFrozen } from '../../src/scraper/promises'
import {
  cotejarCompose,
  explicacionFirmadaPor,
  type Overlay,
  type VerifiedItem,
} from '../../src/scraper/verified-merge'
import { idsSinProcedencia } from '../chunk-pleno-claims'
import {
  BASE,
  VERIFIED,
  cargarCapas,
  componer,
  declaracionesCambiadas,
  type Capas,
} from '../verified-rebuild'
import { loadSupersededTexts, TRANSCRIPTS_DIR } from './transcript-corpus'

/** Imprime el porqué con el prefijo de la CLI y sale con `codigo`. */
export type Salir = (codigo: number, mensaje: string) => never

const PROMISES = resolve('public/data/promises.json')
const COLA_NLI = resolve(COLA_SUGERENCIAS_NLI)

/**
 * Hasta cuándo dura la suspensión electoral, o `null` si no la hay. Como en
 * `relabel-attribution`: un promises.json que falta o no se deja leer es «no
 * congelado», nunca un fallo.
 */
export function congeladoHasta(): string | null {
  if (!existsSync(PROMISES)) return null
  try {
    const raw = JSON.parse(readFileSync(PROMISES, 'utf8')) as { frozenUntil?: string | null }
    const frozenUntil = raw.frozenUntil ?? null
    return isFrozen({ frozenUntil }) ? frozenUntil : null
  } catch {
    return null
  }
}

/** Lo que se compone y lo que se publica, tal como está en disco. */
export interface Composicion {
  base: { generatedAt?: string; items: VerifiedItem[] }
  publicado: { generatedAt?: string; items: VerifiedItem[] }
  capas: Capas
}

/**
 * Lo publicado tiene que ser la composición de la base en disco
 * (`cotejarCompose` = `coincide`), y las capas tienen que validar: si no,
 * firmar ahora recompondría también lo que nadie ha mirado. `accion` es el verbo
 * con que la CLI lo dice («Subir», «Enmendar»).
 */
export function leerComposicion(salir: Salir, accion: string): Composicion {
  if (!existsSync(BASE)) {
    salir(
      1,
      `falta la base (${BASE}), que está gitignorada: cópiala del checkout principal o ` +
        'regénerala con `npm run verify:pleno-claims -- --base-only`',
    )
  }
  if (!existsSync(VERIFIED)) salir(1, `falta ${VERIFIED}, que va comiteado`)
  const base = JSON.parse(readFileSync(BASE, 'utf8')) as Composicion['base']
  const publicado = JSON.parse(readFileSync(VERIFIED, 'utf8')) as Composicion['publicado']
  const cotejo = cotejarCompose({
    baseGeneratedAt: base.generatedAt ?? null,
    publicadoGeneratedAt: publicado.generatedAt ?? null,
  })
  if (cotejo.estado !== 'coincide') {
    salir(
      1,
      `lo publicado no es la composición de la base en disco (${cotejo.estado}): ${cotejo.motivo} ` +
        `${accion} ahora recompondría también eso, sin que nadie lo mirara.`,
    )
  }
  let capas: Capas | undefined
  try {
    capas = cargarCapas()
  } catch (err) {
    salir(1, `los ficheros que se componen no validan: ${(err as Error).message}`)
  }
  return { base, publicado, capas: capas as Capas }
}

/**
 * La declaración, en la base y en lo publicado. Si falta en la base, su entrada
 * del overlay —si la tiene— es huérfana: ninguna página la publica, y no hay
 * nada que firmar.
 */
export function declaracionEn(
  c: Composicion,
  claimId: string,
  salir: Salir,
): { enBase: VerifiedItem; enPublicado: VerifiedItem } {
  const enBase = c.base.items.find((it) => it.claim.id === claimId)
  const enPublicado = c.publicado.items.find((it) => it.claim.id === claimId)
  if (!enBase) {
    salir(
      1,
      `${claimId} no está en la base: si tiene entrada en el overlay, es huérfana, y ninguna ` +
        'página la publica',
    )
  }
  if (!enPublicado) salir(1, `${claimId} no está en lo publicado`)
  return { enBase: enBase as VerifiedItem, enPublicado: enPublicado as VerifiedItem }
}

/**
 * ¿Consta el literal en alguna transcripción de su sesión? La que no consta la
 * retiene la puerta de publicación: la misma pregunta, con sus mismos textos,
 * que hace `chunk-pleno-claims` (`idsSinProcedencia`).
 */
export function constaEnSuSesion(item: VerifiedItem): boolean {
  const sin = idsSinProcedencia(
    [item],
    (plenoId) => {
      const p = resolve(TRANSCRIPTS_DIR, `${plenoId}.txt`)
      return existsSync(p) ? readFileSync(p, 'utf8') : null
    },
    (plenoId) => loadSupersededTexts(plenoId),
  )
  return !sin.has(item.claim.id)
}

/**
 * El alcance: recomponer con el overlay nuevo sólo puede cambiar esta
 * declaración. Cualquier otra fila que se moviera la republicaría esta firma.
 * Devuelve lo compuesto.
 */
export function compuestaSoloEsta(
  c: Composicion,
  nuevo: Overlay,
  claimId: string,
  salir: Salir,
): VerifiedItem[] {
  let compuestas: VerifiedItem[] = []
  try {
    compuestas = componer(c.base.items, { ...c.capas, overlay: nuevo }).items
  } catch (err) {
    salir(1, `rechazado al componer: ${(err as Error).message}`)
  }
  const ajenas = declaracionesCambiadas(c.publicado.items, compuestas).filter(
    (id) => id !== claimId,
  )
  if (ajenas.length > 0) {
    salir(
      1,
      `recomponer movería ${ajenas.length} declaración(es) además de ${claimId} ` +
        `(${ajenas.slice(0, 5).join(', ')}${ajenas.length > 5 ? '…' : ''}): lo publicado no es ` +
        'sólo la composición de lo que hay en disco. Arréglalo antes, por su vía.',
    )
  }
  return compuestas
}

/**
 * Lo que una máquina escribió sobre esta declaración y la persona no puede
 * firmar como suyo: el resumen de la base, lo que publica una entrada del
 * overlay que no firmó una persona —una explicación ya enmendada la escribió
 * una, pero el `reason` del motor sigue siendo del motor—, y la propuesta de NLI
 * si la cola está en disco. Una cola que no se deja leer se dice: no cotejar
 * contra ella no es cotejar y no hallar nada.
 */
export function resumenesDeMaquina(
  claimId: string,
  base: VerifiedItem,
  overlay: Overlay,
  prefijo: string,
): string[] {
  const out = [base.verification.summary]
  const entrada = overlay.entries[claimId]
  if (entrada && claseDeFirma(entrada.editor) !== 'persona') {
    const firmada = explicacionFirmadaPor(entrada) !== null
    if (!firmada) out.push(entrada.verification.summary)
    if (!firmada || entrada.source === 'verdict-engine') out.push(entrada.reason ?? '')
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
        `${prefijo} AVISO: ${COLA_SUGERENCIAS_NLI} no se deja leer (${(err as Error).message}); ` +
          'el texto no se ha cotejado con la propuesta de NLI\n',
      )
    }
  }
  return out.filter((t) => typeof t === 'string' && t.trim() !== '')
}
