/**
 * A pleno's speaker map: `SPEAKER_NN` → the bloc that spoke, and the audio
 * evidence that establishes it.
 *
 * ## Why this exists
 *
 * The claim extractor is handed a ~1200-char slice of transcript and asked
 * which bloc is speaking. Measured on pleno `10yl550`, of 515 such windows
 * **6 (1%)** contain a turn-grant — the only valid evidence of who holds the
 * floor — and 41% contain a party name, which in a debate is usually the party
 * being *attacked*. So the question is unanswerable from the window, and the
 * model answers it anyway by reaching for the party named in the text. That is
 * the published attribution inversion: quotes filed under the bloc they
 * criticise.
 *
 * The evidence does exist — the chair grants every turn by naming party and
 * person — but it lives minutes away from the claim, and `gpt-4o-transcribe-diarize`
 * shreds those short Valencian phrases («Compromís, Rafa» → «Más palabras,
 * compromiso, razón»). A separate pass recovers them once per session, and
 * this map is the result. Attribution then becomes a join, not a judgement.
 *
 * ## What a row asserts, and what it does not
 *
 * A row says "the person labelled SPEAKER_05 belongs to Compromís, and here is
 * the moment on tape where the chair said so". It never asserts anything about
 * the *content* of what they said, and it is not a voiceprint match — no
 * biometric claim is involved. `.voiceprints/` answers a different question
 * and both can hold at once; see `voice-id.ts`.
 *
 * Maps live in `pleno-speaker-map/` at the repo root, **never under `public/`**
 * — Vercel serves that whole directory, and these rows name living people.
 */
// The two settings that decide whether a chunk passes, imported rather than
// restated: a write-off is stamped with the gate that made it, and a hand-copied
// version string would keep every stale write-off alive through a prompt change.
// `speaker-map-prompt` is a leaf — it imports nothing — so there is no cycle.
import {
  SPEAKER_MAP_PROMPT_VERSION,
  SPEAKER_MAP_COVERAGE_FLOOR,
  SPEAKER_MAP_THINKING_LEVEL,
  type ThinkingLevel,
} from './speaker-map-prompt'

/**
 * How a piece of audio evidence connects to the speaker it identifies.
 *
 * The distinction is load-bearing: `turn-grant` and `reply` can be verified
 * against the segment sequence, `back-reference` cannot, and all three look
 * identical if the map only records a timestamp. An early draft printed just
 * the timestamp, which made a row read as the mayor thanking himself when in
 * fact a councillor was thanking the mayor who had just given him the floor.
 * The inference was sound and unreviewable, which is the worst combination.
 */
export type EvidenceRelation =
  /** The cited line hands the floor to the labelled speaker: «Compromís, Rafa». */
  | 'turn-grant'
  /** The cited line answers the previous speaker: «Sí, gràcies, alcalde». */
  | 'reply'
  /** The cited line names the speaker at arbitrary distance: «que ha plantejat David». */
  | 'back-reference'

export interface SpeakerEvidence {
  /** Who uttered the cited line. NOT the speaker being identified, usually. */
  spokenBy: string
  /** Seconds into the session, inside `spokenBy`'s segment. */
  at: number
  /** Verbatim from the transcript, so the claim can be listened to. */
  quote: string
  relation: EvidenceRelation
}

export interface SpeakerMapRow {
  /** `SPEAKER_NN`, as it appears in the transcript this map is aligned to. */
  label: string
  /**
   * The bloc, or null when the audio named a person but no party and the name
   * did not resolve. Null is a real answer: it means "we heard a name and
   * could not safely turn it into an attribution".
   */
  bloc: string | null
  /** Resolved councillor slug, only when name AND party pinned exactly one. */
  slug: string | null
  /** Name as heard on tape — phonetic, e.g. «Alberto Jimenos» for Gimeno. */
  heardAs: string | null
  evidence: SpeakerEvidence[]
  /**
   * True when `bloc` holds exactly one seat, so naming the bloc names the
   * person by elimination. Drives `decideAutomation({ namesIndividual })`.
   */
  namesIndividual: boolean
  /**
   * Rows resting only on `back-reference` evidence. Kept for review, never
   * sufficient on their own — nothing positional can confirm them.
   */
  weak: boolean
}

