/**
 * Canonical department (concejalía) taxonomy.
 *
 * Four upstream data sources each store department names differently:
 *   - officials.json            "Urbanismo"          (TitleCase, accented Spanish)
 *   - plenos-agendas.json       "URBANISMO"          (UPPERCASE, sometimes un-accented)
 *   - pleno-votes.json          optional string field (human-curated)
 *   - queja-router categories   "urbanismo"          (snake_case lowercase enum)
 *
 * This module is the single source of truth that maps all of them onto
 * one kebab-case slug per concejalía. The canonical set was
 * hand-derived from the real 40 portfolio fragments + 27 agenda
 * department strings + 29 queja categories on 2026-04-21. It stays
 * narrow on purpose: fewer slugs → more cross-source matches → more
 * accountability coverage per department card.
 *
 * Conservative behavior:
 *   - canonicalizeDepartment returns null for unrecognized input.
 *     Callers must render an honest "sin departamento asignado" state,
 *     not guess.
 *   - resolveResponsibleOfficial returns null when no official owns the
 *     slug (e.g. alcaldía-reserved areas). The UI must not fabricate a
 *     responsible concejal.
 */

import { stripDiacritics, slugify } from './normalize'

export const ALLOWED_DEPARTMENT_SLUGS = [
  'alcaldia',
  'urbanismo',
  'obras-publicas',
  'medio-ambiente',
  'movilidad',
  'deportes',
  'educacion',
  'cultura',
  'fiestas',
  'juventud',
  'mayores',
  'servicios-sociales',
  'salud',
  'igualdad',
  'transparencia',
  'hacienda',
  'contratacion',
  'seguridad',
  'empleo-economia',
  'comercio',
  'agricultura',
  'turismo',
  'vivienda',
  'recursos-humanos',
  'servicios-generales',
  'bienestar-animal',
  'innovacion',
  'comunicacion',
] as const

export type DepartmentSlug = (typeof ALLOWED_DEPARTMENT_SLUGS)[number]

export interface DepartmentLabel {
  es: string
  ca: string
}

export const DEPARTMENT_LABEL: Record<DepartmentSlug, DepartmentLabel> = {
  alcaldia: { es: 'Alcaldía', ca: 'Alcaldia' },
  urbanismo: { es: 'Urbanismo', ca: 'Urbanisme' },
  'obras-publicas': { es: 'Obras públicas', ca: 'Obres públiques' },
  'medio-ambiente': { es: 'Medio ambiente', ca: 'Medi ambient' },
  movilidad: { es: 'Movilidad', ca: 'Mobilitat' },
  deportes: { es: 'Deportes', ca: 'Esports' },
  educacion: { es: 'Educación', ca: 'Educació' },
  cultura: { es: 'Cultura', ca: 'Cultura' },
  fiestas: { es: 'Fiestas', ca: 'Festes' },
  juventud: { es: 'Juventud', ca: 'Joventut' },
  mayores: { es: 'Mayores', ca: 'Majors' },
  'servicios-sociales': { es: 'Servicios sociales', ca: 'Serveis socials' },
  salud: { es: 'Salud', ca: 'Salut' },
  igualdad: { es: 'Igualdad', ca: 'Igualtat' },
  transparencia: { es: 'Transparencia', ca: 'Transparència' },
  hacienda: { es: 'Hacienda', ca: 'Hisenda' },
  contratacion: { es: 'Contratación', ca: 'Contractació' },
  seguridad: { es: 'Seguridad', ca: 'Seguretat' },
  'empleo-economia': { es: 'Empleo y economía', ca: 'Ocupació i economia' },
  comercio: { es: 'Comercio', ca: 'Comerç' },
  agricultura: { es: 'Agricultura', ca: 'Agricultura' },
  turismo: { es: 'Turismo', ca: 'Turisme' },
  vivienda: { es: 'Vivienda', ca: 'Habitatge' },
  'recursos-humanos': { es: 'Recursos humanos', ca: 'Recursos humans' },
  'servicios-generales': { es: 'Servicios generales', ca: 'Serveis generals' },
  'bienestar-animal': { es: 'Bienestar animal', ca: 'Benestar animal' },
  innovacion: { es: 'Innovación', ca: 'Innovació' },
  comunicacion: { es: 'Comunicación', ca: 'Comunicació' },
}

