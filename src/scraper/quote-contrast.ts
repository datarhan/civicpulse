/**
 * What would the editorial gate do with the claim behind each verbatim that
 * `/hallazgos` publishes?
 *
 * `claim-public-gate.ts` is, in its own words, the «single source of truth for
 * what the machine-extracted verifier output may surface to the public». It
 * fails safe, it is applied by the chunker at build time and again client-side,
 * and `/plenos` obeys it. **`/hallazgos` never consulted it.**
 *
 * Measured on the published snapshots, with the overlay applied: of the 177
 * verbatims on `/hallazgos`, the gate would SHOW 16, TOGGLE 86 and HIDE 75 —
 * and every one of the 75 is an `acusacion_publica` the verifier could not
 * ground in municipal data. So the editorial surface publishes, verbatim and
 * unqualified, accusations by named political groups that the same site
 * withholds two clicks away.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS IS A DISCLOSURE AND NOT A RETRACTION
 *
 * The gate's own header says promotion into a finding is the sanctioned way
 * past it, «precisely because a person is standing in it». That exception is
 * real and stays. What went wrong is who took it: 39 of the 52 findings have no
 * quote the gate would show, and most of those were signed `auto-curation-v1`.
 * A machine took a human's exception.
 *
 * Removing the quotes would be a bigger editorial act than publishing them was,
 * taken by the same kind of process for the same lack of a reason. So nothing
 * here removes or rewrites a quote. It states the fact the reader was missing —
 * this accusation is not backed by municipal data, and we are not saying it is
 * false — and `triage:finding-exception` queues the 39 for a person.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * TWO OUTCOMES, KEPT APART
 *
 * `hidden` and `toggle` are different facts and the gate separates them
 * deliberately: an ungrounded public ACCUSATION versus an ungrounded ordinary
 * claim. Folding them into one «unverified» mark would tell a reader that «el
 * presupuesto sube un 3 %» and «se adjudicó a dedo» are the same kind of
 * unproven. They are not, and the gate is the module that knows it.
 *
 * The three states below are therefore keyed by the gate's OWN enum, imported
 * from it. Nothing here restates the policy and nothing re-derives a verdict:
 * `classifyClaimVisibility` decides, this module only counts and labels.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE OVERLAY IS NOT OPTIONAL
 *
 * `pleno-claims-verified-base.json` is the deterministic pass. The verdict
 * engine, the NLI pass and curator downgrades live in
 * `pleno-claims-overlay.json`, and the published ledger is
 * `mergeVerified(base, overlay)`. Classifying the base alone gives
 * 149 shown / 20 toggle / 8 hidden — a different site. 135 of the 177 quotes
 * land in a different bucket. That is not a rounding difference, it is the
 * whole finding inverted, and it is the mistake this module is built to make
 * impossible: the corpus carries base AND merged, the stats count how many
 * quotes were decided on an overlay verdict, and `contrastSanityFailure`
 * refuses a run where the overlay had entries and none of them reached a quote.
 */
import {
  classifyClaimVisibility,
  CLAIM_VISIBILITIES,
  type ClaimVisibility,
  type ClaimVisibilityInput,
} from './claim-public-gate'

/**
 * What each gate outcome means for a verbatim on `/hallazgos`, and whether the
 * reader has to be told. A `Record` over the gate's enum, so a fourth outcome
 * is a compile error here rather than a quote that renders unmarked.
 *
 * `meaning` is the technical definition a machine reading the JSON needs; the
 * reader-facing wording lives in the component, next to the transcript marks it
 * has to compose with.
 */
const CONTRAST_MEANING: Record<ClaimVisibility, { meaning: string; marks: boolean }> = {
  shown: {
    meaning:
      'El verificador encontró datos municipales sobre la afirmación que sostiene esta cita: la puerta editorial la publicaría en /plenos tal cual.',
    marks: false,
  },
  toggle: {
    meaning:
      'El verificador no encontró ningún dato municipal que confirme ni desmienta la afirmación que sostiene esta cita. No es una acusación; en /plenos se publica etiquetada como sin contraste.',
    marks: true,
  },
  hidden: {
    meaning:
      'La afirmación que sostiene esta cita es una acusación pública que el verificador no pudo contrastar con ningún dato municipal (o un `contradicho` asignado por máquina). En /plenos no se publica; en un hallazgo se publica porque alguien la promovió.',
    marks: true,
  },
}

