/**
 * Manual mapping from queja category → EU CPV (Common Procurement Vocabulary)
 * division codes. Used by the tender↔queja correlator as a pre-filter: only
 * tenders whose CPV prefix matches the queja's likely CPV division get LLM
 * reranked. The LLM is NEVER asked to guess CPV — hallucinated codes there
 * would corrupt the structural match.
 *
 * CPV divisions (first 2 digits):
 *   03 — Agricultural, farming, fishing, forestry
 *   09 — Petroleum, electricity
 *   14 — Mining, basic metals
 *   15 — Food, beverages, tobacco
 *   16 — Agricultural machinery
 *   18 — Clothing, footwear, luggage
 *   22 — Printed matter
 *   24 — Chemical products
 *   30 — Office equipment, computers
 *   31 — Electrical machinery, apparatus
 *   32 — Radio, TV, communication equipment
 *   33 — Medical equipment, pharmaceuticals
 *   34 — Transport equipment (vehicles)
 *   35 — Security, defence, emergency equipment
 *   37 — Musical instruments, sports, toys
 *   38 — Laboratory, optical, precision equipment
 *   39 — Furniture, furnishings, appliances
 *   42 — Industrial machinery
 *   44 — Construction structures and materials
 *   45 — Construction work
 *   48 — Software packages and information systems
 *   50 — Repair and maintenance services
 *   51 — Installation services
 *   55 — Hotel, restaurant, retail trade services
 *   60 — Transport services
 *   63 — Supporting and auxiliary transport services
 *   64 — Postal, telecommunications services
 *   65 — Public utilities
 *   66 — Financial, insurance services
 *   70 — Real estate services
 *   71 — Architectural, construction, engineering, inspection
 *   72 — IT services
 *   73 — R&D services
 *   75 — Administration, defence, social security services
 *   76 — Oil & gas services
 *   77 — Agricultural, forestry, horticultural services
 *   79 — Business services (advertising, marketing, etc.)
 *   80 — Education and training services
 *   85 — Health and social work services
 *   90 — Sewage, refuse, cleaning, environmental services
 *   92 — Recreational, cultural, sporting services
 *   98 — Other community, social, personal services
 *
 * A queja may map to multiple divisions (e.g. `via_publica` hits both 45 for
 * the construction work and 50 for the maintenance service). Order matters
 * for scoring — the first match gets the highest weight.
 */
import type { QuejaCategory } from '../scraper/queja-router'

export const QUEJA_CATEGORY_TO_CPV: Record<QuejaCategory, string[]> = {
  via_publica:       ['45', '50', '71'],       // construction / repair / engineering
  limpieza:          ['90', '50'],              // cleaning services / maintenance
  zonas_verdes:      ['77', '45', '50'],        // horticulture / groundworks / upkeep
  alumbrado:         ['45', '50', '31'],        // installation / repair / electrical kit
  trafico:           ['45', '34', '71'],        // road works / vehicles / signage design
  mobiliario_urbano: ['39', '44', '45'],        // furniture / construction materials / install
  ruido:             ['79', '50', '71'],        // env. assessment / upkeep / engineering
  agua_saneamiento:  ['45', '65', '71'],        // civil works / utilities / engineering
  transporte:        ['60', '34', '63'],        // transport service / vehicles / aux services
  transparencia:     ['72', '79', '75'],        // IT services / business services / admin
  urbanismo:         ['71', '45', '79'],        // engineering / construction / services
  accesibilidad:     ['45', '50', '71'],        // construction / repair / engineering
  seguridad:         ['35', '79', '75'],        // security equipment / services / admin
  cultura:           ['92', '79'],              // cultural services / events
  educacion:         ['80', '45', '39'],        // training / school building / furniture
  servicios_sociales:['85', '79'],              // health/social work / services
  medio_ambiente:    ['90', '77', '71'],        // environmental / horticulture / engineering
  residuos:          ['90', '34'],              // refuse / specialist vehicles
  comercio:          ['79', '55'],              // business / retail trade
  fiestas:           ['92', '79', '98'],        // cultural / services / personal services
  vivienda:          ['45', '70'],              // construction / real estate
  agricultura:       ['77', '03', '16'],        // horticulture / ag products / ag machinery
  mayores:           ['85', '55'],              // social work / meal services
  juventud:          ['92', '80', '79'],        // recreation / education / services
  turismo:           ['79', '92'],              // services / cultural
  salud:             ['85', '33'],              // health / medical equipment
  deportes:          ['37', '45', '92'],        // sports goods / construction / recreation
  igualdad:          ['79', '85', '98'],        // services / social work / community
  bienestar_animal:  ['85', '77', '98'],        // veterinary (85) / ag. services / community
  otros:             ['79', '50'],              // generic services fallback
}

/** Given a CPV code string (e.g. "45233141-9" or "45000000-7"), return its 2-digit division. */
export function cpvDivision(cpv: string | undefined | null): string | null {
  if (!cpv) return null
  const m = cpv.match(/^(\d{2})/)
  return m ? m[1] : null
}

/** True when any of the tender's CPV divisions matches one of the queja category's expected divisions. */
export function tenderMatchesQuejaCpv(
  category: QuejaCategory,
  cpvs: string[] | undefined | null,
): boolean {
  if (!cpvs || cpvs.length === 0) return false
  const expected = new Set(QUEJA_CATEGORY_TO_CPV[category] || QUEJA_CATEGORY_TO_CPV.otros)
  for (const c of cpvs) {
    const div = cpvDivision(c)
    if (div && expected.has(div)) return true
  }
  return false
}
