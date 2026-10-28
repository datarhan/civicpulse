import { useJsonFetch } from './useJsonFetch'

// 404-fallback (module-level constant → stable ref).
const EMPTY_ISPA = {
  generatedAt: null,
  source: null,
  municipality: null,
  latestYear: null,
  alcaldeTrend: [],
  years: [],
}

/**
 * ISPA elected-official retribuciones (public/data/ispa.json) — the official
 * Ministerio de Hacienda dataset, multi-year. Councillor rows are anonymised
 * (dedicación + amount, no name); only the alcalde is identifiable.
 */
export function useIspa() {
  return useJsonFetch('/data/ispa.json', EMPTY_ISPA)
}

/** The latest year's block (alcalde + concejales distribution + summary). */
export function ispaLatest(data) {
  const years = data?.years || []
  return years.find((y) => y.year === data?.latestYear) || years[years.length - 1] || null
}

/**
 * The one sentinel the split keys on, exported so nothing restates it.
 * `src/scraper/ispa.ts` classifies every row as exclusiva / parcial /
 * sin-dedicacion; only the last is "attendance fees only". Six tests in this
 * repo once hand-copied a shape and stayed green while production matched
 * nothing, so this value is imported by its test rather than typed twice.
 */
export const SIN_DEDICACION = 'sin-dedicacion'

/**
 * The two ways an elected member of this corporación is paid, split apart.
 *
 * Seven draw a salary fixed by the pleno acuerdo; the other fourteen are paid
 * per session attended. Both live in the same ISPA year and the page used to
 * print only the first, so fourteen councillors appeared to be paid nothing —
 * and none of them is.
 *
 * `sin-dedicacion` is matched and everything else is the COMPLEMENT, so a row
 * carrying a value nobody anticipated lands with the salaried rather than
 * vanishing. That alone would be a silent mis-file, which is what `cuadra`
 * exists for: it re-derives the split against the counts and the total the
 * parser computed independently, and goes false the moment they disagree. A
 * caller that prints a subtotal without checking it is printing arithmetic
 * nobody verified.
 *
 * Councillor rows are ANONYMOUS in ISPA — amount and dedicación, no name — so
 * this returns a distribution and never a person. Adjudicating one of these
 * figures to a named councillor is a claim the source does not support.
 */
export function retribucionesSplit(data) {
  const y = ispaLatest(data)
  if (!y || !y.summary) return null
  const filas = [...(y.alcalde ? [y.alcalde] : []), ...(y.concejales || [])]
  if (filas.length === 0) return null

  const sinFilas = filas.filter((f) => f.dedicacion === SIN_DEDICACION)
  const conFilas = filas.filter((f) => f.dedicacion !== SIN_DEDICACION)
  const suma = (xs) => xs.reduce((a, f) => a + (f.amountEuros || 0), 0)
  const con = {
    count: conFilas.length,
    sum: suma(conFilas),
    amounts: conFilas.map((f) => f.amountEuros).sort((a, b) => b - a),
  }
  const amounts = sinFilas.map((f) => f.amountEuros).sort((a, b) => a - b)
  const sin = {
    count: sinFilas.length,
    sum: suma(sinFilas),
    amounts,
    min: amounts[0] ?? null,
    max: amounts[amounts.length - 1] ?? null,
  }
  const s = y.summary
  const cuadra =
    con.count === s.conDedicacion &&
    sin.count === s.sinDedicacion &&
    Math.abs(con.sum + sin.sum - s.totalAnnualEuros) < 0.01
  return { year: y.year, total: s.totalAnnualEuros, con, sin, cuadra }
}

/**
 * How many people ISPA paid in the split's year: its own rows, not the roster.
 *
 * The /cargos hero said «Los {n} percibieron … en 2024» with n read from the
 * CURRENT officials.json, which counts a councillor who took the seat in 2025
 * and leaves out one who was paid in 2024 and has since gone. The number
 * matched by coincidence; the people did not.
 */
export function perceptoresIspa(split) {
  if (!split) return null
  return split.con.count + split.sin.count
}

/**
 * Whether the page may say «ninguno cobró cero»: only from a split that
 * reconciles, and none of whose rows — salaried or per-session — is zero.
 * The hero and the panel's eyebrow both make the claim, so both ask here.
 */
export function ningunoACero(split) {
  if (!split?.cuadra) return false
  const filas = [...split.con.amounts, ...split.sin.amounts]
  return filas.length > 0 && filas.every((v) => typeof v === 'number' && v > 0)
}

/**
 * The alcalde's ISPA series as SLOTS to lay out, gaps included.
 *
 * ISPA publishes no 2023 for this municipality, and the page used to paint the
 * four years it has as a row of ↑↓ arrows: 2024's arrow compared against 2022
 * as though they were consecutive, turning two years of drift into what reads
 * as one year's change. A missing year is not a shorter axis — it is a hole,
 * and it has to occupy space to be seen.
 *
 * Interior gaps only: the series is as long as it is, and inventing an absence
 * before the first entrega or after the last would be a claim about years ISPA
 * never covered.
 *
 * @returns {Array<{tipo: 'dato', year: number, amountEuros: number} | {tipo: 'hueco', desde: number, hasta: number}>}
 */
export function alcaldeSerie(data) {
  const trend = [...(data?.alcaldeTrend || [])].sort((a, b) => a.year - b.year)
  if (trend.length === 0) return []
  const slots = [{ tipo: 'dato', year: trend[0].year, amountEuros: trend[0].amountEuros }]
  for (let i = 1; i < trend.length; i++) {
    const prev = trend[i - 1].year
    const cur = trend[i].year
    if (cur - prev > 1) slots.push({ tipo: 'hueco', desde: prev + 1, hasta: cur - 1 })
    slots.push({ tipo: 'dato', year: cur, amountEuros: trend[i].amountEuros })
  }
  return slots
}

/**
 * Salary-growth % for the alcalde over each requested window (years back from
 * the latest ISPA year). Returns { years, pct } with pct === null when that
 * base year isn't in the (clean) ISPA series — so the UI can render "—" rather
 * than invent a figure. Only the alcalde has a continuous per-year series;
 * councillors' dedicación dates from the 2023 acuerdo (no prior history).
 */
export function alcaldeGrowth(data, windows = [1, 3, 5, 10]) {
  const trend = data?.alcaldeTrend || []
  if (trend.length < 2) return []
  const latest = trend[trend.length - 1]
  return windows.map((years) => {
    const base = trend.find((t) => t.year === latest.year - years)
    return {
      years,
      pct: base && base.amountEuros ? (latest.amountEuros / base.amountEuros - 1) * 100 : null,
    }
  })
}
