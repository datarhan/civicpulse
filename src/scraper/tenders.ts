import { parse } from 'csv-parse/sync'
import { isScoreArtifactAmount } from '../lib/tenders'
import { CANCELLED_STATUSES, procurementStatusKind } from '../lib/contract-status.js'
import { esTituloCpv } from './etiqueta-de-contrato'
import { fnv32 } from './hash'

// ---------------------------------------------------------------------------
// Status normalisation
// ---------------------------------------------------------------------------
// `formalized` is what Gobierto actually emits for a SIGNED contract — 298 of
// 730 rows in the committed fixture. The list said `finalized`, one letter
// apart, so normStatus() coerced every one of them to `unknown`, and since all
// awarded totals are computed as `status === 'awarded'`, €53.5M across 314
// signed contracts disappeared from the KPI strip, the money map, the
// contractor leaderboard and the entity registry. `void`/`abandoned` are added
// for the same reason: a cancelled contract must be distinguishable from a
// signed one, not share the `unknown` bucket with it.
export const CONTRACT_STATUS = new Set<ContractStatus>([
  'awarded',
  'formalized',
  'void',
  'abandoned',
  'provisionally_awarded',
  'revoked',
  'in_progress',
  'open',
  'finalized',
  'draft',
  'pending',
  'closed',
  'unknown',
])

export const TENDER_STATUS = new Set<TenderStatus>([
  'awarded',
  'formalized',
  'void',
  'abandoned',
  'provisionally_awarded',
  'open',
  'evaluation',
  'revoked',
  'finalized',
  'draft',
  'closed',
  'unknown',
  'withdrawn',
  // Lo que la Plataforma llama «Anulada»; Gobierto lo exporta como `formalized`
  // en la tabla de licitaciones (ver `estadoDeLicitacion`).
  'annulled',
])

// ---------------------------------------------------------------------------
// Tender (licitación) status: Gobierto's words are not PLACSP's states
// ---------------------------------------------------------------------------
/**
 * Qué estado de la Plataforma de Contratación hay detrás de cada palabra que
 * Gobierto escribe en `licitaciones.status`. `null` = lo medido es una mezcla.
 *
 * En la tabla de CONTRATOS las palabras dicen lo que dicen (55V/2024: contrato
 * `awarded`, Adjudicada; `void` es «Desierto», #325). En la de LICITACIONES no:
 * el 2026-10-19 se cotejaron 51 licitaciones, de todos los estados y de 2017 a
 * 2026, con el «Estado de la licitación» de su ficha en PLACSP
 * (tests/fixtures/placsp_estado-licitacion_2026-10-19.json), y salió esto:
 *
 *   revoked                → Adjudicada (13 de 14; la otra, Resuelta)
 *   formalized             → Anulada (2 de 2; las dos con su anuncio de anulación)
 *   void                   → Evaluación (7 de 7; sólo el anuncio de licitación)
 *   provisionally_awarded  → Evaluación (9 de 10, dos de ellas «Previa»)
 *   awarded                → Resuelta (9 de 9)
 *   abandoned              → Evaluación Previa (4), Parcialmente adjudicada o
 *                            resuelta (3): una mezcla, sin una clase que darle
 *
 * No es el retraso de Gobierto, que va semanas por detrás: las licitaciones de
 * 2018 a 2024 dan los mismos pares. Leídas al pie de la letra, `tenders.json`
 * publicaba «revoked» sobre 114 licitaciones adjudicadas —el verificador llegó
 * a tomarlas por desmentidos (#389)— y «formalized» sobre dos anuladas.
 *
 * «Resuelta» NO es «formalizada»: tres de las nueve no traen anuncio de
 * formalización y una trae un desistimiento. Por eso `awarded` se queda en
 * `awarded` y no sube a `formalized`, que diría «firmado».
 */
export const PLACSP_DE_LICITACION_GOBIERTO: Readonly<Record<string, string | null>> = {
  revoked: 'Adjudicada',
  formalized: 'Anulada',
  void: 'Evaluación',
  provisionally_awarded: 'Evaluación',
  awarded: 'Resuelta',
  abandoned: null,
}