// Keyword → slug rules. Evaluated in order, first match wins. Keys are
// already normalized (stripDiacritics + toLowerCase) so the rule engine
// can do plain substring tests. Multi-word keys let us match phrases.
const RULES: Array<{ match: string; slug: DepartmentSlug; whole?: boolean }> = [
  // ── Valencian ────────────────────────────────────────────────────────────
  // The corporation holds its plenos in Valencian, so agenda items arrive as
  // "MEDI AMBIENT, Expedient 4297/2024/GEN – …" while this table was
  // Spanish-only: 2 of 24 real department names resolved, leaving 328 of 362
  // agenda items with no concejalía and 91% of council business invisible per
  // official. These are the exact names the ayuntamiento writes, not fuzzy
  // inference. Listed first, and most-specific-first within the block, because
  // matching is first-wins.
  { match: 'servicis juridics', slug: 'servicios-generales' },
  { match: 'serveis juridics', slug: 'servicios-generales' },
  { match: 'servicis socials', slug: 'servicios-sociales' },
  { match: 'serveis socials', slug: 'servicios-sociales' },
  { match: 'servicis generals', slug: 'servicios-generales' },
  { match: 'serveis generals', slug: 'servicios-generales' },
  { match: 'benestar animal', slug: 'bienestar-animal' },
  { match: 'seguretat ciutadana', slug: 'seguridad' },
  { match: 'obres publiques', slug: 'obras-publicas' },
  { match: 'medi ambient', slug: 'medio-ambiente' },
  { match: 'emergencia climatica', slug: 'medio-ambiente' },
  { match: 'parcs i jardins', slug: 'medio-ambiente' },
  { match: 'urbanisme', slug: 'urbanismo' },
  { match: 'activitats', slug: 'urbanismo' },
  { match: 'joventut', slug: 'juventud' },
  { match: 'igualtat', slug: 'igualdad' },
  { match: 'contractacio', slug: 'contratacion' },
  // Intervención is the comptroller — the hacienda area in this corporation.
  { match: 'intervencio', slug: 'hacienda' },
  { match: 'hisenda', slug: 'hacienda' },
  { match: 'tresoreria', slug: 'hacienda' },
  { match: 'innovacio', slug: 'innovacion' },
  { match: 'educacio', slug: 'educacion' },
  { match: 'esports', slug: 'deportes' },
  { match: 'comerc', slug: 'comercio' },
  // Whole-word: diacritics are stripped before matching, so Valencian
  // "ocupació" folds to `ocupacio` while Spanish "ocupación" folds to
  // `ocupacion` — and a substring test matches both. The second is squatting,
  // not employment, and it filed a Xarxa MAO motion under Empleo y economía.
  { match: 'ocupacio', slug: 'empleo-economia', whole: true },
  { match: 'foment economic', slug: 'empleo-economia' },
  { match: 'festes', slug: 'fiestas' },
  { match: 'turisme', slug: 'turismo' },
  { match: 'habitatge', slug: 'vivienda' },
  { match: 'participacio', slug: 'transparencia' },
  { match: 'transparencia', slug: 'transparencia' },
  { match: 'mobilitat', slug: 'movilidad' },
  { match: 'majors', slug: 'mayores' },
  { match: 'comunicacio', slug: 'comunicacion' },
  // Whole-word: "mitjans personals i materials" / "medios personales" are the
  // contractor's means of performance, not staffing. Two contract-penalty
  // items were filed under Recursos Humanos because of it.
  { match: 'personal', slug: 'recursos-humanos', whole: true },
  { match: 'secretaria', slug: 'servicios-generales' },
  { match: 'sanitat', slug: 'salud' },
  { match: 'agricultura', slug: 'agricultura' },
  { match: 'cultura', slug: 'cultura' },
  // ── Spanish ──────────────────────────────────────────────────────────────
  // Most specific first — "servicios juridicos" must match before "servicios"
  { match: 'bienestar animal', slug: 'bienestar-animal' },
  { match: 'protocolo y bienestar', slug: 'bienestar-animal' },
  { match: 'servicios juridicos', slug: 'servicios-generales' },
  { match: 'servicios generales', slug: 'servicios-generales' },
  { match: 'servicios publicos', slug: 'servicios-generales' },
  { match: 'administracion y servicios', slug: 'servicios-generales' },
  { match: 'secretaria', slug: 'servicios-generales' },
  { match: 'servicios sociales', slug: 'servicios-sociales' },
  { match: 'accion social', slug: 'servicios-sociales' },
  { match: 'politicas inclusivas', slug: 'servicios-sociales' },
  { match: 'infancia y adolescencia', slug: 'servicios-sociales' },
  { match: 'memoria historica', slug: 'servicios-sociales' },
  { match: 'recursos humanos', slug: 'recursos-humanos' },
  { match: 'medio ambiente', slug: 'medio-ambiente' },
  { match: 'emergencia climatica', slug: 'medio-ambiente' },
  { match: 'parques y jardines', slug: 'medio-ambiente' },
  { match: 'zonas verdes', slug: 'medio-ambiente' },
  { match: 'agenda 2030', slug: 'medio-ambiente' },
  { match: 'residuos', slug: 'medio-ambiente' },
  { match: 'limpieza', slug: 'medio-ambiente' },
  { match: 'obra publica', slug: 'obras-publicas' },
  { match: 'obras publicas', slug: 'obras-publicas' },
  { match: 'edificios publicos', slug: 'obras-publicas' },
  { match: 'actividades y edificios', slug: 'obras-publicas' },
  { match: 'urbanizaciones', slug: 'urbanismo' },
  { match: 'barrios y diseminados', slug: 'urbanismo' },
  { match: 'urbanismo', slug: 'urbanismo' },
  { match: 'vivienda', slug: 'vivienda' },
  { match: 'via publica', slug: 'movilidad' },
  { match: 'mobiliario urbano', slug: 'movilidad' },
  { match: 'alumbrado', slug: 'movilidad' },
  { match: 'accesibilidad', slug: 'movilidad' },
  { match: 'trafico', slug: 'movilidad' },
  { match: 'transporte', slug: 'movilidad' },
  { match: 'movilidad y deportes', slug: 'deportes' },
  { match: 'movilidad', slug: 'movilidad' },
  { match: 'deportes', slug: 'deportes' },
  { match: 'juventud', slug: 'juventud' },
  { match: 'mayores', slug: 'mayores' },
  { match: 'educacion', slug: 'educacion' },
  { match: 'agricultura', slug: 'agricultura' },
  { match: 'arte y cultura', slug: 'cultura' },
  { match: 'cultura', slug: 'cultura' },
  { match: 'fallas', slug: 'fiestas' },
  { match: 'fiestas y tradiciones', slug: 'fiestas' },
  { match: 'fiestas', slug: 'fiestas' },
  { match: 'promocion de la salud', slug: 'salud' },
  { match: 'infraestructuras sanitarias', slug: 'salud' },
  { match: 'agua saneamiento', slug: 'salud' },
  { match: 'salud', slug: 'salud' },
  { match: 'ruido', slug: 'salud' },
  { match: 'igualdad', slug: 'igualdad' },
  { match: 'participacion y transparencia', slug: 'transparencia' },
  { match: 'transparencia', slug: 'transparencia' },
  { match: 'integridad', slug: 'transparencia' },
  { match: 'atencion a la ciudadania', slug: 'comunicacion' },
  { match: 'comunicacion', slug: 'comunicacion' },
  { match: 'finanzas publicas', slug: 'hacienda' },
  { match: 'recaudacion', slug: 'hacienda' },
  { match: 'intervencion', slug: 'hacienda' },
  { match: 'tesoreria', slug: 'hacienda' },
  { match: 'gestion tributaria', slug: 'hacienda' },
  { match: 'gestion patrimonial', slug: 'hacienda' },
  { match: 'hacienda', slug: 'hacienda' },
  { match: 'contratacion', slug: 'contratacion' },
  { match: 'compra publica', slug: 'contratacion' },
  { match: 'seguridad y emergencias', slug: 'seguridad' },
  { match: 'policia local', slug: 'seguridad' },
  { match: 'seguridad', slug: 'seguridad' },
  { match: 'empleo y emprendimiento', slug: 'empleo-economia' },
  { match: 'fomento economico', slug: 'empleo-economia' },
  { match: 'fondos europeos', slug: 'empleo-economia' },
  { match: 'empleo', slug: 'empleo-economia' },
  { match: 'comercio', slug: 'comercio' },
  { match: 'turismo', slug: 'turismo' },
  { match: 'innovacion', slug: 'innovacion' },
  { match: 'planificacion estrategica', slug: 'innovacion' },
  { match: 'alcaldia', slug: 'alcaldia' },
]

