import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  authorshipBreakdown,
  isMachineAuthored,
  HUMAN_CURATORS,
} from '../src/scraper/finding-authorship'

describe('finding-authorship — the case the prefix guess missed', () => {
  it('counts civicpulse-auto as a machine', () => {
    // `startsWith('auto')` matched auto-curation-v1 and NOT this, so
    // /metodologia disclosed 44 machine-written findings where there were 49.
    expect(isMachineAuthored('civicpulse-auto')).toBe(true)
    expect(isMachineAuthored('auto-curation-v1')).toBe(true)
  })

  it('counts the human curator as human', () => {
    expect(isMachineAuthored('civicpulse-curator')).toBe(false)
  })

  it('breaks the total down without losing anyone', () => {
    const items = [
      { curatorName: 'auto-curation-v1' },
      { curatorName: 'auto-curation-v1' },
      { curatorName: 'civicpulse-auto' },
      { curatorName: 'civicpulse-curator' },
    ]
    const b = authorshipBreakdown(items)
    expect(b).toEqual({
      total: 4,
      machine: 3,
      human: 1,
      byMachineName: [
        ['auto-curation-v1', 2],
        ['civicpulse-auto', 1],
      ],
    })
    expect(b.machine + b.human).toBe(b.total)
  })
})

describe('finding-authorship — the default direction is the safe one', () => {
  // Listing the MACHINES would mean a new automated curator nobody added is
  // silently counted as human, over-claiming oversight on the page that
  // promises it. Listing the humans fails the other way, which for a watchdog
  // is the error to prefer.
  it('an unknown curator counts as a machine, not as a person', () => {
    expect(isMachineAuthored('some-future-pipeline-v3')).toBe(true)
  })

  it('a missing or blank signature counts as a machine', () => {
    expect(isMachineAuthored(undefined)).toBe(true)
    expect(isMachineAuthored(null)).toBe(true)
    expect(isMachineAuthored('   ')).toBe(true)
  })

  it('an unsigned finding is grouped under an explicit label, never silently', () => {
    expect(authorshipBreakdown([{ curatorName: '' }]).byMachineName).toEqual([['(sin firma)', 1]])
  })

  it('tolerates surrounding whitespace on a real human name', () => {
    expect(isMachineAuthored('  civicpulse-curator  ')).toBe(false)
  })

  it('an empty snapshot is zeroes, not a crash', () => {
    expect(authorshipBreakdown([])).toEqual({
      total: 0,
      machine: 0,
      human: 0,
      byMachineName: [],
    })
  })
})

describe('finding-authorship — against the real published snapshot', () => {
  // Not a frozen number: reads what is actually published and asserts the
  // INVARIANTS. A hard-coded 49 here would rot exactly like the prose did.
  const snapshot = JSON.parse(
    readFileSync(resolve(__dirname, '../public/data/pleno-findings.json'), 'utf8'),
  ) as { items: Array<{ curatorName?: string }> }

  it('every published finding is attributed to exactly one side', () => {
    const b = authorshipBreakdown(snapshot.items)
    expect(b.total).toBe(snapshot.items.length)
    expect(b.machine + b.human).toBe(b.total)
  })

  it('every curator name in the snapshot is either a known human or counted as a machine', () => {
    const names = new Set(snapshot.items.map((f) => (f.curatorName ?? '').trim()))
    for (const n of names) {
      expect(HUMAN_CURATORS.has(n) || isMachineAuthored(n)).toBe(true)
    }
  })

  it('the machine share is the majority — the disclosure exists because it is', () => {
    const b = authorshipBreakdown(snapshot.items)
    expect(b.machine).toBeGreaterThan(b.human)
  })
})
