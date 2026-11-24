/**
 * Turn the model's identity candidates into rows the pipeline will vouch for.
 *
 * The model is asked for evidence, not conclusions, and this is where the
 * evidence is checked. Nothing here consults the audio — every gate is a
 * deterministic statement about the transcript the model itself returned, so
 * the same candidate always produces the same verdict.
 *
 * A rejected candidate is **reported with a reason**, never silently dropped:
 * "no rows" because the audio named nobody and "no rows" because every
 * citation failed are different facts, and folding them together is the
 * `DATA_INTEGRITY.md` rule 2 failure.
 */
import { findPartiesInText, normalizeParty } from '../lib/party-alias'
import type { BlocSeats, OfficialLike } from './corporation-seats'
import { singleSeatBlocs } from './corporation-seats'
import { SPEAKER_GROUPS } from './pleno-votes'
import type { RawSegment, SpeakerCandidate, SpeakerMapRow } from './speaker-map'

export type RejectReason =
  /** The cited second falls in no segment at all. */
  | 'evidence-outside-transcript'
  /** The cited second belongs to a different speaker than the one claimed. */
  | 'evidence-speaker-mismatch'
  /** turn-grant/reply asserted, but the sequence does not bear it out. */
  | 'relation-contradicted'
  /** Neither an acredited party nor a resolvable name — nothing to stand on. */
  | 'unresolvable'
  /** Name and party fit more than one councillor. Naming needs certainty. */
  | 'ambiguous'
  /** Two labels resolved to the same person, so at least one is wrong. */
  | 'label-collision'
  /** The roster's party for this councillor is not publishable as a bloc. */
  | 'bloc-not-publishable'
  /** The identified voice only answers with a vote read back. See `esRespuestaDeVoto`. */
  | 'roll-call'
  /** The identified voice answers in ≤ PALABRAS_RESPUESTA_BREVE words and stops. */
  | 'short-answer'

export interface RejectedCandidate {
  label: string
  reason: RejectReason
  detail: string
}

export interface ValidationResult {
  rows: SpeakerMapRow[]
  rejected: RejectedCandidate[]
}

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()

/**
 * A vote, folded: what a group answers when the chair reads the vote back.
 * Castilian and Valencian fold to the same forms («abstenció» and «abstención»
 * lose their accents).
 */
const SOLO_VOTO = /^(?:a favor|en contra|contra|abstencio|abstencion)$/
const MULETILLAS = /\b(?:eh|ehm|mm|bueno|be)\b/g
const plano = (s: string) =>
  fold(s)
    .replace(/[^\p{L}\s]/gu, ' ')
    .replace(MULETILLAS, ' ')
    .replace(/\s+/g, ' ')
    .trim()

/**
 * True when a whole line is an ANSWER that is nothing but a vote: «Abstenció.»,
 * «A favor.», «Contra.». A question is never one, so the chair's «¿Abstenciones?»
 * is not.
 *
 * After an electronic vote the chair reads each group's vote back — «Partit
 * Popular? — Abstenció. Vox? — Abstenció.» — and «Vox?» looks exactly like a
 * turn grant. Both cases in `tests/speaker-map-votacion.test.ts` are real
 * output, caught on 2026-11-24.
 *
 * A WHOLE line, deliberately: «A favor, perquè esta moció…» is a turn of
 * speech that begins with a vote.
 */
export function esRespuestaDeVoto(text: string): boolean {
  return !text.includes('?') && SOLO_VOTO.test(plano(text))
}

/**
 * At most this many words, and the voice stops: an answer, not a turn.
 *
 * A one- or two-word reply identifies nobody. In a nominal vote the chair reads
 * each name and the answer is «Sí.» or «No.»; offered the floor, a group may say
 * «No, gràcies.». Either way the voice the label names has said two words, the
 * chair sometimes says them himself («Vox, abstenció. José Manuel?»), and the
 * label carries the bloc onto everything else it says in the chunk. Three of
 * the five blocs hold one seat, so a wrong one names a person.
 */
export const PALABRAS_RESPUESTA_BREVE = 2