/**
 * A label made unique across the whole session: `c03/SPEAKER_01`.
 *
 * Each chunk is transcribed independently, so `SPEAKER_01` in chunk 3 has
 * nothing to do with `SPEAKER_01` in chunk 4 — the same trap the published
 * transcripts already carry, where pyannote's per-chunk numbering makes the
 * chair appear as thirteen different people. Prefixing keeps them apart.
 *
 * Cross-chunk identity is recovered afterwards, and by a stronger route: two
 * labels that resolve to the same councillor slug ARE the same person, which
 * is a documentary claim rather than an acoustic guess.
 */
export function globalLabel(chunk: number, label: string): string {
  return `c${String(chunk).padStart(2, '0')}/${label}`
}

export interface SpeakerMap {
  plenoId: string
  generatedAt: string
  /** Model that produced the raw identity block, for provenance. */
  model: string
  /**
   * Prompt wording that produced these segments. Optional because maps written
   * before it existed genuinely do not know — absent means "v1 or earlier",
   * never "current".
   */
  promptVersion?: string
  /** Chunk length used, so a re-run with different chunking is comparable. */
  chunkSeconds: number
  /**
   * Every segment, times made absolute and labels made global. P3 aligns the
   * published transcript against this text, so it has to travel with the map.
   */
  segments: RawSegment[]
  rows: SpeakerMapRow[]
  /**
   * Candidates that failed a gate, each with the reason and the detail.
   *
   * Persisted, not just tallied. A curator asking "why is this councillor
   * missing from the map" needs the answer in the file, and a tuning change to
   * a gate needs the cases it would newly admit — neither is recoverable from
   * a count.
   */
  rejected: Array<{ label: string; reason: string; detail: string }>
  /**
   * What the run did, separately. A map with zero rows because the audio was
   * never fetched and a map with zero rows because nobody was ever named are
   * different facts, and folding them together is `DATA_INTEGRITY.md` rule 2.
   */
  stats: {
    /**
     * Chunks in the SESSION, not in the run that produced this file. A 25-chunk
     * session capped at 16 by the daily quota records 25 here and 16 below, and
     * `chunksTranscribed < chunksExpected` is what tells the backlog the
     * session is unfinished. Recording the run's plan instead made a capped run
     * indistinguishable from a complete one.
     */
    chunksExpected: number
    chunksTranscribed: number
    /**
     * Chunks that never produced a usable transcript, with why. Named
     * explicitly so a gap in the map cannot be mistaken for a stretch where
     * nobody spoke — `DATA_INTEGRITY.md` rule 2, the same distinction between
     * "never attempted" and "nothing found".
     */
    failedChunks: FailedChunk[]
    labelsSeen: number
    rowsAccepted: number
    rowsRejected: number
    /** Reason → count, so a run can say WHY it dropped what it dropped. */
    rejectedBy: Record<string, number>
    /**
     * Chunks THIS run sent to the model — the only number that reflects what
     * it cost. `chunksTranscribed` counts everything now complete, including
     * chunks carried forward for free, so a budget that subtracts it charges a
     * run for work it never did: a session resuming at 16/17 and mapping one
     * chunk billed 17 against an 18-chunk budget and stopped the nightly
     * pipeline before it reached the next session.
     *
     * Optional because a map written before this existed genuinely does not
     * know. Absent means "unknown", and a caller must not read it as zero.
     */
    attemptedThisRun?: number
    /**
     * Peticiones que esta pasada mandó al modelo, reintentos incluidos.
     *
     * Es la unidad que la cuota mide y la única con la que se puede presupuestar
     * una noche. Existía como contador dentro del proceso y moría con él, así
     * que el nocturno restaba TROZOS de un techo de PETICIONES: los días 20 y 21
     * de agosto de 2026 un trozo costó 3,0 llamadas —12 para 4, porque uno que
     * falla se lleva sus tres intentos— contra un presupuesto dimensionado sobre
     * 1,33.
     *
     * Opcional por el mismo motivo que `attemptedThisRun`: un mapa escrito antes
     * de que existiera no lo sabe, y ausente significa «no consta», nunca cero.
     */
    apiCalls?: number
    /**
     * Share of the session's SPEECH the map recovered — measured against the
     * published transcript, not against the session's duration. Silence is not
     * missing data, and a chunk that is mostly silence is not a chunk that was
     * mostly missed. See `referenceCoverage`.
     */
    coverage: number
  }
}

// ── Parsing the model's response ────────────────────────────────────────────

/** One `[start → end] (SPEAKER_NN) text` line, as the model emitted it. */
export interface RawSegment {
  start: number
  end: number
  speaker: string
  text: string
}

