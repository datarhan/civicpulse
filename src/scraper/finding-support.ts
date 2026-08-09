/**
 * finding-support — assemble the evidence a curator needs to answer, for each
 * published `/hallazgos` finding, the one question no check can answer:
 *
 *   ¿el extracto citado SOSTIENE la frase, o sólo se le PARECE?
 *
 * Three published findings show the failure class this exists to surface:
 *
 *   · f-2026-01-19-acu-d2b7bb — «…que corrobora la referencia a la gestión del
 *     correo electrónico municipal», cotejado con un contrato de migración a
 *     Microsoft 365. El debate era si un concejal había contestado un correo.
 *     Colisión léxica sobre «correo».
 *   · f-2025-10-06-cit-591d40 — un debate sobre atención policial a mujeres
 *     vulnerables, atado al «Contrato Menor de Suministro de dos perros para la
 *     Unidad Canina». Colisión sobre «Unidad … Policía Local».
 *   · f-2026-05-11-acu-1e1bfa — «la valoración técnica de este Plan no es
 *     positiva» atribuida a un contrato del Plan de Igualdad cuando quien
 *     hablaba se refería a Tesorería.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POR QUÉ ESTO PRESENTA Y NO TRIA
 *
 * No hay puntuación, ni orden por fuerza, ni recomendación — y no es una
 * omisión, es el resultado de una medición. El commit 8989c3b probó un cribado
 * léxico contra la señal independiente del motor de veredictos: su bucket
 * «débil» retenía un 67 % de veredictos retractados frente al 62 % del bucket
 * «fuerte». Cero poder discriminante. Un número al lado de una fila que nombra
 * a un grupo político no sería neutral: dirigiría la lectura del curador con
 * una señal que ya sabemos que no informa.
 *
 * Lo que sí es lícito medir con una expresión regular es una propiedad LÉXICA
 * del propio sumario: **¿afirma un vínculo documental, sí o no?** Eso se lee en
 * el texto («el registro municipal incluye…»), no se infiere del expediente.
 * `classifyClaimShape` hace exactamente eso y nada más: NUNCA predice si el
 * vínculo se sostiene. Su única consecuencia es el orden de la cola, y las 52
 * filas entran en la cola pase lo que pase.
 *
 * La decisión la toma una persona: `revisar-borrador` paso 3 es «Informa, no
 * edites», y `decideAutomation` devuelve Tier C en cuanto una fila nombra a
 * alguien. Nada de este módulo escribe en `public/data/pleno-findings.json`;
 * el único escritor sigue siendo `npm run correct-pleno-finding`.
 */
import { sha256Short } from './hash'
import type { PlenoFinding, PlenoFindingsSnapshot } from './pleno-finding'

/** Ruta del único escritor del snapshot publicado. Ninguna otra cosa escribe. */
export const CORRECTION_CLI = 'npm run correct-pleno-finding'

/**
 * Las cuatro clases de fallo del paso 1 de `revisar-borrador`, más «se
 * sostiene» y el estado inicial. El curador elige una; la cola no elige por él.
 */
export const SUPPORT_VERDICTS = [
  {
    id: 'pendiente',
    label: 'Pendiente de revisión',
    question: 'Todavía nadie ha leído este sumario contra su extracto.',
    isFailure: false,
  },
  {
    id: 'lo-sostiene',
    label: 'Lo sostiene',
    question: 'El extracto citado sostiene lo que la frase afirma.',
    isFailure: false,
  },
  {
    id: 'solo-se-le-parece',
    label: 'Sólo se le parece',
    question:
      '¿Lo sostiene o sólo se le parece? El extracto puede mencionar el asunto y el hecho sin ligarlos.',
    isFailure: true,
  },
  {
    id: 'tiempo-verbal-no-coincide',
    label: 'El tiempo verbal no coincide',
    question:
      '¿Coincide el tiempo verbal? Un extracto en futuro («se aprobará») no sostiene una frase en pasado.',
    isFailure: true,
  },
  {
    id: 'omision-que-cambia-la-conclusion',
    label: 'Falta algo que cambia la conclusión',
    question:
      '¿Falta algo que cambia la conclusión? No basta con que cada cifra sea cierta si la conclusión es falsa.',
    isFailure: true,
  },
  {
    id: 'nombra-persona-con-prueba-de-bloque',
    label: 'Nombra a una persona con prueba de bloque',
    question:
      '¿Nombra a una persona con prueba de bloque? `speakerGroup` es PSOE/PP/VOX/Compromís o null; cruzar a un individuo lo hace un curador, por hallazgo, con prueba propia.',
    isFailure: true,
  },
] as const