/** How far ahead (or back, for a reply) «the voice goes on» is looked for. */
export const SEGMENTOS_PARA_SEGUIR = 4

/**
 * A short answer: at most PALABRAS_RESPUESTA_BREVE words. «[inaudible]» is not
 * one — it is a line nobody could read, and an unread line is not evidence that
 * the voice stopped.
 */
const esBreve = (text: string) =>
  !/\[inaudible\]/i.test(text) &&
  plano(text).split(' ').filter(Boolean).length <= PALABRAS_RESPUESTA_BREVE

/**
 * The segment containing `at`, using a **half-open interval and no epsilon**.
 *
 * Segments are contiguous — `[a→b][b→c]` — so a tolerance of even ±0.05 s
 * makes the *previous* segment win at every boundary. Turn-grants sit exactly
 * on boundaries by nature (the chair stops, the next speaker starts), so that
 * off-by-epsilon turned every correct citation into a mismatch: it reported 6
 * of 7 sound citations as unsupported when it was first written.
 */
export function segmentAt(segments: readonly RawSegment[], at: number): number {
  return segments.findIndex((s) => at >= s.start && at < s.end)
}

/**
 * Does a name heard on tape plausibly belong to this councillor?
 *
 * Audio names are phonetic and abbreviated: «Rafa» for Rafael, «Albert» for
 * Alberto, «Alberto Jimenos» for Gimeno. So a token matches on a prefix
 * relation in either direction, with a 3-character floor — «Pep» must not
 * reach «Pepita», and a 1–2 letter fragment matches half the roster.
 *
 * Deliberately not fuzzy beyond that. Edit distance would let «Abert» reach
 * «Alberto», and «Abert, Pep?» is a line where the model misheard BOTH names;
 * a matcher generous enough to rescue it is generous enough to name the wrong
 * councillor.
 */
export function nameMatches(heard: string, officialName: string): boolean {
  const heardTokens = fold(heard).split(/\s+/).filter(Boolean)
  const nameTokens = fold(officialName).split(/\s+/).filter(Boolean)
  if (heardTokens.length === 0) return false
  return heardTokens.every((h) =>
    nameTokens.some(
      (n) => (h.length >= 3 && n.startsWith(h)) || (n.length >= 3 && h.startsWith(n)),
    ),
  )
}

/**
 * Is the name the model reports actually spoken in the quote it cites?
 *
 * Token-level and prefix-tolerant, matching `nameMatches`, because the quote
 * carries the spoken form: «Compromís, Rafa» acredits "Rafa", and a quote
 * reading «el regidor del Partit Popular» acredits no name whatever the model
 * put in the field.
 */
export function nameAppearsIn(heard: string, quote: string): boolean {
  const quoteTokens = new Set(
    fold(quote)
      .split(/[^a-z0-9]+/)
      .filter(Boolean),
  )
  const heardTokens = fold(heard).split(/\s+/).filter(Boolean)
  if (heardTokens.length === 0) return false
  return heardTokens.every((h) =>
    [...quoteTokens].some(
      (q) => (h.length >= 3 && q.startsWith(h)) || (q.length >= 3 && h.startsWith(q)),
    ),
  )
}

export interface ValidateOptions {
  candidates: readonly SpeakerCandidate[]
  segments: readonly RawSegment[]
  officials: readonly OfficialLike[]
  seats: readonly BlocSeats[]
}

