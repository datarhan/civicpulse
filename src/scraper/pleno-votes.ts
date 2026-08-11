/**
 * Pleno voting-records schema.
 *
 * This is a HUMAN-CURATED dataset (same editorial contract as promises.json,
 * quejas-responses.json, and sindic.json). Voting records are legally sensitive
 * — misattributing a vote to a concejal can be defamatory — so the parser
 * validates every field. The inference engine never writes here; only the
 * `npm run pleno-vote` CLI (which runs this validator before any write) or an
 * approved pull request can mutate public/data/pleno-votes.json.
 *
 * Sources, plural — and that is the point. A record asserts an OUTCOME and a
 * per-bloc BREAKDOWN, and in practice they come from different documents: the
 * council's session portal publishes the orden del día and the result, the
 * acta publishes both, and the session transcript carries the nominal call.
 * Each half cites its own source in `provenance`; see the block above
 * `VOTE_SOURCE_KINDS` for what went wrong when they shared one. The acuerdo
 * title is quoted verbatim from the orden del día either way.
 *
 * Party bloc identifiers mirror src/hooks/useOfficials.js PARTY_COLORS. Any
 * new party must be added there first so the UI can render it.
 */

/**
 * Group codes that NAME a real municipal group. This is the only set a
 * `speakerGroup` may take — «who said this» is an attribution, so a
 * placeholder there is a claim about a person.
 *
 * `Otro` is deliberately absent. It never meant "another party"; it was the
 * extractor's "cannot tell". Riba-roja's corporación is PSOE 11 · PP 7 · VOX 1
 * · Compromís 1 · EU-Podem 1, so a reader of the published JSON who takes
 * `Otro` for "the party that is not one of the four" identifies one specific
 * councillor by elimination. `null` already means "not determined" and already
 * renders as «Grupo no identificado» (src/lib/party-label.js `blocLabel`), so
 * the sentinel had no job left. See docs/DATA_INTEGRITY.md, «un centinela
 * nunca es un valor».
 *
 * Mirrored by `REAL_BLOCS` in src/lib/party-label.js for the JS/UI layer; a
 * test asserts the two lists cannot drift apart.
 */
export const SPEAKER_GROUPS = ['PSOE', 'PP', 'VOX', 'Compromís', 'Ciudadanos', 'EU-Podem'] as const

/** A group that can be named as the author of a statement. */
export type SpeakerGroup = (typeof SPEAKER_GROUPS)[number]

/**
 * A voting bloc. Identical to `SpeakerGroup`: `Otro` was retired here too.
 *
 * It survived one migration longer on the argument that `votes[].bloc` answers
 * a different question — which group cast this vote — in a curated file whose
 * schema had no null. That argument does not hold. The 12 rows carrying it all
 * had `seats: 1`, and the corporación has exactly one councillor outside
 * PSOE/PP/VOX/Compromís, so `Otro` named him by elimination in the one place
 * the site states how a group *voted*. Worse, `Otro` there was not read off an
 * acta at all: the extractor was handed the seat table from officials.json,
 * which then still labelled that seat `Otro`
 * (`seats=PSOE:11,PP:7,VOX:1,Otro:1,Compromís:1` in scripts/logs/vote-backfill.log),
 * so the sentinel was copied in, not observed.
 *
 * A vote by a member the source does not name is now `bloc: null` — rendered
 * «Grupo no identificado» by src/lib/party-label.js `blocLabel`. Naming the
 * group instead requires the acta to name it *for that vote*, entered by a
 * curator through `npm run pleno-vote`. See docs/DATA_INTEGRITY.md, «un
 * centinela nunca es un valor».
 */
export type VoteBloc = SpeakerGroup

export type VoteDirection = 'a_favor' | 'en_contra' | 'abstencion' | 'ausente'

export type VoteOutcome = 'aprobado' | 'rechazado' | 'retirado' | 'aplazado'

// ── provenance: one citation per claim, not one per row ──────────────────────
//
// A vote record asserts TWO facts of different provenance:
//
//   · the outcome    — «el punto se aprobó»
//   · the breakdown  — «PSOE a favor, PP en contra, …»
//
// Until 2026-08-05 every published row carried a single `sourceUrl`, and for
// all 17 of them it pointed at regmeet. regmeet publishes the orden del día
// and the outcome; it publishes NO per-bloc breakdown at all. The tallies came
// off an uncited Whisper transcript of the session. So each row attributed two
// claims to one citation that supports one of them — and `check:citations`
// could never catch it, because the URL resolves perfectly. It just does not
// contain half of what was attributed to it.
//
// The fix is structural rather than editorial: a source is declared per claim,
// and the schema knows which claims each kind of source is capable of carrying.
// A breakdown attributed to regmeet is now refused at write time, by the same
// validator every CLI runs before it writes.

/**
 * What each kind of source ACTUALLY publishes, what it is made FROM, and what
 * the page must say when a claim cited to it has not been cotejado.
 *
 * This table is the single definition of «can this citation carry this claim».
 * `BREAKDOWN_SOURCE_KINDS` / `OUTCOME_SOURCE_KINDS` are DERIVED from it and
 * exported, so a checker or a test can never hand-copy a list that has since
 * drifted — the trap in docs/DATA_INTEGRITY.md rule 1, which cost this repo
 * €53.5M of published contracting.
 *
 * `publishesBreakdown: false` on `regmeet` is the whole point of this file's
 * 2026-08-05 migration; it is a fact about the upstream portal, not a policy
 * knob. Loosening it re-permits exactly the defect the split exists to remove.
 *
 * The two later columns:
 *
 * `derivedFrom` — the artefact this one is MECHANICALLY produced from, or null
 * for a source that is a record in its own right. Only one edge exists today
 * (`transcripcion` ← `video`: Whisper reads the recording), and it is the whole
 * basis of `isIndependentVerificationSource` below. It records production, not
 * authority: an acta and a video are both accounts of the same session, but
 * neither is generated from the other.
 *
 * `unverifiedNote` — the clause a surface shows beside a claim cited to this
 * kind while `verification !== 'verificado'`, or null when no caveat is
 * warranted. It is null for `acta` and `regmeet` because for those the cited
 * document *states* the claim in the council's own words: an acta is the
 * authoritative minute, and regmeet is the council's session portal publishing
 * the orden del día and the result. There is nothing above them to cotejar
 * against, so a caveat there would be noise that trains readers to ignore the
 * one place it means something. It is non-null for `transcripcion` and `video`
 * because those carry the claim only through a reading — a machine's, or a
 * human's ear — and a reading can be wrong. Three of the first nineteen
 * breakdowns taken from the transcript were.
 *
 * Living in this table, not in the JSX, is deliberate: until 2026-08-09 the
 * component applied one hard-coded string — «sin cotejar con el acta» — to both
 * provenance rows, so a regmeet-sourced OUTCOME was published under a caveat
 * about a document it never needed. One test, two rows, one of them false.
 */
