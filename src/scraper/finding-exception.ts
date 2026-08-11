/**
 * «¿Merece este hallazgo la excepción?» — the queue behind
 * `triage:finding-exception`.
 *
 * `claim-public-gate.ts` withholds a machine-extracted claim from `/plenos`
 * when it is an ungrounded public accusation, or a `contradicho` no human
 * signed. Its header states the one way past: «promotion into a finding is the
 * sanctioned way PAST this gate precisely because a person is standing in it. A
 * machine that promotes a gated claim has not satisfied the exception, it has
 * walked around the gate.»
 *
 * Measured on the published snapshots: 39 of the 52 findings on `/hallazgos`
 * have not one quote the gate would show, 11 are made entirely of quotes it
 * would hide, and the name at the bottom of most of them is `auto-curation-v1`.
 * The exception was taken, and nobody was standing in the gate.
 *
 * ── What this file is, and what it refuses to be ────────────────────────────
 *
 * It is a reading aid. It puts, on one screen and for one finding: the prose we
 * published, every quote in it with the gate's verdict and the verifier's
 * verdict side by side, whether ANY grounded quote survives, and who signed it.
 * That is the whole question — a finding whose every citation is an unbacked
 * accusation is a different object from one that has three grounded quotes and
 * one that is not.
 *
 * It does not score, rank by strength, recommend, or preselect. `decision` is
 * `null` on every row and there is no branch that fills it, for the same reason
 * `quote-reanchor` has none: deciding that a published finding about a named
 * political group should come down, or stay up, is the editorial act the gate
 * reserved for a person in the first place. A queue that arrived with an answer
 * would be the machine taking the exception a second time.
 *
 * Nor does it write. `public/data/pleno-findings.json` has exactly one writer,
 * `npm run correct-pleno-finding`, which demands a reason and leaves the change
 * in the finding's public correction log. The rows carry the commands; a person
 * runs them.
 *
 * Sorting is by pleno date, newest first — a calendar, not a judgement. Any
 * order that ranked «worst first» would be the recommendation this refuses to
 * make.
 */
import type { ClaimVisibility } from './claim-public-gate'

export const EXCEPTION_QUEUE_VERSION = 'finding-exception-v1'
export const CORRECTION_CLI = 'npm run correct-pleno-finding'
export const RETRACTION_CLI = 'npm run retract-finding'

/** One published quote, with both verdicts a curator needs to see at once. */
export interface ExceptionQuote {
  index: number
  /** The verbatim as published. Byte for byte. */
  text: string
  speakerGroup: string | null
  claimId: string | null
  /** What the editorial gate would do with the claim, in the gate's own words. */
  gate: ClaimVisibility | null
  /** The verifier's verdict the gate read. `null` when the claim is missing. */
  verdict: string | null
  claimType: string | null
  accusationSubtype: string | null
  /** The transcript axis of the same quote, so both marks are on one screen. */
  transcriptStatus: string | null
  /**
   * The command that would retract THIS quote. Composed, never run — and the
   * CLI renumbers, so a curator removing several from one finding issues them
   * highest index first. Said here because the screen is where it is needed.
   */
  removeCommand: string
}

export interface ExceptionRow {
  findingId: string
  plenoId: string
  plenoDate: string
  title: string
  severity: string
  /** The published prose. The claim being judged is this, not the quotes. */
  summary: string
  /** `auto-curation-v1` here IS the finding; the field is the reason to look. */
  curatorName: string
  publishedAt: string
  quotes: ExceptionQuote[]
  /** How many quotes the gate would publish on /plenos. Zero ⇒ queued. */
  citasMostrables: number
  /** True when EVERY quote is one the gate withholds — the hardest cases. */
  ningunaCitaContrastada: boolean
  /** Has a group already replied? A reply is context, never a verdict. */
  conReplica: boolean
  /**
   * Always `null`. No branch fills it, and that is the guarantee of the screen:
   * the queue presents, it does not decide.
   */
  decision: null
  /**
   * The exact commands a person would run. Composed, never executed.
   *
   * `retirarHallazgo` appears ONLY on a row the gate has hollowed out — every
   * quote withheld — because that is the one case where correcting the prose
   * cannot work: there is nothing publishable left for a rewritten summary to
   * rest on, and `applyFindingRedaction` refuses to redact to a stub for
   * exactly that reason. Offering both is not deciding between them; the row
   * still arrives undecided, as every row does, and a person still picks.
   *
   * (It said «no such CLI exists» here until 2026-08-11, and that was true:
   * eleven hollow findings stayed published because the only sanctioned
   * remedy was one that could not apply to them.)
   */
  commands: { corregirSumario: string; retirarHallazgo?: string }
}