export function validateSpeakerMap(opts: ValidateOptions): ValidationResult {
  const { candidates, segments, officials, seats } = opts
  const oneSeat = new Set(singleSeatBlocs(seats))
  const rows: SpeakerMapRow[] = []
  const rejected: RejectedCandidate[] = []
  const reject = (label: string, reason: RejectReason, detail: string) =>
    rejected.push({ label, reason, detail })

  for (const c of candidates) {
    const ev = c.evidence
    if (!ev) {
      reject(c.label, 'unresolvable', 'candidate carries no evidence')
      continue
    }

    // ── Gate 1 · the citation resolves ──────────────────────────────────
    const i = segmentAt(segments, ev.at)
    if (i < 0) {
      reject(c.label, 'evidence-outside-transcript', `no segment contains ${ev.at}s`)
      continue
    }
    if (segments[i].speaker !== ev.spokenBy) {
      reject(
        c.label,
        'evidence-speaker-mismatch',
        `${ev.at}s is ${segments[i].speaker}, cited as ${ev.spokenBy}`,
      )
      continue
    }

    // ── Gate 2 · the relation holds positionally ────────────────────────
    // A back-reference cannot be checked this way — it names someone at
    // arbitrary distance — so it is kept and marked weak rather than
    // rejected. `blocForLabel` refuses weak rows at read time.
    let weak = false
    if (ev.relation === 'turn-grant') {
      if (segments[i + 1]?.speaker !== c.label) {
        reject(
          c.label,
          'relation-contradicted',
          `turn-grant, but ${ev.at}s is followed by ${segments[i + 1]?.speaker ?? 'nothing'}`,
        )
        continue
      }
    } else if (ev.relation === 'reply') {
      if (segments[i - 1]?.speaker !== c.label) {
        reject(
          c.label,
          'relation-contradicted',
          `reply, but ${ev.at}s follows ${segments[i - 1]?.speaker ?? 'nothing'}`,
        )
        continue
      }
    } else {
      weak = true
    }

    // ── Gate 2b · an answer of one or two words is not a turn of speech ──
    // The identified speaker's own line next to the evidence says at most
    // PALABRAS_RESPUESTA_BREVE words and the voice does not go on: it is a vote
    // read back, or a «Sí.» / «No, gràcies.». Re-validated per chunk over the
    // stored maps on 2026-11-24, every row this removed was a vote read back or
    // a label that says at most three words in its chunk.
    // Back-references are exempt: they are weak already and name at a distance.
    const propia = ev.relation === 'turn-grant' ? i + 1 : ev.relation === 'reply' ? i - 1 : -1
    const lineaPropia = propia >= 0 ? segments[propia] : undefined
    // «The voice goes on» — and how far to look depends on the answer.
    //   · After a VOTE, only if the same voice continues in the very next
    //     segment (an explanation of vote: «A favor.» → «Nosaltres votarem…»).
    //     Further out is the roll-call's own business: in 1qi8axv c07 the label
    //     that answered «A favor.» for Compromís resumes two segments later with
    //     «Gracias. Pasaríamos al punto seis…» — the chair, not the councillor.
    //   · After any other short answer, if the voice says more within
    //     SEGMENTOS_PARA_SEGUIR segments either side. A councillor's «Sí.» is
    //     often cut off by the chair's own «Sí.» before the turn resumes
    //     (k4olcs c09, 796 words), and a reply's own line may come right after
    //     it (10yl550 c20, «Albert.» → 228 words).
    // A merged label answering the NEXT vote («Abstenció.» again) is never
    // going on: only a line longer than a short answer counts.
    const paso = ev.relation === 'turn-grant' ? 1 : -1
    const voto = lineaPropia ? esRespuestaDeVoto(lineaPropia.text) : false
    const habla = (k: number) => {
      const s2 = segments[propia + k]
      return s2?.speaker === c.label && !esBreve(s2.text)
    }
    let sigue = false
    if (voto) sigue = habla(paso)
    else for (let k = 1; k <= SEGMENTOS_PARA_SEGUIR && !sigue; k++) sigue = habla(k) || habla(-k)
    if (lineaPropia && lineaPropia.speaker === c.label && !sigue && esBreve(lineaPropia.text)) {
      reject(
        c.label,
        voto ? 'roll-call' : 'short-answer',
        `${ev.relation} at ${ev.at}s «${ev.quote}» is answered only by «${lineaPropia.text}»` +
          (voto ? ' — a vote read back' : ''),
      )
      continue
    }

    // ── Gate 3 · party AND name must be IN the cited evidence ───────────
    // Asked for a field the model supplies one whether the audio carries it or
    // not. Both halves were caught on real output on 2026-08-10:
    //
    //   · party — it answered «Partido Popular» citing a line reading only
    //     «Es paraules. Abert, Pep?».
    //   · name  — it answered «Salva» citing «el regidor del Partit Popular»,
    //     a quote containing no name at all. That one RESOLVED, to a real
    //     councillor, on evidence that names nobody. Plausible and unfounded
    //     is the worst combination there is.
    //
    // Anything the quote does not carry is dropped here, and what remains has
    // to stand on its own.
    const inQuote: string[] = findPartiesInText(ev.quote)
    const claimedParty = c.party ? normalizeParty(c.party) : null
    const acredited = claimedParty && inQuote.includes(claimedParty) ? claimedParty : null
    const acreditedName = c.heardAs && nameAppearsIn(c.heardAs, ev.quote) ? c.heardAs : null

    // ── Gate 4 · resolve to exactly one councillor, party first ─────────
    // A one-seat bloc names its councillor outright, which is why the party
    // is the stronger signal and the name only corroborates: «Compromís,
    // Rafa» resolves even though "Rafa" is not a token of "Rafael Folgado
    // Navarro".
    let pool = officials.filter((o) => (acredited ? o.party === acredited : true))
    const resolvedByOneSeat = Boolean(acredited && oneSeat.has(acredited))
    if (!resolvedByOneSeat) {
      if (!acreditedName) {
        reject(
          c.label,
          'unresolvable',
          c.heardAs
            ? `heard "${c.heardAs}" but the cited quote does not contain it`
            : 'no name in the cited quote and the party is not single-seat',
        )
        continue
      }
      pool = pool.filter((o) => nameMatches(acreditedName, o.name))
    }

    if (pool.length === 0) {
      reject(
        c.label,
        'unresolvable',
        `heard "${acreditedName ?? '—'}"${acredited ? ` (${acredited})` : ''} matches nobody`,
      )
      continue
    }
    if (pool.length > 1) {
      // José matches five councillors and Rafael two. Naming the wrong one is
      // the harm this whole pipeline exists to avoid, so ambiguity fails closed.
      reject(
        c.label,
        'ambiguous',
        `heard "${c.heardAs ?? '—'}" fits ${pool.length}: ${pool.map((o) => o.name).join(', ')}`,
      )
      continue
    }

    const official = pool[0]

    // The roster's party vocabulary is WIDER than what may be published:
    // `PARTIES` in corporacion.ts carries `Otro`, which never meant "another
    // party" — it was the extractor's "cannot tell". In a 21-seat council a
    // published `Otro` identifies one councillor by elimination, which is
    // `DATA_INTEGRITY.md` rule 3 exactly. Removing `speakerGroup` from the LLM
    // schema moved that risk here, so the gate moves here with it.
    if (!(SPEAKER_GROUPS as readonly string[]).includes(official.party)) {
      reject(
        c.label,
        'bloc-not-publishable',
        `${official.name} sits under "${official.party}", which is not a publishable bloc`,
      )
      continue
    }

    rows.push({
      label: c.label,
      bloc: official.party,
      slug: official.slug,
      heardAs: c.heardAs,
      evidence: [ev],
      namesIndividual: oneSeat.has(official.party),
      weak,
    })
  }

  // ── Gate 5 · one label, one person ──────────────────────────────────────
  // Two labels resolving to the same councillor means at least one is wrong,
  // and nothing here can tell which. Both go.
  const bySlug = new Map<string, SpeakerMapRow[]>()
  for (const r of rows) {
    if (!r.slug) continue
    const list = bySlug.get(r.slug) ?? []
    list.push(r)
    bySlug.set(r.slug, list)
  }
  const collided = new Set<string>()
  for (const [slug, list] of bySlug) {
    if (list.length < 2) continue
    for (const r of list) {
      collided.add(r.label)
      reject(
        r.label,
        'label-collision',
        `${list.map((x) => x.label).join(' and ')} both resolve to ${slug}`,
      )
    }
  }

  return { rows: rows.filter((r) => !collided.has(r.label)), rejected }
}

/** Reason → count, for the run manifest. */
export function rejectionTally(rejected: readonly RejectedCandidate[]): Record<string, number> {
  const out: Record<string, number> = {}
  for (const r of rejected) out[r.reason] = (out[r.reason] ?? 0) + 1
  return out
}
