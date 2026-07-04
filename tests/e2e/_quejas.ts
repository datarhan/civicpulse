import { readFileSync } from 'node:fs'

/**
 * The /quejas empty-state copy ("el canal … está abierto") only renders when
 * `public/data/quejas.json` has `stats.total === 0`. Once the Telegram bot
 * captures a real queja the committed snapshot is non-empty and that copy is
 * (correctly) gone — not a frontend bug. The empty-state e2e reads this so it
 * gates its assertion on real data and restores coverage automatically once the
 * snapshot is empty again (mirrors `agendaHasDepartments` in ./_agenda).
 */
export function quejasIsEmpty(): boolean {
  try {
    const q = JSON.parse(readFileSync('public/data/quejas.json', 'utf8'))
    return (q?.stats?.total ?? 0) === 0
  } catch {
    // No snapshot on disk → the page shows the empty-state, so treat as empty.
    return true
  }
}
