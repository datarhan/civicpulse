// @ts-check
/**
 * Is this contract money the town has actually committed?
 *
 * Gobierto's `status` vocabulary is `awarded | formalized | void | abandoned |
 * revoked | ''`. **`formalized` means signed** — it is the final state of a
 * contract, not a draft — and it is the single most common value after
 * `awarded` (298 of 730 rows in the committed fixture).
 *
 * Every awarded total in this project used to be written as
 * `status === 'awarded'`, which excluded all of them: €53.5M across 314 signed
 * contracts, including the town's largest single contract (GARBIALDI's €15.8M
 * waste concession — on its own bigger than the entire published headline).
 *
 * One predicate, imported everywhere, so the definition of "spent" cannot
 * drift between the KPI strip, the map, the leaderboard and the department
 * pages again — which it already had: /departamentos said €79M while
 * /presupuesto said €14.7M from the same file.
 */

/**
 * Statuses that mean the contract was signed or awarded.
 *
 * ORDERED, strongest first: a permalink is often several rows (one per lot)
 * carrying different statuses, and a caller naming the expediente in one word
 * needs a deterministic pick rather than whichever lot the array happened to
 * list first. Declared as arrays with the Sets derived, so the order and the
 * membership cannot disagree.
 */
export const COMMITTED_STATUSES = ['formalized', 'finalized', 'closed', 'awarded']
const COMMITTED = new Set(COMMITTED_STATUSES)

/** Statuses that mean the award was undone. Never counted as spend. */
export const CANCELLED_STATUSES = ['void', 'revoked', 'abandoned', 'withdrawn']
const CANCELLED = new Set(CANCELLED_STATUSES)

/**
 * Statuses that mean the procurement is still running, so no money is
 * committed yet. `provisionally_awarded` belongs here: a provisional award can
 * still be withdrawn before formalisation, and 23 of the 449 licitaciones sit
 * in that state.
 */
export const IN_FLIGHT_STATUSES = [
  'provisionally_awarded',
  'in_progress',
  'evaluation',
  'open',
  'pending',
  'draft',
]
const IN_FLIGHT = new Set(IN_FLIGHT_STATUSES)

/**
 * Which of the three things a status says, or `null` when it says nothing.
 *
 * `null` covers BOTH `unknown` — Gobierto's blank, the sentinel — and a
 * vocabulary this build has never seen. Neither is a value
 * (`docs/DATA_INTEGRITY.md` rule 3): a caller must render «no consta» or stay
 * quiet, never print the token. `estado: unknown` sat inside 16 published
 * finding snippets precisely because the sentinel was treated as a word.
 *
 * @param {string|null|undefined} status
 * @returns {'committed'|'cancelled'|'in-flight'|null}
 */
export function procurementStatusKind(status) {
  if (typeof status !== 'string') return null
  const s = status.trim().toLowerCase()
  if (COMMITTED.has(s)) return 'committed'
  if (CANCELLED.has(s)) return 'cancelled'
  if (IN_FLIGHT.has(s)) return 'in-flight'
  return null
}

/**
 * True when the contract represents committed public money.
 *
 * The `unknown` fallback is deliberate and narrow. Gobierto leaves `status`
 * blank on rows that plainly are awarded — assignee, award date and amount all
 * present — and the parser normalises blank to `unknown`; that is where the
 * town's largest contract lives (GARBIALDI, €15.8M). But the fallback applies
 * ONLY to `unknown`. An in-flight status with a named winner is not spend, and
 * an earlier draft of this function that trusted any non-cancelled row with an
 * assignee counted open tenders as awarded money.
 */
export function isCommittedContract(c) {
  if (!c) return false
  if (CANCELLED.has(c.status)) return false
  if (COMMITTED.has(c.status)) return true
  if (IN_FLIGHT.has(c.status)) return false
  // Only a blank/unknown status falls back to "is there a named winner". A
  // status string we do not recognise is not evidence of spend — it means the
  // upstream vocabulary moved and someone needs to look, which the parser's
  // own enum test now enforces.
  if (c.status && c.status !== 'unknown') return false
  return Boolean(c.assignee)
}

/** Un importe publicado y positivo, o `null`. Nunca un cero que se pueda sumar. */
function positivo(v) {
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? n : null
}

/**
 * Cuánto se ADJUDICÓ este contrato, sin IVA. `null` cuando la fuente no lo
 * publica.
 *
 * Sin IVA primero para casar con el titular «Importe de adjudicación» de la
 * ficha de PLACSP (contrataciondelestado.es) y con la convención española del
 * valor estimado, que va siempre sin impuestos. El importe CON IVA sólo entra
 * cuando la fila no trae el otro.
 *
 * **No cae al presupuesto base de licitación**, y esa es la razón de que esta
 * función exista. Lo licitado es lo que el ayuntamiento sacó a concurso y lo
 * adjudicado es por lo que se firmó: dos magnitudes distintas, casi siempre la
 * primera mayor que la segunda. Rellenar el hueco con la de al lado publica
 * como adjudicación algo que nadie adjudicó. El 2026-09-21 eran cinco
 * contratos firmados y 309.855,55 € colados en una tarjeta rotulada
 * «adjudicado sin IVA», por una caída que su propio comentario declaraba
 * imposible («none do today»).
 *
 * Devuelve `null`, no `0`: adjudicar por cero euros y no publicar el importe
 * son cosas distintas, y un cero se suma, se compara y se pinta sin que nadie
 * lo note. Quien agrega descarta el `null`; quien pinta dice que falta.
 *
 * @param {{finalAmountNoTaxes?:number, finalAmount?:number}|null} [c]
 * @returns {number|null}
 */