/**
 * Cada estado de la Plataforma, en el vocabulario de este proyecto
 * (`contract-status.js` decide su clase). «Parcialmente adjudicada/resuelta»
 * cuenta como comprometida por la misma regla que /hallazgos aplica a los
 * lotes: un expediente en el que algún lote llegó a contrato no está anulado.
 */
export const ESTADO_DE_PLACSP: Readonly<Record<string, TenderStatus>> = {
  'Anuncio Previo': 'open',
  'En plazo': 'open',
  Evaluación: 'evaluation',
  'Evaluación Previa': 'evaluation',
  Adjudicada: 'awarded',
  'Parcialmente Adjudicada': 'awarded',
  Resuelta: 'awarded',
  'Parcialmente Resuelta': 'awarded',
  Anulada: 'annulled',
}

/**
 * Todo lo que `estadoDeLicitacion` puede devolver. `check:vocabulary` lo lee
 * para no tomar nuestra traducción por deriva del origen: una palabra de aquí
 * que aparece en `tenders.tenders.status` la ha puesto este parser, y la de
 * Gobierto se vigila en `sourceStatus` (src/scraper/vocabulary-census.ts).
 */
export const ESTADOS_DE_LICITACION_TRADUCIDOS: ReadonlySet<TenderStatus> = new Set<TenderStatus>([
  ...Object.values(PLACSP_DE_LICITACION_GOBIERTO)
    .filter((p): p is string => p !== null)
    .map((p) => ESTADO_DE_PLACSP[p]),
  'unknown',
])

/**
 * El estado de una licitación de Gobierto, traducido a lo que dice la
 * Plataforma. Una palabra que nadie ha cotejado, una mezcla o el blanco de
 * Gobierto dan el centinela: con el vocabulario corrido, una palabra nueva
 * puede significar cualquier cosa (regla 3: el centinela no es un valor).
 */
export function estadoDeLicitacion(value: unknown): TenderStatus {
  if (typeof value !== 'string') return 'unknown'
  const placsp = PLACSP_DE_LICITACION_GOBIERTO[value.trim().toLowerCase()]
  return (placsp && ESTADO_DE_PLACSP[placsp]) || 'unknown'
}

// ---------------------------------------------------------------------------
// Category vocabulary
// ---------------------------------------------------------------------------
/**
 * The categories Gobierto files a contract under (`category_title`), in the
 * English it ships them in. The parser passes the field through untouched
 * (`categoryTitle: nullable(row.category_title)`), so this is the vocabulary
 * every consumer of that field can meet — and the one `claim-verifier.ts`
 * writes into a contract snippet («… · INSDAGAR S.L. · construction · …»),
 * where the reader's surfaces swap it for its `contrato.categoria.<key>` label
 * (`snippetParaLeer`, src/lib/crosschecked-status.js).
 *
 * Exported so the label test and the department map read the list from here
 * rather than restating it (docs/DATA_INTEGRITY.md rule 1). The parser does
 * NOT coerce to it on purpose: a category Gobierto adds tomorrow stays visible
 * as its raw word on every surface, and `tests/i18n-mapa-enums.test.ts` reds
 * because the published value is outside this list — a coerced `null` would
 * have hidden it.
 */
export const CATEGORIAS_DE_CONTRATO = [
  'agriculture',
  'architecture',
  'audiovisual',
  'catering',
  'construction',
  'culture',
  'education',
  'electrical',
  'energy',
  'environment',
  'finance',
  'furniture',
  'health',
  'industry',
  'it',
  'legal',
  'maintenance',
  'other',
  'print',
  'public_services',
  'real_estate',
  'security',
  'software',
  'telecom',
  'textile',
  'transportation',
] as const

export type CategoriaDeContrato = (typeof CATEGORIAS_DE_CONTRATO)[number]

function normStatus<T extends string>(value: unknown, allowed: Set<T>): T {
  if (typeof value !== 'string') return 'unknown' as T
  const v = value.trim().toLowerCase()
  return (allowed.has(v as T) ? v : 'unknown') as T
}