/**
 * One identity line, parsed but **not judged**. `party` may be unacredited,
 * `heardAs` may be a mishearing, the relation may not hold. Deciding that is
 * `speaker-map-validate.ts`'s job, and keeping the two apart is what lets the
 * validator's gates be tested against real model output rather than against
 * whatever the parser already filtered out.
 */
export interface SpeakerCandidate {
  label: string
  heardAs: string | null
  party: string | null
  evidence: SpeakerEvidence | null
}

export interface ParsedSpeakerMapResponse {
  segments: RawSegment[]
  candidates: SpeakerCandidate[]
}

const IDENTITY_HEADER = '=== HABLANTES ==='

/** `[12.4 → 18.9] (SPEAKER_03) texto`. The arrow is U+2192, per the prompt. */
const SEGMENT_RE = /^\[\s*(\d+(?:\.\d+)?)\s*→\s*(\d+(?:\.\d+)?)\s*\]\s*\((SPEAKER_\d+)\)\s*(.*)$/

/** `SPEAKER_01 @432.0 "…"` — who uttered the evidence, and when. */
const EVIDENCE_RE = /^(SPEAKER_\d+)\s*@\s*(\d+(?:\.\d+)?)\s*["“](.*)["”]\s*$/

const RELATIONS: readonly EvidenceRelation[] = ['turn-grant', 'reply', 'back-reference']

/** The model writes «sin identificar» for a field it cannot acredit. */
function orNull(field: string): string | null {
  const v = field.trim()
  if (!v) return null
  return /^sin\s+identificar$/i.test(v) ? null : v
}

/**
 * Decode a run of elapsed-time strings, tolerating the model's M.SS slip.
 *
 * The prompt asks for seconds with one decimal and says «Nunca mm:ss». The
 * model disregards it: measured on `15uvjew` chunk 1 (2026-08-11), it wrote the
 * first minute as seconds and then switched notation mid-transcript —
 *
 *     [48.5 → 59.5]   seconds, as asked
 *     [1.19 → 1.26]   1 min 19 s, written M.SS
 *     [9.36 → 9.59]   9 min 59 s = 599 s, the end of a 600 s chunk
 *
 * Read as decimals that transcript "ends" at 9.6 s, scores 1.6 % against the
 * coverage floor and is discarded — the «covered 2%» that run recorded. The
 * response was complete (`finishReason: STOP`, 43 segments, verified against
 * the published transcript: at t=891 s both hold the same sentence). It was
 * then re-requested twice and discarded twice more, because a retry cannot fix
 * a notation the model uses consistently.
 *
 * The rule is the conservative one: **prefer seconds; read M.SS only when the
 * seconds reading would run time backwards**, and only when the fraction is a
 * possible `SS` (≤ 59). A well-formed response never runs backwards, so this
 * cannot touch one — chunk 6's 134 timestamps, all one-decimal, come through
 * unchanged. Where neither reading moves forwards the raw seconds value is
 * kept: a wrong timestamp is worse than a rejected chunk, and the coverage
 * floor is what catches the remainder.
 *
 * This matters beyond coverage. `at` is the second a curator listens to in
 * order to check a published attribution, so decoding it wrong would point
 * them at a different sentence.
 */
export function decodeElapsed(raws: readonly string[]): number[] {
  const out: number[] = []
  let last = -Infinity
  for (const raw of raws) {
    const seconds = Number(raw)
    if (!Number.isFinite(seconds)) {
      out.push(Number.NaN)
      continue
    }
    let value = seconds
    if (seconds < last) {
      const [whole, frac] = raw.split('.')
      // Exactly two digits after the point, and a legal seconds field.
      if (frac?.length === 2 && Number(frac) <= 59) {
        const asClock = Number(whole) * 60 + Number(frac)
        if (asClock >= last) value = asClock
      }
    }
    out.push(value)
    if (value > last) last = value
  }
  return out
}

/**
 * One evidence timestamp, in a response already shown to use M.SS.
 *
 * Only applied when the transcript block established the notation — on its own
 * `1.56` is genuinely ambiguous, and guessing would move a curator's listening
 * point to a different sentence.
 */
function decodeEvidenceAt(raw: string): number {
  const [whole, frac] = raw.split('.')
  if (frac?.length === 2 && Number(frac) <= 59) return Number(whole) * 60 + Number(frac)
  return Number(raw)
}

/**
 * Split a model response into segments and identity candidates.
 *
 * Pure and total: never throws, never fetches. A line it cannot read whole is
 * **dropped**, not half-read — a candidate missing its evidence would look to
 * the validator like a row whose citation simply failed a gate, when in fact
 * nobody ever cited anything.
 */