export type SupportVerdictId = (typeof SUPPORT_VERDICTS)[number]['id']

export const SUPPORT_VERDICT_IDS: readonly SupportVerdictId[] = SUPPORT_VERDICTS.map((v) => v.id)

export type ClaimShape =
  | 'afirmativa-documental'
  | 'documental-matizada'
  | 'sin-afirmacion-documental'

/**
 * Sustantivos con los que el sitio nombra, en su propia voz, un documento
 * publicado. Deliberadamente NO incluye verbos de habla («menciona», «hace
 * referencia»): que un grupo mencione un contrato en el pleno no es que
 * nosotros afirmemos que el registro lo respalda.
 */
const DOC_NOUN_RE =
  /(?:registros?|expedientes?|contratos?|licitaci[oó]n(?:es)?|documentaci[oó]n|documentos|base (?:municipal|de contratos|de datos)|contrataci[oó]n (?:municipal )?publicada|acuerdo marco)/i

/**
 * Conectores afirmativos en voz del medio. Cada uno lleva nombre para que la
 * fila pueda decirle al curador QUÉ frase la clasificó: una cola que no puede
 * explicar su propia etiqueta es una cola en la que no se puede confiar.
 */
const DOCUMENTARY_CONNECTORS: ReadonlyArray<readonly [string, RegExp]> = [
  ['incluye', /\bincluyen?\b/i],
  ['consta', /\bconstan?\b/i],
  ['registra', /\bregistran?\b/i],
  ['figura', /\bfiguran?\b/i],
  ['cuenta-con', /\bcuenta con\b/i],
  ['corrobora', /\bcorrobora\b/i],
  ['coincide-con', /\bcoinciden? con\b/i],
  ['se-relaciona-con', /\bse relacionan? con\b/i],
  ['se-refleja-en', /\bse reflejan? en\b|\breflejad[oa]s? en\b/i],
  ['se-enmarca-en', /\bse enmarcan? en\b/i],
  ['queda-documentado', /\bqueda documentad[oa]\b/i],
  ['en-referencia-al', /\ben referencia al?\b/i],
  ['segun-el-registro', /\bseg[uú]n el registro\b/i],
  ['documentos-cotejados', /\bdocumentos cotejados\b/i],
]

/**
 * Matices y negaciones: el sumario dice explícitamente que el documento NO
 * respalda, o sólo respalda en parte. Su presencia no absuelve a la fila — sólo
 * la baja del bloque que se lee primero.
 */
const HEDGE_MARKERS: ReadonlyArray<readonly [string, RegExp]> = [
  [
    'negacion',
    /\bno\s+(?:se\s+)?(?:recoge|recogen|registra|registran|consta|constan|incluye|incluyen|documenta|documentan|permite|permiten|equivale|corresponde|cita|citan|acredita|respalda)\b/i,
  ],
  ['sin-respaldo', /\bsin\s+(?:corroboraci[oó]n|contraste|respaldo|expediente)\b/i],
  [
    'ninguno',
    /\bningun[oa]\b[^.]{0,70}\b(?:respalda|desmiente|expediente|operaci[oó]n|contrato|fila)\b/i,
  ],
  [
    'parcial',
    /\bparcialmente\b|\bs[oó]lo podemos confirmar\b|\bquedan? pendiente\b|\bpendiente de documentar\b|\bqueda por documentarse\b/i,
  ],
]

export interface ConnectorHit {
  /** Nombre del conector, p. ej. `incluye`. */
  name: string
  /** La frase del sumario que lo contiene, **verbatim**. */
  sentence: string
}

export interface HedgeHit {
  name: string
  /** El texto exacto que activó el matiz, **verbatim**. */
  match: string
}

