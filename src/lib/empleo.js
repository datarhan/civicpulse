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

/** «Cierran pronto»: las próximas dos semanas. Lo usan el contador y la frase. */
export const DIAS_CIERRE_PRONTO = 14

const cierraPronto = (o, now) => {
  const d = daysUntil(o.deadline, now)
  return d !== null && d >= 0 && d <= DIAS_CIERRE_PRONTO
}

/**
 * La frase de la lectura vecinal de /empleo: cuántas ofertas hay abiertas,
 * cuántas son para trabajar en Riba-roja y cuántas cierran pronto.
 *
 * Sobre TODAS las ofertas y no sobre las filtradas: dice cómo está la bolsa
 * hoy, no lo que enseña el filtro de cada lector. Y sólo de las abiertas, con
 * el mismo predicado que la píldora de cada tarjeta (`isOfferClosed`): una
 * oferta cerrada no «es en Riba-roja» para quien busca trabajo.
 * @param {any[]} offers
 * @param {number} [now]  epoch ms (injectable for tests)
 */
export function enBreveEmpleo(offers, now = Date.now()) {
  const todas = offers || []
  const abiertas = todas.filter((o) => !isOfferClosed(o, now))
  return {
    // La agencia sigue listando ofertas con el plazo vencido, y el contador de
    // la lista las cuenta: la frase da las dos cifras para que cuadren.
    publicadas: todas.length,
    abiertas: abiertas.length,
    enRiba: abiertas.filter((o) => o.inRibaRoja).length,
    cierranPronto: abiertas.filter((o) => cierraPronto(o, now)).length,
  }
}

/**
 * El orden de la lista. Por cierre, las abiertas primero y la que cierra antes
 * arriba; las que no tienen plazo, detrás; las cerradas, al final. Ordenar sólo
 * por fecha ponía la de plazo vencido la primera, porque es la más antigua.
 * Por publicación, la más reciente arriba, abierta o cerrada.
 * @param {any[]} offers
 * @param {'deadline'|'published'} sortBy
 * @param {number} [now]  epoch ms (injectable for tests)
 */
export function ordenarOfertas(offers, sortBy, now = Date.now()) {
  const reciente = (a, b) => String(b.publishedAt).localeCompare(String(a.publishedAt))
  return [...(offers || [])].sort((a, b) => {
    if (sortBy === 'published') return reciente(a, b)
    const ca = isOfferClosed(a, now)
    const cb = isOfferClosed(b, now)
    if (ca !== cb) return ca ? 1 : -1
    if (ca) return reciente(a, b)
    if (!a.deadline && !b.deadline) return reciente(a, b)
    if (!a.deadline) return 1
    if (!b.deadline) return -1
    return a.deadline.localeCompare(b.deadline)
  })
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
  // El PUENTE entre las dos cifras de Riba-roja que publica esta página.
  //
  // El KPI cuenta `inRibaRoja` —la columna LOCALIDAD del listado— y el gráfico
  // agrupa `detail.municipio`, de la ficha. Son dos campos, y el lector ve 38
  // arriba y 26 abajo sin poder cuadrarlos. La diferencia son exactamente las
  // ofertas cuya localidad dice Riba-roja y cuya ficha no dice municipio: 12 el
  // 2026-09-21, y 26 + 12 = 38. Decir cuántas quedan fuera del gráfico ya se
  // decía; lo que faltaba era decir cuántas de ésas son de aquí.
  let sinMunicipioEnRiba = 0
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
      } else if (o.inRibaRoja) {
        sinMunicipioEnRiba++
      }
    }
    // Una oferta sin ficha tampoco trae municipio, y también cuenta para el
    // puente: lo que el gráfico no puede colocar es todo lo que no tiene
    // `detail.municipio`, haya ficha o no.
    if (!d && o.inRibaRoja) sinMunicipioEnRiba++
    if (cierraPronto(o, now)) closingSoon++
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
    sinMunicipioEnRiba,
    positions,
    inRibaRoja,
    inRibaRojaPct: total ? Math.round((inRibaRoja / total) * 100) : 0,
    closingSoon,
    vehicleRequired,
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
 * Las ofertas que enseña la portada: abiertas, la que cierra antes primero, y
 * después las que no traen plazo.
 *
 * La portada ordenaba por plazo sin mirar si ya había pasado, así que la
 * primera oferta que veía un vecino era la más vieja: el 25-10-2026, un
 * «Auxiliar Administrativo» cerrado el 15-01-2026, pintado «cierra 15 ene». El
 * portal sigue llamando «Abierta» a ofertas vencidas; el corte es el mismo
 * `isOfferClosed` que usan el listado, la ficha y el recuento de `stats`.
 *
 * @param {any[]} offers
 * @param {number} [n]
 * @param {number} [now]
 */
export function ofertasDePortada(offers, n = 3, now = Date.now()) {
  const abiertas = (offers || []).filter((o) => !isOfferClosed(o, now))
  const conPlazo = abiertas
    .filter((o) => o.deadline)
    .sort((a, b) => String(a.deadline).localeCompare(String(b.deadline)))
  const sinPlazo = abiertas.filter((o) => !o.deadline)
  return [...conPlazo, ...sinPlazo].slice(0, n)
}

/**
 * «27 oct», o «15 ene 2027» cuando el cierre no es de este año: sin el año, un
 * «15 ene» se lee como el próximo enero.
 *
 * El plazo llega como «AAAA-MM-DD», que es un DÍA de calendario y no un
 * instante: `new Date('2026-10-27')` es la medianoche UTC, y al oeste de
 * Greenwich eso ya es el 26. Así que un plazo de sólo fecha se pinta en UTC, y
 * el año se compara en la cadena, no en un `Date`.
 *
 * @param {string} iso
 * @param {string} locale
 * @param {number} [now]
 */
export function fechaDeCierre(iso, locale, now = Date.now()) {
  const s = String(iso)
  const anio = Number(s.slice(0, 4))
  const opts = /** @type {Intl.DateTimeFormatOptions} */ ({ day: 'numeric', month: 'short' })
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) opts.timeZone = 'UTC'
  if (anio !== new Date(now).getFullYear()) opts.year = 'numeric'
  return new Date(s).toLocaleDateString(locale === 'ca' ? 'ca-ES' : 'es-ES', opts)
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