export function parseSpeakerMapResponse(raw: string): ParsedSpeakerMapResponse {
  const [bodyPart, identityPart = ''] = (raw ?? '').split(IDENTITY_HEADER)

  // Collect the raw timestamp strings before converting any of them: the M.SS
  // slip is only visible across the sequence, never in a single value.
  const rows: Array<{ startRaw: string; endRaw: string; speaker: string; text: string }> = []
  for (const line of bodyPart.split('\n')) {
    const m = SEGMENT_RE.exec(line.trim())
    if (!m) continue
    rows.push({ startRaw: m[1], endRaw: m[2], speaker: m[3], text: m[4].trim() })
  }
  const rawTimes = rows.flatMap((r) => [r.startRaw, r.endRaw])
  const decoded = decodeElapsed(rawTimes)
  // Did the transcript need clock decoding? One response uses one notation, so
  // this is what tells the identity block below how to read ITS timestamps —
  // those are not in time order, so they cannot be decoded on their own.
  const usedClock = decoded.some((v, i) => v !== Number(rawTimes[i]))

  const segments: RawSegment[] = []
  rows.forEach((r, i) => {
    const start = decoded[i * 2]
    const end = decoded[i * 2 + 1]
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return
    segments.push({ start, end, speaker: r.speaker, text: r.text })
  })

  const candidates: SpeakerCandidate[] = []
  for (const line of identityPart.split('\n')) {
    const fields = line.split('|').map((f) => f.trim())
    if (fields.length < 5) continue
    const [label, name, party, ev, rel] = fields
    if (!/^SPEAKER_\d+$/.test(label)) continue

    const relation = rel.replace(/^rel:\s*/i, '').trim() as EvidenceRelation
    if (!RELATIONS.includes(relation)) continue

    const em = EVIDENCE_RE.exec(ev)
    if (!em) continue
    // Read `at` in whatever notation the transcript above turned out to use.
    // These are in candidate order, not time order, so the sequence cannot
    // decode them — but a response that wrote M.SS in block 1 wrote it in
    // block 2 as well (chunk 1 cited «@ 1.56» for a line at 1 min 56 s).
    const at = usedClock ? decodeEvidenceAt(em[2]) : Number(em[2])
    if (!Number.isFinite(at)) continue

    candidates.push({
      label,
      heardAs: orNull(name),
      party: orNull(party),
      evidence: { spokenBy: em[1], at, quote: em[3].trim(), relation },
    })
  }

  return { segments, candidates }
}

/**
 * Seconds of speech the segments cover inside `[from, to)`.
 *
 * The union of their spans, clipped to the window. Overlaps count once — two
 * councillors talking over each other cover that stretch, not twice it — and
 * the input is not assumed sorted, because the model does not reliably emit it
 * in order.
 */
export function speechSeconds(segments: readonly RawSegment[], from: number, to: number): number {
  const spans = segments
    .map((s) => ({ start: Math.max(from, s.start), end: Math.min(to, s.end) }))
    .filter((s) => Number.isFinite(s.start) && Number.isFinite(s.end) && s.end > s.start)
    .sort((a, b) => a.start - b.start)
  if (!spans.length) return 0
  let covered = 0
  let curStart = spans[0].start
  let curEnd = spans[0].end
  for (const s of spans.slice(1)) {
    if (s.start <= curEnd) curEnd = Math.max(curEnd, s.end)
    else {
      covered += curEnd - curStart
      curStart = s.start
      curEnd = s.end
    }
  }
  return covered + (curEnd - curStart)
}

/**
 * A window holding less speech than this is treated as silence: there is
 * nothing in it to miss, so nothing to judge a transcript against.
 */
export const SILENT_WINDOW_SECONDS = 5

/**
 * Least speech a reference must carry before it can judge a session.
 *
 * A pleno is hours long; anything under a minute is not a short session, it is
 * a file that did not parse.
 */
export const MIN_REFERENCE_SPEECH_SECONDS = 60

/**
 * Can this reference judge a session at all?
 *
 * `referenceCoverage` answers 1 for a window the reference says is silent,
 * which is right for the tail of a session and catastrophic for an empty
 * reference: every window then looks silent and the gate passes exactly what
 * it exists to catch. Fail closed — an unusable reference means "cannot
 * judge", never "nothing to miss".
 *
 * Not hypothetical. 23 of the 44 files in `public/data/pleno-transcripts` are
 * acta text rather than diarized audio: placeholder `[0.0 → 0.0]` stamps, no
 * speaker labels. `parseDiarizedTranscript` drops every line and returns [],
 * and `existsSync` on the path cannot tell them from the real thing.
 */