export function importeAdjudicado(c) {
  if (!c) return null
  return positivo(c.finalAmountNoTaxes) ?? positivo(c.finalAmount)
}

/** ¿Publica la fuente el importe de adjudicación de esta fila? */
export function publicaImporteAdjudicado(c) {
  return importeAdjudicado(c) !== null
}

/**
 * Cuántas filas firmadas NO publican su importe de adjudicación.
 *
 * Existe porque las tres superficies de la portada pintan pegados un recuento y
 * una suma que describen conjuntos distintos: `awardedContracts` cuenta los
 * comprometidos (711 el 2026-09-21) y `awardedTotalEuros` suma los que traen
 * importe (706). Cada cifra por separado es cierta; «711 contratos que suman
 * 124,0 M€» no lo es, porque deja fuera lo que se adjudicó en cinco contratos
 * cuyo importe la fuente no publica — que no es cero, es desconocido.
 *
 * Se DERIVA de las filas, como `yearSpan`, en vez de vivir en el `stats` del
 * snapshot: así no puede quedarse vieja respecto al fichero que la acompaña.
 *
 * @param {Array<object>|null|undefined} contracts
 * @returns {number}
 */
export function comprometidosSinImporte(contracts) {
  let n = 0
  for (const c of contracts ?? []) {
    if (isCommittedContract(c) && importeAdjudicado(c) === null) n += 1
  }
  return n
}

/**
 * El presupuesto base de LICITACIÓN, sin IVA. `null` si no consta.
 *
 * Se pide por su nombre, nunca cayendo desde `importeAdjudicado`: quien enseña
 * esta cifra tiene que saber que está enseñando otra magnitud, y por eso es
 * otra llamada y no un segundo parámetro.
 *
 * @param {{initialAmountNoTaxes?:number, initialAmount?:number}|null} [c]
 * @returns {number|null}
 */
export function importeLicitacion(c) {
  if (!c) return null
  return positivo(c.initialAmountNoTaxes) ?? positivo(c.initialAmount)
}

/**
 * Primer y último año de adjudicación de las filas que cuentan como gasto
 * comprometido, o `null` si ninguna trae fecha utilizable.
 *
 * Existe porque una cifra de contratación SIN periodo se lee como anual.
 * `/datos` publicaba «699 adjudicados · 806 expedientes» pegada debajo de
 * «Presupuesto municipal · Ejercicio 2025» —que sí dice el suyo— y entre fichas
 * que lo llevan («1148 personas (2026-07)»); son adjudicaciones de nueve años.
 *
 * Se mide sobre EXACTAMENTE las filas que `isCommittedContract` acepta, que son
 * las que la cifra cuenta. Sobre todas las filas daría el periodo de otro
 * número, que es la misma clase de desajuste que ya costó «806 contratos»
 * leídos como adjudicados.
 *
 * Y se calcula, nunca se escribe: un «2017–2026» a mano se vuelve falso solo en
 * cuanto el raspador traiga una adjudicación de 2027.
 *
 * @param {Array<{status?: string, assignee?: string, awardDate?: string|null}>|null|undefined} contracts
 * @returns {{from: number, to: number}|null}
 */
export function committedAwardYearSpan(contracts) {
  let from = null
  let to = null
  for (const c of contracts ?? []) {
    if (!isCommittedContract(c)) continue
    const year = Number(String(c?.awardDate ?? '').slice(0, 4))
    // `> 1990` descarta el ruido de una fecha mal parseada sin tirar la fila:
    // la contratación pública electrónica no es anterior, así que un año menor
    // es un error de dato, no un contrato viejo.
    if (!Number.isFinite(year) || year <= 1990) continue
    if (from === null || year < from) from = year
    if (to === null || year > to) to = year
  }
  return from !== null && to !== null ? { from, to } : null
}

/**
 * Tipos de contrato que son una CONCESIÓN.
 *
 * Se exporta como conjunto en vez de comprobarse a mano en cada superficie:
 * una concesión se adjudica por todo su plazo de una vez, y esa salvedad tiene
 * que decirse igual la pinte quien la pinte.
 */
export const CONCESSION_CONTRACT_TYPES = ['public_services_management']

/**
 * ¿Es una concesión?
 *
 * Por TIPO, nunca por el título. Un regex sobre «concesión» arrastraría también
 * los expedientes que sólo la mencionan, y la portada ya tiene un precedente
 * caro de eso: un patrón por «emergencia» casaba 72 contratos de los que ~63
 * eran limpieza tras la DANA. El tipo lo llevan 4 filas de 809.
 *
 * @param {{contractType?: string|null}|null|undefined} c
 */
export function isConcession(c) {
  return Boolean(c && CONCESSION_CONTRACT_TYPES.includes(c.contractType ?? ''))
}

/**
 * El plazo del contrato en años, redondeado, a partir de sus días.
 *
 * «Diecisiete años» es lo que hace entendible un importe de ocho dígitos, y es
 * justo la clase de número que alguien teclea una vez y se queda viejo. Sale de
 * dividir — el mismo convenio que `committedAwardYearSpan`: se calcula, nunca
 * se escribe.
 *
 * Sin plazo utilizable devuelve `null`, no `0`: un cero se lee como «dura
 * cero», que es un dato, y lo que hay es una ausencia.
 *
 * @param {{duration?: number|null}|null|undefined} c
 * @returns {number|null}
 */
export function contractTermYears(c) {
  const dias = c?.duration
  if (typeof dias !== 'number' || !Number.isFinite(dias) || dias <= 0) return null
  return Math.round(dias / 365.2425)
}
