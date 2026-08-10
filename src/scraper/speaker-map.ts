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

export interface SpeakerMap {
  plenoId: string
  generatedAt: string
  /** Model that produced the raw identity block, for provenance. */
  model: string
  rows: SpeakerMapRow[]
  /**
   * What the run did, separately. A map with zero rows because the audio was
   * never fetched and a map with zero rows because nobody was ever named are
   * different facts, and folding them together is `DATA_INTEGRITY.md` rule 2.
   */
  stats: {
    labelsSeen: number
    rowsAccepted: number
    rowsRejected: number
    /** Reason → count, so a run can say WHY it dropped what it dropped. */
    rejectedBy: Record<string, number>
  }
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
