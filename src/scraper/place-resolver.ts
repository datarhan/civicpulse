/**
 * Pure place-resolver: fold a contract title, match it against a gazetteer of
 * streets + civic POIs + urbanizaciones + barrios, and return the single most
 * specific point where the named place sits — or null.
 *
 * Conservative by design (mirrors ZONE_ALIASES discipline): matches are
 * token-bounded, most-specific-and-longest wins, and short/common street cores
 * (e.g. "Mayor"/"Major") are not offered as needles at all — an honest miss
 * beats placing a contract on the wrong street. Provenance (the matched place
 * name) rides back on every match so the UI can show "situado por «…»".
 *
 * No network, no fs — the CLI (scripts/compute-tender-geo.ts) loads the JSON
 * snapshots and calls buildGazetteer() + resolvePlace().
 */
import { stripDiacritics } from './normalize'

export type PlaceKind = 'poi' | 'street' | 'urbanizacion' | 'barrio'

export interface Candidate {
  kind: PlaceKind
  name: string
  point: [number, number]
  sourceId: string
  /** Folded search strings; any one matching token-bounded is a hit. */
  needles: string[]
  /** Higher = more specific/precise (poi 4 > street 3 > urbanizacion 2 > barrio 1). */
  specificity: number
}

export interface PlaceMatch {
  point: [number, number]
  kind: PlaceKind
  name: string
  matchedText: string
  sourceId: string
}