export function isUsableReference(reference: readonly RawSegment[]): boolean {
  if (!reference.length) return false
  return speechSeconds(reference, 0, Number.MAX_SAFE_INTEGER) >= MIN_REFERENCE_SPEECH_SECONDS
}

/**
 * How much of a window's speech the map actually recovered, 0–1.
 *
 * The denominator is the PUBLISHED transcript's speech in the same window, not
 * the window's duration. That distinction is the whole point, and it was paid
 * for twice:
 *
 *   · `segments.at(-1).end / duration`, the original, measured where the last
 *     timestamp landed. One segment near the end of a chunk scored 100 %.
 *   · union-of-segments / duration, the obvious repair, scores silence as
 *     missing data. `15uvjew` does not begin until 545 s, so chunk 0 holds 34 s
 *     of speech in 600 s of audio; the map found 40 s of it — a complete
 *     reading — and that rule scores it 7 % and rejects it, then spends three
 *     retries re-rejecting it on every future run.
 *
 * Against the published transcript the two cases separate cleanly. On the same
 * run: chunk 0, 34 s of speech, map found 40 s → complete. Chunks 1, 3, 6 and
 * 8 held 518 s, 501 s, 546 s and 530 s and the map found nothing → truncated.
 *
 * A window the transcript says is silent returns 1. It cannot be judged
 * missing, and scoring it otherwise fails the tail of every session forever.
 */
export function referenceCoverage(
  mapSegments: readonly RawSegment[],
  referenceSegments: readonly RawSegment[],
  from: number,
  to: number,
): number {
  const expected = speechSeconds(referenceSegments, from, to)
  if (expected < SILENT_WINDOW_SECONDS) return 1
  return Math.min(1, speechSeconds(mapSegments, from, to) / expected)
}

/**
 * Which chunks a resume may legitimately skip.
 *
 * Resume used to treat a chunk as done if the prior map held any segment in
 * its window. Against a gate that could not tell a dense chunk from a sparse
 * one that was as good a proxy as existed. Against a real one it would make
 * the correction inert: every chunk already written, here and across the other
 * 43 sessions, would keep the verdict the old metric gave it. Correcting a
 * gate has to re-open what the old one decided, or nothing already on disk
 * changes.
 */
export function resumableChunks(
  mapSegments: readonly RawSegment[],
  referenceSegments: readonly RawSegment[],
  chunkSeconds: number,
  chunkCount: number,
  floor: number,
): Set<number> {
  const done = new Set<number>()
  for (let i = 0; i < chunkCount; i++) {
    const from = i * chunkSeconds
    if (referenceCoverage(mapSegments, referenceSegments, from, from + chunkSeconds) >= floor) {
      done.add(i)
    }
  }
  return done
}

/**
 * Has this session been mapped all the way through?
 *
 * A map FILE is not a finished map. A 25-chunk session against a 20-request
 * daily quota writes a partial one and is meant to come back tomorrow, so a
 * backlog that selects on the file existing leaves every long session
 * permanently unfinished — its tail unreachable at any quota. That was the
 * behaviour until this existed.
 *
 * Anything unreadable, unlabelled or inconsistent counts as **unfinished**. The
 * cost of re-running a finished session is some quota; the cost of skipping an
 * unfinished one is a session nobody ever revisits.
 */
export function isMapComplete(map: unknown, gate: Gate = CURRENT_GATE): boolean {
  const s = (
    map as {
      stats?: {
        chunksTranscribed?: unknown
        chunksExpected?: unknown
        failedChunks?: unknown
      }
    }
  )?.stats
  const done = s?.chunksTranscribed
  const total = s?.chunksExpected
  if (typeof done !== 'number' || typeof total !== 'number') return false
  if (!Number.isFinite(done) || !Number.isFinite(total) || total <= 0) return false
  // Chunks written off count towards finished. They are still declared — the
  // hole stays in `failedChunks` where anyone can see it — but the session
  // stops costing a call a night to fail the same way. Only write-offs under
  // the CURRENT gate count, so fixing the parser or moving the floor puts every
  // one of them back in the queue.
  const gaps = Array.isArray(s?.failedChunks)
    ? writtenOffChunks(s.failedChunks as FailedChunk[], gate).size
    : 0
  return done + gaps >= total
}

