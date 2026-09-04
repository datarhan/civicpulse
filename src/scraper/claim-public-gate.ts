/**
 * The editorial gate for the PUBLIC pleno claim ledger — single source
 * of truth for what the machine-extracted verifier output may surface
 * to the public. Applied at build time (chunker) so `hidden` verbatim
 * never enters a deployed file, and again client-side as defense-in-depth.
 *
 * Policy (see
 * docs/superpowers/specs/2026-06-21-plenos-claim-ledger-editorial-gate-design.md):
 *   hidden  — any acusacion_publica that is opinativa OR not data-grounded;
 *             any machine-assigned `contradicho` (see below)
 *   toggle  — non-accusation claims that are not data-grounded (sin-datos)
 *   shown   — data-grounded claims of any type (incl. data-backed accusations)
 *
 * Fail-safe: anything not explicitly data-grounded is hidden (accusations)
 * or toggled (everything else) — a new type/verdict can never default to shown.
 */
import type { VerifiedClaimItem } from './pleno-claims-chunks'
import { corpusReales } from './claim-verdicts'

/**
 * The three outcomes, as a value rather than only a type.
 *
 * Exported so a caller can build a `Record<ClaimVisibility, …>` — reader
 * wording, a counter per outcome — and be broken by the compiler when a fourth
 * outcome appears, instead of hand-copying the list. Copying a shape into a
 * caller is what kept six suites in this repo green while production matched
 * nothing (docs/DATA_INTEGRITY.md rule 1).
 *
 * The union is DERIVED from this array, so the two cannot drift apart.
 */
export const CLAIM_VISIBILITIES = ['shown', 'toggle', 'hidden'] as const

export type ClaimVisibility = (typeof CLAIM_VISIBILITIES)[number]

/** Verdicts that mean the verifier found corroborating/contradicting data. */
export const DATA_GROUNDED_VERDICTS: ReadonlySet<string> = new Set([
  'verificado',
  'parcial',
  'contradicho',
  'promesa-repetida',
])

/**
 * `contradicho` says "this councillor stated something the municipal record
 * contradicts". It is the most accusatory verdict the machine can assign and
 * the one the deterministic matcher is worst at, because it fires on a strong
 * NAME match with a mismatched amount — which is also what an unrelated
 * contract looks like.
 *
 * Real example from the run that prompted this gate: a councillor said the
 * Generalitat would approve «2.364 millones para la dana». The matcher scored
 * the entity hint "dana" against a municipal contract for clearing rubble and
 * published `contradicho` — a €2.36bn regional budget line "refuted" by a
 * town rubble-removal job. The claim is not even about municipal spending.
 *
 * So a machine `contradicho` is a lead for a curator, not a publishable
 * verdict. It stays in the snapshot (the CLIs and /curator read it) and is
 * withheld from the public ledger. A curator publishes it by promoting the
 * claim into a finding, which is where the human judgement already lives.
 *
 * That last sentence is the whole design, and it has a corollary the
 * auto-curator broke for months: promotion into a finding is the sanctioned way
 * PAST this gate precisely because a person is standing in it. A machine that
 * promotes a gated claim has not satisfied the exception, it has walked around
 * the gate — and lands the withheld verbatim on `/hallazgos`, a page with no
 * toggle and no gate of its own. `selectBundles` in auto-curate.ts therefore
 * bundles `shown` claims only.
 */
function isCuratorPromoted(item: ClaimVisibilityInput): boolean {
  const src = item?.verification?.source
  return src === 'curator' || src === 'curator-downgrade'
}

/**
 * The four fields the gate reads, and nothing else.
 *
 * Structural and `unknown`-leaved so every caller — the chunker, the SPA, the
 * verifiers and the auto-curator — passes its own item shape directly. The
 * alternative was what two call sites already did, `classifyClaimVisibility(it
 * as never)`: a cast that satisfies the compiler by switching it off, on the
 * one function in this repo whose whole job is to fail safe. Widening the
 * parameter is what makes the cast unnecessary rather than merely unwritten.
 *
 * Never narrow this to a concrete snapshot type and never let a caller build an
 * adapter object out of the fields it thinks the gate reads — restating a shape
 * is how six suites here stayed green while matching nothing, and here it would
 * fail OPEN: a field added below that the adapter does not forward arrives as
 * `undefined` and the claim is published.
 */
export interface ClaimVisibilityInput {
  claim?: { type?: unknown; accusationSubtype?: unknown } | null
  verification?: { verdict?: unknown; source?: unknown; checkedAgainst?: unknown } | null
}

