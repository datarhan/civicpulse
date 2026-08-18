/**
 * Which transcript does a published verbatim actually come from?
 *
 * Every `/hallazgos` finding puts words inside guillemets and attributes them
 * to a named political group. Those words were lifted from whichever transcript
 * was published the day the finding was written. Eighteen sessions have since
 * been re-transcribed with a better engine, and the current files are 121–191 %
 * the size of the ones they replaced for most of them — so when a quote no
 * longer appears in the current text, that absence is not a coverage gap. It is
 * the earlier engine's wording, published as speech.
 *
 * Spot-checked on `10yl550`: `satombat` appears once in the superseded file and
 * never in the current one; `Rivarroch` (a mangling of *Riba-roja*) 18 times
 * versus 4. Meanwhile «Feria de Comercio» appears five times in each. The
 * substance was debated; the wording is degraded ASR.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS IS DERIVED AND NOT CURATED
 *
 * The status is a fact about two files on disk, provable by reading them. It is
 * deliberately NOT written into `pleno-findings.json`: that would need 45
 * curated corrections for something no human judged, and
 * `validateFindingsSnapshot` rebuilds published rows from an allow-list anyway.
 * `compute:finding-quote-provenance` derives a ~17 KB snapshot the SPA can read
 * beside a finding, instead of shipping 300 KB transcripts to the browser.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THREE STATES, AND WHY «CANNOT TELL» IS ONE OF THEM
 *
 * Four sessions buck the size trend — `19xkzxw` at 78 % of its predecessor,
 * `1pe3qs8` 88 %, `1sqj7is` 92 %, `rx4hb4` 97 %. For those, a missing quote
 * might be degraded wording OR a stretch the new pass simply did not cover, and
 * nothing on disk says which. Folding them into «only in the superseded one»
 * would publish a claim about the earlier engine that the bytes do not support;
 * folding them into «found» would publish the opposite. `docs/DATA_INTEGRITY.md`
 * rule 3 — a sentinel is never a value — so «cannot tell» is its own state and
 * is counted on its own.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * AND A FOURTH OUTCOME THAT IS NOT A STATE
 *
 * A quote in NEITHER transcript is a different editorial problem: possible
 * fabrication, not degraded wording. It gets no provenance label at all —
 * `buildQuoteProvenance` returns it under `unresolved` and the compute script
 * refuses to write. `check:finding-quotes` is the gate that already exits 1 on
 * it, and it currently reports zero.
 *
 * The matcher is `quote-match.ts`, the same 8-word sliding window
 * `check:finding-quotes`, `check:citations` and `repoint-source-url` use. There
 * is one matcher AND one classifier: `check:finding-quotes` and the compute
 * script both call `classifyQuoteProvenance`, so the gate and the published
 * snapshot cannot disagree about what a quote's status is.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * A SECOND AXIS, IN THE SAME SNAPSHOT
 *
 * «¿Salieron estas palabras del mejor texto que tenemos?» and «¿respalda algún
 * dato municipal lo que dicen?» are different questions, and a quote can fail
 * both. The second one is `quote-contrast.ts`, which asks the editorial gate
 * (`claim-public-gate.ts`) what it would do with the claim behind each
 * verbatim — 75 of the 177 are accusations that gate withholds from `/plenos`.
 *
 * They live in ONE file and one row because they describe the same quote and
 * the reader meets them in the same blockquote: a parallel snapshot would need
 * a parallel hook, a parallel chip and a parallel drift gate, and the two would
 * eventually disagree about which quotes exist. This module owns the transcript
 * axis and the row assembly; `quote-contrast.ts` owns the gate axis. Neither
 * restates the other's decision tree.
 */
import type { ClaimVisibility } from './claim-public-gate'
import { quoteAppearsIn, quoteCoverage } from './quote-match'
import {
  buildQuoteContrast,
  contrastSanityFailure,
  QUOTE_CONTRAST_STATES,
  type QuoteContrastStats,
  type VerifierCorpus,
} from './quote-contrast'

/**
 * The three publishable states. Exported as the single definition — nothing
 * downstream restates this list, because six tests in this repo hand-copied a
 * shape and stayed green while production matched nothing
 * (`docs/DATA_INTEGRITY.md` rule 1). The reader-facing wording lives in the
 * component; `meaning` here is the technical definition a machine reading the
 * JSON needs.
 */
