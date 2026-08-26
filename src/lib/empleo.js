import { isOfferClosed } from '../scraper/empleo'
// @ts-check
/**
 * Pure client helpers for /empleo — stats aggregation, the filter predicate,
 * jornada/contract normalization, and pagination. No React, no I/O; unit-tested
 * in tests/empleo-lib.test.ts so the page stays a thin orchestrator.
 */

/** Default page size for the offer list. */
export const PER_PAGE = 12

/** @typedef {{ q: string, ribaOnly: boolean, municipio: string, contract: string, jornada: string, closing: 'all'|'week'|'month' }} EmpleoFilters */

/** @type {EmpleoFilters} */
export const EMPTY_FILTERS = {
  q: '',
  ribaOnly: false,
  municipio: '',
  contract: '',
  jornada: '',
  closing: 'all',
}

// Short, legible labels for the long portalemp contract-type strings.
const CONTRACT_SHORT = {
  'CONTRATO INDEFINIDO': 'Indefinido',
  'CONTRATO DE OBRA O SERVICIO DETERMINADO': 'Obra o servicio',
  'CONTRATO A TIEMPO PARCIAL': 'Tiempo parcial',
  'CONTRATACION DISCAPACIDAD': 'Discapacidad',
  'FIJOS DISCONTINUOS': 'Fijo discontinuo',
  'CONTRATO EVENTUAL POR CIRCUNSTANCIAS DE LA PRODUCCION': 'Eventual',
  INDIFERENTE: 'Indiferente',
  'CONTRATO DE RELEVO': 'Relevo',
  'CONTRATO EN PRÁCTICAS': 'Prácticas',
  'CONTRATO FORMATIVO': 'Formativo',
}

/** Short display label for a raw portalemp contract type. */
export function shortContract(raw) {
  if (!raw) return ''
  return CONTRACT_SHORT[raw] || CONTRACT_SHORT[String(raw).toUpperCase()] || raw
}

/** Collapse the "Turnos: …" suffix → 'Completa' | 'Parcial' | 'Otra' | null. */
export function normalizeJornada(j) {
  const s = (j || '').trim()
  if (!s) return null
  if (/^completa/i.test(s)) return 'Completa'
  if (/^parcial/i.test(s)) return 'Parcial'
  return 'Otra'
}

/** Float days from `now` (epoch ms) until an ISO deadline; null if absent. */
function daysUntil(deadline, now) {
  if (!deadline) return null
  const t = Date.parse(deadline)
  if (Number.isNaN(t)) return null
  return (t - now) / 86_400_000
}

/**
 * Aggregate stats over an offer list (already filtered by the caller, so the
 * numbers track the active filter set).
 * @param {any[]} offers
 * @param {number} [now]  epoch ms (injectable for tests)
 */
