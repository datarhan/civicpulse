/**
 * Domain → citation-trust table for web sources (MBFC-inspired, adapted
 * to the Spanish/Valencian ecosystem — idea credit: intruth-factcheck's
 * source-credibility scoring; our local outlets aren't in MBFC, so the
 * table is curated here, deterministic and git-audited).
 *
 * Tiers feed SourceCitation.trust, which the /laboratorio/agentes source
 * ledger renders and the verify stage weighs:
 *   high   — official/institutional publishers (BOE, GVA/DOGV, .gob.es,
 *            the Ayuntamiento itself, INE, EU institutions)
 *   medium — established press with editorial accountability
 *   low    — everything else (the honest default: an unknown domain gets
 *            the curator's attention, not the benefit of the doubt)
 *
 * Matching is by registrable-suffix: `sede.ribarroja.es` inherits
 * `ribarroja.es`; lookalikes (`notboe.es`) never match (`.` boundary).
 */
import type { CitationTrust } from '../journalist'

const HIGH_TRUST_ZONES: readonly string[] = [
  'boe.es',
  'gob.es',
  'gva.es', // incl. dogv.gva.es, carto.icv.gva.es, sindicdegreuges…
  'ribarroja.es',
  'ine.es',
  'europa.eu', // incl. ted.europa.eu
  'congreso.es',
  'senado.es',
  'dival.es', // Diputació de València (BOP)
  'interior.es', // incl. infoelectoral.interior.es (resultados electorales)
  'poderjudicial.es',
  'consejodetransparencia.es',
  'seg-social.es',
  'sepe.es',
  'civicpulse.es', // our own published snapshots (same data as local-snapshot)
]

const MEDIUM_TRUST_ZONES: readonly string[] = [
  // national press
  'elpais.com',
  'elmundo.es',
  'abc.es',
  'larazon.es',
  '20minutos.es',
  'eldiario.es', // incl. eldiariocv
  'elespanol.com',
  'europapress.es',
  'efe.com',
  'rtve.es',
  'cadenaser.com',
  'ondacero.es',
  'lasexta.com',
  'antena3.com',
  // fact-checkers (IFCN signatories)
  'newtral.es',
  'maldita.es',
  // Comunitat Valenciana / comarcal
  'lasprovincias.es',
  'levante-emv.com',
  'valenciaplaza.com',
  'apuntmedia.es',
  'infoturia.com',
  'diariodelpuerto.com',
  'elperiodicodeaqui.com',
  'elperiodic.com',
  'hortanoticias.com',
  // municipal-sector institutional (association, not government)
  'fvmp.es',
  // crowd-edited reference — medium as a WEB hit (the dedicated
  // wikipedia tool citation stays 'high': it fetches the curated
  // summary endpoint, not an arbitrary article state)
  'wikipedia.org',
]

function hostMatchesZone(host: string, zone: string): boolean {
  return host === zone || host.endsWith(`.${zone}`)
}

/**
 * Trust tier for a web URL. Unparseable input → 'low' (never throws —
 * a citation must always get a tier).
 */
export function trustForUrl(url: string): CitationTrust {
  let host: string
  try {
    host = new URL(url).hostname.toLowerCase()
  } catch {
    return 'low'
  }
  if (HIGH_TRUST_ZONES.some((z) => hostMatchesZone(host, z))) return 'high'
  if (MEDIUM_TRUST_ZONES.some((z) => hostMatchesZone(host, z))) return 'medium'
  return 'low'
}
