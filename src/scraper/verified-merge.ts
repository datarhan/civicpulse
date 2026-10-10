/**
 * Base/overlay merge for pleno-claims-verified.json (P2, fixes audit R4/B5).
 *
 * The deterministic pass writes `pleno-claims-verified-base.json`; second-pass
 * runners (NLI/LLM), curator downgrades and, since 2026-10-04, the raise a
 * person signs (`subir-veredicto`, src/scraper/subida-firmada.ts) write
 * `pleno-claims-overlay.json`.
 * The published `pleno-claims-verified.json` is the pure merge of the two, so a
 * deterministic re-run rebuilds the base and re-applies the overlay — it can no
 * longer clobber second-pass or curator decisions.
 *
 * Two more optional layers joined later, both curator sidecars for a field the
 * overlay deliberately cannot touch (it owns verdicts, not the claim):
 * `pleno-claim-reclassifications.json` for a claim whose TYPE the extractor got
 * wrong, and `pleno-claim-reanchors.json` for one whose VERBATIM it mis-quoted.
 * Same merge discipline in all cases: the base stays machine-reproducible, the
 * sidecar is committed and precious, and any rebuild re-applies it. A fifth,
 * `pleno-claim-relabels.json`, holds the GROUP of a speaker as a person signed
 * it after listening; its rules live in atribucion-firmada.ts.
 *
 * Pure module — no fs, no Date (callers pass timestamps). See
 * docs/superpowers/specs/2026-06-23-factcheck-rebuild-p2-design.md.
 */
import { ALLOWED_CLAIM_TYPES, type ClaimType, type PlenoClaim } from './pleno-claim'
import type { ClaimVerdict, ClaimVerification, ClaimEvidence } from './claim-verifier'
import { corpusDeEvidencia, corpusReales, esTextoDeMaquina } from './claim-verdicts'
import { charlaDeTarea } from './charla-de-tarea'
// Sólo valor: trinquete.ts importa de aquí únicamente tipos, así que no hay
// ciclo en ejecución.
import { TRINQUETE } from './trinquete'
// El mismo descuento de palabras vacías que usa la cola de reanclaje de
// `/hallazgos`. Importado, no recitado: dos listas de stopwords que midieran
// distinto harían que el CLI aceptara lo que la cola desaconseja.
import { contentWords } from './quote-reanchor'
import {
  claseDeFirma,
  nombraAUnaPersona,
  rechazoDeFirma,
  rechazoDeMarcador,
  type ClaseDeFirma,
} from './firma-de-persona'
import { REASON_DIGEST_RE, reasonDigest, type PlenoFindingReasonAmendment } from './pleno-finding'
import {
  HUELLA_DE_LITERAL_RETIRADO_RE,
  MOTIVOS_DE_RETIRADA,
  type RetiradaDeDeclaracion,
} from './declaracion-retirada'
import { sha256Short } from './hash'
import { quoteAppearsIn } from './quote-match'
// atribucion-firmada.ts importa de aquí sólo tipos: no hay ciclo en ejecución.
import { conAtribucionFirmada, type AtribucionesFirmadas } from './atribucion-firmada'

export interface VerifiedItem {
  claim: PlenoClaim
  verification: VerificacionPublicada
}

export type OverlaySource =
  'nli' | 'llm' | 'curator-downgrade' | 'verdict-engine' | 'curator-upgrade'

/**
 * La verificación tal y como se publica: la del verificador y, cuando la puso
 * el overlay, el CANAL por el que entró — el `source` de su entrada.
 *
 * Hasta el 2026-09-28 ese dato se quedaba en la entrada. La puerta editorial lee
 * aquí la firma del curador (`isCuratorPromoted` en claim-public-gate.ts), así
 * que su excepción no casaba con nada, y cinco «parcial» que un curador había
 * firmado se servían plegados como si no hubiera datos detrás. Una fila de la
 * base no pasó por ningún canal y no lo lleva.
 */
export interface VerificacionPublicada extends ClaimVerification {
  source?: OverlaySource
  /**
   * Sólo en una bajada del curador: quién la DECIDIÓ, según la firma de su
   * entrada (`claseDeFirma`). Viaja la clase, no la firma cruda.
   *
   * Hasta el 2026-09-30 no viajaba nada, y la tarjeta rotulaba «corregido por
   * un curador» cualquier bajada: 25 servidas no las había decidido ninguna
   * persona (la revisión de oro con un modelo, sesiones de Claude, una firma
   * que no dice quién).
   */
  downgradedBy?: ClaseDeFirma
  /**
   * Quién firmó la última enmienda del motivo, si la hay: siempre una persona
   * con su nombre (`validarEnmiendas`). Es otra firma que la de la bajada: la
   * de quien reescribió la explicación, no la de quien decidió el veredicto.
   * Desde el 10-10-2026 la lleva también una retractación del motor cuya
   * explicación reescribió una persona (`enmendarMotivoDeBajada`).
   */
  reasonSignedBy?: string
  /**
   * Sólo en una subida firmada: quién la firmó, la firma de su entrada. Siempre
   * una persona con su nombre —`validarSubida` no acepta otra cosa—, y por eso
   * viaja el nombre y no una clase: la tarjeta lo imprime («firmado por…»),
   * como la firma de una enmienda de motivo.
   */
  raisedBy?: string
  /**
   * La retirada que firmó una persona, estampada desde la entrada como el
   * canal: la puerta la lee aquí (`motivoDeRetirada`, declaracion-retirada.ts).
   */
  retirada?: RetiradaDeDeclaracion
}

export interface OverlayEntry {
  verification: ClaimVerification
  source: OverlaySource
  /**
   * Required (≥20 chars) for curator-downgrade, verdict-engine and
   * curator-upgrade entries; in a curator-upgrade it IS the published summary.
   */
  reason?: string
  /**
   * Curator name (curator-downgrade), model id (verdict-engine), or the person
   * who signed a raise (curator-upgrade, always a person).
   */
  editor?: string
  appliedAt: string
  /**
   * Sólo en una subida firmada: el veredicto publicado cuando se firmó. La
   * subida corrige ESE estado, y volver a él es una bajada
   * (`isDowngrade(veredicto, desde)`). Ver `validarSubida`.
   */
  desde?: ClaimVerdict
  /**
   * Cada sustitución del motivo de una bajada de curador, en orden. Ausente
   * —nunca vacía— si el motivo es el de la bajada. Ver `enmendarMotivoDeBajada`.
   */
  reasonAmendments?: EnmiendaDeMotivo[]
  /**
   * La declaración, retirada por una persona: su literal, escuchada la sesión,
   * no es lo que se dijo. Sólo en una bajada de curador a `sin-datos` firmada
   * con un nombre. Ver `retirarDeclaracion`.
   */
  retirada?: RetiradaDeDeclaracion
  /**
   * Cada corrección del rótulo de una retractación del motor, en orden: a
   * nombre de quién está, no qué dice. Ausente —nunca vacía— si el rótulo es el
   * que escribió la pasada. Ver `corregirRotulos` (correccion-de-rotulo.ts).
   */
  labelCorrections?: CorreccionDeRotulo[]
}

/**
 * Una corrección del rótulo (`editor`) de una retractación del motor.
 *
 * El 02-08-2026 el motor rotuló `verdict-engine:claude-code` 457 retractaciones
 * que había contestado gpt-4o-mini (la causa, cerrada en la PR #248). El
 * veredicto y la explicación no cambian; cambia a nombre de quién están, y la
 * corrección se queda en la entrada: el rótulo anterior, el porqué —que dice
 * qué modelo hizo cada paso—, quién la firmó y cuándo.
 */
export interface CorreccionDeRotulo {
  /** El rótulo que tenía la entrada antes de esta corrección. */
  previous: string
  /** Por qué, ≥20 caracteres: qué paso contestó cada modelo, y de dónde se sabe. */
  reason: string
  /** Quién la firma: una persona o la cuenta de rol, nunca el hueco de una orden. */
  editor: string
  correctedAt: string
}

/**
 * Una sustitución del motivo de una bajada: la forma y la receta de huella de
 * la enmienda de motivo de /hallazgos (ENMIENDA DEL MOTIVO, pleno-finding.ts),
 * para que un auditor rehaga las dos con la misma herramienta.
 */
export type EnmiendaDeMotivo = PlenoFindingReasonAmendment

export interface Overlay {
  version: number
  generatedAt: string
  entries: Record<string, OverlayEntry>
}

/**
 * Remove exact-duplicate evidence rows (same kind + ref + snippet) within one
 * claim's evidence array, preserving first-seen order. The deterministic verifier
 * can match a single contract via more than one path (amount + text similarity),
 * pushing the same {kind,ref,snippet} row twice; the UI (/declaraciones,
 * /hallazgos) renders the first rows verbatim, so the dup surfaces as the same
 * citation shown twice. A shared snippet with a DIFFERENT ref is kept — those are
 * two genuinely distinct contracts that happen to share a title.
 */
export function dedupeEvidence(evidence: ClaimEvidence[]): ClaimEvidence[] {
  if (!Array.isArray(evidence) || evidence.length < 2) return evidence ?? []
  const seen = new Set<string>()
  const out: ClaimEvidence[] = []
  for (const e of evidence) {
    const key = JSON.stringify([e.kind, e.ref ?? '', (e.snippet ?? '').trim()])
    if (seen.has(key)) continue
    seen.add(key)
    out.push(e)
  }
  return out
}

/** Same verification when nothing was duplicated (keeps a byte-identical
 *  round-trip for un-affected claims); a fresh object with deduped evidence
 *  otherwise. Preserves key order so JSON output is stable. */
function withDedupedEvidence<V extends ClaimVerification>(v: V): V {
  const ev = v.evidence
  if (!Array.isArray(ev) || ev.length < 2) return v
  const deduped = dedupeEvidence(ev)
  return deduped.length === ev.length ? v : { ...v, evidence: deduped }
}

/**
 * One curator type-correction. `from` records the published type the curator
 * moved away from — the entry corrects a SPECIFIC observed state, so a base
 * whose type moved upstream makes the entry stale (skipped, counted) rather
 * than silently re-applied to something the curator never judged.
 */
export interface ReclassificationEntry {
  /** The corrected claim type. Never 'acusacion_publica'. */
  type: ClaimType
  /** The published type this correction moved away from (audit trail). */
  from: ClaimType
  /** Curator's grounds, ≥20 chars. */
  reason: string
  /** Curator name. */
  editor?: string
  appliedAt: string
}

export interface Reclassifications {
  version: number
  generatedAt: string
  entries: Record<string, ReclassificationEntry>
}

/**
 * Reclassify one claim object: type replaced, `accusationSubtype` dropped (the
 * schema defines it only for accusations), every other field — id included —
 * untouched. Key order is preserved so JSON output stays byte-stable.
 */
