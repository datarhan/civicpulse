/**
 * Who wrote this published finding — a person, or a process?
 *
 * `/metodologia` discloses the answer, so getting it wrong is not a cosmetic
 * bug: it misstates how much of the site a machine authored, on the page a
 * reader consults precisely to find that out.
 *
 * It WAS wrong. Two places independently guessed with
 * `curatorName.startsWith('auto')`, which matches `auto-curation-v1` but not
 * `civicpulse-auto` — so 49 machine-written findings were disclosed as 44, and
 * the reader-review pass was handed the same under-count as ground truth.
 * Classic DATA_INTEGRITY rule 1: two copies of a shape, both wrong, neither
 * failing.
 *
 * ## The default direction is deliberate
 *
 * Humans are named; everything else counts as a machine. The alternative —
 * listing the machines — means a NEW automated curator nobody added to the list
 * is silently counted as human, which over-claims human oversight on the page
 * that promises it. This way the failure goes the other way: a new human
 * curator is briefly counted as a machine, which understates our own oversight.
 * For a watchdog that is the safe error.
 */

/**
 * Curator identities that are a person. Add a new one here when a real human
 * starts curating — and nowhere else.
 */
export const HUMAN_CURATORS: ReadonlySet<string> = new Set(['civicpulse-curator'])

/** Unknown or absent authorship counts as machine, on purpose. See above. */
export function isMachineAuthored(curatorName?: string | null): boolean {
  return !HUMAN_CURATORS.has((curatorName ?? '').trim())
}

export interface AuthorshipBreakdown {
  total: number
  machine: number
  human: number
  /** Machine curator identities, most prolific first. */
  byMachineName: Array<[string, number]>
}

export function authorshipBreakdown(
  items: ReadonlyArray<{ curatorName?: string | null }>,
): AuthorshipBreakdown {
  const byMachineName = new Map<string, number>()
  let machine = 0
  for (const f of items ?? []) {
    if (!isMachineAuthored(f?.curatorName)) continue
    machine += 1
    const n = (f?.curatorName ?? '').trim() || '(sin firma)'
    byMachineName.set(n, (byMachineName.get(n) ?? 0) + 1)
  }
  const total = (items ?? []).length
  return {
    total,
    machine,
    human: total - machine,
    byMachineName: [...byMachineName.entries()].sort(
      (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
    ),
  }
}