export interface ClaimShapeResult {
  shape: ClaimShape
  connectors: ConnectorHit[]
  hedges: HedgeHit[]
}

/** Corta el sumario en frases sin normalizar nada dentro de ellas. */
export function splitSentences(summary: string): string[] {
  return summary.split(/(?<=[.;])\s+/).filter((s) => s.trim().length > 0)
}

/**
 * ¿El sumario afirma un vínculo documental? Propiedad **léxica** del texto.
 *
 * NO es una predicción de si el vínculo se sostiene — eso lo mide una persona,
 * y el cribado léxico que lo intentó quedó medido sin poder discriminante
 * (8989c3b). El resultado sólo ordena la cola.
 */
export function classifyClaimShape(summary: string): ClaimShapeResult {
  const connectors: ConnectorHit[] = []
  for (const sentence of splitSentences(summary)) {
    if (!DOC_NOUN_RE.test(sentence)) continue
    for (const [name, re] of DOCUMENTARY_CONNECTORS) {
      if (re.test(sentence)) {
        connectors.push({ name, sentence })
        break
      }
    }
  }
  const hedges: HedgeHit[] = []
  for (const [name, re] of HEDGE_MARKERS) {
    const m = re.exec(summary)
    if (m) hedges.push({ name, match: m[0] })
  }
  const shape: ClaimShape =
    connectors.length > 0
      ? hedges.length > 0
        ? 'documental-matizada'
        : 'afirmativa-documental'
      : 'sin-afirmacion-documental'
  return { shape, connectors, hedges }
}

/**
 * Revisiones anteriores que constan **por escrito en la prosa de un commit**.
 *
 * Sólo lo que un commit nombra explícitamente. La pasada de c2b61c6 dio por
 * sostenidos 10 hallazgos pero sólo nombró 4: los otros 6 no se pueden
 * identificar, y deducirlos por eliminación es exactamente cómo la anterior
 * afirmación de «cierre» se cayó tres días después. Sin nombre, sin etiqueta.
 */
export interface PriorReview {
  outcome: 'upheld' | 'corrected'
  sourceCommit: string
  note: string
}

export const PRIOR_REVIEWS: Readonly<Record<string, PriorReview>> = {
  'f-2026-03-09-afi-a9546e': {
    outcome: 'upheld',
    sourceCommit: 'c2b61c6',
    note: 'Nombrado en la auditoría como ejemplar: «dice literalmente "Sin contraste automático: la traza queda en el acta y el expediente interno, no en contratacion.es"».',
  },
  'f-2026-01-19-acu-2c074a': {
    outcome: 'upheld',
    sourceCommit: 'c2b61c6',
    note: 'Nombrado en la auditoría como ejemplar: «enlaza "contratamos de manera verbal y por emergencia" con el contrato verbal por el temporal: coincidencia directa».',
  },
  'f-2025-12-23-cit-c905c3': {
    outcome: 'upheld',
    sourceCommit: 'c2b61c6',
    note: 'Nombrado en la auditoría como ejemplar: «cita exactamente el expediente del que se hablaba».',
  },
  'f-2026-07-03-cit-df8455': {
    outcome: 'upheld',
    sourceCommit: 'c2b61c6',
    note: 'Nombrado en la auditoría como ejemplar: «cita exactamente el expediente del que se hablaba».',
  },
  'f-2026-07-03-cit-1e90e0': {
    outcome: 'corrected',
    sourceCommit: '8989c3b',
    note: 'Defecto corregido: afirmaba «Según el registro municipal» un contrato de emergencia a FCC que no existe en ninguna fila publicada.',
  },
  'f-2026-01-19-cit-8b29a9': {
    outcome: 'corrected',
    sourceCommit: '8989c3b',
    note: 'Defecto corregido: respaldaba el cambio de parqué de La Malla con un contrato de pavimentación del paseo Pacadar, otra actuación.',
  },
  'f-2026-05-11-acu-7c65c5': {
    outcome: 'corrected',
    sourceCommit: 'c2b61c6',
    note: 'Defecto corregido: publicaba como registro existente un PEF que la intervención de origen anunciaba en futuro («que aprobaremos en el 2025»).',
  },
}