function reclassifiedClaim(claim: PlenoClaim, type: ClaimType): PlenoClaim {
  const { accusationSubtype: _dropped, ...rest } = claim
  return { ...rest, type }
}

/**
 * La verificación que publica una entrada: la suya, con lo que estampa la
 * ENTRADA —el canal, la retirada y, en una bajada del curador, quién la decidió
 * y quién firmó la última enmienda del motivo—, todo lo que `validateOverlay`
 * comprueba. Sin retirada ni bajada del curador, las claves salen en el orden de
 * siempre y el monolito no cambia de bytes. Quién decidió viaja como CLASE
 * (`claseDeFirma`): la firma cruda se queda en la entrada.
 */
function publicadaDesde(e: OverlayEntry): VerificacionPublicada {
  const {
    retirada: _colada,
    downgradedBy: _decidio,
    reasonSignedBy: _firmo,
    raisedBy: _subio,
    ...propia
  } = e.verification as VerificacionPublicada
  const v: VerificacionPublicada = {
    ...propia,
    source: e.source,
    ...(e.retirada ? { retirada: e.retirada } : {}),
  }
  // La firma de una subida viaja tal cual: el validador sólo la deja escribir
  // con el nombre de una persona, y quien la lee —la tarjeta, check:veredictos—
  // vuelve a mirar que lo sea.
  if (e.source === 'curator-upgrade') {
    return typeof e.editor === 'string' ? { ...v, raisedBy: e.editor } : v
  }
  const ultima = e.reasonAmendments?.[e.reasonAmendments.length - 1]
  // La explicación de una retractación del motor que reescribió una persona:
  // el veredicto sigue siendo del motor, y viaja quién firmó la explicación.
  if (e.source === 'verdict-engine') return ultima ? { ...v, reasonSignedBy: ultima.editor } : v
  if (e.source !== 'curator-downgrade') return v
  return {
    ...v,
    downgradedBy: claseDeFirma(e.editor),
    ...(ultima ? { reasonSignedBy: ultima.editor } : {}),
  }
}

/**
 * base items in their original order; for each, the overlay entry (matched by
 * claimId) replaces the verification when present — stamped with the entry's
 * `source`, see `VerificacionPublicada` —, the reclassification entry
 * replaces the claim's type, and the reanchor entry replaces its verbatim. Both
 * sidecars apply only while the claim still shows the state they recorded in
 * `from` — a base that moved upstream makes the entry stale, not silently
 * re-applied to something the curator never judged. Entries whose claimId is
 * absent from base are dropped (the claim was removed upstream). Evidence is
 * deduped on the way out (base- AND overlay-origin), so the published monolith
 * + chunks never carry a citation twice.
 *
 * Los sidecars tocan campos distintos del mismo objeto y se COMPONEN: un claim
 * reclasificado, reanclado y con atribución firmada sale con las tres
 * correcciones. Escribirlos como un `else if` —que es como salió la primera
 * versión— habría hecho que aplicar el segundo deshiciera el primero en
 * silencio.
 *
 * La atribución firmada (`firmadas`) también se juzga contra la base; las
 * entradas de `tramoPerdido` —su tramo ya no contiene las palabras, lo mide
 * quien lee las transcripciones— cuentan como obsoletas. Una obsoleta nunca
 * publica un grupo que contradiga la firma (`conAtribucionFirmada`).
 */
export function mergeVerified(
  baseItems: VerifiedItem[],
  overlay: Overlay,
  reclassifications?: Reclassifications,
  reanchors?: Reanchors,
  firmadas?: AtribucionesFirmadas,
  tramoPerdido?: ReadonlySet<string>,
): VerifiedItem[] {
  const entries = overlay?.entries ?? {}
  const reclas = reclassifications?.entries ?? {}
  const reanc = reanchors?.entries ?? {}
  const firm = firmadas?.entries ?? {}
  return baseItems.map((it) => {
    const e = entries[it.claim.id]
    // El `source` de la ENTRADA, que es el que valida `validateOverlay`, y no
    // uno que la verificación trajera dentro: si discrepan, manda el validado.
    // La retirada y quién decidió una bajada, igual: lo colado dentro de la
    // verificación no se publica.
    const verification = withDedupedEvidence<VerificacionPublicada>(
      e ? publicadaDesde(e) : it.verification,
    )
    const r = reclas[it.claim.id]
    let claim =
      r != null && it.claim.type === r.from ? reclassifiedClaim(it.claim, r.type) : it.claim
    const a = reanc[it.claim.id]
    // Contra `it.claim.verbatim`, no contra `claim.verbatim`: la reclasificación
    // no toca el literal, y comparar contra el intermedio ataría dos estratos
    // que son independientes a propósito.
    if (a != null && it.claim.verbatim === a.from) claim = reanchoredClaim(claim, a.verbatim)
    claim = conAtribucionFirmada(
      it.claim,
      claim,
      firm[it.claim.id],
      tramoPerdido?.has(it.claim.id) ?? false,
    )
    return verification === it.verification && claim === it.claim ? it : { claim, verification }
  })
}

/**
 * What a merge run did with each reclassification entry — the three outcomes,
 * counted apart (DATA_INTEGRITY rule 2: folding «not attempted» into
 * «unchanged» is how a pass once reported work it never did).
 */
export function reclassificationOutcomes(
  baseItems: VerifiedItem[],
  reclassifications: Reclassifications,
): { aplicadas: string[]; obsoletas: string[]; sinClaim: string[] } {
  const byId = new Map(baseItems.map((it) => [it.claim.id, it]))
  const aplicadas: string[] = []
  const obsoletas: string[] = []
  const sinClaim: string[] = []
  for (const [id, e] of Object.entries(reclassifications?.entries ?? {})) {
    const item = byId.get(id)
    if (item == null) sinClaim.push(id)
    else if (item.claim.type !== e.from) obsoletas.push(id)
    else aplicadas.push(id)
  }
  return { aplicadas, obsoletas, sinClaim }
}

// Certainty rank for the three graded verdicts. `contradicho` is handled
// explicitly (it may only relax toward parcial/sin-datos). `promesa-repetida`
// is out of scope for the downgrade tool.
const RANK: Partial<Record<ClaimVerdict, number>> = {
  verificado: 3,
  parcial: 2,
  'sin-datos': 1,
}

/**
 * True iff moving `from`→`to` is a downgrade (toward less certainty). Used to
 * gate the curator CLI so it can never raise a verdict (libel-increasing).
 */
export function isDowngrade(from: ClaimVerdict, to: ClaimVerdict): boolean {
  if (from === to) return false
  if (to === 'contradicho' || to === 'promesa-repetida') return false // never a downgrade target
  if (from === 'contradicho') return to === 'parcial' || to === 'sin-datos'
  const a = RANK[from]
  const b = RANK[to]
  if (a == null || b == null) return false
  return b < a
}

/**
 * Subir es «no bajar y no quedarse igual», DERIVADO de `isDowngrade` — la misma
 * función que ya gobierna el CLI del curador y el motor de veredictos. Vive aquí,
 * junto a ella, y la usan el overlay (`applyOverlayEntries`) y la guarda del
 * rebuild (`acusacionesQueSuben`): dos copias de un orden ya discreparon una vez.
 *
 * La primera versión escribió su propia escala de fuerza aquí, y la revisión
 * independiente encontró lo de siempre: las dos escalas ya discrepaban.
 * `isDowngrade` se niega a tratar `contradicho` como destino (nunca es una
 * bajada), mientras que la escala local lo empataba con `verificado` — o sea
 * que el CLI rechazaba `verificado → contradicho` y esta guarda lo dejaba
 * pasar, justo la transición que el bloque sólo-título hacía alcanzable sin que
 * interviniera nadie. Reescribir un orden es reescribir un enum: la regla 1 de
 * DATA_INTEGRITY, aplicada a una relación en vez de a una lista.
 *
 * Al derivarla, la guarda se vuelve además más estricta que la escala que
 * sustituye: cualquier movimiento que el curador no podría firmar como bajada
 * cuenta como subida y se para.
 */
export function esSubida(de: ClaimVerdict, a: ClaimVerdict): boolean {
  return de !== a && !isDowngrade(de, a)
}

/**
 * ¿Es esta entrada una subida firmada? El canal de la etapa que lleva la firma
 * en la entrada (`firmaEnLaEntrada`) y una firma que nombra a una persona. El
 * canal solo no basta: quien llama aquí puede tener delante un overlay que no
 * pasó por `validateOverlay`.
 */
export function esSubidaFirmada(
  e: Pick<OverlayEntry, 'source' | 'editor'> | null | undefined,
): boolean {
  return (
    TRINQUETE[e?.source as OverlaySource]?.firmaEnLaEntrada === true &&
    nombraAUnaPersona(e?.editor as string)
  )
}

/** Una entrada del overlay que publica por encima de lo que dice hoy su base. */
export interface EntradaPorEncima {
  id: string
  /** Lo que dice hoy la pasada determinista. */
  base: ClaimVerdict
  /** Lo que publica la entrada. */
  publica: ClaimVerdict
  source: OverlaySource
}

/**
 * ── Lo que el overlay publica, contra la base de HOY ─────────────────────────
 *
 * Una entrada se juzga al ESCRIBIRLA, contra la base de ese día
 * (`applyOverlayEntries`, con `isDowngrade`), y `mergeVerified` la vuelve a
 * aplicar sobre cada base posterior sin compararla con nada. Las entradas no
 * guardan `from`, como sí lo hacen las reclasificaciones y los reanclajes, así
 * que una base que se movió no las vuelve obsoletas: siguen publicándose.
 *
 * Mientras la base se mueva hacia arriba, eso es justo lo que se quiere —la
 * retractación sigue mandando—. Si se mueve por DEBAJO, lo publicado queda por
 * encima de lo que el verificador encuentra, y nada lo decía. Medido el
 * 04-10-2026, una de 1.319: 1sqj7is-053-pro-68944b publicaba `parcial`, una
 * bajada de junio desde el `verificado` de la pasada LLM ya retirada, que
 * conservaba la evidencia de esa pasada, sobre una base que dice `sin-datos`.
 *
 * Esto sólo lo CUENTA. Bajar el veredicto o reescribir su motivo es cosa de una
 * persona con la CLI que lo firma; ninguna escritura automática toca lo
 * publicado (docs/DATA_INTEGRITY.md, regla 4). «Por encima» es `esSubida`, la
 * misma relación que gobierna el CLI del curador y la guarda del rebuild, y no
 * una escala recitada aquí. Cuatro desenlaces contados aparte (regla 2): una
 * entrada cuya declaración ya no está en la base ni se aplica ni se publica, y
 * no es «igual» ni «baja».
 *
 * Y un quinto desde el 04-10-2026: la SUBIDA FIRMADA (src/scraper/
 * subida-firmada.ts). Publica por encima de su base a propósito —una persona
 * leyó el registro que la base no casó y lo firmó con su nombre—, así que no es
 * «por encima» sin que nadie lo decidiera, que es lo que ese desenlace afirma.
 * Va aparte, y sólo con la firma de una persona (`esSubidaFirmada`): una entrada
 * de ese canal sin ella sigue contando como «por encima».
 */
