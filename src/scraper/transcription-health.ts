/**
 * Is the transcription backlog moving, and is it worth waking someone up?
 *
 * Two decisions, both with a wrong answer available, both previously buried in
 * `scripts/check-transcription-health.ts` where nothing could test them:
 *
 *   1. What is the DENOMINATOR? Only a session with a video can ever be
 *      transcribed, so counting the rest as pending keeps the alarm on forever
 *      over work nobody can do. But the video index lags — it has listed fewer
 *      sessions than we hold transcripts for, which printed «44/24 transcritas».
 *      A monitor that prints impossible numbers is one nobody believes when it
 *      finally says something real.
 *   2. Should this fire AGAIN? The same cause repeated nightly trains everyone
 *      to mute the channel, and a muted alarm is not an alarm.
 *
 * Pure: the caller supplies the clock, the files and the network.
 */

export interface PlenoRef {
  id: string
  date: string
}

export interface BacklogInput {
  plenos: PlenoRef[]
  /** Ids that already have a transcript on disk. */
  transcribedIds: string[]
  /** Dates present in the video index, or null when there is no index at all. */
  videoDates: string[] | null
  /** mtime of the newest transcript, or 0 when there are none. */
  newestTranscriptMs: number
  nowMs: number
}

export interface Backlog {
  /** Sessions that could have a transcript: has a video, OR already has one. */
  transcribable: string[]
  done: string[]
  remaining: string[]
  totalSessions: number
  /** Sessions excluded from the denominator because nothing can be done. */
  withoutVideo: number
  /** Infinity when nothing has ever been transcribed. */
  daysSinceNewest: number
}

/**
 * The universe is «has a video OR already has a transcript».
 *
 * The OR is load-bearing. Taking the video index as the universe made the
 * denominator smaller than the numerator the moment the index fell behind.
 */
export function computeBacklog(input: BacklogInput): Backlog {
  const done = new Set(input.transcribedIds)
  const ids = input.plenos.map((p) => p.id)

  const hasVideo = input.videoDates
    ? new Set(input.plenos.filter((p) => new Set(input.videoDates).has(p.date)).map((p) => p.id))
    : new Set(ids) // no index: assume every session is fair game rather than none

  const transcribable = ids.filter((id) => hasVideo.has(id) || done.has(id))
  const daysSinceNewest = input.newestTranscriptMs
    ? (input.nowMs - input.newestTranscriptMs) / 86_400_000
    : Infinity

  return {
    transcribable,
    done: transcribable.filter((id) => done.has(id)),
    remaining: transcribable.filter((id) => !done.has(id)),
    totalSessions: ids.length,
    withoutVideo: ids.length - transcribable.length,
    daysSinceNewest,
  }
}

export interface NotifyState {
  lastCause?: string
  lastNotifiedAt?: string
  lastRemaining?: number
}

export interface NotifyDecision {
  notify: boolean
  /** Why, for the log — a throttled alarm must say it throttled. */
  reason: string
}

/**
 * Repeat an alarm only when it says something new, or when enough time has
 * passed that silence would itself be misleading.
 */
export function shouldNotify(args: {
  state: NotifyState
  cause: string
  nowMs: number
  force?: boolean
  renotifyDays: number
}): NotifyDecision {
  if (args.force) return { notify: true, reason: '--force' }
  if (args.state.lastCause !== args.cause) {
    return { notify: true, reason: 'la causa cambió desde el último aviso' }
  }
  if (!args.state.lastNotifiedAt) {
    return { notify: true, reason: 'misma causa pero no consta aviso previo' }
  }
  const parsed = new Date(args.state.lastNotifiedAt).getTime()
  if (!Number.isFinite(parsed)) {
    // A corrupt timestamp must not silence the alarm — fail loud, not quiet.
    return { notify: true, reason: 'la marca de tiempo del último aviso no es legible' }
  }
  const daysAgo = (args.nowMs - parsed) / 86_400_000
  if (daysAgo >= args.renotifyDays) {
    return {
      notify: true,
      reason: `misma causa pero el último aviso fue hace ${daysAgo.toFixed(1)} días`,
    }
  }
  return {
    notify: false,
    reason: `misma causa y avisado hace ${daysAgo.toFixed(1)} días (< ${args.renotifyDays})`,
  }
}