export const VOTE_SOURCE_KINDS = {
  /** The published minutes. The authoritative record of both halves. */
  acta: {
    label: 'Acta oficial',
    publishesOutcome: true,
    publishesBreakdown: true,
    derivedFrom: null,
    unverifiedNote: null,
  },
  /** The council's session portal. Item + outcome only — never a tally. */
  regmeet: {
    label: 'Portal de sesiones (regmeet)',
    publishesOutcome: true,
    publishesBreakdown: false,
    derivedFrom: null,
    unverifiedNote: null,
  },
  /** Whisper transcript of the session audio, published under
   *  /data/pleno-transcripts/. Carries the nominal call, so it CAN support a
   *  breakdown — but it is machine-written, and three of the first nineteen
   *  breakdowns taken from it were wrong. Hence `verification`. */
  transcripcion: {
    label: 'Transcripción automática de la sesión',
    publishesOutcome: true,
    publishesBreakdown: true,
    derivedFrom: 'video',
    unverifiedNote: 'transcripción automática, sin cotejar con otra fuente',
  },
  /** The session video. The transcript's own upstream. */
  video: {
    label: 'Vídeo de la sesión',
    publishesOutcome: true,
    publishesBreakdown: true,
    derivedFrom: null,
    unverifiedNote: 'leído del vídeo, sin cotejar con otra fuente',
  },
} as const satisfies Record<
  string,
  {
    label: string
    publishesOutcome: boolean
    publishesBreakdown: boolean
    /** Typed `string | null` rather than `VoteSourceKind | null` because that
     *  type is derived from this very object. `voteSourceDerivedFrom` narrows
     *  it, and `assertDerivationGraphIsSane` proves every edge resolves. */
    derivedFrom: string | null
    unverifiedNote: string | null
  }
>

export type VoteSourceKind = keyof typeof VOTE_SOURCE_KINDS

export const VOTE_SOURCE_KIND_IDS = Object.keys(VOTE_SOURCE_KINDS) as VoteSourceKind[]

/** Kinds that can support «how each group voted». Derived, never restated. */
export const BREAKDOWN_SOURCE_KINDS: readonly VoteSourceKind[] = VOTE_SOURCE_KIND_IDS.filter(
  (k) => VOTE_SOURCE_KINDS[k].publishesBreakdown,
)

/** Kinds that can support «how the motion resolved». Derived, never restated. */
export const OUTCOME_SOURCE_KINDS: readonly VoteSourceKind[] = VOTE_SOURCE_KIND_IDS.filter(
  (k) => VOTE_SOURCE_KINDS[k].publishesOutcome,
)

/** The artefact `kind` is mechanically produced from, or null. Narrowing
 *  accessor for the `string | null` the capability table has to declare. */
export function voteSourceDerivedFrom(kind: VoteSourceKind): VoteSourceKind | null {
  return (VOTE_SOURCE_KINDS[kind].derivedFrom as VoteSourceKind | null) ?? null
}

/**
 * Is `verifier` a source that can genuinely COTEJAR a claim cited to `cited`?
 *
 * This is the rule that gives «verificado» a meaning. Until 2026-08-09 there
 * was none: `verificado` needed only a ≥20-char quote and a signature, so a
 * curator could mark a tally verified by quoting the very Whisper transcript
 * the tally was read off — and every surface would then say the claim had been
 * cotejado. Self-verification passing a verification gate is not a loose gate,
 * it is a gate measuring nothing.
 *
 * Two disqualifiers, and the reasoning for each:
 *
 * 1. **Same kind is never independent, whatever the URL.** The kind IS the way
 *    of knowing. Two transcripts of one session are two runs of the same ASR
 *    over the same audio: a second run agreeing proves Whisper is
 *    deterministic, not that the tally is right. Two actas of the same session
 *    are the same secretario's account, one copied from the other. So the
 *    same-kind-different-URL case — the one that looks like a second opinion —
 *    is refused: it shares the failure mode it claims to rule out.
 *
 * 2. **A source made FROM the cited one cannot check it.** Everything a
 *    derivative knows, it got from its upstream, plus whatever its own
 *    production step got wrong. `transcripcion` derives from `video`, so a
 *    transcript can never verify a video-read tally.
 *
 * The edge that has to be decided explicitly, because it is the one a curator
 * will actually hit: **video verifying a transcript-derived tally is ACCEPTED.**
 * The two do come from one session recording, so they are not independent
 * *observations* of the vote — the acta is, and the acta remains the better
 * check. But independence here is asked of the ERROR the verification exists to
 * catch, and that error is the transcription step: Whisper mishearing «tretze»
 * as «tres», dropping a bloc, or hallucinating a stretch outright. The video is
 * upstream of that step, and a human watching the nominal call is a different
 * reader, not a second machine. Rejecting it would mean the only admissible
 * check is a document this project currently cannot fetch at all (see
 * `scripts/fetch-pleno-actas.ts`, broken against the Aug-2026 portal), which
 * would leave `verificado` unreachable in practice and therefore, again,
 * meaningless. What it does NOT license is quietly calling that «cotejado con
 * el acta»: the surfaces name the document actually consulted, from
 * `verifiedAgainst.kind`.
 *
 * The graph has one edge, so no two kinds are siblings under a shared upstream.
 * If one is ever added, `assertDerivationGraphIsSane` fails and forces that
 * case to be decided here rather than inherited by accident.
 */
export function isIndependentVerificationSource(
  verifier: VoteSourceKind,
  cited: VoteSourceKind,
): boolean {
  if (verifier === cited) return false
  // Walk the verifier's ancestry: if `cited` is anywhere in it, the verifier is
  // downstream of what it claims to check.
  let up = voteSourceDerivedFrom(verifier)
  const seen = new Set<VoteSourceKind>([verifier])
  while (up != null && !seen.has(up)) {
    if (up === cited) return false
    seen.add(up)
    up = voteSourceDerivedFrom(up)
  }
  return true
}

/**
 * Proves the `derivedFrom` column is a well-formed graph, and that the one
 * assumption `isIndependentVerificationSource` makes about its SHAPE still
 * holds. Called from the tests; throwing here beats a rule that silently starts
 * approving pairs nobody weighed.
 */
export function assertDerivationGraphIsSane(): void {
  const roots = new Map<VoteSourceKind, VoteSourceKind>()
  for (const kind of VOTE_SOURCE_KIND_IDS) {
    const seen = new Set<VoteSourceKind>([kind])
    let up = voteSourceDerivedFrom(kind)
    let root = kind
    while (up != null) {
      must(
        VOTE_SOURCE_KIND_IDS.includes(up),
        `VOTE_SOURCE_KINDS.${kind}.derivedFrom = "${up}", which is not a source kind`,
      )
      must(!seen.has(up), `derivedFrom cycle through ${kind} → ${up}`)
      seen.add(up)
      root = up
      up = voteSourceDerivedFrom(up)
    }
    if (root !== kind) {
      const sibling = [...roots.entries()].find(([, r]) => r === root)
      // Siblings share every error their common upstream made, so neither can
      // check the other — but the current table has none, and the walk above
      // only rules out ANCESTORS. Rather than write a rule for a case that does
      // not exist, refuse to let one appear unnoticed.
      must(
        sibling == null,
        `${kind} and ${sibling?.[0]} are both derived from ${root}. Two derivatives of one ` +
          `upstream are not independent of each other, and isIndependentVerificationSource ` +
          `only rules out ancestors — decide that case there before adding this edge`,
      )
      roots.set(kind, root)
    }
  }
}

/**
 * Has this claim been cotejado against a source that could actually contradict
 * it? The ONE predicate every surface and checker asks — the validator refuses
 * to write a ref that would answer this differently from how it reads, so a
 * consumer never has to re-derive the rule and never gets to soften it.
 */
export function isIndependentlyVerified(
  ref: {
    kind?: unknown
    verification?: unknown
    verifiedAgainst?: { kind?: unknown } | null
  } | null,
): boolean {
  if (ref == null || ref.verification !== 'verificado') return false
  const against = ref.verifiedAgainst?.kind
  if (typeof against !== 'string' || !VOTE_SOURCE_KIND_IDS.includes(against as VoteSourceKind))
    return false
  if (typeof ref.kind !== 'string' || !VOTE_SOURCE_KIND_IDS.includes(ref.kind as VoteSourceKind))
    return false
  return isIndependentVerificationSource(against as VoteSourceKind, ref.kind as VoteSourceKind)
}

