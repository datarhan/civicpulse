/**
 * «¿Dice el sumario, con otras palabras, lo que la cita retenida no puede
 * decir?» — la cola de `triage:finding-exception`.
 *
 * ── Por qué esta pregunta (decisión del operador, 30-09-2026) ─────────────────
 *
 * La cola nació el 10-08-2026 con otra: «¿merece este hallazgo la excepción?».
 * Promover una declaración a hallazgo la sacaba entonces de la puerta editorial
 * —/hallazgos imprimía el literal de una acusación que /plenos retenía—, y la
 * pregunta era la de la propia puerta sobre las fichas que no citaban ni un
 * literal que ella mostraría, casi todas firmadas por `auto-curation-v1`.
 *
 * El 27-08 la ficha pasó a obedecer la puerta la promueva quien la promueva
 * (`citaRetenida`, src/lib/cita-retenida.js), y la pregunta se quedó sin
 * efecto: responderla sólo sacaba la fila de la cola, porque promover escribe
 * pleno-findings.json y ni `classifyClaimVisibility` ni `citaRetenida` lo leen.
 * Tampoco separaba: el filtro —ninguna cita mostrable— encolaba 38 de 40
 * fichas, porque tras retirar la pasada `llm` casi ninguna cita queda `shown`.
 * Una cola cuya respuesta no cambia nada acaba sin abrirse.
 *
 * Lo que la puerta no alcanza es el SUMARIO: prosa del sitio, en su propia voz,
 * al lado del hueco «Literal retenido». `check:summary-gate` bloquea la copia
 * literal, y la criba de la copia servida (`tramosDeLiterales`, con
 * `TRAMO_MINIMO_EN_CARACTERES`) la de 40 caracteres seguidos de cualquier
 * versión del literal. Por debajo —el estilo indirecto, una paráfrasis, dos
 * muletillas entre comillas— ningún umbral separa una copia de un tema, y esa
 * franja se deja a una persona a propósito. Ésta es su cola.
 *
 * ── Qué encola ────────────────────────────────────────────────────────────────
 *
 * Las fichas publicadas con al menos una cita cuyo literal retiene la puerta,
 * elegidas con el predicado de la página (`citaRetenida`) sobre la puerta que
 * publica finding-quote-provenance.json: la cola y el hueco de /hallazgos no
 * pueden discrepar sobre qué cita está retenida. Nunca una comparación con el
 * resultado de la puerta escrita aquí (docs/DATA_INTEGRITY.md, regla 1).
 *
 * ── Qué puede responder una persona ───────────────────────────────────────────
 *
 *   mantener      el sumario no lo dice. `review:finding-exception` lo anota
 *                 atado a la huella del sumario: si el sumario cambia, la ficha
 *                 vuelve a la cola.
 *   corregir      el sumario lo dice. `correct-pleno-finding --redact summary`,
 *                 no `--field summary`: la corrección ordinaria deja el original
 *                 tachado en la bitácora pública de la ficha, y ese original es
 *                 justo la paráfrasis que se quita.
 *   reclasificar  la cita retenida no era una acusación. `reclassify-claim`,
 *                 que sólo aleja de `acusacion_publica`; con el tipo corregido
 *                 la puerta deja de retenerla y, si era la única, la ficha sale.
 *   retirar       la ficha es su acusación. `retract-finding`, sin vuelta atrás.
 *
 * Las cuatro llegan compuestas en cada fila y ninguna se ejecuta aquí: las firma
 * el operador en su terminal. Sus huecos (`MARCADORES`) son cortos a propósito,
 * para que una orden copiada sin rellenar la rechace su propia CLI antes de
 * escribir nada.
 *
 * ── Lo que no hace ────────────────────────────────────────────────────────────
 *
 * No puntúa, no ordena por gravedad, no recomienda ni preselecciona: `decision`
 * es `null` en cada fila y no hay rama que lo llene. Decidir que el sumario
 * publicado sobre un grupo con nombre se queda, se reescribe o se retira es el
 * acto editorial que esta cola existe para dejar a una persona; una cola que
 * llegara con la respuesta sería la máquina decidiéndolo otra vez.
 *
 * Tampoco escribe nada publicado: compone órdenes para las CLIs que sí lo hacen,
 * y todas exigen motivo y dejan rastro. El orden es por fecha del pleno, lo más
 * reciente primero: un calendario, no un juicio.
 */
