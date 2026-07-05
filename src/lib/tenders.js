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
 * Baja de adjudicación: how far the awarded price fell below the tender budget,
 * as a percentage. Prefers the sin-IVA figures (our headline convention) and
 * falls back to tax-included. Returns null when either figure is missing so the
 * card can hide the chip rather than print a misleading 0 %.
 * @param {{initialAmountNoTaxes?:number, finalAmountNoTaxes?:number, initialAmount?:number, finalAmount?:number}|null|undefined} c
 * @returns {number|null}
 */
export function bajaPct(c) {
  if (!c) return null
  const initial = amt(c.initialAmountNoTaxes) || amt(c.initialAmount)
  const final = amt(c.finalAmountNoTaxes) || amt(c.finalAmount)
  if (initial <= 0 || final <= 0) return null
  return Math.round(((initial - final) / initial) * 1000) / 10
}