function num(v: unknown): number {
  if (v === null || v === undefined || v === '') return 0
  if (typeof v === 'number') return v
  const s = String(v).replace(/\s/g, '').replace(/,/g, '.')
  const n = parseFloat(s)
  return Number.isFinite(n) ? n : 0
}

function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : ''
}

function nullable(v: unknown): string | null {
  const s = str(v)
  return s === '' ? null : s
}

function csvRows(text: string): Record<string, string>[] {
  return parse(text, {
    columns: true,
    skip_empty_lines: true,
    relax_quotes: true,
    trim: true,
  }) as Record<string, string>[]
}

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------
export type ContractStatus =
  | 'awarded'
  | 'formalized'
  | 'void'
  | 'abandoned'
  | 'provisionally_awarded'
  | 'revoked'
  | 'in_progress'
  | 'open'
  | 'finalized'
  | 'draft'
  | 'pending'
  | 'closed'
  | 'unknown'

export type TenderStatus =
  | 'awarded'
  | 'formalized'
  | 'void'
  | 'abandoned'
  | 'provisionally_awarded'
  | 'open'
  | 'evaluation'
  | 'revoked'
  | 'finalized'
  | 'draft'
  | 'closed'
  | 'unknown'
  | 'withdrawn'
  | 'annulled'

export interface Contract {
  id: string
  /**
   * La clave de fila de Gobierto (`contract_id`), `null` si la fila no la trae.
   *
   * En un expediente multifila ya va dentro del `id` (`idsDeFilas`); en una fila
   * suelta sólo está aquí. Se guarda en todas para medir si aguanta una edición
   * de la fuente (`identidad-de-filas.ts`), porque de eso depende ahora que los
   * ids multifila no se muevan.
   */
  sourceRowId: string | null
  title: string
  permalink: string | null
  status: ContractStatus
  contractType: string | null
  processType: string | null
  minorContract: boolean
  startDate: string | null
  endDate: string | null
  awardDate: string | null
  formalizedDate: string | null
  /** Contracted execution period, in days (Gobierto `duration`). */
  duration: number
  /**
   * Lote al que corresponde esta fila (Gobierto `batch_number`), 0 cuando la
   * fuente no lo declara.
   *
   * Gobierto sirve la tabla `contratos` con UNA FILA POR LOTE, y las filas de
   * un mismo expediente comparten `id` y `permalink`. Sin este número, aguas
   * abajo un lote era indistinguible de un contrato suelto: la portada
   * publicaba «UE casco 5 · 6.900 €» enlazando a la ficha de PLACSP del
   * expediente entero —tres lotes, 53.409,63 € de presupuesto base—, y el
   * lector que comprobaba la cita encontraba otro número. Ver
   * `src/lib/tender-lotes.js` y `tests/tenders-lotes.test.ts`.
   */
  batchNumber: number
  /** Winning firm (Gobierto `assignee`) — the adjudicatario. */
  assignee: string | null
  /** Contracting body (Gobierto `contractor`) — usually the Ayuntamiento. */
  contractor: string | null
  contractorId: string | null
  contractorType: string | null
  categoryId: string | null
  categoryTitle: string | null
  cpvs: string[]
  initialAmount: number
  initialAmountNoTaxes: number
  finalAmount: number
  finalAmountNoTaxes: number
  /** Valor estimado del contrato (Gobierto `estimated_value`). */
  estimatedValue: number
  numberOfProposals: number
  /**
   * La palabra de Gobierto, sólo en las filas cuyo estado se cambió: por
   * imposible (`sinEstadoImposible`) o por una corrección curada.
   */
  sourceStatus?: string
}

export interface Tender {
  id: string
  title: string
  documentNumber: string | null
  permalink: string | null
  /** Lo que dice la Plataforma, traducido de la palabra de Gobierto (`estadoDeLicitacion`). */
  status: TenderStatus
  /** La palabra de Gobierto tal cual, para cotejar la traducción. */
  sourceStatus: string | null
  contractType: string | null
  processType: string | null
  minorContract: boolean
  submissionDate: string | null
  openProposalsDate: string | null
  contractor: string | null
  contractValue: number
  initialAmount: number
  initialAmountNoTaxes: number
  categoryTitle: string | null
  cpvs: string[]
  numberOfBatches: number
}