export const QUOTE_PROVENANCE_STATUSES = [
  {
    id: 'en-vigente',
    meaning:
      'La cita aparece en la transcripción vigente de su sesión: está cotejada contra el mejor texto disponible.',
    /** Does the reader need to be warned? */
    marks: false,
  },
  {
    id: 'solo-en-sustituida',
    meaning:
      'La cita aparece en la transcripción anterior de su sesión y no en la vigente, y la vigente NO es más corta — así que la ausencia se atribuye al cambio de motor, no a falta de cobertura.',
    marks: true,
  },
  {
    id: 'sin-determinar',
    meaning:
      'La cita no aparece en la transcripción vigente y no se puede decir por qué: o no hay transcripción vigente, o la vigente es más corta que la que sustituyó.',
    marks: true,
  },
] as const

export type QuoteProvenanceStatus = (typeof QUOTE_PROVENANCE_STATUSES)[number]['id']

export const QUOTE_PROVENANCE_STATUS_IDS: readonly QuoteProvenanceStatus[] =
  QUOTE_PROVENANCE_STATUSES.map((s) => s.id)

/** The states that put a marker in front of a reader. Derived, never retyped. */
export const MARKED_STATUS_IDS: readonly QuoteProvenanceStatus[] = QUOTE_PROVENANCE_STATUSES.filter(
  (s) => s.marks,
).map((s) => s.id)

/**
 * Why a quote is undetermined. Naming the reason is what keeps a new cause
 * from hiding inside a growing «cannot tell» count: the two are counted
 * separately in `stats`.
 */
export const UNDETERMINED_REASONS = [
  {
    id: 'transcripcion-actual-mas-corta',
    meaning:
      'La transcripción vigente pesa menos que la que sustituyó, así que la ausencia puede ser un tramo no cubierto y no una reescritura.',
  },
  {
    id: 'sin-transcripcion-vigente',
    meaning:
      'No hay fichero de transcripción vigente para esa sesión: no hay nada contra lo que cotejar.',
  },
] as const

export type UndeterminedReason = (typeof UNDETERMINED_REASONS)[number]['id']

export const UNDETERMINED_REASON_IDS: readonly UndeterminedReason[] = UNDETERMINED_REASONS.map(
  (r) => r.id,
)

/** The two texts of one session, plus their sizes. No disk access in here. */
export interface SessionTexts {
  /** The transcript published today, or null when the file is absent. */
  current: string | null
  /** The transcript this session had before it was re-transcribed, if any. */
  superseded: string | null
  /** Bytes on disk. Only the comparison matters, never the absolute figure. */
  currentBytes: number
  supersededBytes: number
}

/**
 * The outcome of classifying one quote. `clasificada` carries one of the three
 * publishable states; `no-localizada` is deliberately NOT a state — see the
 * header.
 */
export type QuoteProvenanceOutcome =
  | {
      kind: 'clasificada'
      status: QuoteProvenanceStatus
      reason: UndeterminedReason | null
    }
  | {
      kind: 'no-localizada'
      /** Longest contiguous run of the quote present anywhere, 0–1. */
      coverage: number
    }

/**
 * Is this session's absence-of-a-quote interpretable?
 *
 * The size comparison is the whole discriminator and it is deliberately crude:
 * bytes, not words, not a diff. A finer measure would be a judgement about
 * transcript quality, and this module is not entitled to make one — it only has
 * to tell «the new pass says more» from «the new pass says less».
 */
export function sessionIsComparable(s: SessionTexts): boolean {
  if (s.current === null) return false
  if (s.superseded === null) return true
  return s.currentBytes >= s.supersededBytes
}

/**
 * The single classifier. `check:finding-quotes` and
 * `compute:finding-quote-provenance` both call this; neither has its own copy
 * of the decision tree.
 */
export function classifyQuoteProvenance(quote: string, s: SessionTexts): QuoteProvenanceOutcome {
  const text = quote.trim()
  if (text === '') {
    // Nothing to trace. Not a state either: a blank verbatim is a schema
    // problem, and labelling it would publish a provenance for no words.
    return { kind: 'no-localizada', coverage: 0 }
  }
  if (s.current === null) {
    return { kind: 'clasificada', status: 'sin-determinar', reason: 'sin-transcripcion-vigente' }
  }
  if (quoteAppearsIn(text, s.current)) {
    return { kind: 'clasificada', status: 'en-vigente', reason: null }
  }
  if (s.superseded === null || !quoteAppearsIn(text, s.superseded)) {
    const cov = Math.max(
      quoteCoverage(text, s.current),
      s.superseded ? quoteCoverage(text, s.superseded) : 0,
    )
    return { kind: 'no-localizada', coverage: cov }
  }
  return sessionIsComparable(s)
    ? { kind: 'clasificada', status: 'solo-en-sustituida', reason: null }
    : {
        kind: 'clasificada',
        status: 'sin-determinar',
        reason: 'transcripcion-actual-mas-corta',
      }
}