export interface QueueRef {
  kind: string
  ref: string
  /**
   * El `snippet` del snapshot, **byte a byte**. Sin re-ajustar, recortar ni
   * normalizar: el curador juzga el texto que el lector ve, no una versión
   * limpia de él.
   */
  excerpt: string
}

export interface QueueRow {
  id: string
  plenoId: string
  plenoDate: string
  title: string
  summary: string
  /** sha256Short(summary) — invalida un veredicto si el sumario cambia. */
  summaryHash: string
  severity: PlenoFinding['severity']
  claimShape: ClaimShape
  documentaryConnectors: ConnectorHit[]
  hedges: HedgeHit[]
  quotes: PlenoFinding['quotes']
  crossChecked: QueueRef[]
  contradiction: QueueRef[]
  corrections: PlenoFinding['corrections']
  priorReview: PriorReview | null
  /** Veredicto del curador. La cola nunca lo rellena por sí sola. */
  verdict: SupportVerdictId
  reviewer: string | null
  reviewedAt: string | null
  notes: string
  /** Motivo por el que un veredicto anterior se descartó, si lo hubo. */
  verdictInvalidatedBy: string | null
  /** El comando exacto — el único escritor del snapshot publicado. */
  correctionCommand: string
}

export interface SupportQueue {
  _comment: string
  generatedAt: string
  queueVersion: string
  sourceSnapshot: {
    path: string
    generatedAt: string
    itemCount: number
  }
  verdictOptions: typeof SUPPORT_VERDICTS
  stats: {
    queued: number
    afirmativaDocumental: number
    documentalMatizada: number
    sinAfirmacionDocumental: number
    conRevisionPrevia: number
    conVeredictoDelCurador: number
    veredictosArrastrados: number
    veredictosInvalidadosPorCambio: number
  }
  rows: QueueRow[]
}

export const QUEUE_VERSION = 'finding-support-v1'

/** Orden de lectura: primero lo que afirma un vínculo sin matizarlo. */
const SHAPE_ORDER: Record<ClaimShape, number> = {
  'afirmativa-documental': 0,
  'documental-matizada': 1,
  'sin-afirmacion-documental': 2,
}

function toRef(r: { kind: string; ref: string; snippet: string }): QueueRef {
  // `snippet` entra tal cual. Cualquier `.trim()` aquí rompería la garantía de
  // que lo que revisa el curador es lo que el lector tiene delante.
  return { kind: r.kind, ref: r.ref, excerpt: r.snippet }
}

/** Estado de revisión rescatable de una ejecución anterior de la cola. */
export interface CarriedReview {
  summaryHash: string
  verdict: SupportVerdictId
  reviewer: string | null
  reviewedAt: string | null
  notes: string
}

/**
 * Construye la cola. Función pura: no lee disco ni red, y no toca el snapshot.
 *
 * `previous` permite reejecutar la cola sin borrar el trabajo del curador — es
 * un fichero de trabajo en `editorial/`, editable a mano. El arrastre está
 * direccionado por CONTENIDO (`summaryHash`): si el sumario cambió, el
 * veredicto anterior se refería a otra frase y se descarta con su motivo, en
 * vez de sobrevivir callado a la corrección que debía provocar.
 */