import type { ClaimVisibility, ClaimVisibilityInput } from './claim-public-gate'
import { ALLOWED_CLAIM_TYPES, type ClaimType } from './pleno-claim'
import { citaRetenida } from '../lib/cita-retenida.js'

export const EXCEPTION_QUEUE_VERSION = 'finding-exception-v2'

/**
 * La pregunta de cada fila, escrita una vez. La titula /curator, la lleva el
 * fichero de la cola, y el registro de revisiones guarda a qué pregunta
 * responde cada versión suya.
 */
export const PREGUNTA_DE_LA_COLA =
  '¿Dice el sumario, con otras palabras, lo que la cita retenida no puede decir?'

export const CORRECTION_CLI = 'npm run correct-pleno-finding'
export const RETRACTION_CLI = 'npm run retract-finding'
export const RECLASSIFICATION_CLI = 'npm run reclassify-claim'
export const REVIEW_CLI = 'npm run review:finding-exception'

/** El único tipo del que `reclassify-claim` aleja una afirmación. */
const TIPO_ACUSACION: ClaimType = 'acusacion_publica'

/** Hacia dónde puede reclasificarse: el enum entero menos la acusación. Derivado, no copiado. */
const TIPOS_DESTINO = ALLOWED_CLAIM_TYPES.filter((t) => t !== TIPO_ACUSACION)

/**
 * Los huecos de una orden preparada.
 *
 * Cortos a propósito: cada uno queda por debajo de lo que exige la CLI que lo
 * recibe —un motivo o una nota de menos de 20 caracteres, un sumario de menos
 * de 40, que `applyFindingRedaction` rechaza como muñón, un tipo fuera del
 * enum—, así que una orden copiada tal cual se rechaza antes de escribir nada.
 * La firma la rechazan también `retract-finding`, `reclassify-claim` y
 * `--redact`, antes de leer nada (`rechazoDeMarcador`, firma-de-persona.ts),
 * pero sólo como hueco: no piden una persona, porque el operador las firma con
 * la cuenta de rol; y `review:finding-exception` no mira su `--reviewer`.
 * Retirar una ficha no tiene vuelta atrás: los demás huecos siguen cortos.
 */
export const MARCADORES = {
  firma: '<nombre y apellidos>',
  motivo: '<motivo>',
  nota: '<por qué>',
  sumario: '<sumario nuevo>',
  tipo: `<${TIPOS_DESTINO.join(' | ')}>`,
} as const

/** Una cita de la ficha, con los dos veredictos que hay que ver a la vez. */
export interface ExceptionQuote {
  index: number
  /**
   * El literal tal como está en el repositorio, byte a byte — también el de una
   * retenida, que la página no imprime: sin leerlo no se puede cotejar con el
   * sumario. Por eso la cola vive en editorial/ y no se publica.
   */
  text: string
  speakerGroup: string | null
  claimId: string | null
  /** Lo que haría la puerta editorial con la afirmación, en sus propias palabras. */
  gate: ClaimVisibility | null
  /** El veredicto del verificador que leyó la puerta. `null` si falta la afirmación. */
  verdict: string | null
  claimType: string | null
  accusationSubtype: string | null
  /** El eje de la transcripción de la misma cita, para tener las dos marcas en una pantalla. */
  transcriptStatus: string | null
  /** ¿Retiene la puerta su literal? Lo decide `citaRetenida`, el predicado de la página. */
  retenida: boolean
  /**
   * La orden que la reclasificaría, si no era una acusación. Sólo en una cita
   * retenida cuyo tipo publicado es `acusacion_publica` —`reclassify-claim` sólo
   * aleja de ahí—; `null` en las demás. Compuesta, nunca ejecutada.
   */
  reclasificar: string | null
}