export function overlayOutcomes(
  baseItems: VerifiedItem[],
  overlay: Overlay,
): {
  bajan: string[]
  iguales: string[]
  porEncima: EntradaPorEncima[]
  subidasFirmadas: EntradaPorEncima[]
  sinClaim: string[]
} {
  const byId = new Map(baseItems.map((it) => [it.claim.id, it]))
  const bajan: string[] = []
  const iguales: string[] = []
  const porEncima: EntradaPorEncima[] = []
  const subidasFirmadas: EntradaPorEncima[] = []
  const sinClaim: string[] = []
  for (const [id, e] of Object.entries(overlay?.entries ?? {})) {
    const item = byId.get(id)
    if (item == null) {
      sinClaim.push(id)
      continue
    }
    const base = item.verification.verdict
    const publica = e.verification.verdict
    if (base === publica) iguales.push(id)
    else if (esSubida(base, publica)) {
      const fila = { id, base, publica, source: e.source }
      if (esSubidaFirmada(e)) subidasFirmadas.push(fila)
      else porEncima.push(fila)
    } else bajan.push(id)
  }
  return { bajan, iguales, porEncima, subidasFirmadas, sinClaim }
}

/**
 * El suelo de evidencia: ¿se sostiene este veredicto sobre algo?
 *
 * Un veredicto por encima de `sin-datos` AFIRMA que algo respalda la
 * afirmación. Hasta el 2026-08-27 nada obligaba a que ese algo existiera, y en
 * lo publicado había 92 filas con `parcial` o `verificado` sin nombrar un solo
 * corpus — 87 de ellas escritas por una pasada retirada.
 *
 * Se exige lo que el objeto publicado permite comprobar, y ni una coma más:
 * que nombre un corpus DE VERDAD (no una marca de pasada) y que traiga alguna
 * fila de evidencia. Si esa evidencia FUNDA o sólo se le parece es un juicio
 * que este esquema no guarda —las filas no fundantes se anotan dentro del
 * verificador y no salen del módulo— y fingir aquí que se comprueba sería
 * afirmar de más, que es justo lo que este suelo existe para impedir.
 */
export function evidenciaSuficiente(v: {
  verdict?: string
  checkedAgainst?: readonly unknown[]
  evidence?: readonly unknown[]
}): boolean {
  const fuerte = v?.verdict === 'verificado' || v?.verdict === 'parcial'
  if (!fuerte) return true
  if (corpusReales(v?.checkedAgainst).length === 0) return false
  return (v?.evidence?.length ?? 0) > 0
}

/**
 * La verificación que escribe una bajada de curador.
 *
 * `downgrade-verdict` y `apply-gold-downgrades` la construían cada una a mano,
 * con la misma forma recitada dos veces. Vive aquí para que quien la necesite
 * pase por el camino real en vez de recitarla una tercera: recitar una forma es
 * lo que tuvo verde la excepción de curador de `claim-public-gate.ts` mientras
 * no casaba con nada (docs/DATA_INTEGRITY.md regla 1).
 *
 * `sin-datos` vacía la evidencia —bajar a «no hay datos» y seguir enseñando
 * datos se contradice—; cualquier otro destino conserva la que había. El orden
 * de las claves es el de siempre, para que el overlay no cambie de bytes.
 */
export function verificacionDeBajada(
  claimId: string,
  actual: Pick<ClaimVerification, 'evidence'>,
  nuevo: ClaimVerdict,
  motivo: string,
): ClaimVerification {
  return {
    claimId,
    verdict: nuevo,
    summary: motivo,
    evidence: nuevo === 'sin-datos' ? [] : actual.evidence,
    checkedAgainst: ['curator-downgrade'],
  }
}

export interface ApplyEntry {
  claimId: string
  verification: ClaimVerification
  source: OverlaySource
  reason?: string
  editor?: string
  /** Sólo en una subida firmada: el veredicto publicado que sube (ver `OverlayEntry`). */
  desde?: ClaimVerdict
}

const VALID_SOURCES: OverlaySource[] = [
  'nli',
  'llm',
  'curator-downgrade',
  'verdict-engine',
  'curator-upgrade',
]

/**
 * ¿Es esto una fila de una cola humana? `requiresHumanApproval` es la marca de
 * toda sugerencia de máquina, y un esquema curado la rechaza (CLAUDE.md): aquí
 * `applyOverlayEntries` la tiraría sin avisar al copiar la entrada y publicaría
 * lo que esperaba una firma. Se mira en la fila y en su verificación.
 */
function esperaFirma(e: unknown): boolean {
  const fila = e as { requiresHumanApproval?: unknown; verification?: unknown } | null
  const v = fila?.verification as { requiresHumanApproval?: unknown } | null | undefined
  return (
    (fila != null && 'requiresHumanApproval' in fila) || (v != null && 'requiresHumanApproval' in v)
  )
}

/** Throws on a malformed overlay (called on every write — defence in depth). */
export function validateOverlay(o: Overlay): void {
  if (!o || typeof o.version !== 'number' || !o.entries || typeof o.entries !== 'object') {
    throw new Error('[overlay] malformed: missing version/entries')
  }
  for (const [id, e] of Object.entries(o.entries)) {
    if (!e || typeof e !== 'object') throw new Error(`[overlay] ${id}: entry not an object`)
    if (!e.verification || typeof e.verification.verdict !== 'string') {
      throw new Error(`[overlay] ${id}: missing verification`)
    }
    if (!VALID_SOURCES.includes(e.source))
      throw new Error(`[overlay] ${id}: bad source ${e.source}`)
    if (esperaFirma(e)) {
      throw new Error(
        `[overlay] ${id}: lleva requiresHumanApproval — es una sugerencia que espera la firma de ` +
          'una persona, no una decisión, y en el overlay se publicaría',
      )
    }
    if (typeof e.appliedAt !== 'string') throw new Error(`[overlay] ${id}: missing appliedAt`)
    if (e.source === 'curator-downgrade' && (!e.reason || e.reason.trim().length < 20)) {
      throw new Error(`[overlay] ${id}: curator-downgrade needs a reason of at least 20 chars`)
    }
    if (e.source === 'verdict-engine') {
      if (!e.reason || e.reason.trim().length < 20) {
        throw new Error(`[overlay] ${id}: verdict-engine needs a reason of at least 20 chars`)
      }
      if (e.verification.verdict === 'contradicho') {
        throw new Error(`[overlay] ${id}: verdict-engine may never emit contradicho`)
      }
    }
    if (e.reasonAmendments !== undefined) validarEnmiendas(id, e)
    if (e.labelCorrections !== undefined) validarCorreccionesDeRotulo(id, e)
    if (e.retirada !== undefined) validarRetirada(id, e)
    if (e.desde !== undefined && e.source !== 'curator-upgrade') {
      throw new Error(
        `[overlay] ${id}: desde sólo lo lleva una subida firmada (esta entrada es de ${e.source})`,
      )
    }
    if (e.source === 'curator-upgrade') validarSubida(id, e)
  }
}

/** Las clases de evidencia que una subida firmada puede citar: las de esta vía. */
const KINDS_DE_LA_SUBIDA: readonly string[] = ['tender', 'bdns']

/**
 * Una subida firmada, escrita por la CLI o a mano: el validador no se fía de
 * ninguna. Es la única entrada del overlay que refuerza lo que se publica de
 * una declaración, así que el molde es estricto; el porqué de cada regla está
 * en src/scraper/subida-firmada.ts.
 */
function validarSubida(id: string, e: OverlayEntry): void {
  const donde = `[overlay] ${id}`
  const rechazo = rechazoDeFirma(e.editor ?? '')
  if (rechazo) {
    throw new Error(`${donde}: una subida firmada la firma una persona, con su nombre: ${rechazo}`)
  }
  const v = e.verification
  const puede = TRINQUETE['curator-upgrade'].puedeEmitir
  if (!puede.includes(v.verdict)) {
    throw new Error(`${donde}: una subida firmada emite ${puede.join(' o ')}, no ${v.verdict}`)
  }
  if (!e.desde || !isDowngrade(v.verdict, e.desde)) {
    throw new Error(
      `${donde}: desde (${String(e.desde)}) tiene que ser el veredicto del que subió, y volver ` +
        `a él desde ${v.verdict} tiene que ser una bajada`,
    )
  }
  if (!e.reason || e.reason.trim().length < 20) {
    throw new Error(`${donde}: una subida firmada lleva su resumen, de al menos 20 caracteres`)
  }
  if (v.summary !== e.reason) {
    throw new Error(
      `${donde}: el resumen publicado no es el motivo firmado, y la tarjeta imprime el resumen`,
    )
  }
  const charla = charlaDeTarea(v.summary)
  if (charla) {
    throw new Error(`${donde}: el resumen habla de la tarea de un modelo (${charla})`)
  }
  if (!evidenciaSuficiente(v)) {
    throw new Error(`${donde}: ${v.verdict} no llega al suelo de evidencia`)
  }
  for (const [i, ev] of (v.evidence ?? []).entries()) {
    const at = `${donde}.evidence[${i}]`
    if (!KINDS_DE_LA_SUBIDA.includes(ev?.kind)) {
      throw new Error(
        `${at}: una subida firmada cita un contrato o una convocatoria de la BDNS, no ${String(ev?.kind)}`,
      )
    }
    if (typeof ev.ref !== 'string' || !/^https?:\/\//.test(ev.ref)) {
      throw new Error(`${at}: el registro citado se nombra por su enlace público`)
    }
    if (typeof ev.snippet !== 'string' || ev.snippet.trim() === '') {
      throw new Error(`${at}: la fila describe el registro que cita`)
    }
    if ('similarity' in ev) {
      throw new Error(
        `${at}: lleva una puntuación de parecido, y un registro que elige una persona no la tiene: ` +
          'la tarjeta la imprimiría como si la hubiera',
      )
    }
  }
  const delRegistro = corpusDeEvidencia(v.evidence)
  const anotados = Array.isArray(v.checkedAgainst) ? v.checkedAgainst : []
  if (anotados.length !== delRegistro.length || anotados.some((c, i) => c !== delRegistro[i])) {
    throw new Error(
      `${donde}: checkedAgainst (${anotados.join(', ') || '—'}) tiene que ser el corpus de los ` +
        `registros citados (${delRegistro.join(', ')}), ni uno más`,
    )
  }
  if (
    !Array.isArray(v.derivedBy) ||
    v.derivedBy.length !== 1 ||
    v.derivedBy[0] !== 'curator-upgrade'
  ) {
    throw new Error(`${donde}: derivedBy de una subida firmada es ['curator-upgrade']`)
  }
}

