/**
 * Rebuild the published pleno-claims-verified.json from the deterministic base
 * + the second-pass/curator overlay (P2). IO orchestrator — pure merge logic
 * lives in src/scraper/verified-merge.ts.
 *
 *   base (pleno-claims-verified-base.json, gitignored — reproducible)
 *   ⊕ overlay (pleno-claims-overlay.json, committed — precious)
 *   → pleno-claims-verified.json (published monolith) → chunks
 *
 * generatedAt is preserved from the base (when the deterministic verdicts were
 * computed); the overlay tracks its own timestamp. So a migration that seeds the
 * base verbatim from the current verified.json round-trips to a byte-identical
 * verified.json.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  mergeVerified,
  isDowngrade,
  validateOverlay,
  validateReclassifications,
  reclassificationOutcomes,
  type Overlay,
  type Reclassifications,
  type VerifiedItem,
} from '../src/scraper/verified-merge'
import type { ClaimVerdict } from '../src/scraper/claim-verifier'
import { resumirSinDatos } from '../src/scraper/claim-verdicts'

const DATA = resolve('public/data')
export const BASE = resolve(DATA, 'pleno-claims-verified-base.json')
export const OVERLAY = resolve(DATA, 'pleno-claims-overlay.json')
export const RECLASSIFICATIONS = resolve(DATA, 'pleno-claim-reclassifications.json')
export const VERIFIED = resolve(DATA, 'pleno-claims-verified.json')

interface Snapshot {
  generatedAt: string
  source?: unknown
  stats?: unknown
  items: VerifiedItem[]
}

/** Cuántas de estas citas llevan un bloc atribuido. */
export function atribucionesDeBloc(items: VerifiedItem[]): number {
  return items.reduce((n, it) => n + (it?.claim?.speakerGroup ? 1 : 0), 0)
}

/**
 * ¿Este rebuild publicaría un corpus con menos atribución que el que sustituye?
 *
 * La atribución de bloc vive en `claim.speakerGroup`, o sea en la BASE — que es
 * gitignorada y «reproducible»— y no en el overlay, que es el que está
 * declarado precioso. Ahí está el agujero: el overlay protege los VEREDICTOS de
 * un `verify:pleno-claims`, y a nadie protege de que una base regenerada traiga
 * menos atribución que la publicada.
 *
 * Estado del repositorio el 2026-08-14, que es lo que destapó esto: la base
 * (13-ago) traía 101 citas con bloc; el fichero publicado (1-ago) traía 1.362.
 * O sea que CUALQUIER rebuild —un `downgrade-verdict` de un curador, una pasada
 * de verificación— publicaba en silencio un corpus con 1.261 atribuciones
 * menos. Se descubrió al aplicar cuatro correcciones de veredicto por la vía
 * sancionada y ver que el diff se llevaba por delante 667 atribuciones en los
 * chunks y añadía tres plenos que nunca habían sido públicos.
 *
 * «Attribution is bloc-level until a curator promotes it» es una de las reglas
 * legalmente materiales de este repositorio. Perderla al por mayor no es una
 * degradación cosmética: es dejar de poder decir quién dijo qué.
 *
 * Falla CERRADO. Un rebuild que empobrece la atribución se niega y lo explica;
 * quien de verdad quiera hacerlo pone la variable y queda escrito.
 */
export function rebuildEmpobreceAtribucion(antes: number, despues: number): boolean {
  return despues < antes
}

/** Escotilla documentada, para cuando la pérdida sea la intención. */
export const ANULAR_GUARDA_ATRIBUCION = 'CLAIMS_REBUILD_ALLOW_ATTRIBUTION_LOSS'

/**
 * Subir es «no bajar y no quedarse igual», DERIVADO de `isDowngrade` — la misma
 * función que ya gobierna el CLI del curador y el motor de veredictos.
 *
 * La primera versión escribió su propia escala de fuerza aquí, y la revisión
 * independiente encontró lo de siempre: las dos escalas ya discrepaban.
 * `isDowngrade` se niega a tratar `contradicho` como destino (nunca es una
 * bajada), mientras que la escala local lo empataba con `verificado` — o sea
 * que el CLI rechazaba `verificado → contradicho` y esta guarda lo dejaba
 * pasar, justo la transición que el bloque sólo-título hacía alcanzable sin que
 * interviniera nadie. Reescribir un orden es reescribir un enum: la regla 1 de
 * DATA_INTEGRITY, aplicada a una relación en vez de a una lista.
 *
 * Al derivarla, la guarda se vuelve además más estricta que la escala que
 * sustituye: cualquier movimiento que el curador no podría firmar como bajada
 * cuenta como subida y se para.
 */
function esSubida(de: ClaimVerdict, a: ClaimVerdict): boolean {
  return de !== a && !isDowngrade(de, a)
}