export function buildSupportQueue(
  snapshot: PlenoFindingsSnapshot,
  opts: {
    generatedAt: string
    snapshotPath?: string
    previous?: ReadonlyMap<string, CarriedReview>
  },
): SupportQueue {
  const previous = opts.previous ?? new Map<string, CarriedReview>()
  let carried = 0
  let invalidated = 0

  const rows: QueueRow[] = snapshot.items.map((f) => {
    const { shape, connectors, hedges } = classifyClaimShape(f.summary)
    const summaryHash = sha256Short(f.summary)
    const prev = previous.get(f.id)
    let verdict: SupportVerdictId = 'pendiente'
    let reviewer: string | null = null
    let reviewedAt: string | null = null
    let notes = ''
    let verdictInvalidatedBy: string | null = null
    if (prev && prev.verdict !== 'pendiente') {
      if (prev.summaryHash === summaryHash) {
        verdict = prev.verdict
        reviewer = prev.reviewer
        reviewedAt = prev.reviewedAt
        notes = prev.notes
        carried += 1
      } else {
        verdictInvalidatedBy = `el sumario cambió desde la revisión (${prev.verdict}); vuelve a leerlo`
        notes = prev.notes
        invalidated += 1
      }
    } else if (prev) {
      notes = prev.notes
    }
    return {
      id: f.id,
      plenoId: f.plenoId,
      plenoDate: f.plenoDate,
      title: f.title,
      summary: f.summary,
      summaryHash,
      severity: f.severity,
      claimShape: shape,
      documentaryConnectors: connectors,
      hedges,
      quotes: f.quotes,
      crossChecked: f.crossChecked.map(toRef),
      contradiction: f.contradiction.map(toRef),
      corrections: f.corrections,
      priorReview: PRIOR_REVIEWS[f.id] ?? null,
      verdict,
      reviewer,
      reviewedAt,
      notes,
      verdictInvalidatedBy,
      correctionCommand:
        `${CORRECTION_CLI} -- ${f.id} --field summary ` +
        '--new "<sumario corregido>" --reason "<por qué, ≥20 caracteres>" --editor "<tu nombre>"',
    }
  })

  // Sólo se reordena; no se descarta ninguna fila. La cola contiene el snapshot
  // entero porque «las 28 sin veredicto» era una lista construida por
  // eliminación, y de las 10 que la pasada anterior dio por sostenidas sólo
  // nombró 4.
  rows.sort((a, b) => {
    const s = SHAPE_ORDER[a.claimShape] - SHAPE_ORDER[b.claimShape]
    if (s !== 0) return s
    if (a.plenoDate !== b.plenoDate) return a.plenoDate < b.plenoDate ? 1 : -1
    return a.id < b.id ? -1 : 1
  })

  const count = (s: ClaimShape) => rows.filter((r) => r.claimShape === s).length
  return {
    _comment:
      'COLA DE REVISIÓN — no publicada, y no debe publicarse. Vive en editorial/ (gitignored) ' +
      'porque todo lo que hay bajo public/ es fetchable por URL esté enlazado o no. Presenta ' +
      'evidencia; no puntúa, no ordena por fuerza y no recomienda. Decide una persona, y el ' +
      `único escritor del snapshot publicado es \`${CORRECTION_CLI}\`.`,
    generatedAt: opts.generatedAt,
    queueVersion: QUEUE_VERSION,
    sourceSnapshot: {
      path: opts.snapshotPath ?? 'public/data/pleno-findings.json',
      generatedAt: snapshot.generatedAt,
      itemCount: snapshot.items.length,
    },
    verdictOptions: SUPPORT_VERDICTS,
    stats: {
      queued: rows.length,
      afirmativaDocumental: count('afirmativa-documental'),
      documentalMatizada: count('documental-matizada'),
      sinAfirmacionDocumental: count('sin-afirmacion-documental'),
      conRevisionPrevia: rows.filter((r) => r.priorReview !== null).length,
      conVeredictoDelCurador: rows.filter((r) => r.verdict !== 'pendiente').length,
      veredictosArrastrados: carried,
      veredictosInvalidadosPorCambio: invalidated,
    },
    rows,
  }
}

/** Lee el estado de revisión de una cola anterior, tolerando basura. */
export function carriedReviewsFrom(previousQueue: unknown): Map<string, CarriedReview> {
  const out = new Map<string, CarriedReview>()
  const rows = (previousQueue as { rows?: unknown })?.rows
  if (!Array.isArray(rows)) return out
  for (const r of rows) {
    const row = r as Record<string, unknown>
    if (typeof row.id !== 'string' || typeof row.summaryHash !== 'string') continue
    const verdict = SUPPORT_VERDICT_IDS.includes(row.verdict as SupportVerdictId)
      ? (row.verdict as SupportVerdictId)
      : 'pendiente'
    out.set(row.id, {
      summaryHash: row.summaryHash,
      verdict,
      reviewer: typeof row.reviewer === 'string' ? row.reviewer : null,
      reviewedAt: typeof row.reviewedAt === 'string' ? row.reviewedAt : null,
      notes: typeof row.notes === 'string' ? row.notes : '',
    })
  }
  return out
}