/**
 * Una retirada, escrita por la CLI o a mano: el validador no se fía de ninguna.
 * La puerta oculta lo que la lleva, así que el molde es estricto — sólo baja,
 * sólo la firma una persona y no vuelve a publicar el literal que retira.
 */
function validarRetirada(id: string, e: OverlayEntry): void {
  const donde = `[overlay] ${id}`
  if (e.source !== 'curator-downgrade') {
    throw new Error(
      `${donde}: sólo una bajada de curador retira una declaración (esta entrada es de ${e.source})`,
    )
  }
  if (e.verification.verdict !== 'sin-datos') {
    throw new Error(
      `${donde}: una declaración retirada queda en sin-datos, no en ${e.verification.verdict}: ` +
        'su veredicto se contrastó sobre una frase que no se dijo',
    )
  }
  const rechazo = rechazoDeFirma(e.editor ?? '')
  if (rechazo) throw new Error(`${donde}: una retirada la firma una persona: ${rechazo}`)
  const r = e.retirada as Partial<RetiradaDeDeclaracion> | null
  if (!r || !(MOTIVOS_DE_RETIRADA as readonly unknown[]).includes(r.motivo)) {
    throw new Error(
      `${donde}: motivo de retirada desconocido (${String(r?.motivo)}); los que hay: ` +
        MOTIVOS_DE_RETIRADA.join(', '),
    )
  }
  if (typeof r.literal !== 'string' || !HUELLA_DE_LITERAL_RETIRADO_RE.test(r.literal)) {
    throw new Error(
      `${donde}: la retirada guarda la huella del literal (literal retirado · sha256:<12 hex>), ` +
        'nunca su texto: el overlay se sirve',
    )
  }
}

const FECHA_ISO = /^\d{4}-\d{2}-\d{2}/

/**
 * Lo que una enmienda sustituye: en una bajada de curador, su motivo, que es
 * también el resumen que imprime la tarjeta; en una retractación del motor, la
 * explicación que publica, porque su `reason` es el registro de lo que decidió
 * el motor y no se reescribe a nombre de nadie.
 */
function textoEnmendable(e: Pick<OverlayEntry, 'source' | 'reason' | 'verification'>): string {
  return e.source === 'verdict-engine' ? (e.verification.summary ?? '') : (e.reason ?? '')
}

/**
 * Quién firmó la explicación que publica esta entrada, si la reescribió una
 * persona —la firma de su última enmienda—, o `null` si es la que escribió su
 * canal. Lo que firmó una persona no lo reescribe una pasada: lo miran el
 * overlay al escribir y el motor al elegir qué re-deriva, recorta o devuelve
 * (decision-del-motor.ts).
 */
export function explicacionFirmadaPor(
  e: Pick<OverlayEntry, 'reasonAmendments'> | null | undefined,
): string | null {
  const lista = e?.reasonAmendments
  const ultima = Array.isArray(lista) ? lista[lista.length - 1] : undefined
  return typeof ultima?.editor === 'string' ? ultima.editor : null
}

/**
 * Las enmiendas de una entrada, escritas a mano o por la CLI: el validador no
 * se fía de ninguna. Las mismas reglas que las de /hallazgos, más las que sólo
 * tiene el overlay: las lleva una bajada de curador —y la tarjeta imprime el
 * RESUMEN, así que tiene que ser el motivo enmendado— o, desde el 10-10-2026,
 * una retractación del motor en `sin-datos`, cuya explicación reescribió una
 * persona. En ésa lo enmendado es el resumen: su `reason` es el registro del
 * motor y no se toca.
 */
function validarEnmiendas(id: string, e: OverlayEntry): void {
  const donde = `[overlay] ${id}`
  const delMotor = e.source === 'verdict-engine'
  if (e.source !== 'curator-downgrade' && !delMotor) {
    throw new Error(
      `${donde}: sólo una bajada de curador o una retractación del motor lleva enmiendas ` +
        `(esta entrada es de ${e.source})`,
    )
  }
  if (delMotor && e.verification.verdict !== 'sin-datos') {
    throw new Error(
      `${donde}: una retractación del motor sólo lleva una explicación firmada en sin-datos ` +
        `(publica ${e.verification.verdict})`,
    )
  }
  const lista = e.reasonAmendments
  if (!Array.isArray(lista) || lista.length === 0) {
    throw new Error(`${donde}: reasonAmendments, si está, tiene que ser una lista no vacía`)
  }
  const desde = Date.parse(e.appliedAt)
  if (Number.isNaN(desde)) {
    throw new Error(`${donde}: appliedAt (${e.appliedAt}) no es una fecha con la que comparar`)
  }
  let previa = -Infinity
  lista.forEach((a, i) => {
    const at = `${donde}.reasonAmendments[${i}]`
    if (!a || typeof a !== 'object') throw new Error(`${at} tiene que ser un objeto`)
    if (typeof a.previous !== 'string' || !REASON_DIGEST_RE.test(a.previous)) {
      throw new Error(
        `${at}.previous tiene que ser la huella del motivo anterior (motivo · sha256:<12 hex>), nunca su texto`,
      )
    }
    if (typeof a.reason !== 'string' || a.reason.trim().length < 20) {
      throw new Error(`${at}.reason tiene que decir el porqué de la enmienda en ≥20 caracteres`)
    }
    const rechazo = rechazoDeFirma(a.editor)
    if (rechazo) throw new Error(`${at}.editor tiene que nombrar a una persona: ${rechazo}`)
    const cuando =
      typeof a.amendedAt === 'string' && FECHA_ISO.test(a.amendedAt)
        ? Date.parse(a.amendedAt)
        : Number.NaN
    if (Number.isNaN(cuando)) throw new Error(`${at}.amendedAt tiene que ser una fecha ISO`)
    if (cuando < desde) {
      throw new Error(
        `${at}.amendedAt (${a.amendedAt}) es anterior a la bajada que enmienda (${e.appliedAt})`,
      )
    }
    if (cuando < previa) {
      throw new Error(`${donde}: reasonAmendments no va en orden cronológico (la ${i} es anterior)`)
    }
    previa = cuando
  })
  if (lista[lista.length - 1].previous === reasonDigest(textoEnmendable(e))) {
    throw new Error(
      `${donde}: la última enmienda no cambió nada — su huella es la del motivo vigente`,
    )
  }
  if (!delMotor && e.verification.summary !== e.reason) {
    throw new Error(
      `${donde}: el resumen publicado no es el motivo enmendado, y la tarjeta imprime el resumen`,
    )
  }
}

/** Cómo empieza el rótulo de una retractación del motor: `verdict-engine:<quién>`. */
const PREFIJO_DEL_ROTULO = 'verdict-engine:'

/**
 * Las correcciones de rótulo de una entrada, escritas por la CLI o a mano: el
 * validador no se fía de ninguna. Sólo las lleva una retractación del motor;
 * cada una dice el rótulo anterior, el porqué, quién firma —una persona o la
 * cuenta de rol, nunca el hueco de una orden— y cuándo, en orden y no antes de
 * la retractación; la última cambió algo; y el motivo dice el mismo rótulo que
 * la entrada, porque los dos nombran a quien contestó y se corrigen juntos.
 */
function validarCorreccionesDeRotulo(id: string, e: OverlayEntry): void {
  const donde = `[overlay] ${id}`
  if (e.source !== 'verdict-engine') {
    throw new Error(
      `${donde}: sólo una retractación del motor lleva labelCorrections (esta entrada es de ${e.source})`,
    )
  }
  const lista = e.labelCorrections
  if (!Array.isArray(lista) || lista.length === 0) {
    throw new Error(`${donde}: labelCorrections, si está, tiene que ser una lista no vacía`)
  }
  const desde = Date.parse(e.appliedAt)
  let previa = -Infinity
  lista.forEach((c, i) => {
    const at = `${donde}.labelCorrections[${i}]`
    if (!c || typeof c !== 'object') throw new Error(`${at} tiene que ser un objeto`)
    if (typeof c.previous !== 'string' || !c.previous.startsWith(PREFIJO_DEL_ROTULO)) {
      throw new Error(`${at}.previous tiene que ser el rótulo anterior (${PREFIJO_DEL_ROTULO}…)`)
    }
    if (typeof c.reason !== 'string' || c.reason.trim().length < 20) {
      throw new Error(`${at}.reason tiene que decir el porqué en ≥20 caracteres`)
    }
    const hueco = rechazoDeMarcador(c.editor)
    if (hueco) throw new Error(`${at}.editor: ${hueco}`)
    const cuando =
      typeof c.correctedAt === 'string' && FECHA_ISO.test(c.correctedAt)
        ? Date.parse(c.correctedAt)
        : Number.NaN
    if (Number.isNaN(cuando)) throw new Error(`${at}.correctedAt tiene que ser una fecha ISO`)
    if (!Number.isNaN(desde) && cuando < desde) {
      throw new Error(
        `${at}.correctedAt (${c.correctedAt}) es anterior a la retractación que corrige (${e.appliedAt})`,
      )
    }
    if (cuando < previa) {
      throw new Error(`${donde}: labelCorrections no va en orden cronológico (la ${i} es anterior)`)
    }
    previa = cuando
  })
  if (lista[lista.length - 1].previous === e.editor) {
    throw new Error(
      `${donde}: la última corrección de rótulo no cambió nada — su rótulo anterior es el vigente`,
    )
  }
  const quien = e.editor?.startsWith(PREFIJO_DEL_ROTULO)
    ? e.editor.slice(PREFIJO_DEL_ROTULO.length)
    : null
  if (!quien || !(e.reason ?? '').startsWith(`verdict-engine (${quien}) `)) {
    throw new Error(
      `${donde}: el motivo no dice el mismo rótulo que la entrada (${e.editor ?? '—'}); los dos ` +
        'nombran a quien contestó y se corrigen juntos',
    )
  }
}

/**
 * Add/overwrite overlay entries (pure — returns a new Overlay, input untouched).
 * `curator-downgrade` entries are gated: reason ≥20 chars AND the move must be a
 * real downgrade vs the base verdict (`baseVerdict` lookup required).
 * `curator-upgrade` entries —the raise a person signs— need a person's
 * signature, a `desde` equal to the published verdict (`baseVerdict`), and a
 * move that would be a downgrade back (src/scraper/subida-firmada.ts).
 */
