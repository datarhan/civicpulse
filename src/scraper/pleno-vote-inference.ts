/**
 * Inference engine: scan a pleno transcript and extract suggested vote tuples.
 *
 * This is *conservative by design*. Every record it emits carries
 * `requiresHumanApproval: true` and is written to a separate suggestions file
 * that the /plenos UI clearly labels "propuesta automática · requiere revisión".
 * The engine NEVER writes to pleno-votes.json — that file is curator-only.
 *
 * Why conservative: transcripts from Whisper on Spanish/Valencian audio have
 * ~5–10% WER on proper nouns + municipal jargon, and misattributing a vote to
 * a concejal is a libel risk. Precision > recall. We'd rather miss 40% of
 * votes than publish one wrong one.
 *
 * Detection strategy
 *   - Split the transcript on canonical pleno phrasings used by the secretaría.
 *     Spanish: "Se somete a votación…", "Se aprueba por X votos a favor…".
 *     Valencian: "Se somet a votació…", "S'aprova per X vots a favor…".
 *   - For each segment, extract: outcome (aprobado/rechazado/retirado/aplazado),
 *     and for each bloc a direction (a_favor/en_contra/abstencion).
 *   - Score confidence based on how many of the 21 council seats are accounted
 *     for and whether the outcome can be reconstructed from the tally.
 *   - Only emit segments where confidence ≥ 0.6. Everything below is dropped.
 *
 * Output is consumed by scripts/extract-pleno-votes.ts and surfaced under
 * public/data/pleno-votes-suggestions.json, mirroring the promise-suggestions
 * pattern that's already in production.
 */

import type { VoteBloc, VoteDirection, VoteOutcome } from './pleno-votes'

export interface InferredVote {
  /** Source pleno id from plenos.json. */
  plenoId: string
  /** ISO date (duplicated so the suggestions file is self-contained). */
  plenoDate: string
  /** Orden del día item number, if we can infer it from the context. */
  itemNumber: number | null
  /** Best-effort transcript excerpt used to extract the vote (≤400 chars). */
  excerpt: string
  /** Inferred outcome, when the transcript is explicit. */
  outcome: VoteOutcome | null
  /** Inferred per-bloc tuples. Only blocs explicitly mentioned are included. */
  votes: { bloc: VoteBloc; direction: VoteDirection; seats?: number }[]
  /** 0..1 — our confidence the extraction is correct. */
  confidence: number
  /** Always true; a marker for the UI + validator. */
  requiresHumanApproval: true
  /** Which engine produced this suggestion — rendered as a pill on the UI. */
  engine?: 'regex' | 'llm'
  /**
   * Optional: ISO date by which the approved motion is supposed to complete,
   * computed from a "con plazo de N meses/días" phrase near the vote. Always
   * paired with dueBySource (the verbatim clause that produced it). Both
   * fields are suggestions — the human curator still approves them, but no
   * longer has to type them. Missing when the transcript doesn't state a plazo.
   */
  dueBy?: string
  /** Verbatim clause from the transcript that fixes the plazo (≥20 chars). */
  dueBySource?: string
}

export interface InferenceResult {
  suggestions: InferredVote[]
  stats: {
    transcriptLength: number
    segmentsScanned: number
    suggestionsEmitted: number
    droppedLowConfidence: number
  }
}

