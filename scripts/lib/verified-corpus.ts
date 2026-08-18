/**
 * Read the verifier corpus off disk: the MERGED truth from the published
 * monolith, the deterministic base (si existe) as a cross-check.
 *
 * The pure half — what the editorial gate would do with each claim — is
 * `src/scraper/quote-contrast.ts`, tested without a filesystem. This is the
 * only reader, so `compute:finding-quote-provenance`, `check:finding-quotes`
 * and `triage:finding-exception` cannot end up disagreeing about which verdicts
 * they are looking at.
 *
 * ── Historia: por qué ANTES no se leía pleno-claims-verified.json ───────────
 *
 * La primera versión fusionaba base ⊕ overlay para PROBAR que la fusión había
 * corrido: leer la base a secas da la respuesta contraria para la mayoría de
 * las citas (149 shown contra 16), y ese error ya se cometió una vez. Pero esa
 * lectura tenía un coste que tardó en verse: la base es gitignorada y
 * «reproducible», y cuando los insumos committed dejan de reproducir el
 * monolito publicado (dos plenos re-extraídos con ids nuevos, agosto 2026),
 * cada productor derivaba unas marcas distintas — el runner de Actions
 * publicaba un snapshot que CONTRADECÍA el ledger que sirve /declaraciones, y
 * `check:relations` lo declaraba roto. Tres noches en rojo en CI por la base
 * ausente fueron el primer síntoma del mismo defecto.
 *
 * La resolución la arbitró `check:relations`: las marcas describen lo que el
 * lector ve, y lo que el lector ve es el monolito. Así que `merged` ES el
 * monolito — el único fichero que sólo escribe `rebuildVerified()`, o sea la
 * fusión ya ejecutada por la vía sancionada — y la base pasa a ser el
 * contraste opcional: presente, las stats miden cuánto decide el overlay y
 * cuánto discrepa la re-derivación; ausente (CI, clon fresco), las marcas
 * salen igual de correctas y el contraste se declara no hecho en vez de
 * inventarse. El peligro viejo (clasificar contra la base sola) ya no tiene
 * camino: este loader no puede producir ese estado.
 */
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import type { VerifierCorpus } from '../../src/scraper/quote-contrast'
import type { VerifiedItem } from '../../src/scraper/verified-merge'

export const VERIFIED_MONOLITH = 'public/data/pleno-claims-verified.json'
export const VERIFIED_BASE = 'public/data/pleno-claims-verified-base.json'
export const VERIFIED_OVERLAY = 'public/data/pleno-claims-overlay.json'
export const VERIFIED_RECLASSIFICATIONS = 'public/data/pleno-claim-reclassifications.json'

/**
 * Throws when the MONOLITH is missing: a caller that carried on would classify
 * against an empty corpus, and an empty corpus produces a page where every
 * quote renders unmarked — the fail-OPEN direction on a legally material
 * surface. A missing base or overlay is tolerated: the base enables the
 * cross-check stats (`baseDisponible: false` says it did not run), and the
 * overlay count feeds the same report.
 */
export function loadVerifiedCorpus(
  opts: { monolithPath?: string; basePath?: string; overlayPath?: string } = {},
): VerifierCorpus {
  const monolithPath = resolve(opts.monolithPath ?? VERIFIED_MONOLITH)
  if (!existsSync(monolithPath)) {
    throw new Error(
      `falta ${opts.monolithPath ?? VERIFIED_MONOLITH} — sin el ledger publicado no se puede ` +
        'preguntar a la puerta editorial qué haría con cada cita, y una cita sin respuesta sale ' +
        'en la página sin marca, que es como sale una contrastada',
    )
  }
  const monolith = JSON.parse(readFileSync(monolithPath, 'utf8')) as { items?: VerifiedItem[] }

  const basePath = resolve(opts.basePath ?? VERIFIED_BASE)
  const baseItems: VerifiedItem[] = existsSync(basePath)
    ? ((JSON.parse(readFileSync(basePath, 'utf8')) as { items?: VerifiedItem[] }).items ?? [])
    : []
  const baseDisponible = existsSync(basePath)

  const overlayPath = resolve(opts.overlayPath ?? VERIFIED_OVERLAY)
  const overlay = existsSync(overlayPath)
    ? (JSON.parse(readFileSync(overlayPath, 'utf8')) as { entries?: Record<string, unknown> })
    : { entries: {} }

  return {
    merged: new Map((monolith.items ?? []).map((it) => [it.claim.id, it])),
    base: new Map(baseItems.map((it) => [it.claim.id, it])),
    baseDisponible,
    overlayEntries: Object.keys(overlay?.entries ?? {}).length,
  }
}
