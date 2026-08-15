import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  GIVE_UP_AFTER_ATTEMPTS,
  recordFailure,
  writtenOffChunks,
  isMapComplete,
  classifyBacklogState,
  type FailedChunk,
} from '../src/scraper/speaker-map'
import {
  SPEAKER_MAP_PROMPT_VERSION,
  SPEAKER_MAP_COVERAGE_FLOOR,
} from '../src/scraper/speaker-map-prompt'

/**
 * A chunk that cannot be read must stop costing a call every night.
 *
 * `15uvjew` sits at 16 of 17. Chunk 8 covers 66% against an 85% floor and has
 * come back at exactly 66% on every attempt — the model reads that window the
 * same way each time. But `isMapComplete` wants `done >= total`, so the session
 * heads the backlog every night, and every night the pass spends its retries
 * failing identically. Over a twenty-night sweep that is twenty nights of
 * quota buying nothing.
 *
 * The fix is NOT to lower the floor. A 66% chunk published as if it were whole
 * is the defect the floor exists to stop: downstream, a gap in a speaker map is
 * indistinguishable from a stretch where nobody spoke. The fix is to stop
 * RETRYING it while still declaring it — the hole stays in `failedChunks`,
 * visible, and the session leaves the queue.
 *
 * ## Why writing-off is tied to the gate that did it
 *
 * Because "permanent" has already been wrong once here, and expensively. In
 * August 2026 a third of all chunks were being discarded as unreadable; the
 * cause was the model writing M.SS where the parser expected seconds, and once
 * `decodeElapsed` absorbed that, the two chunks that had "permanently" failed
 * both passed at 100%. A verdict reached under a broken gate is not one to
 * carry forward, so a written-off chunk records WHICH gate wrote it off and
 * reopens the moment the prompt or the floor moves.
 */

const GATE = { prompt: SPEAKER_MAP_PROMPT_VERSION, floor: SPEAKER_MAP_COVERAGE_FLOOR }
const fail = (over: Partial<FailedChunk> = {}): FailedChunk => ({
  chunk: 8,
  why: 'covered 66% (floor 85%)',
  ...over,
})

describe('a failing chunk is given up on, but only after several nights', () => {
  it('counts a first failure as one attempt, not as a write-off', () => {
    const f = recordFailure(undefined, 8, 'covered 66% (floor 85%)', GATE)
    expect(f.attempts).toBe(1)
    expect(writtenOffChunks([f], GATE).has(8)).toBe(false)
  })

  it('keeps attempting it below the threshold', () => {
    let f = recordFailure(undefined, 8, 'why', GATE)
    for (let i = 1; i < GIVE_UP_AFTER_ATTEMPTS - 1; i++) f = recordFailure(f, 8, 'why', GATE)
    expect(f.attempts).toBe(GIVE_UP_AFTER_ATTEMPTS - 1)
    expect(writtenOffChunks([f], GATE).has(8)).toBe(false)
  })

  it('writes it off once the threshold is reached', () => {
    let f = recordFailure(undefined, 8, 'why', GATE)
    while ((f.attempts ?? 0) < GIVE_UP_AFTER_ATTEMPTS) f = recordFailure(f, 8, 'why', GATE)
    expect(writtenOffChunks([f], GATE).has(8)).toBe(true)
  })

  // The counter alone is not the record. Without the gate stamped alongside it,
  // a chunk written off under a broken parser stays written off after the
  // parser is fixed — which is the mm:ss incident, preserved in amber.
  it('reopens a written-off chunk when the prompt changes, and starts the count again', () => {
    const old = fail({ attempts: GIVE_UP_AFTER_ATTEMPTS, givenUpUnder: { ...GATE } })
    const nuevo = { ...GATE, prompt: `${GATE.prompt}-siguiente` }
    expect(writtenOffChunks([old], nuevo).has(8), 'stayed written off under a new prompt').toBe(
      false,
    )
    expect(recordFailure(old, 8, 'why', nuevo).attempts, 'carried the old gate’s count').toBe(1)
  })

  it('reopens it when the coverage floor moves', () => {
    const old = fail({ attempts: GIVE_UP_AFTER_ATTEMPTS, givenUpUnder: { ...GATE } })
    const nuevo = { ...GATE, floor: GATE.floor - 0.1 }
    expect(writtenOffChunks([old], nuevo).has(8)).toBe(false)
  })
})

describe('a session with written-off gaps leaves the queue', () => {
  const map = (failed: FailedChunk[], done = 16, total = 17) => ({
    stats: { chunksTranscribed: done, chunksExpected: total, failedChunks: failed },
  })

  it('is NOT complete while its gap is still being attempted', () => {
    expect(isMapComplete(map([fail({ attempts: 1, givenUpUnder: { ...GATE } })]))).toBe(false)
  })

  it('IS complete once every outstanding chunk has been written off', () => {
    const gone = fail({ attempts: GIVE_UP_AFTER_ATTEMPTS, givenUpUnder: { ...GATE } })
    expect(isMapComplete(map([gone]))).toBe(true)
    expect(classifyBacklogState({ referenceUsable: true, map: map([gone]) })).toBeNull()
  })

  it('is NOT complete when the write-offs do not cover the shortfall', () => {
    // Two chunks missing, one written off. Declaring this finished would hide a
    // chunk nobody ever looked at behind one somebody did.
    const gone = fail({ attempts: GIVE_UP_AFTER_ATTEMPTS, givenUpUnder: { ...GATE } })
    expect(isMapComplete(map([gone], 15, 17))).toBe(false)
  })

  it('does not count a write-off from a gate that no longer applies', () => {
    const stale = fail({
      attempts: GIVE_UP_AFTER_ATTEMPTS,
      givenUpUnder: { prompt: 'speaker-map-v0', floor: 0.5 },
    })
    expect(isMapComplete(map([stale])), 'a stale write-off retired the session').toBe(false)
  })
})

describe('against the map on disk', () => {
  const real = JSON.parse(readFileSync(resolve('pleno-speaker-map/15uvjew.json'), 'utf8'))

  it('15uvjew is unfinished, and its gap has no attempt history yet', () => {
    // Proof of work for the test below: written before any run has recorded an
    // attempt count, so the session must still be in the backlog. If this ever
    // flips to complete, the sweep finished it and the assertion below is
    // measuring a different world.
    expect(isMapComplete(real)).toBe(false)
    expect(real.stats.failedChunks.length).toBeGreaterThan(0)
  })

  it('does not retire a session on the strength of a count nobody recorded', () => {
    // The gaps already on disk carry no `attempts`. Treating an absent count as
    // "given up on" would retire sessions on no evidence at all; they earn it
    // over the next few nights or not at all.
    expect(writtenOffChunks(real.stats.failedChunks, GATE).size).toBe(0)
  })

  // The assertion above passes for the wrong reason on its own: the entries on
  // disk carry no gate stamp either, and the gate check alone rejects them. So
  // an absent `attempts` was never actually under test — swapping its default
  // to "given up on" left the whole file green. This is the case that isolates
  // it: gate present, count missing.
  it('an entry stamped with the current gate but no count is still not written off', () => {
    const sinCuenta = fail({ givenUpUnder: { ...GATE } })
    expect(writtenOffChunks([sinCuenta], GATE).has(8)).toBe(false)
  })
})