const OUTCOME_PHRASES: [RegExp, VoteOutcome][] = [
  [/s['’]aprova\b|se aprueba\b|queda aprobad[oa]\b|queda aprovat\b/i, 'aprobado'],
  [/s['’]ha rebutjat\b|se rechaza\b|queda rechazad[oa]\b|queda rebutjat\b/i, 'rechazado'],
  [/se retira\b|es retira\b/i, 'retirado'],
  [/se aplaza\b|s['’]ajorna\b|queda aplazad[oa]\b/i, 'aplazado'],
]

/** Normalised bloc spellings we accept from the transcript. Extend carefully. */
const BLOC_ALIASES: Record<VoteBloc, RegExp> = {
  PSOE: /\bPSOE\b|socialista(?:s)?\b/i,
  PP: /\bPP\b|popular(?:es)?\b|partido popular\b|partit popular\b/i,
  VOX: /\bVOX\b/i,
  // Compromís has Valencian/Castilian spelling variants + common accent-less Whisper output.
  'Compromís': /\bcompromís\b|\bcompromis\b/i,
  Ciudadanos: /\bCiudadanos\b|\bC['’]s\b|\bciutadans\b/i,
  Otro: /\bNo adscrito\b|\bno adscrit\b|\bgrupo mixto\b|\bgrup mixt\b/i,
}

/**
 * Direction phrases — ordered by priority. Bare phrases are accepted (no "vot"
 * prefix required) because Spanish pleno narration uses both conjugations:
 *   "Votan a favor PSOE y Compromís"   ← verb-led
 *   "A favor PSOE, PP: 19 votos"       ← direction-led
 * "abstencion" also covers "se abstiene" / "s'absté".
 */
const DIRECTION_PHRASES: [RegExp, VoteDirection][] = [
  [/\ba\s+favor\b|\bvot(?:o|os|s|a|an|aron|en)\s+a\s+favor\b|\bvots?\s+favorables?\b/i, 'a_favor'],
  [/\ben\s+contra\b|\bvot(?:o|os|s|a|an|aron|en)\s+en\s+contra\b/i, 'en_contra'],
  [/\babstenci(?:ón|ó)n(?:es)?\b|\babstenci(?:ó|o)(?:ns)?\b|\bs['’]abst(?:é|e)n\b|\bse\s+abstien(?:e|en)\b/i, 'abstencion'],
]

/**
 * Split the transcript into voting segments. Each segment captures ~300 chars
 * BEFORE the "se somete a votación" marker (so the "Punto N" header that
 * precedes the vote is inside the segment) plus up to 900 chars after. This
 * lets inferItemNumber() see the header without losing any vote detail.
 */
export function splitSegments(transcript: string): string[] {
  // Boundary matches BOTH formal secretaría phrasings AND colloquial ones that
  // Whisper produces from natural speech. "Votemos"/"Vamos a votar" are as
  // common as the formal "Se somete a votación" in small-town municipal
  // recordings.
  const boundary = /(?:s['’]assotmet a votaci[óo]|se somete a votaci[óo]n|pasamos a la votaci[óo]n|passem a la votaci[óo]|\bvamos a votar\b|\bvotaremos\b|\bvotemos\b|\bpassem al punt\b|\bpasamos al punto\b|\bvamos a votar a (?:la )?mano\b)/gi
  const segments: string[] = []
  let match: RegExpExecArray | null
  while ((match = boundary.exec(transcript)) !== null) {
    const start = Math.max(0, match.index - 300)
    const end = Math.min(transcript.length, match.index + 900)
    segments.push(transcript.slice(start, end))
  }
  return segments
}

/** Extract an integer vote count that appears near a direction phrase. */
function countNear(segment: string, directionRx: RegExp): number | null {
  // Look for "\d+ vot[os] a favor" etc.
  const rx = new RegExp(
    `(\\d{1,2})\\s+(?:vot(?:os|s|o)?\\s+)?${directionRx.source}`,
    'i',
  )
  const m = segment.match(rx)
  if (!m) return null
  const n = Number(m[1])
  if (!Number.isInteger(n) || n < 0 || n > 21) return null
  return n
}

function inferOutcome(segment: string): VoteOutcome | null {
  for (const [rx, outcome] of OUTCOME_PHRASES) {
    if (rx.test(segment)) return outcome
  }
  return null
}

/**
 * Anchor-on-direction extraction.
 *
 * For each direction phrase occurrence (e.g. "a favor" at pos X), scan ±60
 * chars for bloc mentions. Every (bloc, direction) tuple is emitted at most
 * once per segment — later occurrences are ignored so "PSOE" mentioned twice
 * in a summary doesn't double up.
 *
 * Directional proximity is preferred over listing order: if "a favor" is 15
 * chars from PSOE and "en contra" is 60 chars from PSOE, PSOE gets a_favor.
 */
function inferBlocDirections(
  segment: string,
): { bloc: VoteBloc; direction: VoteDirection }[] {
  const out: { bloc: VoteBloc; direction: VoteDirection }[] = []
  const seen = new Set<VoteBloc>()

  // Collect every (position, direction) pair so we can measure proximity.
  interface DirHit { pos: number; direction: VoteDirection }
  const dirHits: DirHit[] = []
  for (const [rx, direction] of DIRECTION_PHRASES) {
    const g = new RegExp(rx.source, rx.flags.includes('g') ? rx.flags : rx.flags + 'g')
    let m: RegExpExecArray | null
    while ((m = g.exec(segment)) !== null) {
      dirHits.push({ pos: m.index, direction })
      if (m.index === g.lastIndex) g.lastIndex += 1  // avoid infinite loop on zero-width
    }
  }
  if (dirHits.length === 0) return out

  // For each bloc mention in the segment, attach the closest direction hit
  // within 80 chars. Only the first (bloc, direction) wins.
  for (const [bloc, blocRx] of Object.entries(BLOC_ALIASES) as [VoteBloc, RegExp][]) {
    const g = new RegExp(blocRx.source, blocRx.flags.includes('g') ? blocRx.flags : blocRx.flags + 'g')
    let blocMatch: RegExpExecArray | null
    while ((blocMatch = g.exec(segment)) !== null) {
      if (seen.has(bloc)) break
      const blocPos = blocMatch.index
      // Closest direction within 80 chars.
      let best: DirHit | null = null
      let bestDist = Infinity
      for (const dh of dirHits) {
        const dist = Math.abs(dh.pos - blocPos)
        if (dist <= 80 && dist < bestDist) {
          best = dh
          bestDist = dist
        }
      }
      if (best) {
        out.push({ bloc, direction: best.direction })
        seen.add(bloc)
      }
      if (blocMatch.index === g.lastIndex) g.lastIndex += 1
    }
  }

  return out
}

function scoreConfidence(segment: string, inferredVotes: InferredVote['votes'], outcome: VoteOutcome | null): number {
  let score = 0

  // Outcome phrase present → +0.3
  if (outcome) score += 0.3

  // Number of blocs extracted (0→0, 1→0.15, 2→0.25, 3→0.35, 4+→0.4)
  score += Math.min(0.4, inferredVotes.length * 0.1)

  // Numerical tally present (X votos a favor, Y en contra) → +0.2
  const favor = countNear(segment, DIRECTION_PHRASES[0][0])
  const contra = countNear(segment, DIRECTION_PHRASES[1][0])
  const abst = countNear(segment, DIRECTION_PHRASES[2][0])
  const tallied = [favor, contra, abst].filter((x) => x !== null).length
  if (tallied >= 2) score += 0.2

  // Tally sums to 21 (full council) → +0.15 bonus
  if (favor !== null && contra !== null && abst !== null) {
    if (favor + contra + abst === 21) score += 0.15
  }

  return Math.min(1, score)
}

/** Tiny itemNumber hint, e.g. "Punto 3.- Aprobación inicial…". Often missing from transcripts. */
function inferItemNumber(segment: string): number | null {
  const m = segment.match(/\bpunt(?:o|)\s*(?:n[úu]m(?:ero)?)?[.:\s]+(\d{1,2})\b/i)
  if (!m) return null
  const n = Number(m[1])
  return n > 0 && n < 50 ? n : null
}

// ─── Plazo / dueBy extraction ────────────────────────────────────────────────
// Conservative: only surface a dueBy when the transcript carries a verbatim
// plazo clause, and always attach the verbatim source so the ≥20-char
// dueBySource invariant in pleno-votes.ts validator passes on promotion.
//
// Shapes we match:
//   "con plazo de ejecución de 6 meses"         (→ plenoDate + 6 months)
//   "en el plazo máximo de 90 días"             (→ plenoDate + 90 days)
//   "antes del 31 de diciembre de 2026"         (→ 2026-12-31)
//   "no más tarde del 1 de junio de 2026"       (→ 2026-06-01)
// Valencian equivalents ("termini", "abans del") also covered.

const SPANISH_MONTHS: Record<string, number> = {
  enero: 1, gener: 1,
  febrero: 2, febrer: 2,
  marzo: 3, març: 3,
  abril: 4,
  mayo: 5, maig: 5,
  junio: 6, juny: 6,
  julio: 7, juliol: 7,
  agosto: 8, agost: 8,
  septiembre: 9, setembre: 9, setiembre: 9,
  octubre: 10,
  noviembre: 11, novembre: 11,
  diciembre: 12, desembre: 12,
}

/** Add N months to an ISO YYYY-MM-DD string (calendar-safe). */
function addMonths(iso: string, months: number): string {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  const base = new Date(Date.UTC(y, m - 1, d))
  base.setUTCMonth(base.getUTCMonth() + months)
  return base.toISOString().slice(0, 10)
}

function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  const base = new Date(Date.UTC(y, m - 1, d))
  base.setUTCDate(base.getUTCDate() + days)
  return base.toISOString().slice(0, 10)
}

/**
 * Scan a vote segment for a plazo phrase. Returns both the computed
 * ISO dueBy and the verbatim source clause, or null when nothing matches.
 * The returned source is padded to ≥20 chars by including surrounding
 * context — the pleno-votes.ts validator enforces that floor.
 */
export function inferPlazoFromSegment(
  segment: string,
  plenoDate: string,
): { dueBy: string; dueBySource: string } | null {
  // 1. Relative offset: "plazo ... de N días|meses|años"
  const relRx =
    /((?:con\s+)?(?:un\s+)?plazo[^.]*?(?:de\s+ejecuci[oó]n\s+)?de\s+(\d{1,3})\s+(d[ií]as|meses|mes|a[ñn]os|a[ñn]o)[^.]{0,40})/i
  const relCa =
    /((?:amb\s+)?(?:un\s+)?termini[^.]*?(?:d['’]execuci[oó]\s+)?de\s+(\d{1,3})\s+(dies|mesos|mes|anys|any)[^.]{0,40})/i
  const rel = segment.match(relRx) || segment.match(relCa)
  if (rel) {
    const n = Number(rel[2])
    const unit = rel[3].toLowerCase()
    if (!Number.isInteger(n) || n <= 0 || n > 365 * 5) return null
    let dueBy: string
    if (unit.startsWith('d')) dueBy = addDays(plenoDate, n)
    else if (unit.startsWith('me') || unit === 'mesos' || unit === 'mes')
      dueBy = addMonths(plenoDate, n)
    else dueBy = addMonths(plenoDate, n * 12)
    return { dueBy, dueBySource: padSource(rel[1], segment, rel.index ?? 0) }
  }

  // 2. Absolute date: "antes del 31 de diciembre de 2026"
  const absRx =
    /((?:antes\s+del|no\s+m[aá]s\s+tarde\s+del|a\s+m[aá]s\s+tardar\s+el)\s+(\d{1,2})\s+de\s+([a-zá-úñ]+)\s+de\s+(\d{4}))/i
  const absCa =
    /((?:abans\s+del|no\s+m[eé]s\s+tard\s+del|a\s+tot\s+estirar\s+el)\s+(\d{1,2})\s+d[e']\s*([a-zà-úñç]+)\s+de\s+(\d{4}))/i
  const abs = segment.match(absRx) || segment.match(absCa)
  if (abs) {
    const day = Number(abs[2])
    const monthRaw = stripDiacriticsLocal(abs[3].toLowerCase())
    const year = Number(abs[4])
    const month = SPANISH_MONTHS[monthRaw]
    if (!month || !Number.isInteger(day) || day < 1 || day > 31 || year < 2020 || year > 2100) {
      return null
    }
    const dueBy = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    return { dueBy, dueBySource: padSource(abs[1], segment, abs.index ?? 0) }
  }

  return null
}

// Local copy — pleno-vote-inference.ts is loaded by pure-function tests and
// we don't want it to drag the normalize module into contexts that don't need
// it. (Same shape as src/scraper/normalize.ts#stripDiacritics.)
function stripDiacriticsLocal(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '')
}

/**
 * Ensure the source clause is ≥20 chars by extending with surrounding
 * context from the segment. Trims whitespace but preserves the verbatim
 * substring so the curator can verify it matches the acta.
 */
function padSource(match: string, segment: string, matchIndex: number): string {
  const trimmed = match.trim()
  if (trimmed.length >= 20) return trimmed
  // Expand ±40 chars, trim at word boundaries, keep verbatim subsequence.
  const start = Math.max(0, matchIndex - 20)
  const end = Math.min(segment.length, matchIndex + match.length + 20)
  return segment.slice(start, end).trim().replace(/\s+/g, ' ')
}

export interface InferOptions {
  plenoId: string
  plenoDate: string
  minConfidence?: number  // default 0.6
}

export function inferVotesFromTranscript(
  transcript: string,
  opts: InferOptions,
): InferenceResult {
  const minConfidence = opts.minConfidence ?? 0.6
  const segments = splitSegments(transcript)
  const suggestions: InferredVote[] = []
  let dropped = 0

  for (const segment of segments) {
    const votes = inferBlocDirections(segment)
    if (votes.length === 0) continue   // no bloc → nothing actionable
    const outcome = inferOutcome(segment)
    const confidence = scoreConfidence(segment, votes, outcome)
    if (confidence < minConfidence) { dropped += 1; continue }

    const plazo = inferPlazoFromSegment(segment, opts.plenoDate)
    suggestions.push({
      plenoId: opts.plenoId,
      plenoDate: opts.plenoDate,
      itemNumber: inferItemNumber(segment),
      excerpt: segment.trim().slice(0, 400),
      outcome,
      votes,
      confidence: Math.round(confidence * 100) / 100,
      requiresHumanApproval: true,
      ...(plazo ? { dueBy: plazo.dueBy, dueBySource: plazo.dueBySource } : {}),
    })
  }

  return {
    suggestions,
    stats: {
      transcriptLength: transcript.length,
      segmentsScanned: segments.length,
      suggestionsEmitted: suggestions.length,
      droppedLowConfidence: dropped,
    },
  }
}