export function applyOverlayEntries(
  overlay: Overlay,
  entries: ApplyEntry[],
  stampIso: string,
  baseVerdict?: Map<string, ClaimVerdict>,
): Overlay {
  const next: Overlay = {
    version: overlay?.version ?? 1,
    generatedAt: stampIso,
    entries: { ...(overlay?.entries ?? {}) },
  }
  for (const e of entries) {
    // Una sugerencia de la cola humana no es una decisión: no entra.
    if (esperaFirma(e)) {
      throw new Error(
        `[overlay] ${e.claimId}: lleva requiresHumanApproval — es una sugerencia que espera la ` +
          'firma de una persona, no una decisión. Lo publicado no se escribe desde la cola.',
      )
    }
    // El suelo, antes que nada y para toda fuente automática.
    //
    // Va en la ESCRITURA y no en `validateOverlay`, que corre en cada lectura:
    // hacerlo estallar allí rompería la tubería entera por las 87 filas que ya
    // están. Lo que ya está lo saca `check:veredictos`; lo nuevo no llega a
    // escribirse.
    //
    // `curator-downgrade` queda exento a propósito: ya está limitado a bajar
    // por `isDowngrade`, y bajar nunca refuerza una afirmación. Obligar a un
    // curador a irse hasta `sin-datos` cuando lo que quiere decir es «esto sólo
    // es parcial» le haría retractar de más.
    if (e.source !== 'curator-downgrade' && !evidenciaSuficiente(e.verification)) {
      throw new Error(
        `[overlay] ${e.claimId}: ${e.verification.verdict} no llega al suelo de evidencia — ` +
          'no nombra ningún corpus real o no trae evidencia. Un veredicto fuerte afirma que ' +
          'algo lo respalda; si no lo hay, el veredicto es sin-datos.',
      )
    }
    // La charla de la tarea, también en la ESCRITURA y para toda fuente: el
    // resumen se pinta bajo la cita del concejal. Lo que ya está lo retira la
    // tarjeta (src/lib/resumenes-retirados.js); lo nuevo no llega a escribirse.
    const charla = charlaDeTarea(e.verification.summary)
    if (charla) {
      throw new Error(
        `[overlay] ${e.claimId}: el resumen habla de la tarea del modelo (${charla}), no de la ` +
          'declaración, y se publicaría bajo la cita. Un parte del encargo no es un juicio.',
      )
    }
    // El trinquete declarado, aplicado (src/scraper/trinquete.ts). Va después
    // del suelo y de la charla para que cada prueba mida la regla que nombra.
    const etapa = TRINQUETE[e.source]
    if (etapa?.retirada) {
      throw new Error(
        `[overlay] ${e.claimId}: «${e.source}» (${etapa.nombre}) está retirada — sus veredictos ` +
          'publicados se declaran, pero no escribe entradas nuevas.',
      )
    }
    if (etapa?.exigeFirma && !etapa.firmaEnLaEntrada) {
      throw new Error(
        `[overlay] ${e.claimId}: «${e.source}» (${etapa.nombre}) sólo propone — lo que propone ` +
          'lo firma una persona antes de publicarse, y su sitio es la cola humana. Lo automático ' +
          'sólo baja (docs/DATA_INTEGRITY.md, regla 4).',
      )
    }
    // La etapa de la persona: su firma viaja en la entrada, y sin ella no hay
    // entrada. Antes que nada de lo que sigue, para que la negativa diga lo que
    // falta de verdad.
    if (etapa?.exigeFirma && etapa.firmaEnLaEntrada) {
      const rechazo = rechazoDeFirma(e.editor ?? '')
      if (rechazo) {
        throw new Error(
          `[overlay] ${e.claimId}: «${e.source}» (${etapa.nombre}) la firma una persona, con su ` +
            `nombre: ${rechazo}`,
        )
      }
    }
    if (etapa && !etapa.puedeEmitir.includes(e.verification.verdict)) {
      throw new Error(
        `[overlay] ${e.claimId}: «${e.source}» (${etapa.nombre}) no puede emitir ` +
          `${e.verification.verdict}; sólo puede emitir ${etapa.puedeEmitir.join(', ')}.`,
      )
    }
    // Lo que el overlay ya dice de esta declaración no lo sube ninguna
    // escritura. Una retractación —del motor o de un curador— se hizo a
    // propósito, y ninguna vía de este fichero la deshace hacia arriba: ni una
    // pasada ni una «bajada» medida contra la base en vez de contra lo
    // publicado (las CLIs miden contra lo publicado; aquí no se fía del mapa que
    // le pasen, porque la entrada que hay la tiene delante). Se mira también lo
    // escrito antes en esta misma llamada.
    const previa = next.entries[e.claimId]
    // Una retirada tampoco la pisa nadie, ni con el mismo `sin-datos`: la
    // entrada nueva la sustituiría entera, se llevaría la marca y la
    // declaración volvería a publicarse. Eso es subir la visibilidad, y lo
    // haría quien no escuchó nada.
    if (previa?.retirada) {
      throw new Error(
        `[overlay] ${e.claimId}: la declaración está retirada (${previa.retirada.motivo}, ` +
          `firma ${previa.editor ?? '—'}); «${e.source}» la sustituiría y la volvería a publicar. ` +
          'Una retirada no la deshace ninguna escritura del overlay.',
      )
    }
    // Lo que firmó una persona no lo pisa una pasada: una subida firmada sólo la
    // sustituye otra persona, bajándola por la vía del curador o subiéndola otra
    // vez con su firma. El motor ya no la elegiría —ver la cabecera de
    // verify-pleno-claims-engine.ts—; esto lo sostiene si otro llamante lo hiciera.
    if (
      previa &&
      TRINQUETE[previa.source]?.firmaEnLaEntrada &&
      e.source !== 'curator-downgrade' &&
      !etapa?.firmaEnLaEntrada
    ) {
      throw new Error(
        `[overlay] ${e.claimId}: «${e.source}» sustituiría la subida que firmó ` +
          `${previa.editor ?? '—'}. Lo que firmó una persona sólo lo deshace una persona: ` +
          '`npm run subir-veredicto -- --retirar` o `npm run downgrade-verdict`.',
      )
    }
    // Tampoco la explicación que reescribió una persona: el motivo enmendado de
    // una bajada o la explicación firmada de una retractación del motor. Una
    // re-derivación la sustituiría entera con el razonamiento de una máquina.
    // Sólo la cambia otra persona: otra enmienda, otra bajada, una subida
    // firmada o una retirada.
    const firmoLaExplicacion = explicacionFirmadaPor(previa)
    if (firmoLaExplicacion && e.source !== 'curator-downgrade' && !etapa?.firmaEnLaEntrada) {
      throw new Error(
        `[overlay] ${e.claimId}: «${e.source}» sustituiría la explicación que firmó ` +
          `${firmoLaExplicacion}. Lo que firmó una persona sólo lo cambia una persona: otra ` +
          'enmienda (`npm run downgrade-verdict -- --amend-reason`), una subida firmada o una retirada.',
      )
    }
    if (
      previa &&
      esSubida(previa.verification.verdict, e.verification.verdict) &&
      !etapa?.firmaEnLaEntrada
    ) {
      const etapaPrevia = TRINQUETE[previa.source]
      const retractacion = etapaPrevia?.direccion === 'baja' ? ', una retractación' : ''
      throw new Error(
        `[overlay] ${e.claimId}: «${e.source}» subiría ${previa.verification.verdict} → ` +
          `${e.verification.verdict} sobre la entrada de «${previa.source}»${retractacion}. ` +
          'Una escritura del overlay no sube lo que el overlay ya dice: lo que bajó una ' +
          'retractación sólo lo vuelve a subir una persona, con su nombre: ' +
          '`npm run subir-veredicto`.',
      )
    }
    if (e.source === 'curator-downgrade') {
      if (!e.reason || e.reason.trim().length < 20) {
        throw new Error(
          `[overlay] ${e.claimId}: curator-downgrade needs a reason of at least 20 chars`,
        )
      }
      const from = baseVerdict?.get(e.claimId)
      if (!from) throw new Error(`[overlay] ${e.claimId}: not found in base — cannot downgrade`)
      if (!isDowngrade(from, e.verification.verdict)) {
        throw new Error(
          `[overlay] ${e.claimId}: ${from} → ${e.verification.verdict} is not a downgrade`,
        )
      }
    }
    if (e.source === 'verdict-engine') {
      // Re-derivation by the local engine. Downgrade-only policy is enforced by
      // the runner (vs the current published verdict); here we guard the
      // invariants: a grounded reason, and never contradicho.
      if (!e.reason || e.reason.trim().length < 20) {
        throw new Error(
          `[overlay] ${e.claimId}: verdict-engine needs a reason of at least 20 chars`,
        )
      }
      if (e.verification.verdict === 'contradicho') {
        throw new Error(`[overlay] ${e.claimId}: verdict-engine may never emit contradicho`)
      }
    }
    if (etapa?.firmaEnLaEntrada) {
      // La subida firmada, contra lo que se publica hoy: la CLI pasa el
      // veredicto publicado, y la entrada que sustituye lo tiene delante. Las
      // reglas que no necesitan ni lo uno ni lo otro las vuelve a mirar
      // `validateOverlay` al final.
      const publicado = baseVerdict?.get(e.claimId)
      if (!publicado) {
        throw new Error(
          `[overlay] ${e.claimId}: no se sabe qué publica la declaración, y sin eso no se sabe qué sube`,
        )
      }
      if (e.desde !== publicado) {
        throw new Error(
          `[overlay] ${e.claimId}: desde (${String(e.desde)}) no es lo publicado (${publicado}): ` +
            'la subida se preparó para otro estado',
        )
      }
      if (previa && previa.verification.verdict !== e.desde) {
        throw new Error(
          `[overlay] ${e.claimId}: la entrada que sustituye publica ${previa.verification.verdict}, ` +
            `no ${e.desde}`,
        )
      }
      if (!isDowngrade(e.verification.verdict, e.desde)) {
        throw new Error(
          `[overlay] ${e.claimId}: ${e.desde} → ${e.verification.verdict} no es una subida: ` +
            'volver al veredicto de antes tendría que ser una bajada',
        )
      }
    }
    next.entries[e.claimId] = {
      verification: e.verification,
      source: e.source,
      ...(e.reason ? { reason: e.reason } : {}),
      ...(e.editor ? { editor: e.editor } : {}),
      appliedAt: stampIso,
      ...(etapa?.firmaEnLaEntrada && e.desde ? { desde: e.desde } : {}),
    }
  }
  validateOverlay(next)
  return next
}