/**
 * Has a human cotejado THIS claim against an INDEPENDENT source?
 *
 * Deliberately two values, not a confidence score. «sin-verificar» is the
 * honest state of all 16 published breakdowns and all 17 outcomes: the
 * transcript is now cited, and no second document has been read against it.
 * Recording that is the point — a migration that relabelled 16 unverified rows
 * as verified would have been worse than the single-citation defect it
 * replaced.
 *
 * Note what «sin-verificar» does and does not accuse anyone of. The acta is the
 * source that would settle a breakdown, and this project cannot currently fetch
 * one: `scripts/fetch-pleno-actas.ts` reads a `link` that has pointed at
 * regmeet since 2026-05-25, extracts retired Drupal markup, and has no npm
 * script wiring it to anything. Zero actas are cached; all 45 transcripts on
 * disk are Whisper output. So the flag records an unreachable source, not an
 * unread one, and every message about it should say so.
 */
export const VOTE_VERIFICATIONS = ['verificado', 'sin-verificar'] as const
export type VoteVerification = (typeof VOTE_VERIFICATIONS)[number]

/** Minimum length of the verbatim clause a `verificado` ref must carry.
 *  Same bar as `dueBySource` — a verdict without the words that support it is
 *  an assertion, not evidence. */
export const VERIFIED_QUOTE_MIN = 20

/**
 * One citation, for one claim.
 *
 * `url` accepts a site-absolute path as well as an http(s) URL, because the
 * transcript a breakdown comes from is an artefact this site publishes itself
 * (`/data/pleno-transcripts/<plenoId>.txt` — the same path
 * src/pages/PlenoDetalle.jsx already fetches). That makes the breakdown
 * citation resolvable and, unlike an upstream URL, checkable offline: see the
 * `votes-breakdown-source` check in src/scraper/relations-check.ts, which
 * refuses a site-relative ref whose file is not in the build.
 */
export interface VoteCitation {
  kind: VoteSourceKind
  /** http(s) URL, or a site-absolute path (`/data/…`) for our own artefacts. */
  url: string
  publisher: string
  /** ISO date (YYYY-MM-DD) the source was consulted. */
  retrievedAt: string
  /** Where inside the source: «punto 6», «[3412.5 → 3418.0]», a page number.
   *  Optional, and absent on every row migrated on 2026-08-05 — locating each
   *  tally in a two-hour transcript is work nobody has done, and inventing a
   *  timestamp would be the fabricated verification this split exists to
   *  prevent. */
  locator?: string
}

export interface VoteSourceRef extends VoteCitation {
  verification: VoteVerification
  /** Verbatim clause supporting the claim, READ OFF `verifiedAgainst` — not off
   *  the source being checked. Required when `verificado`. */
  quote?: string
  /** Curator signature. Required when `verificado` — never a script name. */
  verifiedBy?: string
  /**
   * The document the claim was cotejado AGAINST. Required when `verificado`,
   * and refused otherwise.
   *
   * This field is what makes «verificado» mean something. Before it existed the
   * flag needed only a quote and a name, neither of which said WHERE the quote
   * came from — so quoting the same Whisper transcript the tally was read off
   * passed the gate, and every surface then told the reader the claim had been
   * cotejado. `isIndependentVerificationSource` decides which pairs count; the
   * surfaces name this document rather than assuming it is the acta.
   */
  verifiedAgainst?: VoteCitation
}

/** Publisher string for the session transcripts this site generates. */
export const TRANSCRIPT_SOURCE_PUBLISHER =
  'CivicPulse — transcripción automática (Whisper) de la sesión'

/** Where a session transcript is published. One definition, shared by the
 *  migration, the promote CLI and the checker. */
export function transcriptRefUrl(plenoId: string): string {
  return `/data/pleno-transcripts/${plenoId}.txt`
}

/**
 * Which kind of source a URL is — or null when it is not one we recognise.
 *
 * Deliberately never guesses. Naming the wrong kind is exactly how a per-bloc
 * breakdown ends up attributed to a portal that publishes none, so an
 * unrecognised host returns null and every caller refuses rather than
 * defaulting.
 */
export function voteSourceKindForUrl(url: string): VoteSourceKind | null {
  if (url.startsWith('/data/pleno-transcripts/')) return 'transcripcion'
  let host: string
  try {
    host = new URL(url).host
  } catch {
    return null
  }
  if (host === 'regmeet.com') return 'regmeet'
  if (host === 'ribarroja.es' || host.endsWith('.ribarroja.es')) return 'acta'
  if (host === 'youtu.be' || host === 'youtube.com' || host.endsWith('.youtube.com')) return 'video'
  return null
}

/**
 * The two halves of a vote record, each with its own source.
 *
 * `breakdown` is null exactly when no per-bloc tally is published (either the
 * row never had one, or a curator withdrew it). A citation left behind for a
 * tally that is gone would be a claim about nothing.
 */
export interface VoteProvenance {
  outcome: VoteSourceRef
  breakdown: VoteSourceRef | null
}

/** Per-bloc vote tuple. Every bloc that existed on the date of the session
 *  must appear exactly once (no duplicates, no gaps) — enforced at validate().
 *
 *  `bloc: null` means the source records the vote but does not say which group
 *  cast it. It is a gap, not a group: never a placeholder for a group the
 *  reader could name by elimination. At most one null tuple per vote — two
 *  unattributed tuples cannot be told apart, and the dedupe check treats them
 *  as duplicates. */
export interface VoteByBloc {
  bloc: VoteBloc | null
  direction: VoteDirection
  /** Optional: the seat count the bloc held on the date of this session.
   *  Used for UI display; not required for validation. */
  seats?: number
}

/**
 * The stamp a vote carries once its per-bloc breakdown has been WITHDRAWN but
 * the item and its outcome remain published.
 *
 * Present ⟺ `votes` is empty. The two halves are enforced against each other
 * in both directions (see `validateVote`): an empty breakdown with no stamp is
 * an unexplained hole, and a stamp next to a published tally is a claim that
 * contradicts itself.
 */
export interface VoteBreakdownRetractionStamp {
  /** Why the tally was withdrawn. ≥20 chars — this is a public correction. */
  reason: string
  /** Curator signature. Never a script name. */
  editor: string
  /** ISO timestamp of the withdrawal. */
  retractedAt: string
}

export interface PlenoVote {
  /** Stable id. Format: <plenoId>-<itemNumber>, e.g. "k4olcs-03". */
  id: string
  /** References plenos.json `items[].id`. */
  plenoId: string
  /** ISO session date (YYYY-MM-DD). Must match plenos.json. */
  plenoDate: string
  /** Orden del día item number. Matches plenos-agendas.json. */
  itemNumber: number
  /** Exact acuerdo title, verbatim from the acta. Required ≥20 chars. */
  title: string
  /** High-level tally: how the motion resolved. */
  outcome: VoteOutcome
  /**
   * Per-bloc breakdown. Sum of a_favor/en_contra/abstencion determines outcome.
   *
   * Empty ONLY when `votesRetracted` is set — a curator withdrew the tally and
   * signed for it. See `retractVoteBreakdown`.
   */
  votes: VoteByBloc[]
  /** Set ⟺ `votes` is empty: the tally was withdrawn, the item was not. */
  votesRetracted?: VoteBreakdownRetractionStamp
  /** Optional: department/concejalía that proposed the motion. */
  department?: string
  /** Optional: expediente number referenced in the acta. */
  expediente?: string
  /**
   * Optional: ISO date by which the approved motion is supposed to
   * complete. Sourced verbatim from the acta (e.g. "con plazo de
   * ejecución de 6 meses"). If present, `dueBySource` MUST also be set
   * and contain the ≥20-char verbatim clause. The CLI does not
   * synthesize this — a human curator types it from the acta.
   */
  dueBy?: string
  /**
   * Verbatim clause from the acta stating the plazo. Invariant: if
   * `dueBy` is set, this must be ≥20 chars. Mirrors the verbatim-quote
   * requirement on promises.ts evidence entries — stating a deadline
   * is legally material.
   */
  dueBySource?: string
  /**
   * Per-claim citations: where the outcome came from, and where the breakdown
   * came from. Required on every row in `items[]` (enforced in
   * `validateSnapshot`, not here, so the pre-migration votes tombstoned inside
   * `retractions[].original` keep validating without being re-annotated).
   */
  provenance?: VoteProvenance
  /**
   * Source citation for the OUTCOME. Kept as the flat field five consumers and
   * three CLIs already read, and pinned by `validateVote` to
   * `provenance.outcome.url` so the two cannot drift into two truths.
   */
  sourceUrl: string
  /** Publisher of the source (typically "Ayuntamiento de Riba-roja de Túria"). */
  sourcePublisher: string
  /** ISO date (YYYY-MM-DD) when the source was retrieved. */
  retrievedAt: string
  /** Optional free-form note (e.g., "Votación nominal, no por blocos"). */
  note?: string
}

