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
  validateOverlay,
  type Overlay,
  type VerifiedItem,
} from '../src/scraper/verified-merge'
import type { ClaimVerdict } from '../src/scraper/claim-verifier'

const DATA = resolve('public/data')
export const BASE = resolve(DATA, 'pleno-claims-verified-base.json')
export const OVERLAY = resolve(DATA, 'pleno-claims-overlay.json')
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

export function loadOverlay(): Overlay {
  if (!existsSync(OVERLAY)) return { version: 1, generatedAt: '', entries: {} }
  const o = JSON.parse(readFileSync(OVERLAY, 'utf8')) as Overlay
  validateOverlay(o)
  return o
}

export async function rebuildVerified(
  opts: { refreshChunks?: boolean } = {},
): Promise<{ total: number; byVerdict: Record<ClaimVerdict, number>; overlayApplied: number }> {
  if (!existsSync(BASE)) {
    throw new Error(
      `[rebuild] ${BASE} missing — run \`npm run migrate:verified-split\` or \`npm run verify:pleno-claims\``,
    )
  }
  const base = JSON.parse(readFileSync(BASE, 'utf8')) as Snapshot
  const overlay = loadOverlay()
  const items = mergeVerified(base.items, overlay)

  const byVerdict: Record<ClaimVerdict, number> = {
    verificado: 0,
    parcial: 0,
    contradicho: 0,
    'sin-datos': 0,
    'promesa-repetida': 0,
  }
  for (const it of items)
    byVerdict[it.verification.verdict] = (byVerdict[it.verification.verdict] ?? 0) + 1

  // Antes de escribir nada: ¿esto empobrece lo que ya está publicado?
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
    stats: { total: items.length, byVerdict },
    items,
  }
  writeFileSync(VERIFIED, JSON.stringify(out, null, 2) + '\n')

  const baseIds = new Set(base.items.map((it) => it.claim.id))
  const overlayApplied = Object.keys(overlay.entries).filter((id) => baseIds.has(id)).length

  if (opts.refreshChunks !== false) {
    const { rewriteChunksFromMonolith } = await import('./chunk-pleno-claims')
    rewriteChunksFromMonolith()
  }
  return { total: items.length, byVerdict, overlayApplied }
}
