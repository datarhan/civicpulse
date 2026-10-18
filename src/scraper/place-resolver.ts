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

/**
 * Las clases de lugar que el resolutor sabe situar, de la más precisa a la más
 * gruesa. Exportadas para que el mapa rotule cada una por su clave de catálogo
 * (`map.lugar.<clase>`) y `tests/i18n-mapa-enums.test.ts` las lea de aquí en vez
 * de recitarlas. Ninguna puerta del resolutor cambia.
 */
export const PLACE_KINDS = ['poi', 'street', 'urbanizacion', 'barrio'] as const

export type PlaceKind = (typeof PLACE_KINDS)[number]

export interface Candidate {
  kind: PlaceKind
  name: string
  point: [number, number]
  sourceId: string
  /** Folded search strings; any one matching token-bounded is a hit. */
  needles: string[]
  /** Higher = more specific/precise (poi 4 > street 3 > urbanizacion 2 > barrio 1). */
  specificity: number
  /** Raw OSM tag for POIs (townhall/cemetery/library…) — the singleton facility matcher. */
  osmKind?: string
  /** Frases plegadas dentro de las cuales una aguja NO nombra este sitio
   *  (ZONE_ALIAS_EXCLUSIONS): «yacimiento arqueológico de Valencia la Vella» no
   *  es la urbanización. */
  notWithin?: string[]
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
  return (
    stripDiacritics(String(s || ''))
      .toLowerCase()
      // Una sigla con puntos es UN token: «C.D. La Mallá» → «cd la malla». Sin
      // esto se plegaba a «c d la malla», y una «c» suelta es el indicador de
      // «C/» (STREET_INDICATOR_TOKENS): el contrato 85485, limpieza del C.D. La
      // Mallá, acabó pinchado en el «Carrer de la Piscina».
      // También sin el último punto: «C.E.I.P Eres Altes» (266371, 310978).
      .replace(/\b[a-z](?:\.[a-z])+\.?(?![a-z])/g, (m) => `${m.replace(/\./g, '')} `)
      // Lo mismo con la letra de una meta ODS («meta 9.5.c» → «9 5c»), que daba
      // permiso de calle a una app municipal (1402847).
      .replace(/(\d)\.([a-z])\b/g, '$1$2')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim()
  )
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
  // «carril peatonal», «paso peatonal»: un adjetivo, no la vía que OSM llama
  // «Peatonal» a secas.
  'peatonal',
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

/**
 * OSM rotula los centros educativos por su nombre oficial («Col·legi d'Educació
 * Infantil i Primària Eres Altes») y los títulos los nombran por la sigla
 * («CEIP Eres Altes», «C.E.I.P Eres Altes»). La sigla son las iniciales de ese
 * prefijo, así que la aguja «<sigla> <núcleo>» se deriva del nombre y no se
 * mantiene a mano. Sólo con la sigla delante: el núcleo a secas («Eres Altes»,
 * «el Quint») es también una calle o una partida, y no se ofrece.
 *
 * El punto volado parte la palabra: «Col·legi» se pliega a «col legi», de modo
 * que poiCore no la quita y la única aguja del colegio era su nombre entero.
 * Se junta aquí y no en foldTitle, que pliega también cada título.
 *
 * Medido el 2026-10-17 sobre tenders.json: sólo cambian obras que escriben
 * «CEIP <nombre>» — seis sin pin pasan a su colegio y tres pasan del centroide
 * de el Pou d'Escoto (alias «escoto») al CEIP Mas d'Escoto, a 0,9 km de él.
 * Ningún título escribe «IES» todavía.
 */
const SIGLAS_EDUCATIVAS: Array<[prefijo: string, sigla: string]> = [
  ['collegi d educacio infantil i primaria', 'ceip'],
  ['institut d educacio secundaria', 'ies'],
]

function siglaEducativa(foldedName: string): string | null {
  const nombre = foldedName.replace(/^col legi /, 'collegi ')
  for (const [prefijo, sigla] of SIGLAS_EDUCATIVAS) {
    if (!nombre.startsWith(`${prefijo} `)) continue
    const nucleo = nombre.slice(prefijo.length + 1)
    return nucleo ? `${sigla} ${nucleo}` : null
  }
  return null
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

/**
 * Variante castellana de una aguja con la conjunción valenciana «i»: OSM rotula
 * «Carrer de Garelli i Pastor» y el título dice «calle Garelli y Pastor». Sólo
 * una «i» interior es conjunción; la final es un ordinal («Jaume I») y se queda.
 * 2026-10-17: así quedaba sin situar un contrato que daba su dirección exacta.
 */
function conjuncionCastellana(needle: string): string | null {
  const toks = needle.split(' ')
  let cambia = false
  const out = toks.map((t, i) => {
    if (t === 'i' && i > 0 && i < toks.length - 1) {
      cambia = true
      return 'y'
    }
    return t
  })
  return cambia ? out.join(' ') : null
}

/**
 * Instalaciones de las que el pueblo tiene UNA, nombradas por su tipo y no por
 * su nombre propio: «obras en el Cementerio Municipal» no lleva «San Jaime». La
 * frase entra como aguja del único POI de ese `osmKind`; con cero o con dos no
 * entra en ninguno, y la puerta `allowPoi` (sólo obras) sigue mandando.
 *
 * Sólo el cementerio. «Ayuntamiento» va en casi todos los títulos como órgano de
 * contratación, no como lugar; biblioteca y mercado no se han medido. La misma
 * correspondencia ya vivía en `matchFacilityType` (vía LLM + firma): contratos
 * «cementerio municipal» aprobados a mano el 2026-07-05 mientras otros con la
 * misma frase seguían sin pin hasta el 2026-10-17.
 *
 * Dos límites, sabidos y aceptados:
 *  - Sólo cuenta lo que trae `osmKind`, y las filas de gazetteer-supplement.json
 *    no lo traen: un cementerio añadido a mano allí no entra en el recuento ni
 *    recibe la aguja. Si el punto del cementerio de OSM resultara no ser el
 *    municipal, la corrección va por place-overrides.json (contrato a contrato),
 *    no por el suplemento.
 *  - «cementerio municipal de <otro municipio>» también se situaría aquí. Ningún
 *    título real tiene esa forma; se miró y se acepta.
 */
const SINGLETON_FACILITY_NEEDLES: Array<{ needles: string[]; kinds: string[] }> = [
  { needles: ['cementerio municipal', 'cementeri municipal'], kinds: ['cemetery', 'grave_yard'] },
]

interface GazetteerInput {
  streets?: Array<{ slug: string; name: string; kind?: string; point: [number, number] }>
  pois?: Array<{
    id: string
    name: string
    category?: string
    kind?: string
    lat: number
    lng: number
  }>
  zones?: Array<{ slug: string; name: string; centroid: [number, number] }>
  zoneAliases?: Record<string, string[]>
  /** Por slug de zona: frases en las que su alias nombra otro sitio homónimo. */
  zoneAliasExclusions?: Record<string, string[]>
}

function notWithinDe(input: GazetteerInput, slug: string): { notWithin?: string[] } {
  const frases = (input.zoneAliasExclusions?.[slug] ?? []).map(foldTitle).filter(Boolean)
  return frases.length ? { notWithin: frases } : {}
}

/**
 * ¿La aparición de `start..end` (en tokens) cae dentro de alguna de `frases`?
 * Entonces la aguja nombra otro sitio homónimo y no cuenta como este.
 */
function dentroDeFrase(tokens: string[], start: number, end: number, frases: string[]): boolean {
  return frases.some((f) => {
    const ft = f.split(' ')
    for (let k = Math.max(0, end - ft.length); k <= start; k++)
      if (ft.every((t, x) => tokens[k + x] === t)) return true
    return false
  })
}

/** ¿Aparece la aguja `n` en `tokens` fuera de las frases de exclusión de `c`? */
function apareceLibre(tokens: string[], n: string, c: Candidate): boolean {
  const nt = n.split(' ')
  for (let i = 0; i + nt.length <= tokens.length; i++)
    if (
      nt.every((t, k) => tokens[i + k] === t) &&
      !dentroDeFrase(tokens, i, i + nt.length, c.notWithin ?? [])
    )
      return true
  return false
}

/** Build the candidate list from the loaded snapshots. */
export function buildGazetteer(input: GazetteerInput): Candidate[] {
  const out: Candidate[] = []

  for (const p of input.pois || []) {
    const full = foldTitle(p.name)
    const needles = dedupe([full, poiCore(full), siglaEducativa(full) ?? '']).filter(
      needleDistinctive,
    )
    out.push({
      kind: 'poi',
      name: p.name,
      point: [p.lat, p.lng],
      sourceId: p.id,
      needles,
      specificity: 4,
      osmKind: p.kind,
    })
  }

  for (const { needles, kinds } of SINGLETON_FACILITY_NEEDLES) {
    const deEseTipo = out.filter((c) => c.kind === 'poi' && c.osmKind && kinds.includes(c.osmKind))
    if (new Set(deEseTipo.map((c) => c.sourceId)).size !== 1) continue
    for (const c of deEseTipo) c.needles = dedupe([...c.needles, ...needles])
  }

  for (const s of input.streets || []) {
    const full = foldTitle(s.name)
    const base = [full, streetCore(full)]
    const needles = dedupe([...base, ...base.map(conjuncionCastellana)]).filter(
      (n): n is string => typeof n === 'string' && needleDistinctive(n),
    )
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
    // Curated aliases are already conservative. A multi-word alias is trusted as
    // written: «valencia la vella» fails needleDistinctive («valencia» is a
    // municipality token, «vella» a common word), and the resolver could not see
    // the urbanización at all. A single word still has to clear the gate.
    const needles = dedupe(aliases.map(foldTitle)).filter(
      (n) => n.includes(' ') || needleDistinctive(n),
    )
    if (!needles.length) continue
    out.push({
      kind: 'urbanizacion',
      name: zone.name,
      point: zone.centroid,
      sourceId: slug,
      needles,
      specificity: 2,
      ...notWithinDe(input, slug),
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
      ...notWithinDe(input, z.slug),
    })
  }

  // Keep candidates even when they have no title-needle (e.g. "Carrer Major",
  // whose only core is a common word): resolvePlace simply never matches them
  // via a title, but matchNameToGazetteer (the LLM name path) needs them — that
  // cross-language case is exactly what the LLM boost exists to catch.
  return out
}

// A street match is only trusted when the TITLE actually carries a street-type
// word — "asfaltado en C/ València" is a street reference; "subvención en
// Valencia" is not. This context gate kills toponym collisions (València,
// Generalitat, Canal…) far more reliably than blocklisting every such word.
const STREET_INDICATOR_TOKENS = new Set([
  'c',
  'cl',
  'calle',
  'calles',
  'caminos',
  'avenidas',
  'carreteras',
  'plazas',
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

// ─── LLM name → gazetteer point ──────────────────────────────────────────────
// The LLM extracts a place NAME from a title (it has already judged that a place
// is referenced), so this matcher is more permissive than the conservative
// title→needle path: it compares the LLM name against candidate NAMES, keeping
// common words ("Mayor"), and allows a 1-char edit so cross-language spellings
// (Spanish "Mayor" ↔ Valencian "Major", "Sagunto" ↔ "Sagunt") still resolve.
// Crucially the returned POINT is always the gazetteer's — never the LLM's.

// Facility-TYPE words dropped from a name so the matcher keys on the distinctive
// proper noun. This is what lets the LLM's "CEIP Cervantes" reach OSM's "Col·legi
// d'Educació Infantil i Primària Cervantes", or "Complejo deportivo La Mallà"
// reach "Complex Esportiu La Mallà" — the type word differs by language, the
// name (Cervantes / La Mallà) doesn't. Used ONLY by the LLM name-matcher, so it
// never touches the deterministic resolver. Deliberately excludes ambiguous
// words that can BE the distinctive name (camp → Camp de Túria, mas, torre).
const FACILITY_GENERICS = new Set([
  'ceip',
  'colegio',
  'collegi',
  'escola',
  'escuela',
  'ies',
  'institut',
  'educacio',
  'infantil',
  'primaria',
  'cicle',
  'poliesportiu',
  'polideportivo',
  'pavello',
  'pabellon',
  'estadi',
  'estadio',
  'esportiu',
  'deportivo',
  'deportiva',
  'complex',
  'complejo',
  'piscina',
  'biblioteca',
  'mercat',
  'mercado',
  'cementeri',
  'cementerio',
  'auditori',
  'auditorio',
  'conservatori',
  'conservatorio',
  'museu',
  'museo',
  'tanatori',
  'ajuntament',
  'ayuntamiento',
  'consistorial',
  'casa',
  'polivalente',
  // Generic qualifier: a bare "X Municipal" must not match a different
  // "Y Municipal" on the shared word — strip it so only a proper noun matches.
  'municipal',
  'municipals',
  'centre',
  'centro',
  'parc',
  'parque',
  'jardi',
  'jardin',
])

/** Locating tokens of a name: drop connectors, street-types, muni/province,
 *  facility-type words, and bare numbers (house numbers are not locators). */
function nameTokens(name: string): string[] {
  return foldTitle(name)
    .split(' ')
    .filter(
      (t) =>
        t &&
        !/^\d+$/.test(t) &&
        !CONNECTORS.has(t) &&
        !STREET_TYPES.has(t) &&
        !MUNI_TOKENS.has(t) &&
        !FACILITY_GENERICS.has(t),
    )
}

/** Levenshtein distance, capped at 2 (we only care about ≤1). */
function editDistance(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > 1) return 2
  const dp = Array.from({ length: a.length + 1 }, (_, i) => i)
  for (let j = 1; j <= b.length; j++) {
    let prev = dp[0]
    dp[0] = j
    for (let i = 1; i <= a.length; i++) {
      const tmp = dp[i]
      dp[i] = Math.min(dp[i] + 1, dp[i - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1))
      prev = tmp
    }
  }
  return dp[a.length]
}

// Curated Spanish↔Valencian equivalents that appear in Riba-roja place names but
// are too far apart for a 1-char edit ("Paz"↔"Pau", "Castaño"↔"Castanyer"). Only
// used by the LLM name-matcher. Conservative + folded (ñ→n, accents removed);
// two tokens in the same group are treated as the same word.
const SYNONYM_GROUPS: string[][] = [
  ['paz', 'pau'],
  ['castano', 'castanyer', 'castanya'],
  ['puente', 'pont'],
  ['fuente', 'font'],
  ['iglesia', 'esglesia'],
  ['huerta', 'horta'],
  ['molino', 'moli'],
  ['horno', 'forn'],
  ['rio', 'riu'],
  ['colon', 'colom'],
  ['cruz', 'creu'],
  ['calvario', 'calvari'],
  ['virgen', 'verge'],
  ['pino', 'pi'],
  ['olmo', 'om'],
]
const SYNONYM_GROUP = new Map<string, number>()
SYNONYM_GROUPS.forEach((g, i) => g.forEach((w) => SYNONYM_GROUP.set(w, i)))
function areSynonyms(a: string, b: string): boolean {
  const ga = SYNONYM_GROUP.get(a)
  return ga !== undefined && ga === SYNONYM_GROUP.get(b)
}

/** Does token `t` appear in `ctoks` (exact, ≤1 edit for tokens ≥4 chars, or a
 *  curated Spanish↔Valencian synonym)? */
function tokenIn(t: string, ctoks: string[]): boolean {
  return ctoks.some(
    (ct) =>
      ct === t ||
      (t.length >= 4 && ct.length >= 4 && editDistance(t, ct) <= 1) ||
      areSynonyms(t, ct),
  )
}

// Generic facility TYPE terms (folded) → the OSM `kind`(s) they denote. Used
// only when a name has no distinctive proper noun ("Cementerio municipal",
// "Casa Consistorial") and there is EXACTLY ONE facility of that type in town —
// an unambiguous singleton. Deliberately excludes types the town has several of
// (sports_centre) or that are ambiguous (conservatori música vs danza).
const FACILITY_TYPE_TERMS: Array<[string, string[]]> = [
  ['ayuntamiento', ['townhall']],
  ['ajuntament', ['townhall']],
  ['consistorial', ['townhall']],
  ['cementerio', ['cemetery', 'grave_yard']],
  ['cementeri', ['cemetery', 'grave_yard']],
  ['biblioteca', ['library']],
  ['mercado', ['marketplace']],
  ['mercat', ['marketplace']],
]

/**
 * Match a generic facility name to the town's single facility of that type
 * (e.g. "Cementerio municipal" → the one cemetery). Only fires for an
 * unambiguous singleton — zero or several of a type yields no match.
 */
function matchFacilityType(llmName: string, candidates: Candidate[]): PlaceMatch | null {
  const toks = new Set(foldTitle(llmName).split(' '))
  for (const [term, kinds] of FACILITY_TYPE_TERMS) {
    if (!toks.has(term)) continue
    const matching = candidates.filter(
      (c) => c.kind === 'poi' && c.osmKind && kinds.includes(c.osmKind),
    )
    if (matching.length === 1) {
      const c = matching[0]
      return {
        point: c.point,
        kind: c.kind,
        name: c.name,
        matchedText: c.name,
        sourceId: c.sourceId,
      }
    }
  }
  return null
}

/**
 * Resolve an LLM-extracted place name to a gazetteer entry (its real point), or
 * null. First a proper-noun match (every locating token of the LLM name appears
 * in a candidate's name; ties break on specificity); then, for generic names, a
 * singleton facility-type fallback. Returns the gazetteer point — never a
 * fabricated coordinate.
 * @param {string|null|undefined} llmName
 * @param {Candidate[]} candidates
 */
export function matchNameToGazetteer(
  llmName: string | null | undefined,
  candidates: Candidate[],
): PlaceMatch | null {
  const raw = String(llmName || '')
  const toks = nameTokens(raw)
  let best: PlaceMatch | null = null
  let bestSpec = -1
  if (toks.length > 0) {
    for (const c of candidates) {
      const ctoks = nameTokens(c.name)
      if (ctoks.length === 0) continue
      if (!toks.every((t) => tokenIn(t, ctoks))) continue
      if (c.specificity > bestSpec) {
        bestSpec = c.specificity
        best = {
          point: c.point,
          kind: c.kind,
          name: c.name,
          matchedText: c.name,
          sourceId: c.sourceId,
        }
      }
    }
  }
  // Fallback for generic facility names with no distinctive token.
  return best ?? matchFacilityType(raw, candidates)
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
      if (!matches(padded, n) || n.length <= matchedLen) continue
      if (c.notWithin && !apareceLibre(foldedTitle.split(' ').filter(Boolean), n, c)) continue
      matchedLen = n.length
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

// ─── Un título, un sitio ─────────────────────────────────────────────────────
// resolvePlace elige UN ganador aunque el título nombre cinco sitios: «carril
// bici en la zona Molinet, Montealcedo, entrenaranjos, Santa Rosa y El Clot»
// (74419) publicaba un pin en Santa Rosa. Pero contar sitios a secas tampoco
// vale: medido el 17-10-2026 sobre tender-geo.json, «≥2 sitios en el título →
// sin pin» quitaba 22 pines, casi todos legítimos y ANIDADOS — «C/ Dolçaina
// (Partida Gallipont)», «C/Mas de Montes en P.I. Mas de Balo», «parcela de
// Pacadar sita en C/ Arrosals», o una calle con dos grafías en OSM («Passeig
// del Molinet» / «Passeig el Molinet») más la zona que le da nombre.
//
// Así que se cuenta por MENCIONES, no por candidatos:
//  1. Cada tramo del título que casa con algún candidato es una mención; los
//     candidatos que casan con tramos solapados son la MISMA mención («Paseo
//     Molinet» casa con las dos grafías y con la zona: es un sitio).
//  2. Una mención es un ÁREA si la precede una palabra de área («P.I.»,
//     «partida», «zona»…), si sólo casa con zonas, o si casa con una zona sin
//     palabra de calle delante («parcela de Pacadar»). Si no, es PRECISA
//     (calle o POI).
//  3. Dos grafías de la misma calle (mismo núcleo, a menos de
//     DUPLICATE_STREET_KM) son una.
//  4. ≥2 menciones precisas → sin pin. Una → pin, si cae DENTRO de cada área
//     nombrada (a menos de CONTAINMENT_KM de su centroide). Ninguna → el área,
//     si es una sola.
// «Dentro» se mide, no se supone: C/ Toledo queda a 4,9 km de Els Pous, así que
// «c/ Toledo y camí urbanización Els Pous» son dos obras y no se pincha.

/** Radio de contención: distancia máxima del punto de una calle o POI al
 *  centroide del área que el título también nombra. Medido el 17-10-2026: el
 *  más lejano de los anidados legítimos es C/ Tabalet en la Partida Gallipont
 *  (0,94 km); el más cercano de los NO contenidos, Camí de les Ànimes respecto
 *  a Els Pous (4,6 km). */
export const CONTAINMENT_KM = 1.5
/** Dos grafías OSM de una calle: Passeig del Molinet y Passeig el Molinet
 *  distan 0,36 km. */
export const DUPLICATE_STREET_KM = 1

// Delante de un nombre, dicen que el título nombra un área y no la calle
// homónima: «P.I. Mas de Balo» es el polígono, no el Carrer del Mas de Baló.
const AREA_WORDS = new Set([
  'pi',
  'poligono',
  'poligon',
  'partida',
  'pda',
  'pedania',
  'urbanizacion',
  'urbanitzacio',
  'urb',
  'zona',
  'sector',
  'barrio',
  'barri',
])

// Boilerplate de los pliegos que casa con un callejero sin nombrar sitio
// alguno: el ODS 9 «Industria, innovación e infraestructura» pinchaba en la
// Avinguda de la Indústria (4510789, 1402847, 1404560).
const BOILERPLATE = [
  'industria innovacion e infraestructura',
  'industria innovacio i infraestructura',
]

function stripBoilerplate(foldedTitle: string): string {
  let t = ` ${foldedTitle} `
  for (const b of BOILERPLATE) t = t.split(` ${b} `).join(' ')
  return t.trim()
}

export function km(a: [number, number], b: [number, number]): number {
  const r = Math.PI / 180
  const dLat = (b[0] - a[0]) * r
  const dLng = (b[1] - a[1]) * r
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.sin(dLng / 2) ** 2
  return 2 * 6371 * Math.asin(Math.sqrt(h))
}

interface Hit {
  c: Candidate
  start: number
  end: number
  len: number
}

function bestOf(hits: Hit[]): Candidate {
  let best = hits[0]
  for (const h of hits)
    if (
      h.c.specificity > best.c.specificity ||
      (h.c.specificity === best.c.specificity && h.len > best.len)
    )
      best = h
  return best.c
}

const isArea = (c: Candidate) => c.kind === 'urbanizacion' || c.kind === 'barrio'
const maxLen = (hits: Hit[]) => hits.reduce((m, h) => Math.max(m, h.len), -1)

/**
 * The single place a folded title names, or null when it names several that
 * are not nested in one another (see the block above). Same gates as
 * resolvePlace — street indicator, allowPoi — so it can only ever pin LESS.
 */
export function resolveUnambiguousPlace(
  foldedTitle: string,
  candidates: Candidate[],
  opts: { allowPoi?: boolean } = {},
): PlaceMatch | null {
  const { allowPoi = true } = opts
  const text = stripBoilerplate(foldedTitle)
  const tokens = text.split(' ').filter(Boolean)
  const padded = ` ${text} `
  const streetOk = hasStreetIndicator(text)

  const hits: Hit[] = []
  const gated: Hit[] = []
  for (const c of candidates) {
    if (c.kind === 'street' && !streetOk) continue
    const into = c.kind === 'poi' && !allowPoi ? gated : hits
    for (const n of c.needles) {
      if (!matches(padded, n)) continue
      const nt = n.split(' ')
      for (let i = 0; i + nt.length <= tokens.length; i++)
        if (
          nt.every((t, k) => tokens[i + k] === t) &&
          !dentroDeFrase(tokens, i, i + nt.length, c.notWithin ?? [])
        )
          into.push({ c, start: i, end: i + nt.length, len: n.length })
    }
  }
  if (hits.length === 0) return null

  // 1. Tramos solapados → una mención.
  hits.sort((a, b) => a.start - b.start || b.end - a.end)
  const mentions: Hit[][] = []
  let end = -1
  for (const h of hits) {
    if (h.start < end) mentions[mentions.length - 1].push(h)
    else mentions.push([h])
    end = Math.max(end, h.end)
  }

  // Un POI que la puerta de obras no deja pinchar sigue siendo el sitio que el
  // título nombra. Si su nombre contiene el de una zona o una calle, la mención
  // es el POI y no se pincha nada. Si no, la zona recogería el pin: la puerta
  // de obras no deja pinchar un suministro en el «yacimiento arqueológico de
  // Valencia la Vella», y caía en la urbanización homónima, a 0,72 km.
  for (const m of mentions) {
    const start = m[0].start
    const fin = Math.max(...m.map((h) => h.end))
    if (gated.some((g) => g.start < fin && g.end > start && g.len > maxLen(m))) return null
  }

  // 2. Área o precisa.
  const precise: Candidate[] = []
  const areas: Candidate[] = []
  for (const m of mentions) {
    const start = m[0].start
    let p = start - 1
    while (p >= 0 && CONNECTORS.has(tokens[p])) p--
    const before = p >= 0 ? tokens[p] : ''
    const areaWord = AREA_WORDS.has(before) || AREA_WORDS.has(tokens[start])
    const streetWord =
      STREET_INDICATOR_TOKENS.has(before) || STREET_INDICATOR_TOKENS.has(tokens[start])
    const zoneHits = m.filter((h) => isArea(h.c))
    const preciseHits = m.filter((h) => !isArea(h.c))
    const asArea =
      areaWord ||
      preciseHits.length === 0 ||
      (zoneHits.length > 0 && !streetWord && maxLen(zoneHits) >= maxLen(preciseHits))
    if (asArea) areas.push(bestOf(zoneHits.length > 0 ? zoneHits : preciseHits))
    else precise.push(bestOf(preciseHits))
  }

  // 3. Mismo sitio dos veces: mismo id, o dos grafías de una calle.
  const sameStreet = (a: Candidate, b: Candidate) =>
    a.kind === 'street' &&
    b.kind === 'street' &&
    streetCore(foldTitle(a.name)) === streetCore(foldTitle(b.name)) &&
    km(a.point, b.point) <= DUPLICATE_STREET_KM
  const distinct = (list: Candidate[]) =>
    list.filter(
      (c, i) => !list.slice(0, i).some((o) => o.sourceId === c.sourceId || sameStreet(o, c)),
    )
  const sitios = distinct(precise)
  const zonas = distinct(areas).filter((z) => !sitios.some((s) => s.sourceId === z.sourceId))

  // 4. Decidir.
  let chosen: Candidate | null = null
  if (sitios.length === 1) {
    const s = sitios[0]
    if (zonas.every((z) => km(s.point, z.point) <= CONTAINMENT_KM)) chosen = s
  } else if (sitios.length === 0 && zonas.length === 1) {
    chosen = zonas[0]
  }
  return chosen
    ? {
        point: chosen.point,
        kind: chosen.kind,
        name: chosen.name,
        matchedText: chosen.name,
        sourceId: chosen.sourceId,
      }
    : null
}