/**
 * What a retraction withdraws.
 *
 * `record`    — the whole vote. It leaves `items[]`, so every consumer that
 *               reads `items` stops counting it without being taught to: the
 *               department tallies, the «plazos vencidos» flag, /plenos'
 *               aprobado count, `tallyByBloc`. Withdrawal is structural, not a
 *               convention each reader has to remember.
 * `breakdown` — ONLY the per-bloc tally. The row stays in `items[]` with its
 *               item number, title, outcome and source intact.
 *
 * The second scope exists because the two halves of a vote record do not have
 * the same provenance. regmeet publishes the orden del día and the outcome; it
 * publishes no per-bloc breakdown at all, and the tallies here were read off an
 * uncited Whisper transcript. A CLI that could only withdraw the whole record
 * would force a curator to delete two facts the source does publish in order to
 * remove one it never did. qz6weg-14 is the live instance: its `rechazado` is
 * correct and sourced, and two of its five directions are inverted.
 */
export type VoteRetractionScope = 'record' | 'breakdown'

/**
 * A signed, permanent record that something published here was withdrawn.
 *
 * This is the tombstone half of the `apply-promise-draft --retract` idiom (the
 * row leaves the published list) carrying the field set of
 * `correct-pleno-finding` (`original` / `reason` / `editor` / timestamp), and
 * it lives in the same snapshot as `items[]` rather than in a sibling file so
 * that «is this id published?» and «was this id withdrawn?» cannot answer from
 * two files that have drifted apart.
 *
 * Retractions are never removed. Republishing a corrected record requires
 * `revoke`, which stamps this entry rather than deleting it — that is what
 * makes a reappearance impossible to do *silently*.
 */
export interface VoteRetraction {
  /** The withdrawn vote's id. */
  voteId: string
  scope: VoteRetractionScope
  /** Why. ≥20 chars — this concerns how named political groups voted. */
  reason: string
  /** Curator signature. Never a script name. */
  editor: string
  /** ISO timestamp of the withdrawal. */
  retractedAt: string
  /**
   * The published content exactly as it stood. `scope: 'record'` keeps the
   * whole vote; `scope: 'breakdown'` keeps only the withdrawn tuples.
   *
   * Yes, this republishes the erroneous content. That is deliberate and is
   * already this repo's idiom: `correct-pleno-finding` writes `original`
   * alongside `corrected` in a file Vercel serves. A correction that does not
   * say what it corrected is not auditable.
   */
  original: PlenoVote | null
  originalVotes: VoteByBloc[] | null
  /**
   * The withdrawn breakdown's citation, for `scope: 'breakdown'`.
   *
   * Optional because the three entries written before 2026-08-05 predate
   * per-claim provenance and are never re-annotated — a retraction ledger that
   * gets edited after the fact records nothing. The consequence is deliberate:
   * `revokeRetraction` refuses to restore a tally it cannot cite, so putting
   * one of those three back requires a curator to state where it comes from.
   */
  originalBreakdownSource?: VoteSourceRef | null
  /**
   * Set when a curator explicitly puts the id back into circulation. The entry
   * survives; only its blocking effect lifts. Absent = the retraction is live.
   */
  revokedAt?: string
  revokedBy?: string
  /** Why the id was returned to publication. ≥20 chars. */
  revokedReason?: string
}

export interface PlenoVotesSnapshot {
  generatedAt: string
  source: {
    description: string
    contract: string
  }
  stats: {
    total: number
    byOutcome: Record<VoteOutcome, number>
    byPleno: Record<string, number>
    /** Live (non-revoked) retractions, by scope. */
    retracted: Record<VoteRetractionScope, number>
  }
  items: PlenoVote[]
  /** Append-only. Never pruned; see `VoteRetraction`. */
  retractions: VoteRetraction[]
}

/** A retraction still in force — `revoke` has not lifted it. */
export function isLiveRetraction(r: VoteRetraction): boolean {
  return !r.revokedAt
}

/**
 * Vote-bloc allow-list. Now exactly SPEAKER_GROUPS — one list, aliased, so the
 * two cannot be hand-edited apart. `null` is accepted by the validator but is
 * deliberately absent here: this array is the set of names a vote may be
 * *attributed* to, and "not identified" is not one of them.
 */
export const ALLOWED_BLOCS: readonly VoteBloc[] = SPEAKER_GROUPS

export const ALLOWED_DIRECTIONS: readonly VoteDirection[] = [
  'a_favor',
  'en_contra',
  'abstencion',
  'ausente',
]

export const ALLOWED_OUTCOMES: readonly VoteOutcome[] = [
  'aprobado',
  'rechazado',
  'retirado',
  'aplazado',
]

export const RETRACTION_SCOPES: readonly VoteRetractionScope[] = ['record', 'breakdown']

/** Minimum length of a retraction reason. Mirrors `dueBySource` and the IFCN
 *  corrections trail in `correct-pleno-finding`: a signature without a stated
 *  reason is not a record of anything. */
export const RETRACTION_REASON_MIN = 20

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
const ISO_DATETIME = /^\d{4}-\d{2}-\d{2}T[\d:.]+Z?$/
const URL_RE = /^https?:\/\/\S+$/
/** http(s), or a site-absolute path — but not `//host`, which is a remote URL
 *  wearing a local path's clothes. */
const REF_URL_RE = /^(?:https?:\/\/\S+|\/(?!\/)\S*)$/
const ID_RE = /^[a-z0-9]+-\d{2,}$/

export class PlenoVoteValidationError extends Error {}

function must(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new PlenoVoteValidationError(msg)
}

/** True when `url` points at an artefact this site publishes itself, so a
 *  checker can resolve it against the build instead of the network. */
export function isSiteRelativeRef(url: string): boolean {
  return url.startsWith('/')
}

/**
 * The fields every citation carries, wherever it appears — as the source of a
 * claim, or as the document a claim was cotejado against.
 *
 * `claim` decides which capability the kind must have — that is the whole
 * guard: `regmeet` passes as an outcome source and is REFUSED as a breakdown
 * source, because the portal publishes no per-bloc tally. The allowed sets are
 * derived from `VOTE_SOURCE_KINDS`, never listed here. It applies to the
 * verifying document too: you cannot cotejar a per-bloc tally against a portal
 * that publishes none, so the same gate runs on both.
 *
 * `role` only shapes the message — one set of rules, two places they are read.
 */