// ---------------------------------------------------------------------------
// Contracts
// ---------------------------------------------------------------------------
// Deterministic id derived from content when the source CSV leaves it blank.
function fallbackId(row: Record<string, string>): string {
  const seed = [
    str(row.title).slice(0, 80),
    str(row.permalink),
    str(row.initial_amount),
    str(row.start_date),
    str(row.submission_date),
    str(row.award_date),
    str(row.contractor_id),
  ].join('|')
  // The shared primitive, never a local copy: these ids are published, and
  // fnv32's exact arithmetic is part of them (tests/hash-copias-retiradas.test.ts).
  return 'auto-' + fnv32(seed)
}

/**
 * El `id` publicado de cada fila: el de Gobierto, o `<id>#<contract_id>` si
 * Gobierto lo repite.
 *
 * Lo repite en las filas de un expediente —una por lote, una por contrato
 * derivado de un SDA—, y lo único que las distingue es `contract_id`. Ninguna
 * columna de contenido basta: medido el 2026-11-01, `permalink` y lote colisionan
 * en 9 grupos, y 43/2025 BSDA sale dos veces, idéntica salvo en esa clave.
 *
 * Hasta esa fecha el sufijo era `#1`, `#2`… por orden de aparición, y la consulta
 * no lleva `ORDER BY`: el 30-10 una fila de 4889055 se movió y 23 ids amanecieron
 * en otro contrato (`tests/tenders-id-estable.test.ts`).
 *
 * TODAS las filas de un id repetido llevan el sufijo, también la primera. Dejar
 * una a secas —la de `contract_id` más bajo, digamos— la dejaría reapuntarse en
 * silencio el día que esa fila desapareciera. Lo que este id promete es que nombra
 * una fila de la fuente o ninguna, nunca otra: una referencia vieja cuelga, y eso
 * se ve. No promete que una fila lo conserve siempre: lo pierde si la fuente le
 * cambia el `id` (el 30-07-2026 pasó decenas de derivados al de su SDA) y si su
 * expediente gana una segunda fila (ninguna vez en 145 copias diarias).
 *
 * `contract_id` aguanta las ediciones de la fuente: 191 filas, casi todas sin
 * licitación, publican esa clave como `id`, y de las 178 que ya estaban el
 * 2026-04-19 ninguna cambió de fila, 56 de ellas con la adjudicataria o el título
 * reescritos. En 145 copias diarias, ningún cambio de `id` salió de esa clave.
 */
function idsDeFilas(rows: Record<string, string>[]): string[] {
  const bases = rows.map((row) => str(row.id) || fallbackId(row))
  const veces = new Map<string, number>()
  for (const base of bases) veces.set(base, (veces.get(base) ?? 0) + 1)
  const seen = new Set<string>()
  return rows.map((row, n) => {
    const base = bases[n]
    const id = veces.get(base) === 1 ? base : `${base}#${str(row.contract_id) || fallbackId(row)}`
    // Sólo una clave repetida en la fuente llega aquí, y el id sigue siendo único.
    let candidate = id
    let i = 1
    while (seen.has(candidate)) {
      candidate = `${id}#${i++}`
    }
    seen.add(candidate)
    return candidate
  })
}

/** Por encima de esta fracción de filas sin clave, lo que falta es la columna. */
const TECHO_SIN_CLAVE = 0.1

/**
 * Para la pasada si `contract_id` desaparece de la fuente.
 *
 * Una fila suelta sin clave toma una de su contenido y la noche sigue: tumbar el
 * adaptador se llevaría los demás contratos por ella. Sin la columna, en cambio,
 * todas las filas multifila cambiarían de id de golpe y sus ids pasarían a moverse
 * con cada edición del título, así que es mejor conservar la copia de ayer y
 * ponerse rojo. El techo es la pareja de esa salida de emergencia (regla 1 de
 * `docs/DATA_INTEGRITY.md`).
 */