/**
 * ¿Qué ACUSACIONES sube este rebuild respecto a lo ya publicado?
 *
 * La regla de la casa es que lo automático sólo puede ir a la baja, y hasta
 * ahora vivía repartida: `isDowngrade` la aplica al CLI del curador y al motor
 * de veredictos, pero nadie miraba el resultado agregado de un rebuild. Así se
 * coló lo que destapó la revisión independiente del 2026-08-18: un arreglo del
 * emparejador (dejar de casar por importe cuando el objeto no coincide) hizo
 * caer esas afirmaciones a la vía sólo-entidad, que compara TÍTULOS y sí
 * devolvía `verificado` — y una acusación pública del PP subió de `parcial` a
 * `verificado` sobre un contrato que no acredita lo que denuncia. El arreglo
 * medía la distribución agregada, que bajaba, y no la dirección FILA A FILA.
 *
 * Se vigilan las acusaciones y no todo: un veredicto puede subir legítimamente
 * porque llegue un contrato nuevo, y bloquear eso entrenaría a poner la
 * escotilla cada noche. Subir una acusación contra un grupo con nombre es otra
 * cosa — es la dirección que agrava lo que se afirma de alguien— y merece que
 * una persona la mire antes de publicarse.
 *
 * Falla CERRADO, como su hermana de arriba.
 */
export function acusacionesQueSuben(
  antes: VerifiedItem[],
  despues: VerifiedItem[],
): Array<{ id: string; de: string; a: string }> {
  const previo = new Map(antes.map((it) => [it.claim.id, it.verification?.verdict]))
  const out: Array<{ id: string; de: string; a: string }> = []
  for (const it of despues) {
    if (it.claim?.type !== 'acusacion_publica') continue
    const de = previo.get(it.claim.id)
    const a = it.verification?.verdict
    if (de == null || a == null) continue // fila nueva: no hay «antes» que subir
    if (esSubida(de, a)) out.push({ id: it.claim.id, de, a })
  }
  return out
}

/**
 * Acusaciones que ESTRENAN id publicando por encima de `sin-datos`.
 *
 * El punto ciego de la guarda de arriba: una fila sin «antes» no puede subir,
 * y una re-extracción rehace los ids en bloque (este mismo trabajo cambió dos
 * plenos enteros: 369 ids nuevos, 155 de ellos acusaciones). No se bloquea
 * —una sesión recién transcrita tiene que poder publicar lo que diga el
 * cotejo— pero se CUENTA y se dice, que es lo que distingue «no había nada»
 * de «no lo miré».
 */
export function acusacionesNuevasFundadas(
  antes: VerifiedItem[],
  despues: VerifiedItem[],
): string[] {
  const conocidos = new Set(antes.map((it) => it.claim?.id))
  return despues
    .filter(
      (it) =>
        it.claim?.type === 'acusacion_publica' &&
        !conocidos.has(it.claim.id) &&
        it.verification?.verdict != null &&
        it.verification.verdict !== 'sin-datos',
    )
    .map((it) => it.claim.id)
}

/** Escotilla documentada, para cuando la subida sea deliberada y revisada. */
export const ANULAR_GUARDA_ACUSACIONES = 'CLAIMS_REBUILD_ALLOW_ACCUSATION_RAISE'

export function loadOverlay(): Overlay {
  if (!existsSync(OVERLAY)) return { version: 1, generatedAt: '', entries: {} }
  const o = JSON.parse(readFileSync(OVERLAY, 'utf8')) as Overlay
  validateOverlay(o)
  return o
}

/**
 * Validado también AL LEER: un sidecar editado a mano con una entrada HACIA
 * `acusacion_publica` revienta aquí cualquier rebuild antes de publicar nada —
 * la inyección de fallo que este mecanismo promete.
 */
export function loadReclassifications(): Reclassifications {
  if (!existsSync(RECLASSIFICATIONS)) return { version: 1, generatedAt: '', entries: {} }
  const r = JSON.parse(readFileSync(RECLASSIFICATIONS, 'utf8')) as Reclassifications
  validateReclassifications(r)
  return r
}