export interface ExceptionQueue {
  _comment: string
  generatedAt: string
  queueVersion: string
  sourceSnapshot: {
    findings: string
    findingsGeneratedAt: string
    provenance: string
    provenanceGeneratedAt: string
  }
  stats: {
    /** Published findings examined — the denominator. */
    hallazgos: number
    /** Findings with at least one quote. Nothing else can be judged. */
    hallazgosConCitas: number
    encolados: number
    /** Of the queued, those with no grounded quote at all. */
    sinNingunaCitaContrastada: number
    citasEnCola: number
    /** Queued quotes by gate verdict — `shown` is 0 by construction. */
    porContraste: Record<string, number>
    /** Who signed the queued findings. The point of the whole queue. */
    porCurador: Record<string, number>
  }
  rows: ExceptionRow[]
}

export interface ExceptionFinding {
  id: string
  plenoId: string
  plenoDate: string
  title: string
  severity: string
  summary: string
  curatorName: string
  publishedAt?: string
  response?: unknown
  quotes?: Array<{ text?: string; speakerGroup?: string | null; sourceClaimId?: string | null }>
}

/** Just enough of a verifier item to show a curator what the gate read. */
export interface ExceptionClaimFacts {
  verdict: string | null
  claimType: string | null
  accusationSubtype: string | null
}

/**
 * Build the queue. Pure: `gates`, `facts` and `transcript` are already-derived
 * lookups, so this is unit-testable without a filesystem and the CLI owns all
 * the I/O.
 *
 * `gates` comes from the published provenance snapshot rather than being
 * recomputed here, so the queue and the marks on `/hallazgos` cannot disagree
 * about which quotes are affected — the same rule `quote-reanchor` follows.
 */
/**
 * Una ficha hecha POR ENTERO de citas que la puerta retiene.
 *
 * Exportada, no reescrita en el test: el 2026-08-11 esta clase se vació —se
 * retiraron las once que había— y una prueba que restate el predicado se
 * quedaría verde midiendo su propia copia. La regla 1 de
 * docs/DATA_INTEGRITY.md, que costó €53,5M la última vez.
 */
export const marcaNingunaContrastada = (quotes: Array<{ gate: string }>): boolean =>
  quotes.length > 0 && quotes.every((q) => q.gate === 'hidden')