/** Accent/case/punctuation-folded title → space-separated lowercase tokens. */
export function foldTitle(s: string): string {
  return stripDiacritics(String(s || ''))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

// Leading street-type words (folded) + connector words dropped to reach the core.
const STREET_TYPES = new Set([
  'carrer',
  'calle',
  'carretera',
  'ctra',
  'avinguda',
  'avenida',
  'avda',
  'av',
  'cami',
  'camino',
  'placa',
  'plaza',
  'ronda',
  'passeig',
  'paseo',
  'travessera',
  'travesia',
  'carrero',
  'grup',
  'partida',
])
const CONNECTORS = new Set(['de', 'del', 'la', 'el', 'los', 'las', 'els', 'les', 'l', 'dels', 'd'])

// Neither the municipality NOR the province name is a locator — both saturate
// contract titles ("… en Riba-roja de Túria, València"). Any needle made solely
// of these (plus connectors/types) is dropped, so "Avinguda de Riba-roja de
// Túria" or "Carretera de València" (matched only via the province tail of a
// postal address) can't swallow unrelated contracts.
const MUNI_TOKENS = new Set([
  'riba',
  'roja',
  'ribarroja',
  'turia',
  'valencia',
  'valencià',
  'valenciana',
  'valenciano',
])

// Generic words that appear in procurement boilerplate ("carácter social",
// "vía pública", "polideportivo municipal") — too common to locate a contract.
const COMMON_WORDS = new Set([
  'social',
  'publica',
  'publico',
  'publics',
  'publiques',
  'municipal',
  'municipals',
  'general',
  'generals',
  'local',
  'locals',
  'comarcal',
  'provincial',
  'regional',
  'nova',
  'nou',
  'nous',
  'noves',
  'nueva',
  'nuevo',
  'vella',
  'vell',
  'vells',
  'major',
  'majors',
  'mayor',
  'menor',
  'menors',
  'principal',
  'centre',
  'centro',
  'centres',
  'centros',
  'zona',
  'zones',
  'zonas',
  'obra',
  'obres',
  'obras',
  'varios',
  'varias',
  'diversos',
  'diversa',
  'verda',
  'verde',
  'verd',
])

// Generic leading words dropped from a POI name to reach its distinctive core.
const POI_GENERICS = new Set([
  'ceip',
  'colegio',
  'collegi',
  'escola',
  'escuela',
  'ies',
  'parc',
  'parque',
  'jardi',
  'jardin',
  'poliesportiu',
  'polideportivo',
  'pavello',
  'pabellon',
  'piscina',
  'biblioteca',
  'casa',
  'centre',
  'centro',
  'mercat',
  'mercado',
  'cementeri',
  'cementerio',
  'tanatori',
  'museu',
  'museo',
  'auditori',
  'auditorio',
])

/** Drop leading type + connector tokens from a folded street name. */
export function streetCore(foldedName: string): string {
  const toks = foldedName.split(' ').filter(Boolean)
  let i = 0
  if (toks[i] && STREET_TYPES.has(toks[i])) i++
  while (toks[i] && CONNECTORS.has(toks[i])) i++
  return toks.slice(i).join(' ')
}

function poiCore(foldedName: string): string {
  const toks = foldedName.split(' ').filter(Boolean)
  let i = 0
  if (toks[i] && POI_GENERICS.has(toks[i])) i++
  while (toks[i] && CONNECTORS.has(toks[i])) i++
  return toks.slice(i).join(' ')
}

/**
 * Is a needle distinctive enough to safely locate a contract? Conservative by
 * design — an honest miss beats a wrong placement:
 *  - reject needles made ENTIRELY of municipality-name + connector + street-type
 *    tokens (e.g. "riba roja de turia");
 *  - a multi-word needle (matched as a contiguous phrase) is fine as long as it
 *    carries a non-generic token somewhere ("camp de turia" ok, "centre social"
 *    dropped);
 *  - a single-token needle must be ≥5 chars and neither generic nor a muni word
 *    ("sagunt"/"pagos" ok, "major"/"social" dropped).
 */
export function needleDistinctive(needle: string): boolean {
  const toks = needle.split(' ').filter(Boolean)
  if (toks.length === 0) return false
  const nonMuni = toks.filter(
    (t) => !MUNI_TOKENS.has(t) && !CONNECTORS.has(t) && !STREET_TYPES.has(t),
  )
  if (nonMuni.length === 0) return false
  if (toks.length >= 2) return nonMuni.some((t) => !COMMON_WORDS.has(t) && t.length >= 3)
  const t = toks[0]
  return t.length >= 5 && !COMMON_WORDS.has(t) && !MUNI_TOKENS.has(t)
}

function dedupe(list: string[]): string[] {
  return [...new Set(list.filter(Boolean))]
}

interface GazetteerInput {
  streets?: Array<{ slug: string; name: string; kind?: string; point: [number, number] }>
  pois?: Array<{ id: string; name: string; category?: string; lat: number; lng: number }>
  zones?: Array<{ slug: string; name: string; centroid: [number, number] }>
  zoneAliases?: Record<string, string[]>
}

/** Build the candidate list from the loaded snapshots. */
export function buildGazetteer(input: GazetteerInput): Candidate[] {
  const out: Candidate[] = []

  for (const p of input.pois || []) {
    const full = foldTitle(p.name)
    const needles = dedupe([full, poiCore(full)]).filter(needleDistinctive)
    out.push({
      kind: 'poi',
      name: p.name,
      point: [p.lat, p.lng],
      sourceId: p.id,
      needles,
      specificity: 4,
    })
  }

  for (const s of input.streets || []) {
    const full = foldTitle(s.name)
    const needles = dedupe([full, streetCore(full)]).filter(needleDistinctive)
    out.push({
      kind: 'street',
      name: s.name,
      point: s.point,
      sourceId: s.slug,
      needles,
      specificity: 3,
    })
  }

  const zoneBySlug = new Map((input.zones || []).map((z) => [z.slug, z]))
  for (const [slug, aliases] of Object.entries(input.zoneAliases || {})) {
    const zone = zoneBySlug.get(slug)
    if (!zone || !aliases.length) continue
    // Curated aliases are already conservative; keep any that clear the gate.
    const needles = dedupe(aliases.map(foldTitle)).filter(needleDistinctive)
    if (!needles.length) continue
    out.push({
      kind: 'urbanizacion',
      name: zone.name,
      point: zone.centroid,
      sourceId: slug,
      needles,
      specificity: 2,
    })
  }

  for (const z of input.zones || []) {
    const full = foldTitle(z.name)
    const needles = dedupe([full, streetCore(full)]).filter(needleDistinctive)
    out.push({
      kind: 'barrio',
      name: z.name,
      point: z.centroid,
      sourceId: z.slug,
      needles,
      specificity: 1,
    })
  }

  return out.filter((c) => c.needles.length > 0)
}

// A street match is only trusted when the TITLE actually carries a street-type
// word — "asfaltado en C/ València" is a street reference; "subvención en
// Valencia" is not. This context gate kills toponym collisions (València,
// Generalitat, Canal…) far more reliably than blocklisting every such word.
const STREET_INDICATOR_TOKENS = new Set([
  'c',
  'cl',
  'calle',
  'carrer',
  'carrers',
  'avinguda',
  'avenida',
  'avda',
  'av',
  'cami',
  'camino',
  'carretera',
  'ctra',
  'cv',
  'placa',
  'plaza',
  'passeig',
  'paseo',
  'ronda',
  'travessera',
  'carrero',
  'senda',
  'pl',
  'partida',
])

function hasStreetIndicator(foldedTitle: string): boolean {
  return foldedTitle.split(' ').some((t) => STREET_INDICATOR_TOKENS.has(t))
}

/** Token-bounded: needle must be a run of whole space-separated tokens. */
function matches(paddedTitle: string, needle: string): boolean {
  return needle.length > 0 && paddedTitle.includes(` ${needle} `)
}

/**
 * Resolve a folded title to its most specific place, or null. Among all
 * matching candidates, the winner has the highest specificity; ties break on
 * the longest matched needle (the more specific name).
 */
export function resolvePlace(
  foldedTitle: string,
  candidates: Candidate[],
  opts: { allowPoi?: boolean } = {},
): PlaceMatch | null {
  const { allowPoi = true } = opts
  const padded = ` ${foldedTitle} `
  const streetOk = hasStreetIndicator(foldedTitle)
  let best: PlaceMatch | null = null
  let bestScore = -1
  let bestLen = -1
  for (const c of candidates) {
    // A street needs a street-type word in the title; named places (POI/urb/
    // barrio) do not. A POI (point facility) is only trusted for works — a
    // "suministro para la Policía Local" is FOR the dept, not located AT it.
    if (c.kind === 'street' && !streetOk) continue
    if (c.kind === 'poi' && !allowPoi) continue
    let matchedLen = -1
    for (const n of c.needles) {
      if (matches(padded, n) && n.length > matchedLen) matchedLen = n.length
    }
    if (matchedLen < 0) continue
    if (c.specificity > bestScore || (c.specificity === bestScore && matchedLen > bestLen)) {
      bestScore = c.specificity
      bestLen = matchedLen
      best = {
        point: c.point,
        kind: c.kind,
        name: c.name,
        matchedText: c.name,
        sourceId: c.sourceId,
      }
    }
  }
  return best
}