export function computeEmpleoStats(offers, now = Date.now()) {
  const list = offers || []
  const total = list.length
  let positions = 0
  let inRibaRoja = 0
  // Abiertas DE VERDAD, con el mismo predicado que decide la píldora de la
  // tarjeta. Contar `status === 'Abierta'` daba 67 en una página que pintaba
  // dos de ellas «Cerrada».
  let open = 0
  // Sobre cuántas filas se puede calcular el reparto por municipio. No es el
  // total: 23 de 67 no traen ficha, y el gráfico salía al lado de un KPI
  // calculado sobre las 67 sin que nada dijera que son poblaciones distintas.
  let byMunicipioCoverage = 0
  let closingSoon = 0
  let vehicleRequired = 0
  const monthMap = new Map()
  const contractMap = new Map()
  const muniMap = new Map()

  for (const o of list) {
    if (o.inRibaRoja) inRibaRoja++
    if (!isOfferClosed(o, now)) open++
    const d = o.detail
    if (d) {
      const n = parseInt(d.numPuestos, 10)
      if (Number.isFinite(n)) positions += n
      if (d.vehiculo === 'Sí') vehicleRequired++
      if (d.tipoContrato)
        contractMap.set(d.tipoContrato, (contractMap.get(d.tipoContrato) || 0) + 1)
      if (d.municipio) {
        muniMap.set(d.municipio, (muniMap.get(d.municipio) || 0) + 1)
        byMunicipioCoverage++
      }
    }
    const du = daysUntil(o.deadline, now)
    if (du !== null && du >= 0 && du <= 14) closingSoon++
    const ym = (o.publishedAt || '').slice(0, 7)
    if (/^\d{4}-\d{2}$/.test(ym)) monthMap.set(ym, (monthMap.get(ym) || 0) + 1)
  }

  const byMonth = [...monthMap.entries()]
    .map(([month, count]) => ({ month, count }))
    .sort((a, b) => a.month.localeCompare(b.month))
  const byContract = [...contractMap.entries()]
    .map(([raw, count]) => ({ raw, label: shortContract(raw), count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
  const byMunicipio = [...muniMap.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))

  return {
    total,
    open,
    byMunicipioCoverage,
    positions,
    inRibaRoja,
    inRibaRojaPct: total ? Math.round((inRibaRoja / total) * 100) : 0,
    closingSoon,
    vehicleRequired,
    vehiclePct: total ? Math.round((vehicleRequired / total) * 100) : 0,
    byMonth,
    byContract,
    byMunicipio,
  }
}

/**
 * True when an offer passes every active filter.
 * @param {any} offer
 * @param {EmpleoFilters} [filters]
 * @param {number} [now]
 */
export function matchesFilters(offer, filters = EMPTY_FILTERS, now = Date.now()) {
  const f = filters || EMPTY_FILTERS
  const d = offer.detail
  const q = (f.q || '').trim().toLowerCase()
  if (q) {
    const hay = `${offer.titulo} ${offer.codigo} ${offer.location || ''}`.toLowerCase()
    if (!hay.includes(q)) return false
  }
  if (f.ribaOnly && !offer.inRibaRoja) return false
  if (f.municipio && (!d || d.municipio !== f.municipio)) return false
  if (f.contract && (!d || d.tipoContrato !== f.contract)) return false
  if (f.jornada && (!d || normalizeJornada(d.jornada) !== f.jornada)) return false
  if (f.closing && f.closing !== 'all') {
    const du = daysUntil(offer.deadline, now)
    const cap = f.closing === 'week' ? 7 : 31
    if (du === null || du < 0 || du > cap) return false
  }
  return true
}

/**
 * Slice `list` into a 1-based page of `perPage`, clamping out-of-range pages.
 * @returns {{ items: any[], page: number, totalPages: number, total: number }}
 */
export function paginate(list, page, perPage) {
  const arr = list || []
  const total = arr.length
  const totalPages = Math.max(1, Math.ceil(total / perPage))
  const p = Math.min(totalPages, Math.max(1, page || 1))
  const start = (p - 1) * perPage
  return { items: arr.slice(start, start + perPage), page: p, totalPages, total }
}

/** Distinct municipios present in the offers' detail, alphabetically sorted. */
export function distinctMunicipios(offers) {
  const set = new Set()
  for (const o of offers || []) if (o.detail && o.detail.municipio) set.add(o.detail.municipio)
  return [...set].sort((a, b) => String(a).localeCompare(String(b)))
}

/** Distinct contract types (raw + short label + count), most-common first. */
export function distinctContracts(offers) {
  const map = new Map()
  for (const o of offers || []) {
    const raw = o.detail && o.detail.tipoContrato
    if (raw) map.set(raw, (map.get(raw) || 0) + 1)
  }
  return [...map.entries()]
    .map(([raw, count]) => ({ raw, label: shortContract(raw), count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
}

/**
 * Aggregate offers into located municipalities for the map. `coords` maps a
 * municipality name → [lat, lng]; municipalities with no coord are dropped
 * (honest miss — never a fabricated point). Sorted by count desc.
 * @returns {{ name: string, count: number, coord: [number, number] }[]}
 */
export function offersByMunicipioGeo(offers, coords) {
  const counts = new Map()
  for (const o of offers || []) {
    const m = o.detail && o.detail.municipio
    if (m && coords[m]) counts.set(m, (counts.get(m) || 0) + 1)
  }
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count, coord: coords[name] }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
}