// ─── The published snapshot ─────────────────────────────────────────────────

/** v2 adds the `gate` axis to every row — see the header's second section. */
export const PROVENANCE_VERSION = 'finding-quote-provenance-v2'

/** One published quote's row. `reason` is omitted unless there is one. */
export interface QuoteProvenanceEntry {
  status: QuoteProvenanceStatus
  reason?: UndeterminedReason
  /**
   * What `claim-public-gate.ts` would do with the claim behind this quote,
   * in the gate's own vocabulary. `null` only when the quote's `sourceClaimId`
   * is missing from the verifier corpus, which `contrastSanityFailure` refuses
   * to write — so a published file never carries one, and `check:relations`
   * reds if one appears.
   */
  gate: ClaimVisibility | null
}

export interface ProvenanceSessionRow {
  /** Is there a superseded file, i.e. was this session transcribed twice? */
  retranscrita: boolean
  bytesVigente: number
  bytesSustituida: number
  /** false ⇒ an absent quote here is «cannot tell», never «only in the old one». */
  comparable: boolean
}

/** A quote that fits none of the three states. Never published as a status. */
export interface UnresolvedQuote {
  findingId: string
  plenoId: string
  quoteIndex: number
  /** Truncated: this file is published, and the quote already is too. */
  quote: string
  coverage: number
}

export interface QuoteProvenanceSnapshot {
  _comment: string
  version: string
  generatedAt: string
  source: {
    findings: string
    findingsGeneratedAt: string
    transcripts: string
    superseded: string
  }
  statuses: typeof QUOTE_PROVENANCE_STATUSES
  undeterminedReasons: typeof UNDETERMINED_REASONS
  /**
   * The gate axis. A sibling block rather than more keys in `stats` because
   * `stats` is a flat bag of scalars that `diffProvenance` walks key by key,
   * and `porContraste` is a map — folding it in would compare two objects by
   * identity and silently never differ.
   */
  contraste: {
    /**
     * De dónde salen estas marcas. `ledger` es el fichero que las decide —el
     * monolito publicado, que sólo escribe `rebuildVerified()`—; `base` y
     * `overlay` son el contraste informativo, y desde agosto de 2026 pueden no
     * haberse leído (la base es gitignorada). Este campo es la respuesta a
     * «¿de dónde vino esta marca?» de quien audita: decía el fichero
     * equivocado desde que la verdad pasó al monolito, que es exactamente la
     * clase de prosa rancia contra la que este repositorio ya tiene un hook.
     */
    source: { ledger: string; base: string; overlay: string }
    states: typeof QUOTE_CONTRAST_STATES
    stats: QuoteContrastStats
  }
  stats: {
    findings: number
    /** Every quote slot in the snapshot — the denominator nothing may drop. */
    quotes: number
    enVigente: number
    soloEnSustituida: number
    sinDeterminar: number
    /** Split of `sinDeterminar` by cause, so a new cause cannot hide in it. */
    sinDeterminarPorTranscripcionMasCorta: number
    sinDeterminarPorFaltaDeTranscripcion: number
    findingsConCitaMarcada: number
    sesionesConCitas: number
    sesionesRetranscritas: number
    sesionesNoComparables: number
    /** Quotes in neither transcript. Non-zero ⇒ the compute script refuses. */
    sinClasificar: number
    /** Bytes of transcript actually read. Zero ⇒ the matcher measured nothing. */
    bytesLeidos: number
  }
  sessions: Record<string, ProvenanceSessionRow>
  /** findingId → one entry per quote, in the finding's own quote order. */
  quotes: Record<string, QuoteProvenanceEntry[]>
  unresolved: UnresolvedQuote[]
}

/** The finding shape this module needs. Structural, so callers stay decoupled. */
export interface ProvenanceFinding {
  id: string
  plenoId: string
  quotes?: Array<{ text?: string; sourceClaimId?: string | null }>
}

