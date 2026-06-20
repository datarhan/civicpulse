// @ts-check
/**
 * Pure client helpers over a tender-geo snapshot. No React, no fetch — shared
 * by the dashboard components and unit-tested in isolation.
 */

export const EMPTY_TENDER_GEO = {
  generatedAt: null,
  source: { tenders: null, geo: null },
  universe: {
    totalContracts: 0,
    totalAmount: 0,
    locatedContracts: 0,
    locatedAmount: 0,
    danaContracts: 0,
    danaAmount: 0,
    dateMin: null,
    dateMax: null,
  },
  zones: [],
  assignments: [],
}

/**
 * Per-zone {amount,count} for assignments dated on/before `at` (cumulative),
 * optionally restricted to DANA. Assignments with no date are always included.
 * @param {any[]} assignments
 * @param {{at?: number, danaOnly?: boolean}} [opts]
 * @returns {Map<string,{amount:number,count:number}>}
 */
export function zoneAmountsAt(assignments, { at = Infinity, danaOnly = false } = {}) {
  const m = new Map()
  for (const a of assignments || []) {
    if (danaOnly && !a.dana) continue
    if (!a.date || new Date(a.date).getTime() > at) continue
    for (const slug of a.zones) {
      const cur = m.get(slug) || { amount: 0, count: 0 }
      cur.amount += a.amount
      cur.count += 1
      m.set(slug, cur)
    }
  }
  return m
}

/**
 * @param {any[]} contracts
 * @param {number} [n]
 * @returns {{assignee:string,amount:number,count:number}[]}
 */
export function topContractors(contracts, n = 15) {
  const m = new Map()
  for (const c of contracts || []) {
    // Awarded money only — "who received the awarded money".
    if (c.status !== 'awarded' || !(c.finalAmount > 0)) continue
    const name = c.assignee
    if (!name) continue
    const cur = m.get(name) || { assignee: name, amount: 0, count: 0 }
    cur.amount += c.finalAmount
    cur.count += 1
    m.set(name, cur)
  }
  return [...m.values()].sort((a, b) => b.amount - a.amount).slice(0, n)
}

/**
 * @param {any[]} contracts
 * @param {{text?:string,zoneSlug?:string,category?:string,year?:string,dana?:boolean,type?:string}} [opts]
 * @param {Map<string,any>} [assignmentsById]
 * @returns {any[]}
 */
export function filterContracts(contracts, opts = {}, assignmentsById = new Map()) {
  const { text = '', zoneSlug = '', category = '', year = '', dana = false, type = '' } = opts
  const q = text.trim().toLowerCase()
  return (contracts || []).filter((c) => {
    if (q && !c.title.toLowerCase().includes(q) && !(c.assignee || '').toLowerCase().includes(q))
      return false
    if (category && c.categoryTitle !== category) return false
    if (type && c.contractType !== type) return false
    if (year) {
      const d = c.awardDate || c.startDate
      if (!d || !String(d).startsWith(year)) return false
    }
    const a = assignmentsById.get(c.id)
    if (zoneSlug && !(a && a.zones.includes(zoneSlug))) return false
    if (dana && !(a && a.dana)) return false
    return true
  })
}
