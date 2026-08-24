// @ts-check
/**
 * Pure client helpers over a tender-geo snapshot. No React, no fetch — shared
 * by the dashboard components and unit-tested in isolation.
 */
import { isCommittedContract } from './contract-status.js'

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
    situatedContracts: 0,
    situatedAmount: 0,
    danaContracts: 0,
    danaAmount: 0,
    dateMin: null,
    dateMax: null,
  },
  zones: [],
  places: [],
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
 * Meter radius for a money bubble on the map, sized by the euro amount located
 * in a zone. Single source of truth for the scale so the map circles and any
 * legend agree: `150 + √amount / 6` (√ compresses the wide contract range so a
 * €2M zone doesn't dwarf a €50k one). Non-positive amounts get radius 0 — no
 * money located means no bubble, never a phantom minimum-size dot.
 * @param {number} [amount]
 * @returns {number}
 */
export function moneyRadiusMeters(amount) {
  const a = Number(amount) || 0
  if (a <= 0) return 0
  return 150 + Math.sqrt(a) / 6
}

/**
 * @param {any[]} contracts
 * @param {number} [n]
 * @returns {{assignee:string,amount:number,count:number}[]}
 */
/**
 * Top contract winners by awarded money. Without `resolver`, groups by
 * the raw assignee string (legacy behavior). With `resolver` —
 * `(rawName) => {key, canonicalName} | null`, built from entities.json —
 * name variants of the same company merge into one row rendered under
 * its canonical razón social, with `variantCount` for the UI hint.
 * @param {any[]} contracts
 * @param {number} [n]
 * @param {((raw: string) => {key: string, canonicalName: string} | null) | null} [resolver]
 */
export function topContractors(contracts, n = 15, resolver = null) {
  const m = new Map()
  for (const c of contracts || []) {
    // Committed money only — "who received the money". Sin IVA (PLACSP).
    if (!isCommittedContract(c)) continue
    const amount = contractAmount(c)
    if (!(amount > 0)) continue
    const name = c.assignee
    if (!name) continue
    const resolved = resolver ? resolver(name) : null
    const key = resolved?.key ?? name
    const display = resolved?.canonicalName ?? name
    const cur = m.get(key) || { assignee: display, amount: 0, count: 0, variants: new Set() }
    cur.amount += amount
    cur.count += 1
    cur.variants.add(name)
    m.set(key, cur)
  }
  return [...m.values()]
    .map(({ variants, ...row }) => ({ ...row, variantCount: variants.size }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, n)
}

/**
 * Committed euros grouped by `contractType`, biggest first.
 *
 * Exists because a heading claimed something the figure under it did not
 * support: «¿A dónde va el dinero en obras?» sat above the full €68,0M of
 * municipal contracting, of which obras are about a quarter — most of it is
 * town-wide services. Correcting the heading meant publishing the actual share,
 * and a share published beside the breakdown that proves it must come from the
 * SAME computation, or the two drift and the page contradicts itself one scroll
 * apart. So the summary line and the «Tipos de gasto» chart both call this.
 *
 * `contractType` is Gobierto's own field, not an inference from the title.
 * Rows with no type land in `other` rather than being dropped, so the shares
 * always sum to the whole.
 *
 * @param {any[]} contracts
 * @returns {{rows: {type: string, amount: number, count: number}[], total: number}}
 */
export function contractTypeTotals(contracts) {
  const m = new Map()
  let total = 0
  for (const c of contracts || []) {
    if (!isCommittedContract(c)) continue
    const amount = contractAmount(c)
    if (!(amount > 0)) continue
    const type = c.contractType || 'other'
    const cur = m.get(type) || { type, amount: 0, count: 0 }
    cur.amount += amount
    cur.count += 1
    m.set(type, cur)
    total += amount
  }
  return { rows: [...m.values()].sort((a, b) => b.amount - a.amount), total }
}

/**
 * Share of a set of euros that is `construction` (obras), 0–100.
 * @param {{rows: {type: string, amount: number}[], total: number}} totals
 * @returns {number|null} null when there is nothing to take a share OF — a
 *   caller must then say nothing rather than print «0 % obras».
 */
export function obrasSharePct(totals) {
  if (!totals || !(totals.total > 0)) return null
  const obras = totals.rows.find((r) => r.type === 'construction')
  return ((obras?.amount ?? 0) / totals.total) * 100
}

/**
 * De qué está hecho el listado que se está pintando: cuántas filas casan, cuántas
 * son dinero comprometido y qué es el resto — desglosado POR ESTADO, no como un
 * recuento suelto, para que la frase pueda nombrarlo con las mismas palabras que
 * llevan las pastillas de las filas.
 *
 * Existe porque `/presupuesto` usaba «adjudicados» para dos universos distintos:
 * la barra de cobertura, que es sólo-adjudicado, y este listado, que pinta el
 * registro entero. Medido el 24-08-2026: 806 filas, 699 comprometidas, y 7 de
 * las 107 restantes dentro de las 60 primeras que se ven sin filtrar. El
 * revisor de superficies lo señaló, con razón.
 *
 * Se mide sobre las filas FILTRADAS, nunca sobre el snapshot entero: rotular un
 * subconjunto con la composición del total sería el mismo defecto un nivel más
 * abajo.
 *
 * No se filtran las no adjudicadas. Un contrato anulado es material
 * periodístico; esconderlo sería lo contrario de este proyecto. Se nombra.
 *
 * @param {any[]} rows
 * @returns {{total:number, committed:number, rest:number,
 *   restByStatus:{status:string,count:number}[]}}
 */
export function contractsListSummary(rows) {
  const all = rows || []
  const byStatus = new Map()
  let committed = 0
  for (const c of all) {
    if (isCommittedContract(c)) {
      committed += 1
      continue
    }
    // `unknown` es el centinela de Gobierto y aquí es un cubo legítimo: la fila
    // existe y su estado no consta. Nunca se imprime el token, sólo se cuenta.
    const status = c?.status || 'unknown'
    byStatus.set(status, (byStatus.get(status) || 0) + 1)
  }
  return {
    total: all.length,
    committed,
    rest: all.length - committed,
    restByStatus: [...byStatus.entries()]
      .map(([status, count]) => ({ status, count }))
      .sort((a, b) => b.count - a.count || a.status.localeCompare(b.status)),
  }
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