/**
 * A run must prove it did work (`docs/DATA_INTEGRITY.md` rule 2). A matcher
 * that silently matched nothing would mark all 177 quotes and look thorough —
 * exactly the shape of the two front-end suites that were green while measuring
 * nothing. So the build asserts it EVALUATED something before it asserts what
 * it found.
 *
 * Returns the failure as a sentence, or null when the run is credible.
 */
export function provenanceSanityFailure(stats: QuoteProvenanceSnapshot['stats']): string | null {
  if (stats.quotes === 0) return 'ninguna cita evaluada: el snapshot de hallazgos no trae citas'
  if (stats.bytesLeidos === 0)
    return 'no se leyó un solo byte de transcripción: el corpus no está donde se busca'
  if (stats.enVigente === 0)
    return (
      'ninguna de las ' +
      stats.quotes +
      ' citas coincide con su transcripción vigente — eso no es un corpus degradado, es un cotejador que no coteja'
    )
  const classified =
    stats.enVigente + stats.soloEnSustituida + stats.sinDeterminar + stats.sinClasificar
  if (classified !== stats.quotes)
    return `se clasificaron ${classified} filas y el snapshot trae ${stats.quotes} citas: alguna se perdió por el camino`
  const reasons =
    stats.sinDeterminarPorTranscripcionMasCorta + stats.sinDeterminarPorFaltaDeTranscripcion
  if (reasons !== stats.sinDeterminar)
    return `«sin determinar» suma ${stats.sinDeterminar} pero sus motivos suman ${reasons}: hay una causa sin nombre`
  return null
}

/**
 * Both axes' sanity in one call, so a caller cannot check the transcript half
 * and forget the gate half. `compute:finding-quote-provenance` and
 * `check:finding-quotes` call THIS and nothing else — the per-axis functions
 * stay exported for the unit tests that inject broken stats into each.
 *
 * The order matters only in what it reports first; either failure blocks a
 * write. The gate half is where the base-vs-merged mistake would surface.
 */
export function snapshotSanityFailure(snap: QuoteProvenanceSnapshot): string | null {
  return provenanceSanityFailure(snap.stats) ?? contrastSanityFailure(snap.contraste.stats)
}

/**
 * Build the whole snapshot. Pure: `sessions` is already-read text and `corpus`
 * already-merged verifier items, so this is unit-testable against fixtures and
 * the same function serves the check.
 *
 * `corpus` is REQUIRED, not optional. An optional verifier corpus would mean an
 * absent one produces a snapshot with every `gate` null, which renders as an
 * unmarked — i.e. contrasted — quote on a page about named political groups.
 * Every caller passes it, and an empty one is refused by
 * `contrastSanityFailure` before anything is written.
 */
