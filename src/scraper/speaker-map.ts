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
    failedChunks: Array<{ chunk: number; why: string }>
    labelsSeen: number
    rowsAccepted: number
    rowsRejected: number
    /** Reason → count, so a run can say WHY it dropped what it dropped. */
    rejectedBy: Record<string, number>
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
 * Split a model response into segments and identity candidates.
 *
 * Pure and total: never throws, never fetches. A line it cannot read whole is
 * **dropped**, not half-read — a candidate missing its evidence would look to
 * the validator like a row whose citation simply failed a gate, when in fact
 * nobody ever cited anything.
 */
export function parseSpeakerMapResponse(raw: string): ParsedSpeakerMapResponse {
  const [bodyPart, identityPart = ''] = (raw ?? '').split(IDENTITY_HEADER)

  const segments: RawSegment[] = []
  for (const line of bodyPart.split('\n')) {
    const m = SEGMENT_RE.exec(line.trim())
    if (!m) continue
    const start = Number(m[1])
    const end = Number(m[2])
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue
    segments.push({ start, end, speaker: m[3], text: m[4].trim() })
  }

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
    const at = Number(em[2])
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
export function isMapComplete(map: unknown): boolean {
  const s = (map as { stats?: { chunksTranscribed?: unknown; chunksExpected?: unknown } })?.stats
  const done = s?.chunksTranscribed
  const total = s?.chunksExpected
  if (typeof done !== 'number' || typeof total !== 'number') return false
  if (!Number.isFinite(done) || !Number.isFinite(total) || total <= 0) return false
  return done >= total
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