/** The publishable states of the contrast axis, derived from the gate's enum. */
export const QUOTE_CONTRAST_STATES = CLAIM_VISIBILITIES.map((id) => ({
  id,
  ...CONTRAST_MEANING[id],
}))

export type QuoteContrastState = ClaimVisibility

/** The states that put a marker in front of a reader. Derived, never retyped. */
export const MARKED_CONTRAST_IDS: readonly ClaimVisibility[] = CLAIM_VISIBILITIES.filter(
  (id) => CONTRAST_MEANING[id].marks,
)

/**
 * The verifier corpus, as this axis needs it.
 *
 * `merged` is what the gate must read — `mergeVerified(base, overlay)`, the
 * same composition the published ledger ships. `base` is carried for one
 * purpose only: to count how many quotes the overlay actually moved, so a run
 * that silently read the base alone reports zero and is refused. Deleting
 * `base` would remove the proof, not simplify the module.
 */
export interface VerifierCorpus {
  merged: ReadonlyMap<string, ClaimVisibilityInput>
  base: ReadonlyMap<string, ClaimVisibilityInput>
  /** Entries in the overlay that was merged in. */
  overlayEntries: number
}

export interface QuoteContrastStats {
  /** Published quotes whose `sourceClaimId` resolved in the merged corpus. */
  citasConClaim: number
  /** Quotes whose claim is absent from the corpus. Non-zero ⇒ refuse to write. */
  citasSinClaim: number
  /** One counter per gate outcome, keyed by the gate's own enum. */
  porContraste: Record<ClaimVisibility, number>
  /** Quotes whose claim carries an overlay entry. */
  citasConVeredictoDeOverlay: number
  /** Quotes the overlay moved to a DIFFERENT outcome than the base alone. */
  citasReclasificadasPorElOverlay: number
  /** Findings with no quote the gate would show. */
  hallazgosSinCitaMostrable: number
  /** Findings every one of whose quotes the gate would hide. */
  hallazgosSoloConCitasOcultas: number
  /** Claims in the merged corpus. Zero ⇒ the gate classified against nothing. */
  claimsEnCorpus: number
  /** Entries in the overlay. Zero with a corpus present ⇒ the merge lost it. */
  entradasDeOverlay: number
}

/** One published quote's row on this axis. */
export interface QuoteContrastEntry {
  /** The gate's own verdict about this quote's claim, verbatim. */
  gate: ClaimVisibility
}

export interface QuoteContrastResult {
  /** findingId → one entry per quote, indexed by the quote's own position. */
  rows: Record<string, Array<QuoteContrastEntry | null>>
  stats: QuoteContrastStats
  /** Quotes whose claim is missing from the corpus. Never published as a state. */
  unresolved: Array<{ findingId: string; quoteIndex: number; claimId: string | null }>
}

/** The finding shape this axis needs. Structural, so callers stay decoupled. */
export interface ContrastFinding {
  id: string
  quotes?: Array<{ sourceClaimId?: string | null }>
}

/**
 * Classify every published quote against the gate.
 *
 * Pure: the corpus is already-read data. `classifyClaimVisibility` is handed
 * the corpus item DIRECTLY — the gate's parameter is structural precisely so no
 * caller builds an adapter object out of the fields it thinks the gate reads,
 * because a field added to the gate that an adapter does not forward arrives as
 * `undefined` and the claim is published.
 */