export interface ExceptionRow {
  findingId: string
  plenoId: string
  plenoDate: string
  title: string
  severity: string
  /** La prosa publicada. Es lo que se juzga: las citas son su evidencia. */
  summary: string
  curatorName: string
  publishedAt: string
  quotes: ExceptionQuote[]
  /** Cuántas citas retiene la puerta. Al menos una: es el criterio de la cola. */
  citasRetenidas: number
  /**
   * Las retiene TODAS: el sumario no descansa en nada que la ficha enseñe.
   * `check:summary-gate` ya bloquea esa forma (`findHollowFindings`); aquí se
   * marca, porque ahí reescribir no arregla nada.
   */
  todasRetenidas: boolean
  /** ¿Ya ha replicado un grupo? Una réplica es contexto, nunca un veredicto. */
  conReplica: boolean
  /**
   * Siempre `null`. Ninguna rama lo llena, y ésa es la garantía de la pantalla:
   * la cola presenta, no decide.
   */
  decision: null
  /**
   * Las respuestas que valen para toda la ficha, compuestas y sin ejecutar. La
   * cuarta, reclasificar, va en cada cita retenida (`ExceptionQuote.reclasificar`).
   */
  commands: { mantener: string; corregirSumario: string; retirarHallazgo: string }
}

export interface ExceptionQueue {
  _comment: string
  /** La pregunta de cada fila. */
  pregunta: string
  generatedAt: string
  queueVersion: string
  sourceSnapshot: {
    findings: string
    findingsGeneratedAt: string
    provenance: string
    provenanceGeneratedAt: string
  }
  stats: {
    /** Fichas publicadas examinadas — el denominador. */
    hallazgos: number
    /** Fichas con al menos una cita. Sin citas no hay nada retenido. */
    hallazgosConCitas: number
    encolados: number
    /** Citas de las fichas encoladas, retenidas o no. */
    citasEnCola: number
    /** De ellas, las retenidas: todas las del corpus, porque cada una encola su ficha. */
    citasRetenidas: number
    /** Fichas encoladas con TODAS sus citas retenidas. */
    todasRetenidas: number
    /** Citas encoladas por veredicto de la puerta. */
    porContraste: Record<string, number>
    /** Quién firmó las fichas encoladas. */
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
  quotes?: Array<{
    text?: string
    speakerGroup?: string | null
    sourceClaimId?: string | null
    literalRetenido?: boolean
  }>
}

/** Lo justo de una afirmación verificada para enseñar qué leyó la puerta. */
export interface ExceptionClaimFacts {
  verdict: string | null
  claimType: string | null
  accusationSubtype: string | null
}

/**
 * Lo que la puerta leyó de cada afirmación, para enseñarlo junto a su veredicto.
 *
 * `merged` es el corpus publicado (`loadVerifiedCorpus().merged`), nunca la base
 * sola: sobre la base sola el verificador dice «verificado» de casi todo y la
 * cola enseñaría otro sitio. Vive aquí, y no en la CLI, para que la cola y sus
 * pruebas lean los hechos por el mismo camino.
 */
export function hechosDelVerificador(
  merged: ReadonlyMap<string, ClaimVisibilityInput>,
): Map<string, ExceptionClaimFacts> {
  const facts = new Map<string, ExceptionClaimFacts>()
  for (const [id, item] of merged) {
    const claim = (item?.claim ?? {}) as { type?: unknown; accusationSubtype?: unknown }
    const verdict = item?.verification?.verdict
    facts.set(id, {
      verdict: typeof verdict === 'string' ? verdict : null,
      claimType: typeof claim.type === 'string' ? claim.type : null,
      accusationSubtype:
        typeof claim.accusationSubtype === 'string' ? claim.accusationSubtype : null,
    })
  }
  return facts
}

/**
 * Construye la cola. Pura: `gates` y `facts` llegan ya derivados, así que se
 * prueba sin sistema de ficheros y la CLI hace toda la E/S.
 *
 * `gates` sale del snapshot de procedencia publicado en vez de recalcularse
 * aquí, para que la cola y el hueco de `/hallazgos` no puedan discrepar sobre
 * qué cita está retenida — la misma regla que sigue `quote-reanchor`.
 */
export function buildExceptionQueue(
  findings: ExceptionFinding[],
  lookups: {
    /** findingId → el veredicto de la puerta por cita, por su posición. */
    gates: Record<string, Array<{ gate?: ClaimVisibility | null; status?: string } | null>>
    /** claimId → lo que dijo el verificador. Ausente ⇒ nulls, nunca una suposición. */
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
      const retenida = citaRetenida(gateRows[i], q)
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
        retenida,
        reclasificar:
          retenida && claimId != null && fact?.claimType === TIPO_ACUSACION
            ? `${RECLASSIFICATION_CLI} -- ${claimId} "${MARCADORES.tipo}" ` +
              `--reason "${MARCADORES.motivo}" --editor "${MARCADORES.firma}"`
            : null,
      }
    })
    const citasRetenidas = quotes.filter((q) => q.retenida).length
    // El criterio de la cola, y su único filtro: la pregunta es por lo que el
    // sumario dice de una cita retenida, y sin ninguna no hay nada que la
    // ficha calle y el sumario pueda decir por ella.
    if (citasRetenidas === 0) continue

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
      citasRetenidas,
      todasRetenidas: citasRetenidas === quotes.length,
      conReplica: f.response != null,
      decision: null,
      commands: {
        mantener:
          `${REVIEW_CLI} -- ${f.id} ` +
          `--reviewer "${MARCADORES.firma}" --note "${MARCADORES.nota}"`,
        corregirSumario:
          `${CORRECTION_CLI} -- ${f.id} --redact summary --new "${MARCADORES.sumario}" ` +
          `--reason "${MARCADORES.motivo}" --editor "${MARCADORES.firma}"`,
        retirarHallazgo:
          `${RETRACTION_CLI} -- ${f.id} ` +
          `--reason "${MARCADORES.motivo}" --editor "${MARCADORES.firma}"`,
      },
    })
  }

  // Lo más reciente primero, y después un orden estable de id. Un calendario, no un ranking.
  rows.sort((a, b) => {
    if (a.plenoDate !== b.plenoDate) return a.plenoDate < b.plenoDate ? 1 : -1
    return a.findingId < b.findingId ? -1 : 1
  })

  return {
    _comment:
      'COLA DE EXCEPCIÓN — no publicada, y no debe publicarse. Vive en editorial/ (gitignored) ' +
      'porque todo lo que hay bajo public/ es fetchable por URL esté enlazado o no, y aquí van ' +
      'los literales que la página retiene. Encola las fichas con al menos una cita retenida por ' +
      `la puerta editorial, y pregunta de cada una: «${PREGUNTA_DE_LA_COLA}» PRESENTA la ` +
      'evidencia; no puntúa, no recomienda y no elige (`decision` es siempre null). Cada fila ' +
      `trae las cuatro respuestas compuestas —mantener (\`${REVIEW_CLI}\`), corregir el sumario ` +
      `(\`${CORRECTION_CLI} -- <id> --redact summary\`), reclasificar una cita retenida ` +
      `(\`${RECLASSIFICATION_CLI}\`) y retirar la ficha (\`${RETRACTION_CLI}\`)—, y ninguna se ` +
      'ejecuta desde aquí: las firma una persona.',
    pregunta: PREGUNTA_DE_LA_COLA,
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
      citasEnCola: rows.reduce((n, r) => n + r.quotes.length, 0),
      citasRetenidas: rows.reduce((n, r) => n + r.citasRetenidas, 0),
      todasRetenidas: rows.filter((r) => r.todasRetenidas).length,
      porContraste,
      porCurador,
    },
    rows,
  }
}
