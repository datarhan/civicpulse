/**
 * Read the verifier corpus off disk the way the published ledger is built:
 * `mergeVerified(base, overlay)`.
 *
 * The pure half — what the editorial gate would do with each claim — is
 * `src/scraper/quote-contrast.ts`, tested without a filesystem. This is the
 * only reader, so `compute:finding-quote-provenance`, `check:finding-quotes`
 * and `triage:finding-exception` cannot end up disagreeing about which verdicts
 * they are looking at.
 *
 * ── Why not just read pleno-claims-verified.json ────────────────────────────
 *
 * Because the point of this loader is that the merge HAPPENED, and reading the
 * already-merged monolith cannot show that. `pleno-claims-verified-base.json`
 * is the deterministic pass alone; the verdict engine, the NLI pass and curator
 * downgrades live in the overlay. On the 177 verbatims `/hallazgos` publishes,
 * the base alone puts 149 in `shown`; base ⊕ overlay puts 16 there. Reading the
 * base by accident is not a small error, it is the opposite answer — so the
 * corpus carries BOTH maps and the caller's stats count how many quotes the
 * overlay actually moved.
 */
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import type { VerifierCorpus } from '../../src/scraper/quote-contrast'
import {
  mergeVerified,
  validateReclassifications,
  type Overlay,
  type Reclassifications,
  type VerifiedItem,
} from '../../src/scraper/verified-merge'

export const VERIFIED_BASE = 'public/data/pleno-claims-verified-base.json'
export const VERIFIED_OVERLAY = 'public/data/pleno-claims-overlay.json'
export const VERIFIED_RECLASSIFICATIONS = 'public/data/pleno-claim-reclassifications.json'

/**
 * Loads base + overlay and merges them. Throws when the base is missing: a
 * caller that carried on would classify against an empty corpus, and an empty
 * corpus produces a page where every quote renders unmarked — the fail-OPEN
 * direction on a legally material surface.
 *
 * A missing overlay is tolerated as an empty one (a fresh clone before the
 * first verdict-engine run) and reported through `overlayEntries: 0`, which
 * `contrastSanityFailure` reads: zero entries is fine, zero entries REACHING a
 * quote when the overlay has some is not.
 */
export function loadVerifiedCorpus(
  opts: { basePath?: string; overlayPath?: string } = {},
): VerifierCorpus {
  const basePath = resolve(opts.basePath ?? VERIFIED_BASE)
  if (!existsSync(basePath)) {
    throw new Error(
      `falta ${opts.basePath ?? VERIFIED_BASE} — sin el corpus del verificador no se puede ` +
        'preguntar a la puerta editorial qué haría con cada cita, y una cita sin respuesta sale ' +
        'en la página sin marca, que es como sale una contrastada',
    )
  }
  const base = JSON.parse(readFileSync(basePath, 'utf8')) as { items?: VerifiedItem[] }
  const overlayPath = resolve(opts.overlayPath ?? VERIFIED_OVERLAY)
  const overlay: Overlay = existsSync(overlayPath)
    ? (JSON.parse(readFileSync(overlayPath, 'utf8')) as Overlay)
    : { version: 1, generatedAt: '', entries: {} }

  // El sidecar de reclasificaciones curadas es la tercera capa de la MISMA
  // composición que publica el rebuild; leerlo aquí y no en el rebuild (o al
  // revés) es como la página y la cola empezarían a discrepar. Validado al
  // leer: una entrada HACIA acusacion_publica revienta antes de clasificar.
  const reclasPath = resolve(VERIFIED_RECLASSIFICATIONS)
  const reclas: Reclassifications = existsSync(reclasPath)
    ? (JSON.parse(readFileSync(reclasPath, 'utf8')) as Reclassifications)
    : { version: 1, generatedAt: '', entries: {} }
  validateReclassifications(reclas)

  const baseItems = base.items ?? []
  const merged = mergeVerified(baseItems, overlay, reclas)
  return {
    merged: new Map(merged.map((it) => [it.claim.id, it])),
    base: new Map(baseItems.map((it) => [it.claim.id, it])),
    overlayEntries: Object.keys(overlay?.entries ?? {}).length,
  }
}