export function exigeClaveDeFuente(contracts: Contract[]): void {
  const sinClave = contracts.filter((c) => c.id.includes('#auto-')).length
  if (sinClave / contracts.length > TECHO_SIN_CLAVE) {
    throw new Error(
      `${sinClave} de ${contracts.length} contratos sin contract_id: la fuente parece haber ` +
        'retirado la columna, y sin ella los ids de los expedientes multifila no son estables',
    )
  }
}

export function parseRibalicitaContracts(csv: string): Contract[] {
  const rows = csvRows(csv)
  const out: Contract[] = []
  const ids = idsDeFilas(rows)
  for (const [n, row] of rows.entries()) {
    const contract: Contract = {
      id: ids[n],
      sourceRowId: nullable(row.contract_id),
      title: str(row.title),
      permalink: nullable(row.permalink),
      status: normStatus<ContractStatus>(row.status, CONTRACT_STATUS),
      contractType: nullable(row.contract_type),
      processType: nullable(row.process_type),
      minorContract: String(row.minor_contract).toLowerCase() === 't',
      startDate: nullable(row.start_date),
      endDate: nullable(row.end_date),
      awardDate: nullable(row.award_date),
      formalizedDate: nullable(row.formalized_date),
      duration: num(row.duration),
      batchNumber: num(row.batch_number),
      assignee: nullable(row.assignee),
      contractor: nullable(row.contractor),
      contractorId: nullable(row.contractor_id),
      contractorType: nullable(row.contractor_type),
      categoryId: nullable(row.category_id),
      categoryTitle: nullable(row.category_title),
      cpvs: str(row.cpvs)
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s.length > 0),
      initialAmount: num(row.initial_amount),
      initialAmountNoTaxes: num(row.initial_amount_no_taxes),
      finalAmount: num(row.final_amount),
      finalAmountNoTaxes: num(row.final_amount_no_taxes),
      estimatedValue: num(row.estimated_value),
      numberOfProposals: num(row.number_of_proposals),
    }
    // PLACSP publishes framework / SDA call-offs with the 0–100 award-criterion
    // SCORE in the importe field instead of the euro amount (e.g. a "€100" award
    // on a €14.983 budget → a spurious −99% baja). Drop that bogus figure so the
    // award price reads as unknown rather than a €100 win; the real budget
    // (initialAmount) is kept. See src/lib/tenders.js:isScoreArtifactAmount.
    if (isScoreArtifactAmount(contract)) {
      contract.finalAmount = 0
      contract.finalAmountNoTaxes = 0
    }
    out.push(contract)
  }
  return sinEstadoImposible(out)
}

/**
 * Un estado cancelado junto a una fecha de formalización es imposible, y se
 * queda sin estado.
 *
 * La renuncia y el desistimiento sólo caben ANTES de formalizar (art. 152
 * LCSP), y un lote desierto no se firma. Así que una fila `revoked`,
 * `abandoned`, `void` o `withdrawn` con `formalizedDate` dice dos cosas que no
 * pueden ser ciertas a la vez — salvo cuando la fecha es del expediente y la
 * puso un lote HERMANO que sí se firmó: Gobierto copia la fecha de formalización
 * a todos los lotes, y un lote desierto junto a uno firmado es corriente
 * (95133, 85540, 1892773, 4561450 en el registro de octubre de 2026).
 *
 * El caso que la motivó, cotejado en la Plataforma el 2026-10-19: 51/2022
 * (1943883), el alumbrado LED del casco urbano, formalizado el 21-02-2023 con
 * EIFFAGE ENERGÍA. El 11-01-2024 el Ayuntamiento anuló el ANUNCIO de
 * formalización para republicarlo con la financiación FEDER, y Gobierto lo leyó
 * como un contrato revocado. /presupuesto lo pintaba «Renuncia».
 *
 * Esta capa sólo QUITA: deja el centinela, nunca escribe «formalizado», porque
 * del registro sólo se sabe que el estado es imposible, no cuál es el bueno.
 * Restituirlo lo hace una persona, con el anuncio delante
 * (`contract-corrections.ts`). La palabra de Gobierto queda en `sourceStatus`.
 */