function validateCitation(
  raw: unknown,
  claim: 'outcome' | 'breakdown',
  role: string,
  ctx: string,
): VoteCitation {
  must(typeof raw === 'object' && raw !== null, `${claim} ${role} must be an object${ctx}`)
  const o = raw as Record<string, unknown>
  const allowed = claim === 'breakdown' ? BREAKDOWN_SOURCE_KINDS : OUTCOME_SOURCE_KINDS

  must(
    typeof o.kind === 'string' && VOTE_SOURCE_KIND_IDS.includes(o.kind as VoteSourceKind),
    `${claim} ${role} kind must be one of ${VOTE_SOURCE_KIND_IDS.join(',')}${ctx}`,
  )
  must(
    allowed.includes(o.kind as VoteSourceKind),
    `${claim} ${role} cannot be "${String(o.kind)}": ` +
      `${VOTE_SOURCE_KINDS[o.kind as VoteSourceKind].label} does not publish ` +
      `${claim === 'breakdown' ? 'a per-bloc breakdown' : 'an outcome'}. ` +
      `Allowed here: ${allowed.join(', ')}${ctx}`,
  )
  must(
    typeof o.url === 'string' && REF_URL_RE.test(o.url),
    `${claim} ${role} url must be http(s) or a site-absolute path${ctx}`,
  )
  must(
    typeof o.publisher === 'string' && o.publisher.trim().length > 0,
    `${claim} ${role} publisher required${ctx}`,
  )
  must(
    typeof o.retrievedAt === 'string' && ISO_DATE.test(o.retrievedAt),
    `${claim} ${role} retrievedAt must be ISO date${ctx}`,
  )
  if (o.locator !== undefined) {
    must(
      typeof o.locator === 'string' && o.locator.trim().length > 0,
      `${claim} ${role} locator must be a non-empty string when present${ctx}`,
    )
  }
  return {
    kind: o.kind as VoteSourceKind,
    url: o.url as string,
    publisher: (o.publisher as string).trim(),
    retrievedAt: o.retrievedAt as string,
    ...(o.locator !== undefined ? { locator: (o.locator as string).trim() } : {}),
  }
}

/**
 * Validate one per-claim citation, plus — when it claims to have been checked —
 * the citation it was checked against.
 */
export function validateSourceRef(
  raw: unknown,
  claim: 'outcome' | 'breakdown',
  ctx = '',
): VoteSourceRef {
  const cite = validateCitation(raw, claim, 'source', ctx)
  const o = raw as Record<string, unknown>

  must(
    typeof o.verification === 'string' &&
      (VOTE_VERIFICATIONS as readonly string[]).includes(o.verification),
    `${claim} source verification must be one of ${VOTE_VERIFICATIONS.join(',')}${ctx}`,
  )
  // «verificado» is the only value that upgrades what the reader is told, so it
  // is the only one that carries a burden: the words that support the claim,
  // the name of whoever read them, and — since 2026-08-09 — WHERE they read
  // them. Without this an automated pass could flip every row to verified and
  // change nothing else — rule 4 in docs/DATA_INTEGRITY.md, «nada automático
  // reescribe prosa publicada».
  let verifiedAgainst: VoteCitation | undefined
  if (o.verification === 'verificado') {
    must(
      typeof o.quote === 'string' && o.quote.trim().length >= VERIFIED_QUOTE_MIN,
      `${claim} source marked "verificado" needs a verbatim quote ≥${VERIFIED_QUOTE_MIN} chars${ctx}`,
    )
    must(
      typeof o.verifiedBy === 'string' && o.verifiedBy.trim().length > 0,
      `${claim} source marked "verificado" needs verifiedBy — a curator signature${ctx}`,
    )
    must(
      o.verifiedAgainst != null,
      `${claim} source marked "verificado" needs verifiedAgainst — the document it was ` +
        `cotejado against. A quote and a signature say a check happened; only this says ` +
        `what it was checked against, and without it re-reading the source the claim came ` +
        `from passes as a verification${ctx}`,
    )
    verifiedAgainst = validateCitation(o.verifiedAgainst, claim, 'verifiedAgainst', ctx)
    // Independence. See `isIndependentVerificationSource` for why same-kind is
    // refused whatever the URL, and why video-over-transcript is allowed.
    must(
      verifiedAgainst.url !== cite.url,
      `${claim} source claims to have been cotejado against itself (${cite.url}) — ` +
        `re-reading a document is not a check of it${ctx}`,
    )
    must(
      isIndependentVerificationSource(verifiedAgainst.kind, cite.kind),
      `${claim} source is cited to ${VOTE_SOURCE_KINDS[cite.kind].label} and claims to have ` +
        `been cotejado against ${VOTE_SOURCE_KINDS[verifiedAgainst.kind].label}, which is not ` +
        `independent of it` +
        (verifiedAgainst.kind === cite.kind
          ? ` — two documents of the same kind share the way of knowing, so they share the ` +
            `error too`
          : ` — it is produced from the very source it claims to check`) +
        `. Cotejar against a different kind of record that is not derived from this one${ctx}`,
    )
  } else {
    must(
      o.quote === undefined && o.verifiedBy === undefined && o.verifiedAgainst === undefined,
      `${claim} source carries quote/verifiedBy/verifiedAgainst but is not marked ` +
        `"verificado" — a signature beside an unverified claim reads as a verification that ` +
        `did not happen${ctx}`,
    )
  }

  return {
    ...cite,
    verification: o.verification as VoteVerification,
    ...(o.quote !== undefined ? { quote: (o.quote as string).trim() } : {}),
    ...(o.verifiedBy !== undefined ? { verifiedBy: (o.verifiedBy as string).trim() } : {}),
    ...(verifiedAgainst !== undefined ? { verifiedAgainst } : {}),
  }
}

