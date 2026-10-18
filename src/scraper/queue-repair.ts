/**
 * When a stale curator worklist may be rebuilt without a person, and how to
 * tell afterwards that nothing a curator wrote was lost.
 *
 * `check:queues` reports a queue that still lists findings since retracted and
 * names the `triage:*` pass that fixes it. Until 2026-10-18 that pass only ran
 * when somebody read the alarm on their phone and typed it, so the alarm
 * repeated for days over a fix that takes no judgement. The local cron now runs
 * it first (`scripts/repair-queues.ts`), and this module is the whole of what
 * it is allowed to decide.
 *
 * A rebuild only drops rows about findings that are gone, which is a weakening
 * (tier A in `automation-policy.ts`'s terms) — but only if the curator's own
 * input survives it. The builders differ on that, so each queue declares it:
 *
 *   · `carried: false` — the builder writes its human field as `null` every
 *     time (`seleccion`, `decision`). While any row holds a value, the queue is
 *     NOT rebuilt: rebuilding would erase a choice nobody has applied yet.
 *   · `carried: true` — the builder re-reads the old file and carries the
 *     verdict across (`carriedReviewsFrom`). The rebuild runs, and
 *     `lostCuratorInput` checks afterwards that it really did; the caller puts
 *     the backup back when it did not.
 *
 * Pure: no filesystem, no process. Keyed by `QUEUE_SOURCES`' paths, and a test
 * fails when a queue is added there without a spec here.
 */
import { isClean, type QueueReport } from './queue-staleness'

type Row = Record<string, unknown>

export interface RepairSpec {
  /** Does this row hold something a curator wrote? */
  humanInput: (row: Row) => boolean
  /** Does the builder carry that input into the rebuilt file? */
  carried: boolean
  /**
   * For a carried queue: the key the builder carries input under. Input whose
   * key is gone after the rebuild was dropped on purpose (the finding left, or
   * its summary changed and the verdict was invalidated), not lost.
   */
  carryKey?: (row: Row) => string
  /** For a carried queue: the curator's fields, compared before and after. */
  curatorView?: (row: Row) => unknown
}

const filled = (v: unknown) => v !== null && v !== undefined && v !== ''

export const REPAIR_SPECS: Record<string, RepairSpec> = {
  // `seleccion` is the passage a curator picked; the builder never fills it.
  'editorial/quote-reanchor-queue.json': {
    humanInput: (r) => filled(r.seleccion),
    carried: false,
  },
  // The builder carries verdict/reviewer/reviewedAt/notes by id + summaryHash.
  'editorial/finding-support-queue.json': {
    humanInput: (r) =>
      (filled(r.verdict) && r.verdict !== 'pendiente') || filled(r.reviewer) || filled(r.notes),
    carried: true,
    carryKey: (r) => `${String(r.id)}·${String(r.summaryHash)}`,
    curatorView: (r) => [
      r.verdict ?? null,
      r.reviewer ?? null,
      r.reviewedAt ?? null,
      r.notes ?? '',
    ],
  },
  // `decision` is one of the four composed answers, chosen by a person.
  'editorial/finding-exception-queue.json': {
    humanInput: (r) => filled(r.decision),
    carried: false,
  },
  // Every field is the reconciler's own output: `verdict` here is the
  // machine's comparison with the speaker map, not a curator's.
  'editorial/attribution-queue.json': {
    humanInput: () => false,
    carried: false,
  },
}

const rowsOf = (parsed: unknown): Row[] => {
  const rows = (parsed as { rows?: unknown })?.rows
  return Array.isArray(rows) ? (rows as Row[]) : []
}

export type RepairAction = 'absent' | 'clean' | 'rebuild' | 'refuse'

export interface RepairDecision {
  action: RepairAction
  reason: string
}

export function decideRepair(
  report: QueueReport,
  parsed: unknown | null,
  spec: RepairSpec,
): RepairDecision {
  if (!report.present || parsed === null)
    return { action: 'absent', reason: 'sin fichero en esta máquina' }
  if (report.unkeyed > 0)
    return {
      action: 'refuse',
      reason: `${report.unkeyed} fila(s) sin id: la forma cambió, y eso lo mira una persona`,
    }
  if (isClean(report)) return { action: 'clean', reason: 'todas las filas vivas' }
  const conMano = rowsOf(parsed).filter(spec.humanInput).length
  if (!spec.carried && conMano > 0)
    return {
      action: 'refuse',
      reason:
        `${conMano} fila(s) con lo que eligió un curador, y este constructor no lo arrastra: ` +
        'rehacerla lo borraría. Aplícalo o vacíalo y vuelve a correrla.',
    }
  const sobran = report.retracted.length + report.orphaned.length
  return {
    action: 'rebuild',
    reason: `${sobran} fila(s) sobre hallazgos que ya no se publican`,
  }
}

/**
 * Ids whose curator input the rebuild reset while keeping the same key — the
 * one outcome that means the builder did not carry what it says it carries.
 */
export function lostCuratorInput(before: unknown, after: unknown, spec: RepairSpec): string[] {
  if (!spec.carried || !spec.carryKey || !spec.curatorView) return []
  const despues = new Map(rowsOf(after).map((r) => [spec.carryKey!(r), r]))
  const perdidas: string[] = []
  for (const r of rowsOf(before)) {
    if (!spec.humanInput(r)) continue
    const nueva = despues.get(spec.carryKey(r))
    if (!nueva) continue
    if (JSON.stringify(spec.curatorView(nueva)) !== JSON.stringify(spec.curatorView(r)))
      perdidas.push(String(r.id ?? r.findingId))
  }
  return perdidas
}