/** Lo que pide una orden `downgrade-verdict --amend-reason`. */
export interface EnmiendaPedida {
  claimId: string
  /** El veredicto que la orden espera encontrar. No se mueve. */
  veredicto: ClaimVerdict
  /** El motivo nuevo: lo que la tarjeta imprimirá bajo la cita. */
  motivo: string
  /** Por qué se enmienda (≥20 caracteres). */
  porque: string
  /** Una persona, con su nombre (`firma-de-persona.ts`). */
  editor: string
  /**
   * Textos de una máquina sobre esta declaración —el resumen de la base, la
   * propuesta de NLI…— que la persona no puede firmar como suyos. Los pasa la
   * CLI; lo que ya escribió el canal de la entrada lo mira la función.
   */
  resumenesDeMaquina?: readonly string[]
}

/**
 * ── La enmienda del motivo de una bajada ────────────────────────────────────
 *
 * El motivo de una bajada de curador es también el resumen que `ClaimLedger`
 * imprime bajo la cita. Las 40 bajadas del 24-06-2026 (`ai-gold-review`) lo
 * guardan en inglés y con jerga, y hasta el 29-09-2026 ninguna vía podía
 * cambiarlo: `downgrade-verdict` sólo baja, y bajar al mismo veredicto no es
 * una bajada. Volver a escribir la entrada entera, además, pondría la firma y
 * la fecha de hoy a una decisión de junio.
 *
 * La vía de #183 para /hallazgos, aplicada aquí: la enmienda vive en la entrada
 * —que conserva veredicto, evidencia, `editor` y `appliedAt` de la bajada—, con
 * la huella del motivo anterior (`reasonDigest`, nunca su texto: el repositorio
 * es público y el commit anterior lo guarda), el porqué, la firma de una
 * persona y la fecha. Una bajada NUEVA sobre la misma declaración reemplaza la
 * entrada entera, enmiendas incluidas: es otra decisión, con su propio motivo.
 *
 * ── Y la explicación de una retractación del motor (10-10-2026) ─────────────
 *
 * Una retractación del motor publica bajo la cita lo que razonó el motor, y en
 * cuatro de la corrida del 02-08-2026 —19gax3o-143, 1sqj7is-081, ma87e0-195 y
 * qz6weg-184— era un parte sobre su tarea: la tarjeta dice «Explicación
 * retirada» (src/lib/resumenes-retirados.js). La lectura del 06-10-2026 dejó
 * escrita la de cada una desde los registros, y ninguna vía podía publicarla.
 *
 * La misma enmienda, en la entrada del motor, con una diferencia: lo que se
 * enmienda es la explicación que se publica (`verification.summary`). El
 * `reason` —«verdict-engine (…) re-judged …»—, el rótulo, la fecha y las
 * correcciones de rótulo se quedan: la decisión sigue siendo del motor, y
 * escribir ahí las palabras de una persona se las atribuiría a él. Sólo en
 * `sin-datos`, el único veredicto que emite el motor.
 *
 * En las dos, la explicación nueva no puede ser el texto de una máquina
 * (`esTextoDeMaquina`): ni lo que ya escribió el canal de la entrada si no lo
 * firmó una persona, ni lo que pase la CLI. Diseño y decisiones del operador:
 * docs/superpowers/specs/2026-10-10-explicacion-firmada-design.md.
 *
 * Puro: devuelve un overlay nuevo y la huella del texto sustituido.
 */
export function enmendarMotivoDeBajada(
  overlay: Overlay,
  pedida: EnmiendaPedida,
  stampIso: string,
): { overlay: Overlay; previous: string } {
  const { claimId } = pedida
  const donde = `[overlay] ${claimId}`
  const e = overlay?.entries?.[claimId]
  if (!e) throw new Error(`${donde}: no hay ninguna bajada en el overlay, ni motivo que enmendar`)
  const delMotor = e.source === 'verdict-engine'
  if (e.source !== 'curator-downgrade' && !delMotor) {
    throw new Error(
      `${donde}: la entrada es de ${e.source}; sólo se enmienda el motivo de una bajada de ` +
        'curador o la explicación de una retractación del motor',
    )
  }
  if (e.verification.verdict !== pedida.veredicto) {
    throw new Error(
      `${donde}: la bajada publica ${e.verification.verdict}, no ${pedida.veredicto}: la orden se preparó para otro estado`,
    )
  }
  if (delMotor && e.verification.verdict !== 'sin-datos') {
    throw new Error(
      `${donde}: una retractación del motor sólo se explica en sin-datos, y ésta publica ` +
        e.verification.verdict,
    )
  }
  const rechazo = rechazoDeFirma(pedida.editor)
  if (rechazo) {
    throw new Error(
      `${donde}: una enmienda de motivo la firma una persona, con su nombre: ${rechazo}`,
    )
  }
  if (!delMotor && e.verification.summary !== e.reason) {
    throw new Error(
      `${donde}: la bajada publica un resumen distinto de su motivo, y no se sabría cuál se enmienda`,
    )
  }
  const vigente = textoEnmendable(e)
  const motivo = (pedida.motivo ?? '').trim()
  if (motivo.length < 20) {
    throw new Error(
      `${donde}: el motivo nuevo tiene que tener ≥20 caracteres, como cualquier motivo`,
    )
  }
  if (motivo === vigente.trim()) {
    throw new Error(
      `${donde}: el motivo ya es ese texto; una enmienda que no cambia nada no se registra`,
    )
  }
  const charla = charlaDeTarea(motivo)
  if (charla) {
    throw new Error(
      `${donde}: el motivo nuevo habla de la tarea del modelo (${charla}), no de la declaración`,
    )
  }
  // Lo que ya escribió el canal de la entrada, mientras no lo haya reescrito una
  // persona: el razonamiento del motor —y su `reason`, que lo repite—, o el
  // motivo de una bajada que firmó un proceso.
  const firmado = explicacionFirmadaPor(e) !== null
  const deMaquina = [
    ...(!firmado && claseDeFirma(e.editor) !== 'persona' ? [vigente] : []),
    ...(delMotor ? [e.reason ?? ''] : []),
    ...(pedida.resumenesDeMaquina ?? []),
  ]
  if (esTextoDeMaquina(motivo, deMaquina)) {
    throw new Error(
      `${donde}: el motivo nuevo es el texto de una máquina tal cual. Lo escribe quien firma, ` +
        'desde los registros que leyó.',
    )
  }
  const porque = (pedida.porque ?? '').trim()
  if (porque.length < 20) {
    throw new Error(`${donde}: el porqué de la enmienda tiene que tener ≥20 caracteres`)
  }
  const cuando = FECHA_ISO.test(stampIso) ? Date.parse(stampIso) : Number.NaN
  if (Number.isNaN(cuando)) {
    throw new Error(`${donde}: la fecha de la enmienda tiene que ser ISO («${stampIso}»)`)
  }
  if (cuando < Date.parse(e.appliedAt)) {
    throw new Error(
      `${donde}: la enmienda (${stampIso}) no puede ser anterior a la bajada que enmienda (${e.appliedAt})`,
    )
  }
  const anteriores = e.reasonAmendments ?? []
  const ultima = anteriores[anteriores.length - 1]
  if (ultima && cuando < Date.parse(ultima.amendedAt)) {
    throw new Error(
      `${donde}: la enmienda (${stampIso}) no puede ser anterior a la última enmienda (${ultima.amendedAt})`,
    )
  }

  const previous = reasonDigest(vigente)
  const reasonAmendments = [
    ...anteriores,
    {
      previous,
      reason: porque,
      editor: pedida.editor.normalize('NFC').replace(/\s+/g, ' ').trim(),
      amendedAt: stampIso,
    },
  ]
  const entrada: OverlayEntry = delMotor
    ? // Todo lo que decidió el motor se queda, en su sitio: la enmienda va al
      // final, y el overlay comiteado no se reordena.
      { ...e, verification: { ...e.verification, summary: motivo }, reasonAmendments }
    : {
        verification: { ...e.verification, summary: motivo },
        source: e.source,
        reason: motivo,
        ...(e.editor ? { editor: e.editor } : {}),
        appliedAt: e.appliedAt,
        // Enmendar el motivo no deshace la retirada: sin esto, reescribir la
        // explicación volvería a publicar la declaración.
        ...(e.retirada ? { retirada: e.retirada } : {}),
        reasonAmendments,
      }
  const next: Overlay = {
    version: overlay.version,
    generatedAt: stampIso,
    entries: { ...overlay.entries, [claimId]: entrada },
  }
  validateOverlay(next)
  return { overlay: next, previous }
}

/** Lo que pide una orden `downgrade-verdict --literal-no-dicho`. */
export interface RetiradaPedida {
  claimId: string
  /** El literal publicado, el que escuchó quien firma. Se guarda su huella. */
  literal: string
  /** Qué se oye y dónde (≥20 caracteres). Es el resumen de la entrada. */
  motivo: string
  /** Una persona, con su nombre (`firma-de-persona.ts`). */
  editor: string
}

/**
 * La huella de un literal retirado: la receta de las huellas de
 * pleno-finding.ts —`sha256Short` del texto serializado en JSON, tras una
 * etiqueta que dice qué era—, para que un auditor rehaga todas con la misma
 * herramienta.
 */
export function huellaDeLiteralRetirado(texto: string): string {
  return `literal retirado · sha256:${sha256Short(JSON.stringify(texto))}`
}

/**
 * ── La retirada de una declaración ──────────────────────────────────────────
 *
 * Cuando una persona escucha la sesión y el literal no es lo que se dijo —el
 * motor sustituido llegó a oír un año donde se dijo un importe—, la declaración
 * deja de publicarse. La entrada es una bajada de curador a `sin-datos` con la
 * marca `retirada`, que la puerta lee (declaracion-retirada.ts, donde está el
 * caso que lo trajo):
 *
 *   · `sin-datos` y sin evidencia, venga de donde venga: el veredicto que tenía
 *     se contrastó sobre una frase que nadie pronunció;
 *   · no pasa por `isDowngrade`, porque no baja un veredicto sino la
 *     visibilidad: una declaración ya en `sin-datos` también se retira;
 *   · la firma una persona, con su nombre; y
 *   · no vuelve a publicar lo que retira: guarda la huella del literal y se
 *     niega a un motivo que lo cite (una ventana de seis palabras, la medida
 *     con la que el dosier del 29-09 comprobó sus sumarios).
 *
 * Sustituye la entrada que hubiera —su motivo y su firma quedan en el
 * historial del repositorio—, y ninguna escritura posterior la pisa
 * (`applyOverlayEntries`). Puro: devuelve un overlay nuevo.
 */