export function validateVote(v: unknown, idx = -1): PlenoVote {
  const ctx = idx >= 0 ? ` (items[${idx}])` : ''
  must(typeof v === 'object' && v !== null, `vote must be an object${ctx}`)
  const o = v as Record<string, unknown>

  must(typeof o.id === 'string' && ID_RE.test(o.id), `id must match /^[a-z0-9]+-\\d{2,}$/${ctx}`)
  must(typeof o.plenoId === 'string' && o.plenoId.length > 0, `plenoId required${ctx}`)
  must(
    typeof o.plenoDate === 'string' && ISO_DATE.test(o.plenoDate),
    `plenoDate must be ISO date${ctx}`,
  )
  must(
    Number.isInteger(o.itemNumber) && (o.itemNumber as number) > 0,
    `itemNumber must be positive int${ctx}`,
  )
  must(typeof o.title === 'string' && o.title.trim().length >= 20, `title must be ≥20 chars${ctx}`)
  must(
    typeof o.outcome === 'string' && ALLOWED_OUTCOMES.includes(o.outcome as VoteOutcome),
    `outcome must be one of ${ALLOWED_OUTCOMES.join(',')}${ctx}`,
  )
  must(Array.isArray(o.votes), `votes must be an array${ctx}`)
  // An empty breakdown is publishable ONLY as a signed withdrawal. Both
  // directions are checked: a hole with no stamp is unexplained, and a stamp
  // beside a published tally claims to have withdrawn what it is still showing.
  const stamp = o.votesRetracted
  if (stamp !== undefined) {
    must(typeof stamp === 'object' && stamp !== null, `votesRetracted must be an object${ctx}`)
    const s = stamp as Record<string, unknown>
    must(
      typeof s.reason === 'string' && s.reason.trim().length >= RETRACTION_REASON_MIN,
      `votesRetracted.reason must be ≥${RETRACTION_REASON_MIN} chars${ctx}`,
    )
    must(
      typeof s.editor === 'string' && s.editor.trim().length > 0,
      `votesRetracted.editor required — a retraction carries a curator signature${ctx}`,
    )
    must(
      typeof s.retractedAt === 'string' && ISO_DATETIME.test(s.retractedAt),
      `votesRetracted.retractedAt must be an ISO timestamp${ctx}`,
    )
    must(
      (o.votes as unknown[]).length === 0,
      `votesRetracted is set but votes still lists ${(o.votes as unknown[]).length} tuple(s) — ` +
        `a withdrawn breakdown cannot still be published${ctx}`,
    )
  } else {
    must(
      (o.votes as unknown[]).length > 0,
      `votes must be non-empty array, or empty with a votesRetracted stamp${ctx}`,
    )
  }
  must(
    typeof o.sourceUrl === 'string' && URL_RE.test(o.sourceUrl),
    `sourceUrl must be http(s) URL${ctx}`,
  )
  must(
    typeof o.sourcePublisher === 'string' && o.sourcePublisher.trim().length > 0,
    `sourcePublisher required${ctx}`,
  )
  must(
    typeof o.retrievedAt === 'string' && ISO_DATE.test(o.retrievedAt),
    `retrievedAt must be ISO date${ctx}`,
  )

  // Per-claim provenance. Optional HERE so the pre-migration votes tombstoned
  // inside retractions[].original keep validating unchanged; required on every
  // published row by validateSnapshot.
  let provenance: VoteProvenance | undefined
  if (o.provenance !== undefined) {
    must(
      typeof o.provenance === 'object' && o.provenance !== null,
      `provenance must be an object${ctx}`,
    )
    const p = o.provenance as Record<string, unknown>
    const outcomeRef = validateSourceRef(p.outcome, 'outcome', ctx)
    // One URL, one truth. `sourceUrl` stays because five consumers read it;
    // letting it disagree with the outcome citation would just move the defect.
    must(
      outcomeRef.url === o.sourceUrl,
      `provenance.outcome.url (${outcomeRef.url}) ≠ sourceUrl (${String(o.sourceUrl)}) — ` +
        `the outcome has one source, not two${ctx}`,
    )
    // The pairing that makes the split real, checked BOTH ways: a published
    // tally with no breakdown citation is the 2026-08-05 defect itself, and a
    // breakdown citation with no tally cites something the page does not show.
    const tallyCount = (o.votes as unknown[]).length
    if (p.breakdown == null) {
      must(
        tallyCount === 0,
        `provenance.breakdown is null but ${tallyCount} per-bloc tuple(s) are ` +
          `published — a breakdown must name the source that carries it${ctx}`,
      )
      provenance = { outcome: outcomeRef, breakdown: null }
    } else {
      must(tallyCount > 0, `provenance.breakdown is set but no per-bloc tally is published${ctx}`)
      provenance = {
        outcome: outcomeRef,
        breakdown: validateSourceRef(p.breakdown, 'breakdown', ctx),
      }
    }
  }

  if (o.dueBy !== undefined) {
    must(typeof o.dueBy === 'string' && ISO_DATE.test(o.dueBy), `dueBy must be ISO date${ctx}`)
    must(
      typeof o.dueBySource === 'string' && o.dueBySource.trim().length >= 20,
      `dueBySource must be ≥20-char verbatim clause when dueBy is set${ctx}`,
    )
  } else if (o.dueBySource !== undefined) {
    must(
      typeof o.dueBySource === 'string' && o.dueBySource.trim().length >= 20,
      `dueBySource must be ≥20 chars when present${ctx}`,
    )
  }

  const seenBlocs = new Set<string>()
  const votes: VoteByBloc[] = (o.votes as unknown[]).map((raw, i) => {
    const vc = ` (items[${idx}].votes[${i}])`
    must(typeof raw === 'object' && raw !== null, `vote tuple must be object${vc}`)
    const vo = raw as Record<string, unknown>
    // Named before generic: "bloc must be one of PSOE,PP,…" does not tell a
    // curator *why* the value they typed is refused, and `Otro` is the one
    // value someone will reach for again.
    must(
      vo.bloc !== 'Otro',
      `bloc "Otro" is retired: it names no group, and with one councillor ` +
        `outside PSOE/PP/VOX/Compromís it identifies him by elimination. ` +
        `Use null for "the source does not say", or the real group name${vc}`,
    )
    must(
      vo.bloc === null ||
        (typeof vo.bloc === 'string' && ALLOWED_BLOCS.includes(vo.bloc as VoteBloc)),
      `bloc must be null or one of ${ALLOWED_BLOCS.join(',')}${vc}`,
    )
    must(
      typeof vo.direction === 'string' &&
        ALLOWED_DIRECTIONS.includes(vo.direction as VoteDirection),
      `direction must be one of ${ALLOWED_DIRECTIONS.join(',')}${vc}`,
    )
    // `null` gets its own dedupe key rather than the string "null", which a
    // bloc could never be: two unattributed tuples are indistinguishable, so
    // a second one is a duplicate exactly as a second PSOE row would be.
    const key = vo.bloc === null ? '\u0000sin-identificar' : (vo.bloc as string)
    must(
      !seenBlocs.has(key),
      `bloc ${vo.bloc === null ? '(sin identificar)' : vo.bloc} listed more than once${vc}`,
    )
    seenBlocs.add(key)
    if (vo.seats !== undefined) {
      must(
        Number.isInteger(vo.seats) && (vo.seats as number) >= 0,
        `seats must be non-negative int${vc}`,
      )
    }
    return {
      bloc: vo.bloc as VoteBloc | null,
      direction: vo.direction as VoteDirection,
      ...(vo.seats !== undefined ? { seats: vo.seats as number } : {}),
    }
  })

  return {
    id: o.id as string,
    plenoId: o.plenoId as string,
    plenoDate: o.plenoDate as string,
    itemNumber: o.itemNumber as number,
    title: (o.title as string).trim(),
    outcome: o.outcome as VoteOutcome,
    votes,
    ...(o.department ? { department: String(o.department) } : {}),
    ...(o.expediente ? { expediente: String(o.expediente) } : {}),
    ...(o.dueBy ? { dueBy: o.dueBy as string } : {}),
    ...(o.dueBySource ? { dueBySource: (o.dueBySource as string).trim() } : {}),
    ...(stamp !== undefined
      ? {
          votesRetracted: {
            reason: String((stamp as Record<string, unknown>).reason).trim(),
            editor: String((stamp as Record<string, unknown>).editor).trim(),
            retractedAt: (stamp as Record<string, unknown>).retractedAt as string,
          },
        }
      : {}),
    ...(provenance !== undefined ? { provenance } : {}),
    sourceUrl: o.sourceUrl as string,
    sourcePublisher: (o.sourcePublisher as string).trim(),
    retrievedAt: o.retrievedAt as string,
    ...(o.note ? { note: String(o.note) } : {}),
  }
}

