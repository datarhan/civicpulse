// @ts-check
/**
 * Display helpers for contract detail — Spanish labels for the Gobierto
 * `process_type` / `contract_type` enums, plus the baja (savings vs budget).
 * Kept as pure functions/constants so the ContractCard and any future surface
 * agree on wording from one source.
 */

/** Procedimiento de adjudicación (Gobierto `process_type`). */
export const PROCESS_TYPE_LABEL = {
  open: 'Abierto',
  open_simplified: 'Abierto simplificado',
  restricted: 'Restringido',
  negotiated_without_publicity: 'Negociado sin publicidad',
  negotiated_with_publicity: 'Negociado con publicidad',
  minor_contract: 'Contrato menor',
  based_on_agreement: 'Basado en acuerdo marco',
}

/** Tipo de contrato (Gobierto `contract_type`). */
export const CONTRACT_TYPE_LABEL = {
  services: 'Servicios',
  construction: 'Obras',
  supplies: 'Suministros',
  patrimonial: 'Patrimonial',
  public_services_management: 'Gestión de servicios públicos',
  other: 'Otros',
}

function amt(v) {
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? n : 0
}

/**
 * Detects PLACSP "score-as-amount" rows. Framework / Sistema Dinámico de
 * Adquisición (SDA) call-offs are frequently published with the 0–100
 * award-criterion SCORE dumped into the "importe adjudicado" field instead of
 * the euro amount — producing nonsensical rows like a €100 award against a
 * €14.983 budget (a spurious −99% baja). This most often happens when the
 * price offers tie and the winner is picked on social desempate criteria.
 *
 * Signature (all three required, so real awards are never caught):
 *  1. the final amount is TAX-INVARIANT (con-IVA === sin-IVA) — impossible for a
 *     real taxed award, where con-IVA ≈ sin-IVA × 1.21;
 *  2. the BUDGET is properly taxed (initial con-IVA > sin-IVA) — this rules out
 *     genuinely IVA-exempt contracts, whose budget is tax-invariant too;
 *  3. the implied baja is absurd (final ≤ 10% of the budget, i.e. ≥90% off) —
 *     the highest real baja among tax-invariant rows in the data is ~20%.
 *
 * Real deep-discount awards (auctions, aggressive bids) are always taxed
 * (finalAmount ≠ finalAmountNoTaxes) and so fail gate 1 — never neutralised.
 * Verified against exp. 251/2023 BSDA (Montealcedo): PLACSP showed "100 €";
 * the acta adjudicated €14.534,31 — a real 3% baja.
 * @param {{initialAmount?:number, initialAmountNoTaxes?:number, finalAmount?:number, finalAmountNoTaxes?:number}|null|undefined} c
 * @returns {boolean}
 */
export function isScoreArtifactAmount(c) {
  if (!c) return false
  const fin = amt(c.finalAmount)
  const finNo = amt(c.finalAmountNoTaxes)
  const iniNo = amt(c.initialAmountNoTaxes)
  if (fin <= 0 || finNo <= 0 || iniNo <= 0) return false
  const taxInvariantFinal = fin === finNo
  const taxedBudget = amt(c.initialAmount) > iniNo
  const absurdBaja = finNo <= iniNo * 0.1
  return taxInvariantFinal && taxedBudget && absurdBaja
}

/**
 * Baja de adjudicación: how far the awarded price fell below the tender budget,
 * as a percentage. Prefers the sin-IVA figures (our headline convention) and
 * falls back to tax-included. Returns null when either figure is missing so the
 * card can hide the chip rather than print a misleading 0 %.
 * @param {{initialAmountNoTaxes?:number, finalAmountNoTaxes?:number, initialAmount?:number, finalAmount?:number}|null|undefined} c
 * @returns {number|null}
 */
export function bajaPct(c) {
  if (!c) return null
  // A PLACSP score-as-amount row has no real awarded price — hide the chip
  // rather than print a misleading −99% baja (defence in depth: the ingestion
  // also zeroes these amounts, but committed snapshots predate that fix).
  if (isScoreArtifactAmount(c)) return null
  const initial = amt(c.initialAmountNoTaxes) || amt(c.initialAmount)
  const final = amt(c.finalAmountNoTaxes) || amt(c.finalAmount)
  if (initial <= 0 || final <= 0) return null
  return Math.round(((initial - final) / initial) * 1000) / 10
}