/**
 * Which chunks a run should attempt, in order, within its budget.
 *
 * Replaces `planned = Math.min(chunks.length, maxChunks)` followed by a loop
 * over `0..planned-1`. That bounded the INDEX RANGE rather than the amount of
 * work, and resume skips already-done chunks from inside the same range — so
 * once a session was longer than the budget, everything past `maxChunks - 1`
 * became unreachable **at any quota, forever**.
 *
 * `hallazgos-pipeline.sh` passes `--chunks "$REMAINING"` from an 18-chunk
 * budget, so this was live nightly. Measured 2026-08-11 across the 21 mappable
 * sessions, 8 exceeded it: `1sqj7is` 29 chunks, `1du4rf5` 27, `rx4hb4` 26,
 * `10yl550` 25, `qz6weg` 24, `brxx5g` and `anrfd5` 20, `rmtyr` 19. Every one
 * of them would have stalled at chunk 17 on every future run.
 *
 * The same defect `isMapComplete` was written to prevent — "its tail
 * unreachable at any quota" — through a different door. A budget limits
 * ATTEMPTS; it must never limit how far into the session a run may look.
 */
export function chunksToAttempt(
  totalChunks: number,
  /**
   * Chunks with nothing left to decide: mapped above the floor, OR written off
   * after failing on GIVE_UP_AFTER_ATTEMPTS separate nights. Both are settled;
   * only one of them is finished, and the caller keeps that distinction.
   */
  settledChunks: ReadonlySet<number>,
  maxAttempts: number,
): number[] {
  const out: number[] = []
  for (let i = 0; i < totalChunks && out.length < maxAttempts; i++) {
    if (!settledChunks.has(i)) out.push(i)
  }
  return out
}

/**
 * Chunks a capped run never got to: neither finished nor tried and failed.
 *
 * Replaces `for (let i = done + failedChunks.length; i < planned; i++)`, which
 * derived a chunk INDEX from two counts. That only holds while chunks are
 * processed in order from zero, and a resume breaks it — the done set is
 * scattered, so a quota `break` early in the loop marked every later index
 * unattempted, including chunks whose segments were in the file being written.
 *
 * Observed 2026-08-11: a run that resumed with «8 chunk(s) already mapped»
 * reported «1/17 transcribed, 16 GAP(S)» one line later. The segments survived;
 * the account of them did not. Done, attempted and never-attempted have to stay
 * separable — `DATA_INTEGRITY.md` rule 2 — and a count cannot stand in for a
 * position.
 */
export function unattemptedChunks(
  planned: number,
  completed: ReadonlySet<number>,
  failed: ReadonlySet<number>,
): number[] {
  const out: number[] = []
  for (let i = 0; i < planned; i++) {
    if (!completed.has(i) && !failed.has(i)) out.push(i)
  }
  return out
}

/**
 * Where a session stands in the speaker-map backlog, or null when it is done.
 *
 * `blocked` is the state that was missing. The backlog enumerates
 * `public/data/pleno-transcripts`, which holds two different things under one
 * extension: real diarized transcripts, and acta text with placeholder
 * `[0.0 → 0.0]` stamps and no speaker labels. 23 of the 44 files are the
 * latter, and `extract:speaker-map` cannot run on them at all — it scores its
 * coverage gate against that transcript and refuses without a usable one. They
 * were being reported as "sin empezar", which overstates the workable corpus
 * by more than half and makes any quota budget built on the list wrong.
 *
 * "Cannot start" and "not started yet" are different facts, and a backlog that
 * folds them together is `DATA_INTEGRITY.md` rule 2 in miniature.
 */
export type BacklogState = 'absent' | 'partial' | 'blocked'

export function classifyBacklogState(opts: {
  /** Does this session have a transcript the coverage gate can score against? */
  referenceUsable: boolean
  map: unknown
}): BacklogState | null {
  if (isMapComplete(opts.map)) return null
  if (!opts.referenceUsable) return 'blocked'
  return opts.map ? 'partial' : 'absent'
}

/**
 * What one chunk cost, as the API reports it — not as anything here can derive.
 *
 * Audio is billed by duration converted to tokens at a rate the provider owns,
 * and the thinking budget is invisible from outside. The manifest of a good
 * night read `15 calls · 3.688 tokens`: those were the text adjudication calls
 * alone, because the transcription goes out over curl where the LLM client's
 * accounting cannot see it, while one 20-minute chunk is ~30k input tokens by
 * itself. Any budget built on that number was out by two orders of magnitude.
 */