export function retirarDeclaracion(
  overlay: Overlay,
  pedida: RetiradaPedida,
  stampIso: string,
): Overlay {
  const { claimId } = pedida
  const donde = `[overlay] ${claimId}`
  const rechazo = rechazoDeFirma(pedida.editor)
  if (rechazo) {
    throw new Error(`${donde}: una retirada la firma una persona, con su nombre: ${rechazo}`)
  }
  const literal = (pedida.literal ?? '').trim()
  if (!literal) throw new Error(`${donde}: no hay literal que retirar`)
  const motivo = (pedida.motivo ?? '').trim()
  if (motivo.length < 20) {
    throw new Error(`${donde}: el motivo de una retirada tiene que tener ≥20 caracteres`)
  }
  const charla = charlaDeTarea(motivo)
  if (charla) {
    throw new Error(
      `${donde}: el motivo habla de la tarea del modelo (${charla}), no de la declaración`,
    )
  }
  if (quoteAppearsIn(literal, motivo, 6)) {
    throw new Error(
      `${donde}: el motivo vuelve a imprimir el literal que se retira, y el overlay se sirve: ` +
        'di qué se oye y dónde sin citarlo',
    )
  }
  const previa = overlay?.entries?.[claimId]
  if (previa?.retirada) {
    throw new Error(
      `${donde}: ya está retirada (firma ${previa.editor ?? '—'}, ${previa.appliedAt})`,
    )
  }
  if (!FECHA_ISO.test(stampIso) || Number.isNaN(Date.parse(stampIso))) {
    throw new Error(`${donde}: la fecha de la retirada tiene que ser ISO («${stampIso}»)`)
  }

  const entrada: OverlayEntry = {
    verification: verificacionDeBajada(claimId, { evidence: [] }, 'sin-datos', motivo),
    source: 'curator-downgrade',
    reason: motivo,
    editor: pedida.editor.normalize('NFC').replace(/\s+/g, ' ').trim(),
    appliedAt: stampIso,
    retirada: { motivo: 'literal-no-dicho', literal: huellaDeLiteralRetirado(literal) },
  }
  const next: Overlay = {
    version: overlay?.version ?? 1,
    generatedAt: stampIso,
    entries: { ...(overlay?.entries ?? {}), [claimId]: entrada },
  }
  validateOverlay(next)
  return next
}

/**
 * Throws on a malformed reclassification sidecar (called on every write AND on
 * every read by the rebuild loader — defence in depth, like `validateOverlay`).
 * The one rule with legal weight is wired here where no caller can skip it:
 * a reclassification may never point TOWARD `acusacion_publica`. Raising a
 * statement into an accusation is libel-increasing, the exact move the overlay
 * forbids for verdicts with `isDowngrade`.
 */
export function validateReclassifications(r: Reclassifications): void {
  if (!r || typeof r.version !== 'number' || !r.entries || typeof r.entries !== 'object') {
    throw new Error('[reclas] malformed: missing version/entries')
  }
  for (const [id, e] of Object.entries(r.entries)) {
    if (!e || typeof e !== 'object') throw new Error(`[reclas] ${id}: entry not an object`)
    if (!ALLOWED_CLAIM_TYPES.includes(e.type)) {
      throw new Error(`[reclas] ${id}: type ${String(e.type)} is outside ClaimType`)
    }
    if (e.type === 'acusacion_publica') {
      throw new Error(`[reclas] ${id}: reclassifying TOWARD acusacion_publica is forbidden`)
    }
    if (!ALLOWED_CLAIM_TYPES.includes(e.from)) {
      throw new Error(`[reclas] ${id}: from ${String(e.from)} is outside ClaimType`)
    }
    // Política v1, espejada también en la LECTURA para que un sidecar editado a
    // mano no pueda mover lo que el CLI no movería: sólo se corrige DESDE
    // acusacion_publica (la clase de fallo observada). Ampliar este validador
    // ES el acto deliberado de ampliar la política, con su PR y su porqué.
    if (e.from !== 'acusacion_publica') {
      throw new Error(
        `[reclas] ${id}: from ${String(e.from)} — v1 only moves away from acusacion_publica`,
      )
    }
    if (!e.reason || e.reason.trim().length < 20) {
      throw new Error(`[reclas] ${id}: needs a reason of at least 20 chars`)
    }
    if (typeof e.appliedAt !== 'string') throw new Error(`[reclas] ${id}: missing appliedAt`)
  }
}

export interface ApplyReclassification {
  claimId: string
  type: ClaimType
  reason: string
  editor?: string
}

/**
 * Add/overwrite reclassification entries (pure — returns a new sidecar, input
 * untouched). Gated against the PUBLISHED corpus the caller passes in: the
 * claim must exist, and v1 only moves AWAY from `acusacion_publica` — the one
 * observed failure class (the extractor shoehorns debate speech into the
 * accusation bucket). Widen when a real case of another wrong type shows up.
 */
export function applyReclassificationEntries(
  reclassifications: Reclassifications,
  entries: ApplyReclassification[],
  stampIso: string,
  publishedTypes: Map<string, ClaimType>,
): Reclassifications {
  const next: Reclassifications = {
    version: reclassifications?.version ?? 1,
    generatedAt: stampIso,
    entries: { ...(reclassifications?.entries ?? {}) },
  }
  for (const e of entries) {
    if (!e.reason || e.reason.trim().length < 20) {
      throw new Error(`[reclas] ${e.claimId}: needs a reason of at least 20 chars`)
    }
    if (e.type === 'acusacion_publica') {
      throw new Error(`[reclas] ${e.claimId}: reclassifying TOWARD acusacion_publica is forbidden`)
    }
    if (!ALLOWED_CLAIM_TYPES.includes(e.type)) {
      throw new Error(`[reclas] ${e.claimId}: type ${String(e.type)} is outside ClaimType`)
    }
    const from = publishedTypes.get(e.claimId)
    if (!from) throw new Error(`[reclas] ${e.claimId}: not found in the published corpus`)
    if (from !== 'acusacion_publica') {
      throw new Error(
        `[reclas] ${e.claimId}: published type is ${from} — v1 only moves away from acusacion_publica`,
      )
    }
    next.entries[e.claimId] = {
      type: e.type,
      from,
      reason: e.reason,
      ...(e.editor ? { editor: e.editor } : {}),
      appliedAt: stampIso,
    }
  }
  validateReclassifications(next)
  return next
}

// ─── El sello de la composición ─────────────────────────────────────────────
//
// `verified-rebuild.ts` conserva a propósito el `generatedAt` del base al
// componer, para que una migración que siembre el base desde el publicado dé
// la vuelta byte a byte. Ese detalle convierte los dos sellos en un invariante
// comprobable: si no coinciden, lo publicado NO es la composición del base que
// hay en disco.
//
// El desajuste no es una avería. La nocturna y `scrape-all.sh` corren
// `verify:pleno-claims -- --base-only` a propósito —CI necesita que el fichero
// exista, no republicar—, porque republicar un veredicto es un acto humano y
// nada automático debe subir una afirmación publicada. Lo que faltaba era el
// aviso de que esa cola existe: el base avanzó el 24 de agosto y lo publicado
// se quedó en el 18 sin que nada lo dijera en ningún sitio.
//
// Cuatro desenlaces y no dos, por lo mismo que en `check:eficiencia-findings`:
// con dos, el caso normal —el base avanzó, falta republicar— saldría rojo cada
// noche, y una guarda que grita cuando no pasa nada acaba apagada.

/** Los cuatro desenlaces del cotejo. Se exporta; nadie lo recita. */
export const ESTADOS_COMPOSE = [
  'coincide',
  'pendiente-de-republicar',
  'contradice',
  'sin-base',
] as const

export type EstadoCompose = (typeof ESTADOS_COMPOSE)[number]

export interface CotejoCompose {
  estado: EstadoCompose
  baseGeneratedAt: string | null
  publicadoGeneratedAt: string | null
  /** Qué mirar. `null` sólo cuando coincide. */
  motivo: string | null
}

/** Milisegundos de un sello ISO, o `null` si no se deja leer. */
function selloMs(iso: string | null): number | null {
  if (typeof iso !== 'string' || !iso) return null
  const ms = Date.parse(iso)
  return Number.isNaN(ms) ? null : ms
}

/**
 * Coteja el sello de lo publicado contra el del base del que debería salir.
 *
 * Puro: el llamante lee los ficheros y pasa los dos sellos, y pasa `null` por
 * el base cuando no está —está gitignorado, así que un clon recién hecho no lo
 * tiene—. Ese caso sale como `sin-base`, que es SALTADO y jamás un visto
 * bueno: una guarda que no pudo comprobar nada tiene que decirlo en vez de
 * imprimir su propio todo-en-orden.
 */
export function cotejarCompose(input: {
  baseGeneratedAt: string | null
  publicadoGeneratedAt: string | null
}): CotejoCompose {
  const { baseGeneratedAt, publicadoGeneratedAt } = input
  const con = (estado: EstadoCompose, motivo: string | null): CotejoCompose => ({
    estado,
    baseGeneratedAt,
    publicadoGeneratedAt,
    motivo,
  })

  // Sin base no hay nada contra lo que cotejar. Se dice, no se aprueba.
  if (baseGeneratedAt == null) {
    return con(
      'sin-base',
      'no hay base en disco (está gitignorado): no se ha podido cotejar. ' +
        'Reconstrúyelo con `npm run verify:pleno-claims -- --base-only`.',
    )
  }

  // El publicado SÍ está comiteado. Que falte es otra cosa, y es grave.
  if (publicadoGeneratedAt == null) {
    return con('contradice', 'falta pleno-claims-verified.json, que va comiteado')
  }

  const base = selloMs(baseGeneratedAt)
  const publicado = selloMs(publicadoGeneratedAt)
  if (base == null || publicado == null) {
    return con(
      'contradice',
      `sello ilegible (base ${String(baseGeneratedAt)}, publicado ${String(publicadoGeneratedAt)})`,
    )
  }

  if (base === publicado) return con('coincide', null)

  if (base > publicado) {
    return con(
      'pendiente-de-republicar',
      'el base avanzó y nadie ha republicado. Es lo normal —la nocturna corre ' +
        '`--base-only` a propósito— y republicar es un acto humano: corre ' +
        '`npm run verify:pleno-claims` (sin --base-only), REVISA la dirección de ' +
        'los cambios y comitea.',
    )
  }

  // Publicado más nuevo que su base es imposible por construcción: el rebuild
  // copia el sello del base. Si pasa, alguien escribió el publicado a mano o el
  // base se regeneró hacia atrás.
  return con(
    'contradice',
    'lo publicado es MÁS NUEVO que su base, y el rebuild copia el sello del base: ' +
      'o se editó a mano o el base retrocedió',
  )
}