function normalizeKey(raw: string): string {
  return stripDiacritics(raw).toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim()
}

/**
 * Map any of the four upstream namespaces (officials portfolio,
 * agenda department, pleno-vote department, queja category) onto a
 * canonical DepartmentSlug. Returns null when the input is empty or
 * doesn't match any rule — callers must not invent a slug.
 */
export function canonicalizeDepartment(raw: string | null | undefined): DepartmentSlug | null {
  if (!raw) return null
  const key = normalizeKey(raw)
  if (!key) return null
  // Longest matching needle wins, NOT first-in-list.
  //
  // With first-match-wins the table's ORDER decided the answer, and the
  // Valencian block sits above the Spanish one — so the 6-character stem
  // `comerc` (comerç) beat the exact rule `tesoreria` inside the same string,
  // and eight quarterly "Período Medio de Pago a proveedores" reports were
  // filed under Comercio because they mention "deuda comercial". One of them
  // literally begins «TESORERIA, Expedient: 4929/2023/GEN». Same failure put a
  // motion about squatting (`ocupación`) under Empleo y economía and two
  // contract-penalty items (`medios personales`) under Recursos Humanos.
  //
  // Those items are not cosmetic: /cargos/:slug lists them as that
  // councillor's council business and /departamentos counts them as the área's
  // activity. Specificity, not table position, has to decide.
  let best: { match: string; slug: DepartmentSlug } | null = null
  for (const rule of RULES) {
    const hit = rule.whole
      ? new RegExp(`(?:^|[^a-z0-9])${rule.match}(?:[^a-z0-9]|$)`).test(key)
      : key.includes(rule.match)
    if (!hit) continue
    if (best === null || rule.match.length > best.match.length) best = rule
  }
  return best ? best.slug : null
}