export interface ChunkUsage {
  inputTokens: number
  outputTokens: number
  /** Reasoning tokens. Billed as output, reported separately by Gemini. */
  thinkingTokens: number
}

/**
 * Read the usage totals out of a `streamGenerateContent?alt=sse` response.
 *
 * The one thing that must not go wrong: **every event repeats the RUNNING
 * totals**, so the last one wins and summing them multiplies the bill by the
 * number of events — a 30k-token chunk billed as 300k, and a sweep budget that
 * says no to something affordable. Hence last-wins, asserted by its own test.
 *
 * Unparseable or usage-free events contribute nothing rather than throwing: the
 * caller is mid-transcription and losing a cost figure must never cost a map.
 */
export function usageFromSse(sse: string): ChunkUsage {
  const out: ChunkUsage = { inputTokens: 0, outputTokens: 0, thinkingTokens: 0 }
  for (const line of sse.split('\n')) {
    if (!line.startsWith('data: ')) continue
    let u: Record<string, unknown> | undefined
    try {
      u = (JSON.parse(line.slice(6)) as { usageMetadata?: Record<string, unknown> }).usageMetadata
    } catch {
      continue
    }
    if (!u) continue
    const n = (v: unknown, fallback: number) => (Number.isFinite(Number(v)) ? Number(v) : fallback)
    out.inputTokens = n(u.promptTokenCount, out.inputTokens)
    out.outputTokens = n(u.candidatesTokenCount, out.outputTokens)
    out.thinkingTokens = n(u.thoughtsTokenCount, out.thinkingTokens)
  }
  return out
}

/**
 * Runs — not retries within a run — a chunk gets before it is written off.
 *
 * ## This is a budget decision, NOT a verdict about the audio
 *
 * It was built on the opposite belief and the belief was wrong. `15uvjew`
 * chunk 8 had come back at exactly 66% against an 85% floor on three separate
 * attempts, which read as determinism — "the model cannot read this window".
 * On the fourth attempt, 2026-08-15, it returned 89 segments and the session
 * closed at 17/17, 100%. The same night `brxx5g` chunk 3 passed after failing
 * at 84%, and its chunk 11 passed on a third try having read 80% then 67% of
 * the same audio. Coverage failures here are FLAKY, and a run of three is not
 * evidence of impossibility — it is evidence of a bad streak.
 *
 * So what this number means is: after three nights we stop PAYING to ask, not
 * that the answer is settled. Three is a spend limit at 1/20th of a day's quota
 * per attempt, chosen with no measurement that says three is better than five;
 * revisit it with one. Two things keep the mistake cheap: the gap stays
 * declared in `failedChunks` rather than disappearing, and a write-off is
 * stamped with its gate, so moving the prompt or the floor puts every retired
 * chunk back in the queue.
 */
export const GIVE_UP_AFTER_ATTEMPTS = 3

/**
 * Por qué una pasada no llegó a un trozo. **Tres desenlaces, nunca dos.**
 *
 * Los tres son «incompleto» y sólo uno es un problema:
 *
 *   · `quota-exhausted`   — la API dijo 429. Hay que esperar al reinicio diario.
 *   · `call-budget-spent` — la pasada se paró SOLA en su techo de peticiones.
 *   · `chunk-budget-spent`— la pasada se paró sola en su techo de trozos.
 *
 * Doblar el segundo dentro del primero diría que la cuota murió cuando en
 * realidad la noche terminó como debía; doblarlo dentro del tercero escondería
 * cuál fue la unidad que mandó. Regla 3 de `DATA_INTEGRITY.md`: un centinela que
 * vale para dos cosas ha dejado de decir cualquiera de las dos.
 */
export type RunEnding = 'quota-exhausted' | 'call-budget-spent' | 'chunk-budget-spent'

export const NEVER_ATTEMPTED: Record<RunEnding, string> = {
  'quota-exhausted': 'never attempted (quota exhausted earlier in the run)',
  'call-budget-spent': 'never attempted (call budget spent; resumes next run)',
  'chunk-budget-spent': 'never attempted (chunk budget spent; resumes next run)',
}

/** The pair of settings that decide whether a chunk passes. */
export interface Gate {
  prompt: string
  floor: number
  /**
   * Nivel de razonamiento pedido al modelo. Tercer ingrediente desde el
   * 23-ago-2026: tres de las cuatro retiradas de `10yl550` fueron
   * `finishReason=MAX_TOKENS`, es decir el techo de salida agotado por el
   * pensamiento — un ajuste de la PETICIÓN que decide si un chunk se puede leer
   * tanto como lo deciden el prompt y el suelo. Ausente en los mapas escritos
   * antes de existir, que por eso reabren una vez.
   */
  thinking?: ThinkingLevel
}

