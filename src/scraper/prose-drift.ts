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
}

export interface DriftRow {
  where: string
  anchor: string
  frozen: number
  live: number
  ratio: number
  severity: 'ok' | 'drifted'
}

/**
 * A frozen figure is expected to lag — data moves. What is worth a human's
 * attention is a figure that is no longer the same ORDER of thing: a rounding
 * difference is noise, a 4.8× gap means the published sentence is telling the
 * reader something false. 25% is deliberately loose so this stays quiet.
 */
export const DRIFT_THRESHOLD = 0.25

export function detectDrift(
  frozen: FrozenFigure[],
  anchors: Record<string, LiveAnchor>,
): DriftRow[] {
  const out: DriftRow[] = []
  for (const f of frozen) {
    const a = anchors[f.anchor]
    if (!a || !Number.isFinite(a.value) || a.value === 0) continue
    if (!Number.isFinite(f.value) || f.value === 0) continue
    const ratio = f.value / a.value
    const rel = Math.abs(f.value - a.value) / Math.max(Math.abs(a.value), 1)
    out.push({
      where: f.where,
      anchor: a.label,
      frozen: f.value,
      live: a.value,
      ratio: Math.round(ratio * 1000) / 1000,
      severity: rel > DRIFT_THRESHOLD ? 'drifted' : 'ok',
    })
  }
  return out
}