export function sinEstadoImposible(contracts: Contract[]): Contract[] {
  const firmados = new Set(
    contracts
      .filter((c) => c.permalink && procurementStatusKind(c.status) === 'committed')
      .map((c) => c.permalink),
  )
  return contracts.map((c) => {
    if (!CANCELLED_STATUSES.includes(c.status) || !c.formalizedDate) return c
    if (c.permalink && firmados.has(c.permalink)) return c
    return { ...c, status: 'unknown', sourceStatus: c.status }
  })
}

/** Una fila retirada por repetir una adjudicación, y la que queda en su lugar. */
export interface AdjudicacionRepetida {
  id: string
  /** Fuera del snapshot sólo queda aquí: con esto se encuentra la fila en la fuente. */
  sourceRowId: string | null
  queda: string
}

/**
 * Una adjudicación que Gobierto publica en dos filas se cuenta una.
 *
 * Son dos filas con el mismo enlace, lote, fecha, importe sin IVA, adjudicataria
 * y estado, y distinta `contract_id`. Cotejadas en la Plataforma el 2026-11-01 las
 * ocho que había: cada expediente tiene un solo anuncio de adjudicación y ningún
 * lote, de modo que sumaban 137.209,58 € sin IVA que nadie adjudicó, también en el
 * total de tres personas físicas. En cinco, una fila lleva el objeto oficial y la
 * otra una etiqueta CPV, y queda la del objeto; luego, la del lote numerado; entre
 * iguales, el id menor, para que el resultado no dependa del orden de la fuente.
 *
 * Un lote en blanco cuenta como el único lote numerado de esas filas: 153/2025
 * BSDA publica un anuncio sin lote como lote 3 y como lote en blanco, y sus lotes
 * 1, 2 y 4 siguen en el registro, así que queda el 3.
 *
 * Una fila sin fecha toma la de su gemela (`fechaDeSuGemela`): 13/2026 BSDA y
 * 110/2026 BSDA salen también en una fila sin `id`, sin licitación, sin fecha y
 * con una etiqueta CPV por título, igual a la fechada en todo lo demás, y cada una
 * tiene un solo anuncio de adjudicación (cotejadas el 2026-11-02). Queda la fechada.
 *
 * La regla se queda corta antes que fundir: exige todos esos campos y un estado
 * comprometido, porque un lote de igual precio no es una repetición (12/2018,
 * 182/2025), un lote en blanco junto a dos numerados no dice de cuál sería copia y
 * una fila desierta no adjudica nada.
 *
 * El id de la que queda no cambia, porque se calcula antes con todas las filas, y
 * la pasada publica lo retirado en `contractCorrections.adjudicacionesRepetidas`.
 */
export function sinAdjudicacionesRepetidas(contracts: Contract[]): {
  contratos: Contract[]
  repetidas: AdjudicacionRepetida[]
} {
  const candidatas = contracts.filter(
    (c) =>
      c.permalink &&
      c.assignee &&
      c.finalAmountNoTaxes > 0 &&
      procurementStatusKind(c.status) === 'committed',
  )
  const fechas = fechaDeSuGemela(candidatas)
  const grupos = new Map<string, Contract[]>()
  for (const c of candidatas) {
    const fecha = c.awardDate ?? fechas.get(c)
    if (!fecha) continue
    const clave = JSON.stringify([c.permalink, fecha, c.finalAmountNoTaxes, c.assignee, c.status])
    grupos.set(clave, [...(grupos.get(clave) ?? []), c])
  }
  const repetidas: AdjudicacionRepetida[] = []
  for (const grupo of [...grupos.values()].flatMap(porLote)) {
    const [queda, ...sobran] = [...grupo].sort(
      (a, b) =>
        Number(esTituloCpv(a.title)) - Number(esTituloCpv(b.title)) ||
        Number(a.awardDate === null) - Number(b.awardDate === null) ||
        Number(a.batchNumber === 0) - Number(b.batchNumber === 0) ||
        a.id.localeCompare(b.id),
    )
    for (const c of sobran) {
      repetidas.push({ id: c.id, sourceRowId: c.sourceRowId, queda: queda.id })
    }
  }
  const retiradas = new Set(repetidas.map((r) => r.id))
  return { contratos: contracts.filter((c) => !retiradas.has(c.id)), repetidas }
}

