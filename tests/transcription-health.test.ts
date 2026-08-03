import { describe, it, expect } from 'vitest'
import {
  computeBacklog,
  shouldNotify,
  type BacklogInput,
} from '../src/scraper/transcription-health'

const DAY = 86_400_000
const NOW = Date.UTC(2026, 7, 3) // 2026-08-03, fixed: a clock in a test is a flake

const plenos = [
  { id: 'a', date: '2026-01-10' },
  { id: 'b', date: '2026-02-10' },
  { id: 'c', date: '2026-03-10' },
]
const base: BacklogInput = {
  plenos,
  transcribedIds: [],
  videoDates: null,
  newestTranscriptMs: 0,
  nowMs: NOW,
}

describe('transcription-health — the denominator', () => {
  it('excludes sessions with no video: unreachable work is not a backlog', () => {
    const b = computeBacklog({ ...base, videoDates: ['2026-01-10'] })
    expect(b.transcribable).toEqual(['a'])
    expect(b.remaining).toEqual(['a'])
    expect(b.withoutVideo).toBe(2)
    expect(b.totalSessions).toBe(3)
  })

  it('counts a transcribed session even when the video index has not caught up', () => {
    // The «44/24 transcritas» bug: the index lagged, so the universe was
    // smaller than the set of transcripts we already held.
    const b = computeBacklog({
      ...base,
      videoDates: ['2026-01-10'],
      transcribedIds: ['a', 'b', 'c'],
    })
    expect(b.transcribable.sort()).toEqual(['a', 'b', 'c'])
    expect(b.done).toHaveLength(3)
    expect(b.remaining).toEqual([])
  })

  it('NEVER reports more done than transcribable — the impossible figure', () => {
    // The invariant, asserted over every combination rather than one example.
    for (const videoDates of [null, [], ['2026-01-10'], ['2026-01-10', '2026-03-10']]) {
      for (const transcribedIds of [[], ['a'], ['a', 'b'], ['a', 'b', 'c'], ['ghost']]) {
        const b = computeBacklog({ ...base, videoDates, transcribedIds })
        expect(b.done.length).toBeLessThanOrEqual(b.transcribable.length)
        expect(b.done.length + b.remaining.length).toBe(b.transcribable.length)
      }
    }
  })

  it('ignores a transcript for a session that is not in plenos.json', () => {
    const b = computeBacklog({ ...base, videoDates: [], transcribedIds: ['ghost'] })
    expect(b.transcribable).toEqual([])
    expect(b.done).toEqual([])
  })

  it('with no video index at all, treats every session as fair game', () => {
    // Assuming NONE would silently report a healthy empty backlog — the exact
    // "check that cannot fail" shape.
    expect(computeBacklog(base).transcribable).toHaveLength(3)
  })

  it('reports Infinity, not 0, when nothing has ever been transcribed', () => {
    // 0 would read as "transcribed just now" and suppress the stall alarm.
    expect(computeBacklog(base).daysSinceNewest).toBe(Infinity)
  })

  it('measures staleness from the newest transcript', () => {
    const b = computeBacklog({ ...base, newestTranscriptMs: NOW - 4.5 * DAY })
    expect(b.daysSinceNewest).toBeCloseTo(4.5, 5)
  })
})

describe('transcription-health — repeating an alarm', () => {
  const cause = 'OpenAI responde 429'
  const state = { lastCause: cause, lastNotifiedAt: new Date(NOW - 2 * DAY).toISOString() }

  it('stays quiet on the same cause inside the window', () => {
    const d = shouldNotify({ state, cause, nowMs: NOW, renotifyDays: 7 })
    expect(d.notify).toBe(false)
    expect(d.reason).toContain('2.0')
  })

  it('speaks up when the cause changes', () => {
    expect(shouldNotify({ state, cause: 'otra cosa', nowMs: NOW, renotifyDays: 7 }).notify).toBe(
      true,
    )
  })

  it('speaks up once the window has passed', () => {
    expect(shouldNotify({ state, cause, nowMs: NOW + 6 * DAY, renotifyDays: 7 }).notify).toBe(true)
  })

  it('--force always speaks', () => {
    expect(shouldNotify({ state, cause, nowMs: NOW, force: true, renotifyDays: 7 }).notify).toBe(
      true,
    )
  })

  it('speaks up when the state file has no record of a previous notification', () => {
    expect(
      shouldNotify({ state: { lastCause: cause }, cause, nowMs: NOW, renotifyDays: 7 }).notify,
    ).toBe(true)
  })

  it('a corrupt timestamp makes it LOUDER, not quieter', () => {
    // NaN comparisons are false, so an unguarded `daysAgo >= renotify` would
    // silence the alarm forever on a garbled state file.
    const d = shouldNotify({
      state: { lastCause: cause, lastNotifiedAt: 'no es una fecha' },
      cause,
      nowMs: NOW,
      renotifyDays: 7,
    })
    expect(d.notify).toBe(true)
  })

  it('an empty state notifies — a first run is not a repeat', () => {
    expect(shouldNotify({ state: {}, cause, nowMs: NOW, renotifyDays: 7 }).notify).toBe(true)
  })
})