export const CURRENT_GATE: Gate = {
  prompt: SPEAKER_MAP_PROMPT_VERSION,
  floor: SPEAKER_MAP_COVERAGE_FLOOR,
  thinking: SPEAKER_MAP_THINKING_LEVEL,
}

export interface FailedChunk {
  chunk: number
  why: string
  /** Runs that have failed on it. Absent on maps written before this existed. */
  attempts?: number
  /**
   * The gate in force when it was last attempted. Stamped so a write-off can
   * expire: in August 2026 a third of all chunks were being discarded because
   * the model wrote M.SS and the parser read decimals, and the two chunks that
   * had "permanently" failed both passed at 100% the moment that was fixed. A
   * verdict reached under a broken gate is not one to carry forward.
   */
  givenUpUnder?: Gate
}

const sameGate = (a: Gate | undefined, b: Gate): boolean =>
  a?.prompt === b.prompt && a?.floor === b.floor && a?.thinking === b.thinking

/**
 * Fold this run's failure into what earlier runs recorded about the same chunk.
 *
 * A failure under a DIFFERENT gate restarts the count rather than adding to it:
 * evidence that one gate cannot read a window says nothing about another.
 */
export function recordFailure(
  prior: FailedChunk | undefined,
  chunk: number,
  why: string,
  gate: Gate = CURRENT_GATE,
): FailedChunk {
  const carried = prior && sameGate(prior.givenUpUnder, gate) ? (prior.attempts ?? 0) : 0
  return { chunk, why, attempts: carried + 1, givenUpUnder: { ...gate } }
}

/**
 * Chunks given up on under the gate now in force — not to be attempted again.
 *
 * Fails closed on a missing count. Maps written before this existed carry
 * `failedChunks` with no `attempts`, and reading absence as "given up on" would
 * retire those sessions on no evidence whatsoever.
 */
export function writtenOffChunks(
  failed: readonly FailedChunk[] | undefined,
  gate: Gate = CURRENT_GATE,
): Set<number> {
  const out = new Set<number>()
  for (const f of failed ?? []) {
    if ((f?.attempts ?? 0) >= GIVE_UP_AFTER_ATTEMPTS && sameGate(f?.givenUpUnder, gate)) {
      out.add(f.chunk)
    }
  }
  return out
}

/**
 * Where a session's downloaded audio is kept between runs.
 *
 * The sweep is a twenty-night job and a long session needs several of them, but
 * the audio used to live in `tmpdir()/speaker-map-<id>-<pid>` and was deleted
 * on the way out — so every night re-downloaded a 2-to-4-hour video to work on
 * eighteen more chunks of it. 59 hours of audio across the backlog, fetched
 * again and again, and the most likely reason YouTube started refusing on
 * 2026-08-13.
 *
 * Under `.cache/`, which is already gitignored: this is a rebuildable copy of
 * somebody else's file, not data.
 */
export const AUDIO_CACHE_DIR = process.env.SPEAKER_MAP_AUDIO_CACHE || '.cache/speaker-map-audio'

/**
 * Below this, a cached file is a stub or a truncation rather than a session.
 * A real 20-minute mp3 is megabytes; nothing legitimate lands here.
 */
export const MIN_CACHED_AUDIO_BYTES = 1024

export function audioCachePath(plenoId: string, dir: string = AUDIO_CACHE_DIR): string {
  return `${dir}/${plenoId}.mp3`
}

/**
 * @param bytes size on disk, or null/undefined when the file is not there.
 *
 * Fails closed: anything it cannot measure is re-downloaded. Reusing a
 * half-written file would produce a short session, and a short session is
 * indistinguishable downstream from a pleno where people stopped talking.
 */
export function isReusableAudio(bytes: number | null | undefined): boolean {
  return typeof bytes === 'number' && Number.isFinite(bytes) && bytes >= MIN_CACHED_AUDIO_BYTES
}

/**
 * The bloc for a label, or null when the map does not vouch for it.
 *
 * Returns null for weak rows too. A caller asking "which bloc is this" during
 * publication must get the same answer the validator would defend, and a
 * back-reference alone is not defensible.
 */
export function blocForLabel(map: SpeakerMap | null, label: string): string | null {
  if (!map) return null
  const row = map.rows.find((r) => r.label === label)
  if (!row || row.weak) return null
  return row.bloc
}