export function buildQuoteContrast(
  findings: ContrastFinding[],
  corpus: VerifierCorpus,
): QuoteContrastResult {
  const rows: Record<string, Array<QuoteContrastEntry | null>> = {}
  const unresolved: QuoteContrastResult['unresolved'] = []
  const porContraste = Object.fromEntries(CLAIM_VISIBILITIES.map((v) => [v, 0])) as Record<
    ClaimVisibility,
    number
  >
  let citasConClaim = 0
  let conOverlay = 0
  let reclasificadas = 0
  let sinCitaMostrable = 0
  let soloOcultas = 0

  for (const f of findings) {
    const quotes = f.quotes ?? []
    const out: Array<QuoteContrastEntry | null> = []
    let shown = 0
    let hidden = 0
    quotes.forEach((q, i) => {
      const claimId = q?.sourceClaimId ?? null
      const item = claimId != null ? corpus.merged.get(claimId) : undefined
      if (item == null) {
        unresolved.push({ findingId: f.id, quoteIndex: i, claimId })
        out.push(null)
        return
      }
      const gate = classifyClaimVisibility(item)
      citasConClaim += 1
      porContraste[gate] += 1
      if (gate === 'shown') shown += 1
      if (gate === 'hidden') hidden += 1
      const baseItem = claimId != null ? corpus.base.get(claimId) : undefined
      if (baseItem != null) {
        const baseVerdict = baseItem.verification?.verdict
        if (baseVerdict !== item.verification?.verdict) conOverlay += 1
        if (classifyClaimVisibility(baseItem) !== gate) reclasificadas += 1
      }
      out.push({ gate })
    })
    rows[f.id] = out
    if (quotes.length > 0 && shown === 0) sinCitaMostrable += 1
    if (quotes.length > 0 && hidden === quotes.length) soloOcultas += 1
  }

  return {
    rows,
    unresolved,
    stats: {
      citasConClaim,
      citasSinClaim: unresolved.length,
      porContraste,
      citasConVeredictoDeOverlay: conOverlay,
      citasReclasificadasPorElOverlay: reclasificadas,
      hallazgosSinCitaMostrable: sinCitaMostrable,
      hallazgosSoloConCitasOcultas: soloOcultas,
      claimsEnCorpus: corpus.merged.size,
      entradasDeOverlay: corpus.overlayEntries,
    },
  }
}

/**
 * A run must prove it did work (`docs/DATA_INTEGRITY.md` rule 2), and here it
 * must prove one thing more: that it read the MERGED corpus.
 *
 * A traversal that silently matched nothing would mark all 177 quotes and look
 * thorough. A traversal that read `pleno-claims-verified-base.json` alone would
 * mark 28 and also look thorough — it is the mistake that produced the first,
 * wrong version of this measurement. Both are refused below, before anything is
 * written, rather than reported afterwards.
 *
 * Returns the failure as a sentence, or null when the run is credible.
 */
export function contrastSanityFailure(stats: QuoteContrastStats): string | null {
  if (stats.claimsEnCorpus === 0) {
    return 'el corpus del verificador llegó vacío: la puerta editorial no clasificó nada'
  }
  if (stats.citasConClaim + stats.citasSinClaim === 0) {
    return 'ninguna cita evaluada contra la puerta editorial: el snapshot de hallazgos no trae citas'
  }
  if (stats.citasSinClaim > 0) {
    return (
      `${stats.citasSinClaim} cita(s) publicadas cuya afirmación no está en el corpus del ` +
      'verificador: sin ella la puerta no puede clasificarlas y saldrían en la página sin marca, ' +
      'que es como sale una cita contrastada'
    )
  }
  const suma = CLAIM_VISIBILITIES.reduce((n, v) => n + stats.porContraste[v], 0)
  if (suma !== stats.citasConClaim) {
    return `los contadores de la puerta suman ${suma} y se clasificaron ${stats.citasConClaim} citas: hay un estado sin contar`
  }
  if (
    stats.entradasDeOverlay > 0 &&
    stats.citasConVeredictoDeOverlay === 0 &&
    // Una base sembrada VERBATIM desde el monolito publicado (el estado
    // transitorio que bendice migrate:verified-split) absorbe los veredictos
    // del overlay, y ahí la señal de arriba es legítimamente cero. Una puerta
    // movida por el sidecar de reclasificaciones es una prueba igual de firme
    // de que la composición corrió — el stat mide base-vs-fusionado, que en una
    // lectura sin fusionar es idéntico por construcción. Cero en LAS DOS
    // señales sigue siendo una lectura sin fusionar, y se sigue negando.
    stats.citasReclasificadasPorElOverlay === 0
  ) {
    return (
      `el overlay trae ${stats.entradasDeOverlay} entradas y ninguna cita publicada quedó ` +
      'clasificada sobre un veredicto suyo: se está leyendo pleno-claims-verified-base.json sin ' +
      'fusionar, y sobre la base sola la puerta da un resultado distinto para 135 de las 177 citas'
    )
  }
  return null
}