/**
 * La fecha de adjudicación de la gemela de cada fila que no la trae.
 *
 * Gemela es una fila igual en todo lo que el parser lee de la fuente salvo la
 * identidad, el título y la fecha: no basta con la clave de arriba, porque a una
 * fila sin fecha le falta la prueba que la hace ser la misma adjudicación, así que
 * todo lo demás tiene que decirlo. 196/2023 comparte enlace, importe y
 * adjudicataria con su fila fechada, y no se funde: trae otro lote, otro plazo y
 * otro inicio. Si las gemelas fechadas no coinciden en la fecha, no hay una que
 * darle; sin ninguna fechada, tampoco.
 */
function fechaDeSuGemela(contracts: Contract[]): Map<Contract, string> {
  const gemelas = new Map<string, Contract[]>()
  for (const c of contracts) {
    const { id, sourceRowId, title, awardDate, ...resto } = c
    const huella = JSON.stringify(Object.entries(resto).sort(([a], [b]) => a.localeCompare(b)))
    gemelas.set(huella, [...(gemelas.get(huella) ?? []), c])
  }
  const fechas = new Map<Contract, string>()
  for (const grupo of gemelas.values()) {
    const fechadas = new Set(grupo.map((c) => c.awardDate).filter((f) => f !== null))
    if (fechadas.size !== 1) continue
    const [fecha] = fechadas
    for (const c of grupo) if (c.awardDate === null) fechas.set(c, fecha)
  }
  return fechas
}

/** Reparte por lote filas iguales en todo lo demás; con un solo lote numerado, van juntas. */
function porLote(filas: Contract[]): Contract[][] {
  const numerados = new Set(filas.map((c) => c.batchNumber).filter((lote) => lote !== 0))
  if (numerados.size === 1) return [filas]
  const lotes = new Map<number, Contract[]>()
  for (const c of filas) lotes.set(c.batchNumber, [...(lotes.get(c.batchNumber) ?? []), c])
  return [...lotes.values()]
}

// ---------------------------------------------------------------------------
// Tenders
// ---------------------------------------------------------------------------
export function parseRibalicitaTenders(csv: string): Tender[] {
  const rows = csvRows(csv)
  const list: Tender[] = []
  for (const row of rows) {
    const id = str(row.id) || str(row.title).slice(0, 80)
    if (!id) continue
    list.push({
      id,
      title: str(row.title),
      documentNumber: nullable(row.document_number),
      permalink: nullable(row.permalink),
      status: estadoDeLicitacion(row.status),
      sourceStatus: nullable(row.status),
      contractType: nullable(row.contract_type),
      processType: nullable(row.process_type),
      minorContract: String(row.minor_contract).toLowerCase() === 't',
      submissionDate: nullable(row.submission_date),
      openProposalsDate: nullable(row.open_proposals_date),
      contractor: nullable(row.contractor),
      contractValue: num(row.contract_value),
      initialAmount: num(row.initial_amount),
      initialAmountNoTaxes: num(row.initial_amount_no_taxes),
      categoryTitle: nullable(row.category_title),
      cpvs: str(row.cpvs)
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s.length > 0),
      numberOfBatches: num(row.number_of_batches),
    })
  }
  // Newest-first by submission_date (null last).
  list.sort((a, b) => {
    const ad = a.submissionDate ? new Date(a.submissionDate).getTime() : -Infinity
    const bd = b.submissionDate ? new Date(b.submissionDate).getTime() : -Infinity
    return bd - ad
  })
  return list
}