export async function rebuildVerified(opts: { refreshChunks?: boolean } = {}): Promise<{
  total: number
  byVerdict: Record<ClaimVerdict, number>
  overlayApplied: number
  reclassApplied: number
}> {
  if (!existsSync(BASE)) {
    throw new Error(
      `[rebuild] ${BASE} missing — run \`npm run migrate:verified-split\` or \`npm run verify:pleno-claims\``,
    )
  }
  const base = JSON.parse(readFileSync(BASE, 'utf8')) as Snapshot
  const overlay = loadOverlay()
  const reclas = loadReclassifications()
  const items = mergeVerified(base.items, overlay, reclas)

  // Los tres desenlaces de cada reclasificación, a la vista en cada rebuild:
  // «no encontrada» u «obsoleta» plegadas en «aplicada» serían el verde hueco
  // de siempre (DATA_INTEGRITY regla 2).
  const reclasOutcomes = reclassificationOutcomes(base.items, reclas)
  for (const id of reclasOutcomes.sinClaim) {
    process.stderr.write(`[rebuild] reclasificación de ${id}: el claim ya no está en la base\n`)
  }
  for (const id of reclasOutcomes.obsoletas) {
    process.stderr.write(
      `[rebuild] reclasificación de ${id}: OBSOLETA — la base ya no dice el tipo registrado en from\n`,
    )
  }

  const byVerdict: Record<ClaimVerdict, number> = {
    verificado: 0,
    parcial: 0,
    contradicho: 0,
    'sin-datos': 0,
    'promesa-repetida': 0,
  }
  for (const it of items)
    byVerdict[it.verification.verdict] = (byVerdict[it.verification.verdict] ?? 0) + 1

  // Antes de escribir nada: ¿esto SUBE alguna acusación ya publicada?
  if (existsSync(VERIFIED) && !process.env[ANULAR_GUARDA_ACUSACIONES]) {
    const publicado = JSON.parse(readFileSync(VERIFIED, 'utf8')) as Snapshot
    const nuevas = acusacionesNuevasFundadas(publicado.items ?? [], items)
    if (nuevas.length > 0) {
      // No se bloquea: una sesión recién transcrita tiene derecho a publicar lo
      // que diga el cotejo. Pero se dice, porque la guarda de abajo no puede
      // verlas y «no había nada que mirar» y «no lo miré» no son lo mismo.
      process.stderr.write(
        `[rebuild] AVISO: ${nuevas.length} acusación(es) con id nuevo publican por encima de ` +
          `sin-datos y ninguna guarda las compara con un estado anterior: ${nuevas
            .slice(0, 5)
            .join(', ')}${nuevas.length > 5 ? '…' : ''}\n`,
      )
    }
    const suben = acusacionesQueSuben(publicado.items ?? [], items)
    if (suben.length > 0) {
      throw new Error(
        `[rebuild] ABORTADO: este rebuild subiría ${suben.length} acusación(es) pública(s) ya ` +
          'publicadas, y lo automático aquí sólo puede ir a la baja.\n' +
          suben.map((s) => `  · ${s.id}: ${s.de} → ${s.a}\n`).join('') +
          '  Si la subida es correcta, la firma una persona: revísala y publícala por su vía, o\n' +
          `  pon ${ANULAR_GUARDA_ACUSACIONES}=1 y queda escrito.`,
      )
    }
  }

  // Y antes de escribir nada: ¿esto empobrece lo que ya está publicado?
  if (existsSync(VERIFIED) && !process.env[ANULAR_GUARDA_ATRIBUCION]) {
    const publicado = JSON.parse(readFileSync(VERIFIED, 'utf8')) as Snapshot
    const antes = atribucionesDeBloc(publicado.items ?? [])
    const despues = atribucionesDeBloc(items)
    if (rebuildEmpobreceAtribucion(antes, despues)) {
      throw new Error(
        `[rebuild] ABORTADO: publicar esto dejaría el corpus con ${despues} citas atribuidas a un ` +
          `bloc donde ahora hay ${antes} (${antes - despues} menos).\n` +
          `  La atribución vive en claim.speakerGroup, o sea en la BASE, que el overlay NO protege.\n` +
          `  Base: ${BASE}\n` +
          `  Si la base se regeneró sin el mapeo de voces, regenérala CON él en vez de publicar esto.\n` +
          `  Si la pérdida es lo que quieres, ${ANULAR_GUARDA_ATRIBUCION}=1 y queda escrito.`,
      )
    }
  }

  const out = {
    generatedAt: base.generatedAt,
    source: base.source,
    stats: {
      total: items.length,
      byVerdict,
      // Desde los items YA fusionados, para que el desglose describa lo que
      // se publica y no lo que dijo la pasada determinista.
      sinDatosPorque: resumirSinDatos(items.map((it) => it.verification)),
    },
    items,
  }
  writeFileSync(VERIFIED, JSON.stringify(out, null, 2) + '\n')

  const baseIds = new Set(base.items.map((it) => it.claim.id))
  const overlayApplied = Object.keys(overlay.entries).filter((id) => baseIds.has(id)).length

  if (opts.refreshChunks !== false) {
    const { rewriteChunksFromMonolith } = await import('./chunk-pleno-claims')
    rewriteChunksFromMonolith()
  }
  return {
    total: items.length,
    byVerdict,
    overlayApplied,
    reclassApplied: reclasOutcomes.aplicadas.length,
  }
}