export function buildExceptionQueue(
  findings: ExceptionFinding[],
  lookups: {
    /** findingId → per-quote gate verdicts, indexed by quote position. */
    gates: Record<string, Array<{ gate?: ClaimVisibility | null; status?: string } | null>>
    /** claimId → what the verifier said. Absent ⇒ nulls, never a guess. */
    facts: ReadonlyMap<string, ExceptionClaimFacts>
  },
  opts: {
    generatedAt: string
    findingsGeneratedAt: string
    provenanceGeneratedAt: string
  },
): ExceptionQueue {
  const rows: ExceptionRow[] = []
  const porContraste: Record<string, number> = {}
  const porCurador: Record<string, number> = {}
  let hallazgosConCitas = 0

  for (const f of findings) {
    const published = f.quotes ?? []
    if (published.length === 0) continue
    hallazgosConCitas += 1
    const gateRows = lookups.gates[f.id] ?? []
    const quotes: ExceptionQuote[] = published.map((q, i) => {
      const claimId = q?.sourceClaimId ?? null
      const fact = claimId != null ? lookups.facts.get(claimId) : undefined
      return {
        index: i,
        text: q?.text ?? '',
        speakerGroup: q?.speakerGroup ?? null,
        claimId,
        gate: gateRows[i]?.gate ?? null,
        verdict: fact?.verdict ?? null,
        claimType: fact?.claimType ?? null,
        accusationSubtype: fact?.accusationSubtype ?? null,
        transcriptStatus: gateRows[i]?.status ?? null,
        removeCommand:
          `${CORRECTION_CLI} -- ${f.id} --remove quote.${i} ` +
          '--reason "<por qué, ≥20 caracteres>" --editor "<tu nombre>"',
      }
    })
    const citasMostrables = quotes.filter((q) => q.gate === 'shown').length
    // The queue's own question, and the only filter: a finding earns the gate's
    // exception on the strength of what it cites. One grounded quote is enough
    // to make the promotion ordinary; none is what nobody looked at.
    if (citasMostrables > 0) continue

    for (const q of quotes) {
      const key = q.gate ?? 'sin-clasificar'
      porContraste[key] = (porContraste[key] ?? 0) + 1
    }
    porCurador[f.curatorName] = (porCurador[f.curatorName] ?? 0) + 1
    rows.push({
      findingId: f.id,
      plenoId: f.plenoId,
      plenoDate: f.plenoDate,
      title: f.title,
      severity: f.severity,
      summary: f.summary,
      curatorName: f.curatorName,
      publishedAt: f.publishedAt ?? '',
      quotes,
      citasMostrables,
      ningunaCitaContrastada: marcaNingunaContrastada(quotes),
      conReplica: f.response != null,
      decision: null,
      commands: {
        corregirSumario:
          `${CORRECTION_CLI} -- ${f.id} --field summary ` +
          '--new "<el sumario corregido>" --reason "<por qué, ≥20 caracteres>" --editor "<tu nombre>"',
        ...(marcaNingunaContrastada(quotes)
          ? {
              retirarHallazgo:
                `${RETRACTION_CLI} -- ${f.id} ` +
                '--reason "<el criterio, nunca el material — se publica>" --editor "<tu nombre>"',
            }
          : {}),
      },
    })
  }

  // Newest pleno first, then a stable id order. A calendar, not a ranking.
  rows.sort((a, b) => {
    if (a.plenoDate !== b.plenoDate) return a.plenoDate < b.plenoDate ? 1 : -1
    return a.findingId < b.findingId ? -1 : 1
  })

  return {
    _comment:
      'COLA DE EXCEPCIÓN — no publicada, y no debe publicarse. Vive en editorial/ (gitignored) ' +
      'porque todo lo que hay bajo public/ es fetchable por URL esté enlazado o no. La pregunta ' +
      'de cada fila es la de la propia puerta editorial: ¿merece este hallazgo la excepción que ' +
      'la puerta reserva a una persona? PRESENTA la evidencia; no puntúa, no recomienda y no ' +
      'elige (`decision` es siempre null). Decide una persona, y el único escritor de ' +
      `public/data/pleno-findings.json sigue siendo \`${CORRECTION_CLI}\`.`,
    generatedAt: opts.generatedAt,
    queueVersion: EXCEPTION_QUEUE_VERSION,
    sourceSnapshot: {
      findings: 'public/data/pleno-findings.json',
      findingsGeneratedAt: opts.findingsGeneratedAt,
      provenance: 'public/data/finding-quote-provenance.json',
      provenanceGeneratedAt: opts.provenanceGeneratedAt,
    },
    stats: {
      hallazgos: findings.length,
      hallazgosConCitas,
      encolados: rows.length,
      sinNingunaCitaContrastada: rows.filter((r) => r.ningunaCitaContrastada).length,
      citasEnCola: rows.reduce((n, r) => n + r.quotes.length, 0),
      porContraste,
      porCurador,
    },
    rows,
  }
}
