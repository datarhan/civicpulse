/**
 * The queue repair the local cron runs before the health digest.
 *
 * `check:queues` reports a worklist that still lists findings since retracted,
 * and names the `triage:*` pass that fixes it; on 2026-10-18 that alarm reached
 * the operator's phone for the umpteenth time and the fix was, again, running
 * two deterministic passes by hand. Doing it unattended is a weakening — it
 * only drops rows about findings that are gone — PROVIDED nothing a curator
 * wrote into the file is lost. These tests pin that proviso: a queue whose
 * builder does not carry curator input is never rebuilt while it holds some,
 * and a carried queue is verified after the rebuild.
 */
import { describe, it, expect } from 'vitest'
import { QUEUE_SOURCES, type QueueReport } from '../src/scraper/queue-staleness'
import { REPAIR_SPECS, decideRepair, lostCuratorInput } from '../src/scraper/queue-repair'
import { SUPPORT_VERDICT_IDS } from '../src/scraper/finding-support'

// A curator's verdict, read from the enum rather than restated (DATA_INTEGRITY rule 1).
const UN_VEREDICTO = SUPPORT_VERDICT_IDS.find((v) => v !== 'pendiente')!

const report = (over: Partial<QueueReport> = {}): QueueReport => ({
  path: 'editorial/quote-reanchor-queue.json',
  regenerate: 'npm run triage:quote-reanchor',
  present: true,
  total: 3,
  live: 2,
  orphaned: [],
  retracted: ['f-x'],
  unkeyed: 0,
  ...over,
})

const REANCHOR = 'editorial/quote-reanchor-queue.json'
const SUPPORT = 'editorial/finding-support-queue.json'
const EXCEPTION = 'editorial/finding-exception-queue.json'

describe('REPAIR_SPECS', () => {
  it('declares every queue check:queues watches, and nothing else', () => {
    // A queue added to QUEUE_SOURCES without saying what a curator writes in
    // it would be rebuilt blind. Pinned both ways.
    expect(Object.keys(REPAIR_SPECS).sort()).toEqual(QUEUE_SOURCES.map((s) => s.path).sort())
  })
})

describe('decideRepair', () => {
  const rows = (...r: object[]) => ({ rows: r })

  it('leaves an absent file alone: there is no worklist on this machine', () => {
    const d = decideRepair(report({ present: false }), null, REPAIR_SPECS[REANCHOR])
    expect(d.action).toBe('absent')
  })

  it('leaves a clean queue alone, so a curator file is not rewritten daily', () => {
    const d = decideRepair(
      report({ retracted: [] }),
      rows({ findingId: 'a', seleccion: null }),
      REPAIR_SPECS[REANCHOR],
    )
    expect(d.action).toBe('clean')
  })

  it('rebuilds a stale queue that holds no curator input', () => {
    const d = decideRepair(
      report(),
      rows({ findingId: 'a', seleccion: null }, { findingId: 'f-x', seleccion: null }),
      REPAIR_SPECS[REANCHOR],
    )
    expect(d.action).toBe('rebuild')
  })

  it('refuses a stale queue whose builder would wipe what a curator chose', () => {
    const d = decideRepair(
      report(),
      rows({ findingId: 'a', seleccion: 1 }, { findingId: 'f-x', seleccion: null }),
      REPAIR_SPECS[REANCHOR],
    )
    expect(d.action).toBe('refuse')
    expect(d.reason).toMatch(/1 fila/)
  })

  it('refuses the exception queue the same way when a decision is written', () => {
    const d = decideRepair(
      report({ path: EXCEPTION }),
      rows({ findingId: 'f-x', decision: 'mantener' }),
      REPAIR_SPECS[EXCEPTION],
    )
    expect(d.action).toBe('refuse')
  })

  it('rebuilds a carried queue even with verdicts in it: the builder keeps them', () => {
    const d = decideRepair(
      report({ path: SUPPORT }),
      rows({ id: 'a', summaryHash: 'h', verdict: UN_VEREDICTO, reviewer: 'X' }),
      REPAIR_SPECS[SUPPORT],
    )
    expect(d.action).toBe('rebuild')
  })

  it('refuses rows with no id: that is a shape change, and a person looks', () => {
    const d = decideRepair(report({ unkeyed: 2 }), rows({}), REPAIR_SPECS[REANCHOR])
    expect(d.action).toBe('refuse')
  })
})

describe('lostCuratorInput', () => {
  const spec = () => REPAIR_SPECS[SUPPORT]
  const fila = (id: string, summaryHash: string, verdict: string, notes = '') => ({
    id,
    summaryHash,
    verdict,
    reviewer: verdict === 'pendiente' ? null : 'Sergei Lutchenko',
    reviewedAt: verdict === 'pendiente' ? null : '2026-10-01',
    notes,
  })

  it('finds a verdict the rebuild reset under the same finding and summary', () => {
    const before = { rows: [fila('a', 'h1', UN_VEREDICTO, 'leído')] }
    const after = { rows: [fila('a', 'h1', 'pendiente')] }
    expect(lostCuratorInput(before, after, spec())).toEqual(['a'])
  })

  it('is not a loss when the summary changed: the builder invalidates on purpose', () => {
    const before = { rows: [fila('a', 'h1', UN_VEREDICTO)] }
    const after = { rows: [fila('a', 'h2', 'pendiente')] }
    expect(lostCuratorInput(before, after, spec())).toEqual([])
  })

  it('is not a loss when the finding left the queue with its retraction', () => {
    const before = { rows: [fila('a', 'h1', UN_VEREDICTO), fila('b', 'h', 'pendiente')] }
    const after = { rows: [fila('b', 'h', 'pendiente')] }
    expect(lostCuratorInput(before, after, spec())).toEqual([])
  })

  it('a pending row is not curator input', () => {
    const before = { rows: [fila('a', 'h1', 'pendiente')] }
    const after = { rows: [fila('a', 'h1', 'pendiente')] }
    expect(lostCuratorInput(before, after, spec())).toEqual([])
  })
})