export function validateRetraction(r: unknown, idx = -1): VoteRetraction {
  const ctx = idx >= 0 ? ` (retractions[${idx}])` : ''
  must(typeof r === 'object' && r !== null, `retraction must be an object${ctx}`)
  const o = r as Record<string, unknown>

  must(
    typeof o.voteId === 'string' && ID_RE.test(o.voteId),
    `voteId must match /^[a-z0-9]+-\\d{2,}$/${ctx}`,
  )
  must(
    typeof o.scope === 'string' && RETRACTION_SCOPES.includes(o.scope as VoteRetractionScope),
    `scope must be one of ${RETRACTION_SCOPES.join(',')}${ctx}`,
  )
  must(
    typeof o.reason === 'string' && o.reason.trim().length >= RETRACTION_REASON_MIN,
    `reason must be ≥${RETRACTION_REASON_MIN} chars — a withdrawal without a stated ` +
      `reason is not a record of anything${ctx}`,
  )
  must(
    typeof o.editor === 'string' && o.editor.trim().length > 0,
    `editor required — a retraction of a claim about how named political groups ` +
      `voted carries a curator signature${ctx}`,
  )
  must(
    typeof o.retractedAt === 'string' && ISO_DATETIME.test(o.retractedAt),
    `retractedAt must be an ISO timestamp${ctx}`,
  )

  const scope = o.scope as VoteRetractionScope
  // Nothing is deleted without a record: the withdrawn content is the record.
  let original: PlenoVote | null = null
  let originalVotes: VoteByBloc[] | null = null
  if (scope === 'record') {
    must(o.original != null, `scope "record" must keep the withdrawn vote in original${ctx}`)
    original = validateVote(o.original, idx)
    must(original.id === o.voteId, `original.id ${original.id} ≠ voteId ${String(o.voteId)}${ctx}`)
  } else {
    must(
      Array.isArray(o.originalVotes) && (o.originalVotes as unknown[]).length > 0,
      `scope "breakdown" must keep the withdrawn tuples in originalVotes${ctx}`,
    )
    // Re-use the tuple rules (enum + dedupe + the retired `Otro` sentinel) by
    // validating the withdrawn tally as if it were a vote's own breakdown.
    originalVotes = validateVote(
      syntheticTupleCarrier(o.originalVotes as unknown[], o.voteId as string),
      idx,
    ).votes
  }
  // Present only on entries written after 2026-08-05. Absent is a fact about
  // when the entry was made, never something to backfill: see the field's doc
  // comment on `VoteRetraction`.
  let originalBreakdownSource: VoteSourceRef | null | undefined
  if (o.originalBreakdownSource !== undefined && o.originalBreakdownSource !== null) {
    must(
      scope === 'breakdown',
      `originalBreakdownSource belongs to a breakdown retraction, not a "${scope}" one${ctx}`,
    )
    originalBreakdownSource = validateSourceRef(o.originalBreakdownSource, 'breakdown', ctx)
  }

  const revokedFields = [o.revokedAt, o.revokedBy, o.revokedReason].filter((x) => x !== undefined)
  must(
    revokedFields.length === 0 || revokedFields.length === 3,
    `revokedAt, revokedBy and revokedReason travel together — a revocation with ` +
      `no signature or no reason is exactly the silent reappearance this field ` +
      `exists to prevent${ctx}`,
  )
  if (revokedFields.length === 3) {
    must(
      typeof o.revokedAt === 'string' && ISO_DATETIME.test(o.revokedAt),
      `revokedAt must be an ISO timestamp${ctx}`,
    )
    must(
      typeof o.revokedBy === 'string' && (o.revokedBy as string).trim().length > 0,
      `revokedBy required${ctx}`,
    )
    must(
      typeof o.revokedReason === 'string' &&
        (o.revokedReason as string).trim().length >= RETRACTION_REASON_MIN,
      `revokedReason must be ≥${RETRACTION_REASON_MIN} chars${ctx}`,
    )
  }

  return {
    voteId: o.voteId as string,
    scope,
    reason: (o.reason as string).trim(),
    editor: (o.editor as string).trim(),
    retractedAt: o.retractedAt as string,
    original,
    originalVotes,
    ...(originalBreakdownSource !== undefined ? { originalBreakdownSource } : {}),
    ...(revokedFields.length === 3
      ? {
          revokedAt: o.revokedAt as string,
          revokedBy: (o.revokedBy as string).trim(),
          revokedReason: (o.revokedReason as string).trim(),
        }
      : {}),
  }
}

/** Minimal well-formed vote wrapper so a bare tuple array can be pushed through
 *  the tuple half of `validateVote` without restating its rules here — the
 *  hand-copied-shape trap in docs/DATA_INTEGRITY.md rule 1. */
function syntheticTupleCarrier(votes: unknown[], voteId: string) {
  return {
    id: voteId,
    plenoId: voteId.split('-')[0],
    plenoDate: '1970-01-01',
    itemNumber: 1,
    title: 'desglose retirado — portador sintético de validación',
    outcome: 'aprobado' as const,
    votes,
    sourceUrl: 'https://example.invalid/retracted',
    sourcePublisher: 'n/a',
    retrievedAt: '1970-01-01',
  }
}

export function validateSnapshot(raw: unknown): PlenoVotesSnapshot {
  must(typeof raw === 'object' && raw !== null, 'snapshot must be an object')
  const o = raw as Record<string, unknown>
  must(typeof o.generatedAt === 'string', 'generatedAt required')
  must(typeof o.source === 'object' && o.source !== null, 'source required')
  must(Array.isArray(o.items), 'items must be array')
  must(
    o.retractions === undefined || Array.isArray(o.retractions),
    'retractions must be an array when present',
  )

  const seenIds = new Set<string>()
  const items: PlenoVote[] = (o.items as unknown[]).map((it, i) => {
    const v = validateVote(it, i)
    must(!seenIds.has(v.id), `duplicate id ${v.id}`)
    seenIds.add(v.id)
    // PUBLISHED rows must say where each half came from. Enforced here rather
    // than in validateVote so the pre-migration votes tombstoned inside
    // retractions[].original — which also go through validateVote — keep
    // validating without being retroactively annotated.
    must(
      v.provenance != null,
      `vote ${v.id} publishes no provenance: state where the outcome comes from ` +
        `and, if a per-bloc tally is published, where THAT comes from. ` +
        `Migrate with npx tsx scripts/migrate-vote-provenance.ts (items[${i}])`,
    )
    return v
  })

  const seenRetractions = new Set<string>()
  const retractions: VoteRetraction[] = ((o.retractions as unknown[]) ?? []).map((r, i) => {
    const v = validateRetraction(r, i)
    const key = `${v.voteId}|${v.scope}`
    must(!seenRetractions.has(key), `duplicate retraction ${key}`)
    seenRetractions.add(key)
    return v
  })

  const byId = new Map(items.map((it) => [it.id, it]))
  for (const r of retractions) {
    if (!isLiveRetraction(r)) continue
    if (r.scope === 'record') {
      // THE reappearance guard, and it sits on the WRITER, not on a checker
      // that runs later: `npm run pleno-vote` and `promote-vote` both go
      // through this function, so neither can put a withdrawn vote back
      // without an explicit, signed `retract-vote --unretract` first.
      must(
        !byId.has(r.voteId),
        `vote ${r.voteId} was retracted on ${r.retractedAt} by ${r.editor} but is ` +
          `published again in items[]. Republishing a withdrawn vote needs an ` +
          `explicit signed revocation: npm run retract-vote -- ${r.voteId} ` +
          `--unretract --reason "…" --editor "…"`,
      )
    } else {
      const item = byId.get(r.voteId)
      must(
        item != null,
        `breakdown retraction ${r.voteId} has no vote in items[] — withdrawing a ` +
          `tally keeps the item published; use scope "record" to withdraw the whole vote`,
      )
      must(
        item.votes.length === 0 && item.votesRetracted != null,
        `vote ${r.voteId} has a live breakdown retraction but publishes a tally again`,
      )
    }
  }
  // The mirror direction: a stamp on an item must trace to a live ledger entry,
  // so hand-editing a stamp away — or in — cannot pass unrecorded.
  const liveBreakdowns = new Set(
    retractions.filter((r) => isLiveRetraction(r) && r.scope === 'breakdown').map((r) => r.voteId),
  )
  for (const it of items) {
    must(
      it.votesRetracted == null || liveBreakdowns.has(it.id),
      `vote ${it.id} carries a votesRetracted stamp with no live retraction in ` +
        `retractions[] — the withdrawn tuples would be unrecoverable`,
    )
  }

  const byOutcome: Record<VoteOutcome, number> = {
    aprobado: 0,
    rechazado: 0,
    retirado: 0,
    aplazado: 0,
  }
  const byPleno: Record<string, number> = {}
  for (const it of items) {
    byOutcome[it.outcome] += 1
    byPleno[it.plenoId] = (byPleno[it.plenoId] ?? 0) + 1
  }
  const retracted: Record<VoteRetractionScope, number> = { record: 0, breakdown: 0 }
  for (const r of retractions) if (isLiveRetraction(r)) retracted[r.scope] += 1

  return {
    generatedAt: o.generatedAt as string,
    source: {
      description: String((o.source as Record<string, unknown>).description ?? ''),
      contract: String((o.source as Record<string, unknown>).contract ?? ''),
    },
    stats: { total: items.length, byOutcome, byPleno, retracted },
    items,
    retractions,
  }
}

