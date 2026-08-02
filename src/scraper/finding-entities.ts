/**
 * Organisation names asserted in a published finding's prose that appear
 * nowhere in the data we publish.
 *
 * The case that motivated this: a finding told readers "según el registro
 * municipal ... la empresa FCC" operated under an emergency contract replacing
 * Garbialdi. FCC appears in **zero** of 1,231 contract rows. A verbal
 * allegation from the floor had been written up as documentary fact, naming two
 * companies, and nothing caught it — quote fidelity was perfect, referential
 * integrity was perfect, the claim ids all resolved. The defect lived entirely
 * in the summary's prose.
 *
 * A name lookup catches it deterministically: no model, no embedding, no
 * judgement. Either the company is in the data or it is not.
 *
 * IMPORTANT — this produces a REVIEW QUEUE, not a verdict. Naming an absent
 * company is often perfectly correct: one finding accurately reports that a
 * councillor *asked whether* FCC was working, which is a true statement about
 * a company we have no contract for. So the check compares against a committed
 * baseline of already-reviewed names and reports only what is new. Same shape
 * as `.vocabulary-census.json`, and for the same reason: a check that reports
 * the same known-acceptable rows every night is one people learn to ignore.
 *
 * Pure module: callers supply the findings, the haystack and the baseline.
 */

/**
 * Acronyms that are datasets, statutes, institutions or procedures — never
 * contractors. Without this the check is dominated by BDNS/PLACSP/LPACAP noise.
 */
export const NON_COMPANY_ACRONYMS: ReadonlySet<string> = new Set([
  // our own data sources + platforms
  'BDNS',
  'PLACSP',
  'TED',
  'BOE',
  'BOP',
  'DOGV',
  'INE',
  'OSM',
  'CPV',
  'SEPE',
  'CTBG',
  'ICV',
  'REE',
  'AEMET',
  'DGT',
  'FGV',
  'GTFS',
  'IPC',
  'WMS',
  'RSS',
  'API',
  'URL',
  'PDF',
  'XLS',
  'CSV',
  'JSON',
  // statutes, procedures, institutions
  'LPACAP',
  'LOREG',
  'ILP',
  'RPT',
  'SDA',
  'EELL',
  'ACR',
  'OFP',
  'AI',
  'IFCN',
  'UNE',
  'FEMA',
  'ADL',
  'PSTD',
  'FEDER',
  'RENOVE',
  'PATRICOVA',
  'CONPREL',
  'ISPA',
  'OVC',
  'AVL',
  'GVA',
  'CV',
  // parties + political groups
  'PSOE',
  'PP',
  'VOX',
  'EU',
  'UGT',
  'CCOO',
  // places / events that read as acronyms
  'DANA',
  'CEIP',
  'IES',
])

/** Words a capitalised-token scan picks up that are plainly not organisations. */
const NOT_A_NAME: ReadonlySet<string> = new Set(
  (
    'riba roja turia túria valencia valència españa generalitat ayuntamiento consistorio ' +
    'pleno plenos sesion sesión complejo pabellon pabellón malla estado según segun otro otros ' +
    'enero febrero marzo abril mayo junio julio agosto septiembre octubre noviembre diciembre'
  ).split(' '),
)

export interface EntityFlag {
  findingId: string
  name: string
  /** How the name was spotted — the `empresa X` form is far higher signal. */
  via: 'empresa-phrase' | 'acronym'
}

/**
 * Extract organisation-name candidates from a summary.
 *
 * Two patterns, deliberately narrow. Anything broader drowns in place names and
 * sentence-initial capitals, and a noisy check is a check that gets muted.
 */
export function extractOrgCandidates(text: string): { name: string; via: EntityFlag['via'] }[] {
  const out = new Map<string, EntityFlag['via']>()
  const src = text ?? ''

  // "la empresa FCC", "la mercantil X S.L." — an explicit assertion that a
  // named company exists and did something.
  // Unicode letter classes, not an ASCII-plus-accents list: Valencian razón
  // social routinely carries ü and ç ("Aigües"), and a hand-listed character
  // class silently TRUNCATES at the first character it does not know. A
  // truncated name then matches nothing in the data and is reported as a
  // missing company — a false alarm manufactured by the extractor itself.
  for (const m of src.matchAll(
    /\b(?:empresa|mercantil|adjudicataria|adjudicatario|compañía|companyia|UTE)\s+(\p{Lu}[\p{L}\p{N}.&'-]*(?:\s+\p{Lu}[\p{L}\p{N}.&'-]*){0,2})/gu,
  )) {
    const name = m[1].trim().replace(/[.,;]$/, '')
    if (name.length >= 2 && !NOT_A_NAME.has(name.toLowerCase())) out.set(name, 'empresa-phrase')
  }

  // Bare ALL-CAPS acronyms, minus the known vocabulary.
  for (const m of src.matchAll(/\b(\p{Lu}{3,})\b/gu)) {
    const name = m[1]
    if (NON_COMPANY_ACRONYMS.has(name)) continue
    if (NOT_A_NAME.has(name.toLowerCase())) continue
    if (!out.has(name)) out.set(name, 'acronym')
  }

  return [...out.entries()].map(([name, via]) => ({ name, via }))
}

export function foldForLookup(s: string): string {
  return (s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[.,;:()«»"']/g, '')
}

export interface FindingLike {
  id: string
  summary?: string
}

/**
 * Names asserted in a summary that appear nowhere in `haystack` (the
 * concatenated titles/assignees of everything we publish) and are not already
 * in `baseline` (names a human has looked at).
 */
export function findUnbackedOrgNames(
  findings: readonly FindingLike[],
  haystack: string,
  baseline: readonly string[] = [],
): EntityFlag[] {
  const hay = foldForLookup(haystack)
  const seen = new Set(baseline.map((b) => foldForLookup(b)))
  const flags: EntityFlag[] = []
  for (const f of findings) {
    for (const { name, via } of extractOrgCandidates(f.summary ?? '')) {
      const needle = foldForLookup(name)
      if (needle.length < 3) continue
      if (hay.includes(needle)) continue
      if (seen.has(needle)) continue
      flags.push({ findingId: f.id, name, via })
    }
  }
  return flags
}