export function buildQuoteProvenance(
  findings: ProvenanceFinding[],
  sessions: ReadonlyMap<string, SessionTexts>,
  corpus: VerifierCorpus,
  opts: {
    generatedAt: string
    findingsGeneratedAt: string
    findingsPath?: string
    transcriptsPath?: string
    supersededPath?: string
    ledgerPath?: string
    basePath?: string
    overlayPath?: string
  },
): QuoteProvenanceSnapshot {
  // The gate axis, computed over the same findings in the same order. Rows are
  // indexed by the quote's OWN position, so a quote the transcript axis leaves
  // unresolved cannot shift the gate rows underneath the rest.
  const contrast = buildQuoteContrast(findings, corpus)
  const quotes: Record<string, QuoteProvenanceEntry[]> = {}
  const unresolved: UnresolvedQuote[] = []
  const sessionRows: Record<string, ProvenanceSessionRow> = {}
  const empty: SessionTexts = {
    current: null,
    superseded: null,
    currentBytes: 0,
    supersededBytes: 0,
  }

  let total = 0
  let enVigente = 0
  let soloEnSustituida = 0
  let porMasCorta = 0
  let porFalta = 0
  let bytesLeidos = 0
  const marked = new Set<string>()
  const seenSessions = new Set<string>()

  for (const f of findings) {
    const s = sessions.get(f.plenoId) ?? empty
    if (!seenSessions.has(f.plenoId)) {
      seenSessions.add(f.plenoId)
      bytesLeidos += (s.current?.length ?? 0) + (s.superseded?.length ?? 0)
      sessionRows[f.plenoId] = {
        retranscrita: s.superseded !== null,
        bytesVigente: s.currentBytes,
        bytesSustituida: s.supersededBytes,
        comparable: sessionIsComparable(s),
      }
    }
    const rows: QuoteProvenanceEntry[] = []
    ;(f.quotes ?? []).forEach((q, i) => {
      total += 1
      const outcome = classifyQuoteProvenance(q.text ?? '', s)
      if (outcome.kind === 'no-localizada') {
        unresolved.push({
          findingId: f.id,
          plenoId: f.plenoId,
          quoteIndex: i,
          quote: (q.text ?? '').slice(0, 120),
          coverage: Number(outcome.coverage.toFixed(2)),
        })
        // No row is pushed: the entry array is indexed by quote position, and
        // inventing a placeholder status here is the whole failure mode this
        // module refuses. The compute script will not write a snapshot with a
        // non-empty `unresolved`, so the hole can never reach a reader.
        return
      }
      if (outcome.status === 'en-vigente') enVigente += 1
      else {
        marked.add(f.id)
        if (outcome.status === 'solo-en-sustituida') soloEnSustituida += 1
        else if (outcome.reason === 'transcripcion-actual-mas-corta') porMasCorta += 1
        else porFalta += 1
      }
      const gate = contrast.rows[f.id]?.[i]?.gate ?? null
      rows.push(
        outcome.reason === null
          ? { status: outcome.status, gate }
          : { status: outcome.status, reason: outcome.reason, gate },
      )
    })
    quotes[f.id] = rows
  }

  const sessionList = Object.values(sessionRows)
  return {
    _comment:
      'DERIVADO, no curado. Dos cosas por cada literal publicado en /hallazgos. (1) `quotes[id][i].status`: ' +
      'de qué transcripción procede — de la vigente, sólo de la que se sustituyó al re-transcribir la ' +
      'sesión, o de ninguna de las dos de forma concluyente. (2) `quotes[id][i].gate`: qué haría con la ' +
      'afirmación que sostiene esa cita la puerta editorial de src/scraper/claim-public-gate.ts, que ' +
      'gobierna /plenos y que /hallazgos no consultaba — `shown`, `toggle` o `hidden`, su propio ' +
      'vocabulario. Ninguna de las dos modifica una cita y ninguna es una corrección: el único escritor ' +
      'de public/data/pleno-findings.json sigue siendo `npm run correct-pleno-finding`. ' +
      'Se regenera con `npm run compute:finding-quote-provenance`.',
    version: PROVENANCE_VERSION,
    generatedAt: opts.generatedAt,
    source: {
      findings: opts.findingsPath ?? 'public/data/pleno-findings.json',
      findingsGeneratedAt: opts.findingsGeneratedAt,
      transcripts: opts.transcriptsPath ?? 'public/data/pleno-transcripts',
      superseded: opts.supersededPath ?? 'public/data/pleno-transcripts/superseded',
    },
    statuses: QUOTE_PROVENANCE_STATUSES,
    undeterminedReasons: UNDETERMINED_REASONS,
    contraste: {
      source: {
        ledger: opts.ledgerPath ?? 'public/data/pleno-claims-verified.json',
        base: opts.basePath ?? 'public/data/pleno-claims-verified-base.json',
        overlay: opts.overlayPath ?? 'public/data/pleno-claims-overlay.json',
      },
      states: QUOTE_CONTRAST_STATES,
      stats: contrast.stats,
    },
    stats: {
      findings: findings.length,
      quotes: total,
      enVigente,
      soloEnSustituida,
      sinDeterminar: porMasCorta + porFalta,
      sinDeterminarPorTranscripcionMasCorta: porMasCorta,
      sinDeterminarPorFaltaDeTranscripcion: porFalta,
      findingsConCitaMarcada: marked.size,
      sesionesConCitas: sessionList.length,
      sesionesRetranscritas: sessionList.filter((r) => r.retranscrita).length,
      sesionesNoComparables: sessionList.filter((r) => !r.comparable).length,
      sinClasificar: unresolved.length,
      bytesLeidos,
    },
    sessions: sessionRows,
    quotes,
    unresolved,
  }
}

/**
 * Does the committed snapshot still say what the transcripts say?
 *
 * This is what stops the number going silent. A published provenance file is
 * only worth the reader's trust while it tracks the corpus: correct a quote,
 * re-transcribe a session, promote a finding — and the marks on the page are
 * about a state of the world that no longer exists, with nothing on screen to
 * say so. `check:finding-quotes` re-derives and calls this, so the page and the
 * bytes cannot drift apart quietly.
 *
 * Both axes, for the same reason. A `gate` that stopped tracking the verifier
 * is worse than a stale transcript status: the verdict engine re-judges claims
 * on its own schedule, and a quote whose mark says «acusación no contrastada»
 * after the claim was grounded — or, far worse, one that lost its mark after
 * being ungrounded — is a false statement about a named political group.
 *
 * Compares the semantic content only: `generatedAt` moves on every run and a
 * timestamp mismatch is not a defect. Returns the differences as sentences,
 * empty when they agree.
 */