export interface OfficialLike {
  slug: string
  name: string
  party?: string
  portfolios: string[]
  photoUrl?: string
  role?: string
}

/**
 * Find the councillor whose portfolio best matches a department slug.
 * Returns null when no unambiguous owner exists (e.g. the slug is an
 * alcaldía-reserved area). First-match wins in council-list order —
 * officials.json preserves council seating precedence so the tie-break
 * is meaningful.
 */
export function resolveResponsibleOfficial<T extends OfficialLike>(
  slug: DepartmentSlug,
  officials: readonly T[],
): T | null {
  for (const o of officials) {
    for (const p of o.portfolios ?? []) {
      if (canonicalizeDepartment(p) === slug) return o
    }
  }
  return null
}

export { slugify }

/**
 * Gobierto ships each contract with an English `categoryTitle`, so the Spanish
 * keyword rules in `canonicalizeDepartment` returned null for all 804 awarded
 * contracts + 427 tenders — the biggest money dataset in the project reached no
 * concejalía at all.
 *
 * Only unambiguous categories are mapped. "other" (85 rows), "legal" (29),
 * "catering" (16), "textile" (14), "industry" (13) and "electrical" (3) can each
 * sit in several areas, and putting a wrong owner on a spending figure is worse
 * than leaving it blank — the same under-match discipline the tender
 * place-resolver applies to place names. That leaves ~80% of contracts
 * attributed and the remainder honestly unassigned.
 */
export const TENDER_CATEGORY_DEPARTMENT: Record<string, DepartmentSlug> = {
  construction: 'obras-publicas',
  architecture: 'urbanismo',
  real_estate: 'vivienda',
  environment: 'medio-ambiente',
  transportation: 'movilidad',
  health: 'salud',
  education: 'educacion',
  culture: 'cultura',
  security: 'seguridad',
  agriculture: 'agricultura',
  finance: 'hacienda',
  it: 'innovacion',
  software: 'innovacion',
  telecom: 'innovacion',
  audiovisual: 'comunicacion',
  print: 'comunicacion',
  // Facility upkeep and supplies for municipal buildings.
  maintenance: 'servicios-generales',
  furniture: 'servicios-generales',
  energy: 'servicios-generales',
  public_services: 'servicios-generales',
}

/** Department that owns a contract's spending area, or null when ambiguous. */
export function departmentForTenderCategory(
  categoryTitle: string | null | undefined,
): DepartmentSlug | null {
  if (!categoryTitle) return null
  return TENDER_CATEGORY_DEPARTMENT[categoryTitle.trim().toLowerCase()] ?? null
}
