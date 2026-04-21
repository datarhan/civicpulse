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

export type VoteBloc = 'PSOE' | 'PP' | 'VOX' | 'Compromís' | 'Ciudadanos' | 'Otro'

export type VoteDirection = 'a_favor' | 'en_contra' | 'abstencion' | 'ausente'

export type VoteOutcome = 'aprobado' | 'rechazado' | 'retirado' | 'aplazado'

/** Per-bloc vote tuple. Every bloc that existed on the date of the session
 *  must appear exactly once (no duplicates, no gaps) — enforced at validate(). */
export interface VoteByBloc {
  bloc: VoteBloc
  direction: VoteDirection
  /** Optional: the seat count the bloc held on the date of this session.
   *  Used for UI display; not required for validation. */
  seats?: number
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
  /** Per-bloc breakdown. Sum of a_favor/en_contra/abstencion determines outcome. */
  votes: VoteByBloc[]
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
  }
  items: PlenoVote[]
}

export const ALLOWED_BLOCS: readonly VoteBloc[] = [
  'PSOE',
  'PP',
  'VOX',
  'Compromís',
  'Ciudadanos',
  'Otro',
]

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

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
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
  must(typeof o.plenoDate === 'string' && ISO_DATE.test(o.plenoDate), `plenoDate must be ISO date${ctx}`)
  must(Number.isInteger(o.itemNumber) && (o.itemNumber as number) > 0, `itemNumber must be positive int${ctx}`)
  must(typeof o.title === 'string' && o.title.trim().length >= 20, `title must be ≥20 chars${ctx}`)
  must(typeof o.outcome === 'string' && ALLOWED_OUTCOMES.includes(o.outcome as VoteOutcome), `outcome must be one of ${ALLOWED_OUTCOMES.join(',')}${ctx}`)
  must(Array.isArray(o.votes) && (o.votes as unknown[]).length > 0, `votes must be non-empty array${ctx}`)
  must(typeof o.sourceUrl === 'string' && URL_RE.test(o.sourceUrl), `sourceUrl must be http(s) URL${ctx}`)
  must(typeof o.sourcePublisher === 'string' && o.sourcePublisher.trim().length > 0, `sourcePublisher required${ctx}`)
  must(typeof o.retrievedAt === 'string' && ISO_DATE.test(o.retrievedAt), `retrievedAt must be ISO date${ctx}`)

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
    must(typeof vo.bloc === 'string' && ALLOWED_BLOCS.includes(vo.bloc as VoteBloc), `bloc must be one of ${ALLOWED_BLOCS.join(',')}${vc}`)
    must(typeof vo.direction === 'string' && ALLOWED_DIRECTIONS.includes(vo.direction as VoteDirection), `direction must be one of ${ALLOWED_DIRECTIONS.join(',')}${vc}`)
    must(!seenBlocs.has(vo.bloc as string), `bloc ${vo.bloc} listed more than once${vc}`)
    seenBlocs.add(vo.bloc as string)
    if (vo.seats !== undefined) {
      must(Number.isInteger(vo.seats) && (vo.seats as number) >= 0, `seats must be non-negative int${vc}`)
    }
    return { bloc: vo.bloc as VoteBloc, direction: vo.direction as VoteDirection, ...(vo.seats !== undefined ? { seats: vo.seats as number } : {}) }
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
    sourceUrl: o.sourceUrl as string,
    sourcePublisher: (o.sourcePublisher as string).trim(),
    retrievedAt: o.retrievedAt as string,
    ...(o.note ? { note: String(o.note) } : {}),
  }
}

export function validateSnapshot(raw: unknown): PlenoVotesSnapshot {
  must(typeof raw === 'object' && raw !== null, 'snapshot must be an object')
  const o = raw as Record<string, unknown>
  must(typeof o.generatedAt === 'string', 'generatedAt required')
  must(typeof o.source === 'object' && o.source !== null, 'source required')
  must(Array.isArray(o.items), 'items must be array')

  const seenIds = new Set<string>()
  const items: PlenoVote[] = (o.items as unknown[]).map((it, i) => {
    const v = validateVote(it, i)
    must(!seenIds.has(v.id), `duplicate id ${v.id}`)
    seenIds.add(v.id)
    return v
  })

  const byOutcome: Record<VoteOutcome, number> = { aprobado: 0, rechazado: 0, retirado: 0, aplazado: 0 }
  const byPleno: Record<string, number> = {}
  for (const it of items) {
    byOutcome[it.outcome] += 1
    byPleno[it.plenoId] = (byPleno[it.plenoId] ?? 0) + 1
  }

  return {
    generatedAt: o.generatedAt as string,
    source: {
      description: String((o.source as Record<string, unknown>).description ?? ''),
      contract: String((o.source as Record<string, unknown>).contract ?? ''),
    },
    stats: { total: items.length, byOutcome, byPleno },
    items,
  }
}