/**
 * ¿Consta QUIÉN comprobó esto?
 *
 * `checkedAgainst` es lo que el verificador anota sobre su propio trabajo: las
 * fuentes cuyo emparejador llegó a ejecutarse. Se llena así desde que se vio que
 * rellenarlo al LEER los ficheros hacía que cada fila afirmara haber consultado
 * PLACSP, TED, BDNS y el presupuesto cuando los bucles que los consultan van
 * condicionados (ver `note` en claim-verifier.ts). Vacío significa, literalmente,
 * que no consta nada; y una fila que trae evidencia y no anota fuente afirma las
 * dos cosas a la vez.
 *
 * Lo que costaba dejarlo pasar, medido el 2026-08-15 al regenerar el corpus con
 * dos días de salida del emparejador determinista sin publicar:
 *
 *     veredictos fuertes               113 → 254
 *     ACUSACIONES PÚBLICAS fuertes      16 →  65
 *     de ésas, por coincidencia léxica    3 →  49
 *
 * Cuarenta y nueve acusaciones contra grupos municipales cuyo único respaldo es
 * que una palabra sale en el título de un contrato. Es el mismo emparejador que
 * da «verificado» a «Vox dice que no, que no» contra un contrato de voto
 * electrónico, y «parcial» a «Reducimos en cultura,» — un trozo de discurso.
 *
 * O sea: la avería que este fichero ya documenta para `contradicho`, entrando
 * por la puerta de al lado.
 *
 * No amplía la política de arriba, la aplica: «lo que no esté EXPLÍCITAMENTE
 * fundado se oculta (acusaciones) o se pliega (el resto)». Una fila que no dice
 * quién la comprobó no está explícitamente fundada. Y falla del lado seguro: el
 * campo ausente —el caso contra el que avisa `ClaimVisibilityInput`— oculta.
 */
function tieneVerificadorAnotado(item: ClaimVisibilityInput): boolean {
  const ca = item?.verification?.checkedAgainst
  if (!Array.isArray(ca)) return false
  // Y no basta con que el array traiga algo. `checkedAgainst` mezcla dos
  // significados —los corpus que el emparejador consultó, y el NOMBRE de la
  // pasada que produjo el veredicto— y sólo el primero funda. Medido el
  // 2026-08-27: las once acusaciones publicadas pasaban por aquí con
  // `['llm-second-pass']` y nada más, una pasada retirada, sin un dato detrás.
  //
  // La avería que este fichero ya documenta arriba, entrando por la puerta de
  // al lado. Contar la longitud daba por fundada una fila que sólo dice qué
  // pasada la miró.
  return corpusReales(ca).length > 0
}

/**
 * Una cita que no consta en NINGUNA transcripción que tengamos no se publica.
 *
 * Es la puerta que faltaba, y la más simple de justificar: el resto de este
 * fichero decide si una frase está lo bastante FUNDADA para enseñarla; ésta
 * decide si la frase se dijo. `check:claim-provenance` lleva desde el 3-09-2026
 * contando en rojo unas declaraciones publicadas cuyo literal no aparece en la
 * transcripción vigente ni en ninguna sustituida — la definición operativa de
 * «indistinguible de una inventada», que es lo que la carpeta `superseded/`
 * existe para evitar.
 *
 * Se DERIVA, no se cura: el llamador pasa el conjunto que calcula con los mismos
 * textos y el mismo emparejador que usa la comprobación. Una lista curada de
 * ids se quedaría rancia —es el defecto que este repositorio ya se ha contado
 * dos veces— y además esto se cura solo en la dirección buena: recupera el
 * archivo que faltaba y la cita vuelve a publicarse sola.
 *
 * Lo que NO entra aquí: una sesión sin transcripción ninguna. Eso es «no lo
 * hemos mirado», no «no lo encontramos», y confundirlos retiraría medio corpus
 * el día que un fichero no se descargue. Quien los separa es
 * `classifyClaimProvenance`, y el llamador sólo manda los `sin-rastro`.
 */
export function classifyClaimVisibility(
  item: ClaimVisibilityInput,
  opts: { sinProcedencia?: boolean } = {},
): ClaimVisibility {
  if (opts.sinProcedencia) return 'hidden'
  const verdict = item?.verification?.verdict
  if (verdict === 'contradicho' && !isCuratorPromoted(item)) return 'hidden'
  const grounded =
    typeof verdict === 'string' &&
    DATA_GROUNDED_VERDICTS.has(verdict) &&
    // La promoción por curador es la vía sancionada para pasar esta puerta y no
    // puede depender de que una máquina anotara nada: ahí quien responde es una
    // persona, que es exactamente el trato.
    (tieneVerificadorAnotado(item) || isCuratorPromoted(item))
  if (item?.claim?.type === 'acusacion_publica') {
    const subtype = item.claim.accusationSubtype ?? 'opinativa' // safe default
    if (subtype === 'opinativa') return 'hidden'
    return grounded ? 'shown' : 'hidden'
  }
  return grounded ? 'shown' : 'toggle'
}

export interface GatedItem extends VerifiedClaimItem {
  visibility: ClaimVisibility
}

/**
 * Drop `hidden` items and stamp each survivor with its visibility.
 * The chunker calls this before writing public chunks.
 *
 * `sinProcedencia` son los ids cuyo literal no aparece en ninguna transcripción
 * que tengamos. Va como conjunto y no como campo del item porque la respuesta
 * depende de ficheros del disco, y este módulo es puro a propósito: quien lee
 * los textos es el chunker, quien decide qué significa es esto.
 */
export function gateItemsForPublic(
  items: VerifiedClaimItem[],
  opts: { sinProcedencia?: ReadonlySet<string> } = {},
): GatedItem[] {
  const out: GatedItem[] = []
  for (const it of items ?? []) {
    const visibility = classifyClaimVisibility(it, {
      sinProcedencia: opts.sinProcedencia?.has(it?.claim?.id ?? '') ?? false,
    })
    if (visibility === 'hidden') continue
    out.push({ ...it, visibility })
  }
  return out
}
