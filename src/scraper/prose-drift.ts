/**
 * Has a number we published in prose drifted from the number we publish as data?
 *
 * The gap this closes, in one sentence: fixing a data bug does not fix the
 * sentences that were written on top of the broken figure, and nothing tells you
 * which sentences those were.
 *
 * On 2026-08-02 one parser fix moved municipal contracting from €14.7M to
 * €68.0M. Four published things silently became wrong, and all four were found
 * by a person reading pages one at a time:
 *
 *   · «El dinero de la reconstrucción» froze `totalAwarded: 14.048.926,9`
 *   · the same piece froze `situatedAmount: 2.036.285` (live: 6.085.028)
 *   · the landing KPI strip put a cumulative total beside an annual budget
 *   · /metodologia described verdict behaviour that had been retired
 *
 * The first two are pure arithmetic — a frozen figure and its live counterpart,
 * differing by 4.8×. No model is needed or wanted for that: a deterministic
 * comparison cannot hallucinate a drift that is not there, and after a day of
 * checks that confidently said wrong things, that property is worth more than
 * coverage.
 *
 * The last two need judgement and are NOT attempted here. This reports arithmetic
 * only, and reports it as a lead for a curator: a frozen figure is often frozen
 * ON PURPOSE (that is the whole contract of a published reportaje) so drift is a
 * question, never an instruction to edit.
 */

export interface LiveAnchor {
  /** Dotted path used only for the human-readable report. */
  label: string
  value: number
}

export interface FrozenFigure {
  /** Where it lives, e.g. `reconstruccion-dana.totals.totalAwarded`. */
  where: string
  value: number
  /** Which live anchor it is supposed to track. */
  anchor: string
  /**
   * Qué mide la cifra congelada que el ancla NO mide.
   *
   * Presente = la comparación no es de iguales, y la diferencia no es deriva.
   * `reconstruccion-dana.totals.totalAwarded` excluye la concesión del agua
   * —diecisiete años adjudicados de una vez, 55,69 M€— y el ancla
   * `tenders.stats.awardedTotalEuros` la incluye: 123,68 − 55,69 = 68,00
   * exacto, y 699 − 1 = 698 contratos. El check llevaba tiempo diciendo
   * «divergente ×1.8» y pidiendo una nota de corrección que no habría
   * arreglado nada, porque no ha derivado nada. Una alarma permanente es una
   * alarma que se silencia.
   */
  scope?: string
}

export interface DriftRow {
  where: string
  anchor: string
  frozen: number
  live: number
  ratio: number
  /** Copiado de la cifra: por qué esta comparación no es de iguales. */
  scope?: string
  severity: 'ok' | 'drifted' | 'scoped'
}

/**
 * A figure this could not compare, and why.
 *
 * Not cosmetic. `check:drift` prints how many figures it produced a row for, so
 * a figure that fell out — anchor key renamed, snapshot missing, upstream shape
 * changed to `undefined` — used to take the watch count down with it in
 * silence: «2 vigiladas · 0 divergentes» quietly becomes «1 · 0» and still
 * reads as healthy. DATA_INTEGRITY.md rule 2: a run reports attempted, done and
 * skipped-with-reason SEPARATELY, because folding "never attempted" into
 * "nothing wrong" is how every silent-failure incident here began.
 */
export interface SkippedFigure {
  where: string
  anchor: string
  reason: string
}

export interface DriftReport {
  rows: DriftRow[]
  skipped: SkippedFigure[]
}

/**
 * A frozen figure is expected to lag — data moves. What is worth a human's
 * attention is a figure that is no longer the same ORDER of thing: a rounding
 * difference is noise, a 4.8× gap means the published sentence is telling the
 * reader something false. 25% is deliberately loose so this stays quiet.
 */
export const DRIFT_THRESHOLD = 0.25

/** Every input figure comes back exactly once, as a row or as a skip. */
export function detectDrift(
  frozen: FrozenFigure[],
  anchors: Record<string, LiveAnchor>,
): DriftReport {
  const rows: DriftRow[] = []
  const skipped: SkippedFigure[] = []
  const skip = (f: FrozenFigure, reason: string) =>
    skipped.push({ where: f.where, anchor: f.anchor, reason })

  for (const f of frozen) {
    const a = anchors[f.anchor]
    if (!a) {
      skip(f, `no existe el ancla «${f.anchor}» — ¿la renombraron?`)
      continue
    }
    if (!Number.isFinite(a.value)) {
      skip(f, `el ancla ${a.label} devolvió un valor no numérico (¿cambió la forma del snapshot?)`)
      continue
    }
    if (a.value === 0) {
      skip(f, `el ancla ${a.label} vale 0 — no hay contra qué comparar`)
      continue
    }
    if (!Number.isFinite(f.value) || f.value === 0) {
      skip(f, 'la cifra congelada no está en la pieza publicada, o vale 0')
      continue
    }
    const ratio = f.value / a.value
    const rel = Math.abs(f.value - a.value) / Math.max(Math.abs(a.value), 1)
    rows.push({
      where: f.where,
      anchor: a.label,
      frozen: f.value,
      live: a.value,
      ratio: Math.round(ratio * 1000) / 1000,
      scope: f.scope,
      // `scoped` NUNCA es `drifted`: la cifra y el ancla miden cosas
      // distintas, así que su distancia no dice nada sobre si la pieza
      // envejeció. Se sigue imprimiendo —con su motivo— en vez de ocultarse:
      // esconderla dejaría la cifra sin vigilancia de ningún tipo.
      severity: f.scope ? 'scoped' : rel > DRIFT_THRESHOLD ? 'drifted' : 'ok',
    })
  }
  return { rows, skipped }
}
