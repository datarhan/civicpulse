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
 * Source of truth: the published acta (pleno minutes) on ribarroja.es or the
 * DVD/PDF published by the secretaría municipal. Every vote record must cite
 * the acta URL + publication date and quote the exact acuerdo title verbatim.
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
  /** Source citation — URL to the acta or a scanned PDF. Required. */
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
const ID_RE = /^[a-z0-9]+-\d{2,}$/

export class PlenoVoteValidationError extends Error {}

function must(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new PlenoVoteValidationError(msg)
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
    const key = vo.bloc === null ? ' sin-identificar' : (vo.bloc as string)
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
  return {
    ...snap,
    items: snap.items.map((v) =>
      v.id === voteId ? { ...rest, votes: [], votesRetracted: stamp } : v,
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
  return {
    ...snap,
    items:
      scope === 'breakdown'
        ? snap.items.map((v) => {
            if (v.id !== voteId) return v
            const { votesRetracted: _dropped, ...rest } = v
            return { ...rest, votes: live.originalVotes ?? [] }
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
