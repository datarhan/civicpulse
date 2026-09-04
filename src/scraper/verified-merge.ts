/**
 * Base/overlay merge for pleno-claims-verified.json (P2, fixes audit R4/B5).
 *
 * The deterministic pass writes `pleno-claims-verified-base.json`; second-pass
 * runners (NLI/LLM) and curator downgrades write `pleno-claims-overlay.json`.
 * The published `pleno-claims-verified.json` is the pure merge of the two, so a
 * deterministic re-run rebuilds the base and re-applies the overlay — it can no
 * longer clobber second-pass or curator decisions.
 *
 * Two more optional layers joined later, both curator sidecars for a field the
 * overlay deliberately cannot touch (it owns verdicts, not the claim):
 * `pleno-claim-reclassifications.json` for a claim whose TYPE the extractor got
 * wrong, and `pleno-claim-reanchors.json` for one whose VERBATIM it mis-quoted.
 * Same merge discipline in all cases: the base stays machine-reproducible, the
 * sidecar is committed and precious, and any rebuild re-applies it.
 *
 * Pure module — no fs, no Date (callers pass timestamps). See
 * docs/superpowers/specs/2026-06-23-factcheck-rebuild-p2-design.md.
 */
import { ALLOWED_CLAIM_TYPES, type ClaimType, type PlenoClaim } from './pleno-claim'
import type { ClaimVerdict, ClaimVerification, ClaimEvidence } from './claim-verifier'
import { corpusReales } from './claim-verdicts'
// El mismo descuento de palabras vacías que usa la cola de reanclaje de
// `/hallazgos`. Importado, no recitado: dos listas de stopwords que midieran
// distinto harían que el CLI aceptara lo que la cola desaconseja.
import { contentWords } from './quote-reanchor'

export interface VerifiedItem {
  claim: PlenoClaim
  verification: ClaimVerification
}

export type OverlaySource = 'nli' | 'llm' | 'curator-downgrade' | 'verdict-engine'

export interface OverlayEntry {
  verification: ClaimVerification
  source: OverlaySource
  /** Required (≥20 chars) for curator-downgrade AND verdict-engine entries. */
  reason?: string
  /** Curator name (curator-downgrade) or model id (verdict-engine). */
  editor?: string
  appliedAt: string
}

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
function withDedupedEvidence(v: ClaimVerification): ClaimVerification {
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
 * base items in their original order; for each, the overlay entry (matched by
 * claimId) replaces the verification when present, the reclassification entry
 * replaces the claim's type, and the reanchor entry replaces its verbatim. Both
 * sidecars apply only while the claim still shows the state they recorded in
 * `from` — a base that moved upstream makes the entry stale, not silently
 * re-applied to something the curator never judged. Entries whose claimId is
 * absent from base are dropped (the claim was removed upstream). Evidence is
 * deduped on the way out (base- AND overlay-origin), so the published monolith
 * + chunks never carry a citation twice.
 *
 * Los dos sidecars tocan campos distintos del mismo objeto y se COMPONEN: un
 * claim reclasificado y reanclado sale con las dos correcciones. Escribirlos
 * como un `else if` —que es como salió la primera versión— habría hecho que
 * aplicar el segundo deshiciera el primero en silencio.
 */
export function mergeVerified(
  baseItems: VerifiedItem[],
  overlay: Overlay,
  reclassifications?: Reclassifications,
  reanchors?: Reanchors,
): VerifiedItem[] {
  const entries = overlay?.entries ?? {}
  const reclas = reclassifications?.entries ?? {}
  const reanc = reanchors?.entries ?? {}
  return baseItems.map((it) => {
    const e = entries[it.claim.id]
    const verification = withDedupedEvidence(e ? e.verification : it.verification)
    const r = reclas[it.claim.id]
    let claim =
      r != null && it.claim.type === r.from ? reclassifiedClaim(it.claim, r.type) : it.claim
    const a = reanc[it.claim.id]
    // Contra `it.claim.verbatim`, no contra `claim.verbatim`: la reclasificación
    // no toca el literal, y comparar contra el intermedio ataría dos estratos
    // que son independientes a propósito.
    if (a != null && it.claim.verbatim === a.from) claim = reanchoredClaim(claim, a.verbatim)
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

export interface ApplyEntry {
  claimId: string
  verification: ClaimVerification
  source: OverlaySource
  reason?: string
  editor?: string
}

const VALID_SOURCES: OverlaySource[] = ['nli', 'llm', 'curator-downgrade', 'verdict-engine']

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
  }
}

/**
 * Add/overwrite overlay entries (pure — returns a new Overlay, input untouched).
 * `curator-downgrade` entries are gated: reason ≥20 chars AND the move must be a
 * real downgrade vs the base verdict (`baseVerdict` lookup required).
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
    next.entries[e.claimId] = {
      verification: e.verification,
      source: e.source,
      ...(e.reason ? { reason: e.reason } : {}),
      ...(e.editor ? { editor: e.editor } : {}),
      appliedAt: stampIso,
    }
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