// ─── El cuarto estrato: el literal ──────────────────────────────────────────
//
// El overlay manda sobre los VEREDICTOS, las reclasificaciones sobre el TIPO, y
// este sidecar sobre el único campo que dice QUÉ dijo alguien: `verbatim`.
//
// Nace de lo que `check:claim-provenance` lleva contando desde el 3-09-2026 y
// la puerta de `claim-public-gate.ts` acabó reteniendo: siete declaraciones
// publicadas cuyo literal no aparece en ninguna transcripción que tengamos.
// Cuatro de las siete NO son citas inventadas. Medido el 4-09-2026 contra los
// textos, con lo publicado a la izquierda y el acta a la derecha:
//
//   10yl550-265  «…en el año 2026, hemos comprobado»  «…en el año 2026, AÑO DE
//                                                      FERIA, hemos comprobado»
//   k4olcs-096   «se APROBÓ unanimidad»               «se HA APROBADO unanimidad»
//   qz6weg-024   «ESA prolongación en el 2023 2024»   «ESTA prolongación…»
//   1tgd1h4-197  «INDICAR si se graban»               «INDICANDO si se graban»
//
// El extractor recorta y flexiona al citar. Eso no es una confabulación: es un
// literal mal anclado, y la diferencia decide qué se hace con él. Retirarlas
// para siempre le cobra al lector un fallo de nuestro extractor; dejarlas
// publicadas pone entre comillas unas palabras que nadie pronunció. Reanclarlas
// es la tercera salida, y la única que no miente en ninguna de las dos
// direcciones.
//
// Por qué un sidecar y no arreglar la base: re-extraer vuelve a acuñar los ids
// —el hash va sobre el prefijo del verbatim— y pierde la atribución de bloc,
// que no se puede reconstruir (los mapas de voces no existen). Es la misma
// razón por la que existen los otros dos estratos, aplicada al tercer campo.
//
// QUÉ IMPIDE QUE ESTO SEA UNA MÁQUINA DE REESCRIBIR CITAS
//
// Tres cosas, y sólo la última depende de que alguien se porte bien:
//
//  1. La puerta de publicación NO se fía de este fichero. `chunk-pleno-claims`
//     recalcula la procedencia contra las transcripciones en cada compilación,
//     así que un reanclaje que apunte a un texto que no existe deja la
//     declaración retenida igual que estaba. Un mal reanclaje no publica nada.
//  2. `from` fija el estado observado. Si la base cambia el literal por su
//     cuenta, la entrada queda OBSOLETA y se salta contada, en vez de aplicarse
//     sobre algo que el curador nunca juzgó.
//  3. `RETENCION_MINIMA` exige que el literal nuevo conserve las palabras con
//     contenido del viejo. No distingue un acierto de un casi-acierto —para eso
//     está la persona y su motivo—; impide la sustitución gruesa, que es
//     cambiar una cita por otro pasaje del mismo pleno.

/**
 * Cuánto del literal viejo sobrevive en el nuevo, medido en palabras con
 * contenido (0–1). Las vacías se descuentan por lo mismo que en
 * `quote-reanchor.ts`: «de la que en el» lo comparte cualquier par de frases.
 *
 * Se mide en esta dirección —viejo dentro de nuevo— porque lo que hay que
 * proteger es lo que ya está publicado: un reanclaje puede AÑADIR palabras que
 * el extractor se dejó (los cuatro casos reales lo hacen), pero no puede
 * llevarse por delante aquello de lo que la declaración hablaba.
 */
export function retencionLexica(from: string, verbatim: string): number {
  const viejas = new Set(contentWords(from))
  if (viejas.size === 0) return 1
  const nuevas = new Set(contentWords(verbatim))
  let vivas = 0
  for (const w of viejas) if (nuevas.has(w)) vivas += 1
  return vivas / viejas.size
}

/**
 * El suelo, y lo que NO es.
 *
 * Medido sobre los seis literales de este corpus que sí se pueden situar en un
 * acta: los cuatro reanclajes buenos dan 1,00 · 1,00 · 0,75 · 0,67 (las dos
 * cifras bajas son cambios de flexión —«aprobó»/«aprobado»,
 * «indicar»/«indicando»— que cuentan como palabra distinta), y las dos
 * soldaduras que un humano tiene que resolver dan 0,60 y 0,50.
 *
 * El corte NO va en el hueco entre 0,67 y 0,60: siete puntos de separación en
 * una muestra de seis casos no discriminan nada, y fingir que sí sería inventar
 * un umbral con aire de medición. Va en 0,6 porque ahí ataja la sustitución
 * GRUESA —reanclar sobre un pasaje distinto del mismo pleno, que cae cerca de
 * cero— y deja pasar lo que un curador tiene que mirar de todas formas. Quien
 * decide sigue siendo la persona que escribe el motivo; esto sólo se niega a
 * ser la vía por la que una cita se convierte en otra sin que nadie lo note.
 */
export const RETENCION_MINIMA = 0.6

/** El mínimo de `PlenoClaim.verbatim`, que este estrato no puede rebajar. */
const VERBATIM_MINIMO = 20

/**
 * Un reanclaje de curador. `from` guarda el literal publicado del que se movió:
 * la entrada corrige un estado OBSERVADO, igual que `ReclassificationEntry`.
 */
export interface ReanchorEntry {
  /** El literal corregido, tal y como consta en la transcripción. */
  verbatim: string
  /** El literal publicado del que se movió (rastro de auditoría). */
  from: string
  /** Dónde consta: `current` o el nombre del fichero en `superseded/`. */
  fuente: string
  /** Los motivos del curador, ≥20 caracteres. */
  reason: string
  editor?: string
  appliedAt: string
}

export interface Reanchors {
  version: number
  generatedAt: string
  entries: Record<string, ReanchorEntry>
}

/**
 * Revienta con un sidecar malformado. Se llama al ESCRIBIR y al LEER —igual que
 * sus dos hermanas— para que un fichero editado a mano no pueda mover lo que el
 * CLI no movería.
 */
export function validateReanchors(r: Reanchors): void {
  if (!r || typeof r.version !== 'number' || !r.entries || typeof r.entries !== 'object') {
    throw new Error('[reanchor] malformed: missing version/entries')
  }
  for (const [id, e] of Object.entries(r.entries)) {
    if (!e || typeof e !== 'object') throw new Error(`[reanchor] ${id}: entry not an object`)
    if (typeof e.verbatim !== 'string' || e.verbatim.trim().length < VERBATIM_MINIMO) {
      throw new Error(`[reanchor] ${id}: verbatim needs at least ${VERBATIM_MINIMO} chars`)
    }
    if (typeof e.from !== 'string' || e.from.length === 0) {
      throw new Error(`[reanchor] ${id}: missing from — nothing to detect staleness against`)
    }
    if (e.verbatim.trim() === e.from.trim()) {
      throw new Error(`[reanchor] ${id}: verbatim equals from — nothing is being re-anchored`)
    }
    if (typeof e.fuente !== 'string' || e.fuente.length === 0) {
      throw new Error(`[reanchor] ${id}: missing fuente — a re-anchor names the text it anchors to`)
    }
    if (!e.reason || e.reason.trim().length < 20) {
      throw new Error(`[reanchor] ${id}: needs a reason of at least 20 chars`)
    }
    if (typeof e.appliedAt !== 'string') throw new Error(`[reanchor] ${id}: missing appliedAt`)
    const retenido = retencionLexica(e.from, e.verbatim)
    if (retenido < RETENCION_MINIMA) {
      throw new Error(
        `[reanchor] ${id}: el literal nuevo sólo conserva ${(retenido * 100).toFixed(0)} % de las ` +
          `palabras con contenido del publicado (mínimo ${RETENCION_MINIMA * 100} %). ` +
          'Un reanclaje corrige cómo se citó una frase; esto sustituye una frase por otra.',
      )
    }
  }
}

/** Reancla un claim: literal reemplazado, todo lo demás —id incluido— intacto. */
function reanchoredClaim(claim: PlenoClaim, verbatim: string): PlenoClaim {
  return { ...claim, verbatim }
}

export interface ApplyReanchor {
  claimId: string
  verbatim: string
  fuente: string
  reason: string
  editor?: string
}

/**
 * Añade/reemplaza entradas de reanclaje (puro — devuelve un sidecar nuevo).
 *
 * Se juzga contra el corpus PUBLICADO que pasa el llamante, y hay una negativa
 * que no es obvia y sí es la importante: **un claim con bloc atribuido no se
 * reancla**. La atribución sale de `resolveBloc(raw.verbatim)` en el extractor,
 * o sea que está DERIVADA de las mismas palabras que el reanclaje sustituye;
 * moverlas dejaría un partido colgado de una frase que el mapa de voces nunca
 * emparejó. Quien quiera reanclar una de ésas retira antes la atribución con
 * `npm run retract-attribution`, que es el CLI que sí es dueño de ese campo, y
 * entonces vuelve. Hoy no le toca a ninguna de las siete retenidas —todas
 * llevan `speakerGroup: null`—, y por eso mismo conviene que esté escrito antes
 * de que le toque a alguna.
 */
export function applyReanchorEntries(
  reanchors: Reanchors,
  entries: ApplyReanchor[],
  stampIso: string,
  publicado: ReadonlyMap<string, { verbatim: string; speakerGroup: string | null }>,
): Reanchors {
  const next: Reanchors = {
    version: reanchors?.version ?? 1,
    generatedAt: stampIso,
    entries: { ...(reanchors?.entries ?? {}) },
  }
  for (const e of entries) {
    const actual = publicado.get(e.claimId)
    if (!actual) throw new Error(`[reanchor] ${e.claimId}: not found in the published corpus`)
    if (actual.speakerGroup) {
      throw new Error(
        `[reanchor] ${e.claimId}: la declaración está atribuida a ${actual.speakerGroup}, y esa ` +
          'atribución se resolvió sobre el literal que quieres sustituir. Retírala primero con ' +
          '`npm run retract-attribution` y vuelve.',
      )
    }
    next.entries[e.claimId] = {
      verbatim: e.verbatim,
      from: actual.verbatim,
      fuente: e.fuente,
      reason: e.reason,
      ...(e.editor ? { editor: e.editor } : {}),
      appliedAt: stampIso,
    }
  }
  validateReanchors(next)
  return next
}

/**
 * Qué hizo el merge con cada reanclaje: los tres desenlaces por separado, por lo
 * mismo que en `reclassificationOutcomes` — plegar «no encontrada» dentro de
 * «aplicada» es el verde hueco de la regla 2 de DATA_INTEGRITY.
 */
export function reanchorOutcomes(
  baseItems: VerifiedItem[],
  reanchors: Reanchors,
): { aplicadas: string[]; obsoletas: string[]; sinClaim: string[] } {
  const byId = new Map(baseItems.map((it) => [it.claim.id, it]))
  const aplicadas: string[] = []
  const obsoletas: string[] = []
  const sinClaim: string[] = []
  for (const [id, e] of Object.entries(reanchors?.entries ?? {})) {
    const item = byId.get(id)
    if (item == null) sinClaim.push(id)
    else if (item.claim.verbatim !== e.from) obsoletas.push(id)
    else aplicadas.push(id)
  }
  return { aplicadas, obsoletas, sinClaim }
}
