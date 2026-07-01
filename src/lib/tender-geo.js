// @ts-check
/**
 * Pure client helpers over a tender-geo snapshot. No React, no fetch — shared
 * by the dashboard components and unit-tested in isolation.
 */

/**
 * Canonical euro figure to DISPLAY and AGGREGATE for a contract — SIN IVA, to
 * match the authoritative PLACSP detail page (contrataciondelestado.es), whose
 * "Importe de adjudicación" / "Presupuesto base de licitación" headline the
 * tax-excluded amount, and Spanish public-procurement convention (valor
 * estimado is always sin impuestos). Prefers the awarded tax-excluded figure;
 * falls back to the tax-included one, then to the initial amounts, only when a
 * source row lacks the sin-IVA value (none do today — defensive).
 * @param {{finalAmountNoTaxes?:number, finalAmount?:number, initialAmountNoTaxes?:number, initialAmount?:number}} [c]
 * @returns {number}
 */
export function contractAmount(c) {
  if (!c) return 0
  if (c.finalAmountNoTaxes > 0) return c.finalAmountNoTaxes
  if (c.finalAmount > 0) return c.finalAmount
  if (c.initialAmountNoTaxes > 0) return c.initialAmountNoTaxes
  return c.initialAmount || 0
}

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
 * optionally restricted to DANA. Assignments with NO date are excluded from this
 * timeline view (they have no position on it); their value still lives in the
 * snapshot's precomputed `zones[]`/`universe` all-time aggregates (spec §11).
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
    // Awarded money only — "who received the awarded money". Sin IVA (PLACSP).
    if (c.status !== 'awarded') continue
    const amount = contractAmount(c)
    if (!(amount > 0)) continue
    const name = c.assignee
    if (!name) continue
    const cur = m.get(name) || { assignee: name, amount: 0, count: 0 }
    cur.amount += amount
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
    if (
      q &&
      !(c.title || '').toLowerCase().includes(q) &&
      !(c.assignee || '').toLowerCase().includes(q)
    )
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
