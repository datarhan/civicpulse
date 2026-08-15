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
 * A chunk that keeps failing must stop costing a call every night.
 *
 * `15uvjew` sat at 16 of 17 with chunk 8 covering 66% against an 85% floor,
 * three attempts running. `isMapComplete` wants `done >= total`, so the session
 * headed the backlog every night and every night the pass spent its retries on
 * it. Over a twenty-night sweep that is twenty nights of quota buying nothing.
 *
 * **The premise this was built on turned out to be false, and that is worth
 * keeping written down.** Three identical 66% readings looked deterministic —
 * "the model cannot read this window". On the fourth attempt it returned 89
 * segments and the session closed at 17/17, 100%. Coverage failures here are
 * FLAKY. So a write-off is a decision to stop spending, not a finding about the
 * audio, and the tests below are about the spending rule; none of them asserts
 * that a retired chunk is unreadable, because it may well not be.
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
  // This block pointed at `15uvjew` and its proof-of-work assertion did its
  // job: on 2026-08-15 the session finished — its "permanently" failing chunk 8
  // passed on the fourth try — so the file stopped being able to demonstrate
  // anything about unfinished sessions, and the test said so instead of quietly
  // measuring a different world. Repointed at a session that is genuinely
  // unfinished, and one whose gaps are of the kind that must NEVER accumulate.
  const real = JSON.parse(readFileSync(resolve('pleno-speaker-map/brxx5g.json'), 'utf8'))

  it('brxx5g is unfinished and its gaps are budget gaps, not failures', () => {
    // Proof of work. If this flips, the sweep finished the session and
    // everything below is measuring something else.
    expect(isMapComplete(real)).toBe(false)
    expect(real.stats.failedChunks.length).toBeGreaterThan(0)
    expect(
      real.stats.failedChunks.every((f: FailedChunk) => /never attempted/.test(f.why)),
      'this session now has real coverage failures, so it no longer isolates the budget case',
    ).toBe(true)
  })

  it('does not retire a session on the strength of a count nobody recorded', () => {
    // These gaps are chunks the nightly budget never reached. They carry no
    // `attempts`, and they must not: retiring a chunk for being under-budgeted
    // is exactly backwards, and reading an absent count as "given up on" would
    // do it to every session in the backlog at once.
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