// ── retraction: the pure half ────────────────────────────────────────────────
// A retraction is a WEAKENING. Every function below removes a claim from what
// readers see; none of them adds or alters one. `retractVoteBreakdown` is the
// only one that writes to a published row at all, and all it writes is the
// signed reason the tally is gone.
//
// IO, argument parsing and the re-validate-before-write live in
// scripts/retract-pleno-vote.ts, per this repo's parser/CLI split.

export class PlenoVoteRetractionError extends Error {}

function refuse(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new PlenoVoteRetractionError(msg)
}

export interface RetractionSignature {
  reason: string
  editor: string
  /** ISO timestamp. Injected so callers and tests are deterministic. */
  at: string
}

function checkSignature({ reason, editor }: RetractionSignature) {
  refuse(
    reason.trim().length >= RETRACTION_REASON_MIN,
    `--reason must be ≥${RETRACTION_REASON_MIN} chars (got ${reason.trim().length})`,
  )
  refuse(editor.trim().length > 0, '--editor required: a retraction carries a curator signature')
}

/** The live retraction for this id at this scope, if any. */
export function findLiveRetraction(
  snap: PlenoVotesSnapshot,
  voteId: string,
  scope: VoteRetractionScope,
): VoteRetraction | undefined {
  return snap.retractions.find(
    (r) => r.voteId === voteId && r.scope === scope && isLiveRetraction(r),
  )
}

/**
 * Withdraw a whole vote: it leaves `items[]` and its full content is tombstoned
 * into `retractions[]`.
 *
 * The caller must re-validate the result before writing — `validateSnapshot`
 * recomputes `stats` and enforces the reappearance invariant.
 */
export function retractVoteRecord(
  snap: PlenoVotesSnapshot,
  voteId: string,
  sig: RetractionSignature,
): PlenoVotesSnapshot {
  checkSignature(sig)
  const target = snap.items.find((v) => v.id === voteId)
  refuse(
    target != null,
    `vote "${voteId}" is not published in items[] — nothing to retract` +
      (findLiveRetraction(snap, voteId, 'record') ? ' (it is already retracted)' : ''),
  )
  return {
    ...snap,
    items: snap.items.filter((v) => v.id !== voteId),
    retractions: [
      ...snap.retractions,
      {
        voteId,
        scope: 'record',
        reason: sig.reason.trim(),
        editor: sig.editor.trim(),
        retractedAt: sig.at,
        original: target,
        originalVotes: null,
      },
    ],
  }
}

/**
 * Withdraw ONLY the per-bloc tally. Item number, title, outcome, expediente,
 * plazo and source stay published — they are what the cited source actually
 * carries. The tuples are tombstoned and the row is stamped so the surfaces can
 * say the breakdown was withdrawn instead of leaving a silent hole.
 */
export function retractVoteBreakdown(
  snap: PlenoVotesSnapshot,
  voteId: string,
  sig: RetractionSignature,
): PlenoVotesSnapshot {
  checkSignature(sig)
  const target = snap.items.find((v) => v.id === voteId)
  refuse(target != null, `vote "${voteId}" is not published in items[] — nothing to retract`)
  refuse(
    target.votes.length > 0,
    `vote "${voteId}" publishes no per-bloc breakdown — nothing to withdraw`,
  )
  const stamp: VoteBreakdownRetractionStamp = {
    reason: sig.reason.trim(),
    editor: sig.editor.trim(),
    retractedAt: sig.at,
  }
  const { votes: originalVotes, ...rest } = target
  // The tally's citation leaves with the tally. Leaving `provenance.breakdown`
  // behind would cite a source for something the page no longer shows; the
  // ledger keeps it so a revocation can put both back together.
  const originalBreakdownSource = target.provenance?.breakdown ?? null
  const withdrawnProvenance = target.provenance
    ? { outcome: target.provenance.outcome, breakdown: null }
    : undefined
  return {
    ...snap,
    items: snap.items.map((v) =>
      v.id === voteId
        ? {
            ...rest,
            ...(withdrawnProvenance ? { provenance: withdrawnProvenance } : {}),
            votes: [],
            votesRetracted: stamp,
          }
        : v,
    ),
    retractions: [
      ...snap.retractions,
      {
        voteId,
        scope: 'breakdown',
        reason: stamp.reason,
        editor: stamp.editor,
        retractedAt: sig.at,
        original: null,
        originalVotes,
        originalBreakdownSource,
      },
    ],
  }
}

/**
 * Lift a retraction so a corrected record can be published again.
 *
 * The ledger entry is STAMPED, never removed: the id's history stays legible
 * and the act of returning it to publication is itself signed and dated. For a
 * `breakdown` revocation the stamp also comes off the row, which re-opens the
 * `votes` non-empty rule — so the very next `npm run pleno-vote` must supply a
 * real tally rather than leave an unexplained hole.
 */
export function revokeRetraction(
  snap: PlenoVotesSnapshot,
  voteId: string,
  scope: VoteRetractionScope,
  sig: RetractionSignature,
): PlenoVotesSnapshot {
  checkSignature(sig)
  const live = findLiveRetraction(snap, voteId, scope)
  refuse(live != null, `no live ${scope} retraction for "${voteId}"`)
  // Restoring a tally re-asserts «this is how each group voted», so it has to
  // come back with the citation it was withdrawn with. The three entries
  // written before 2026-08-05 have none — they were retracted precisely
  // because their breakdown had no source that carried it — so a revocation
  // there stops here rather than republishing an uncited tally.
  if (scope === 'breakdown' && (live.originalVotes?.length ?? 0) > 0) {
    refuse(
      live.originalBreakdownSource != null,
      `the withdrawn tally for "${voteId}" was recorded without a breakdown source ` +
        `(retracted ${live.retractedAt}), so revoking would republish an uncited ` +
        `breakdown — the defect this ledger exists to record. Publish it instead ` +
        `with: npm run pleno-vote -- --file <vote.json>, stating provenance.breakdown.`,
    )
  }
  return {
    ...snap,
    items:
      scope === 'breakdown'
        ? snap.items.map((v) => {
            if (v.id !== voteId) return v
            const { votesRetracted: _dropped, ...rest } = v
            return {
              ...rest,
              ...(rest.provenance && live.originalBreakdownSource
                ? {
                    provenance: {
                      outcome: rest.provenance.outcome,
                      breakdown: live.originalBreakdownSource,
                    },
                  }
                : {}),
              votes: live.originalVotes ?? [],
            }
          })
        : snap.items,
    retractions: snap.retractions.map((r) =>
      r === live
        ? {
            ...r,
            revokedAt: sig.at,
            revokedBy: sig.editor.trim(),
            revokedReason: sig.reason.trim(),
          }
        : r,
    ),
  }
}