export function diffProvenance(
  published: Partial<QuoteProvenanceSnapshot> | null,
  derived: QuoteProvenanceSnapshot,
): string[] {
  if (published == null) return ['no hay snapshot publicado de procedencia de citas']
  const out: string[] = []
  if (published.version !== derived.version) {
    out.push(`versión ${String(published.version)} ≠ ${derived.version}`)
  }
  const pStats = (published.stats ?? {}) as Record<string, unknown>
  for (const [k, v] of Object.entries(derived.stats)) {
    // `bytesLeidos` is the one figure that legitimately shifts without any
    // editorial change (a transcript rewritten byte-identically in meaning),
    // and it is a liveness signal rather than a claim about a quote.
    if (k === 'bytesLeidos') continue
    if (pStats[k] !== v) out.push(`stats.${k}: publicado ${String(pStats[k])} ≠ derivado ${v}`)
  }
  // The gate axis. `porContraste` is a map, so it is walked rather than
  // compared — `{} !== {}` would make this branch permanently silent, which is
  // the failure mode the whole function exists to prevent.
  const pContrast = ((published.contraste?.stats ?? {}) as Record<string, unknown>) || {}
  for (const [k, v] of Object.entries(derived.contraste.stats)) {
    if (k === 'porContraste') {
      const pMap = (pContrast.porContraste ?? {}) as Record<string, unknown>
      for (const [gate, n] of Object.entries(derived.contraste.stats.porContraste)) {
        if (pMap[gate] !== n) {
          out.push(
            `contraste.porContraste.${gate}: publicado ${String(pMap[gate])} ≠ derivado ${n}`,
          )
        }
      }
      continue
    }
    // Las tres cifras del CONTRASTE con la base determinista no son
    // afirmaciones sobre ninguna cita: dicen si en esta máquina había base con
    // la que comparar. La base es gitignorada, así que en un clon limpio valen
    // 0/0/false y en el portátil no — y compararlas ponía en rojo un snapshot
    // perfectamente correcto por el entorno en el que se ejecuta el test. Es la
    // misma excepción que `bytesLeidos` arriba, por la misma razón: señal de
    // liveness, no afirmación publicada. Lo que decide las MARCAS es el
    // monolito, y eso sí se compara entero, cita por cita.
    if (
      k === 'baseDisponible' ||
      k === 'citasConVeredictoDeOverlay' ||
      k === 'citasReclasificadasPorElOverlay'
    ) {
      continue
    }
    if (pContrast[k] !== v) {
      out.push(`contraste.stats.${k}: publicado ${String(pContrast[k])} ≠ derivado ${v}`)
    }
  }
  const pQuotes = (published.quotes ?? {}) as Record<string, QuoteProvenanceEntry[]>
  const ids = new Set([...Object.keys(pQuotes), ...Object.keys(derived.quotes)])
  for (const id of [...ids].sort()) {
    const a = pQuotes[id]
    const b = derived.quotes[id]
    if (!a) {
      out.push(`${id}: hallazgo sin fila publicada`)
      continue
    }
    if (!b) {
      out.push(`${id}: fila publicada de un hallazgo que ya no existe`)
      continue
    }
    if (a.length !== b.length) {
      out.push(`${id}: ${a.length} cita(s) publicadas ≠ ${b.length} derivadas`)
      continue
    }
    for (let i = 0; i < b.length; i += 1) {
      if (a[i]?.status !== b[i].status || (a[i]?.reason ?? null) !== (b[i].reason ?? null)) {
        out.push(
          `${id}[${i}]: publicado ${a[i]?.status ?? '—'}${a[i]?.reason ? `/${a[i].reason}` : ''} ` +
            `≠ derivado ${b[i].status}${b[i].reason ? `/${b[i].reason}` : ''}`,
        )
      }
      if ((a[i]?.gate ?? null) !== b[i].gate) {
        out.push(
          `${id}[${i}]: puerta publicada ${String(a[i]?.gate ?? '—')} ≠ derivada ${String(b[i].gate)}`,
        )
      }
    }
  }
  return out
}
