/**
 * claim-reanchor — la cola de reanclaje de las DECLARACIONES retenidas, hermana
 * de `quote-reanchor.ts` y construida sobre sus mismas piezas.
 *
 * Aquélla resuelve los literales de `/hallazgos`, que están firmados por un
 * curador; ésta, los de `/declaraciones`, que salen del extractor. El problema
 * es el mismo con distinta causa: allí el texto se movió bajo la cita, aquí la
 * cita nació desplazada. `check:claim-provenance` cuenta siete cuyo literal no
 * aparece en ninguna transcripción que tengamos, y la puerta de
 * `claim-public-gate.ts` deja de publicarlas — bien, porque son
 * indistinguibles de una inventada, y mal, porque cuatro de las siete son la
 * misma frase del acta mal recortada o mal flexionada.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POR QUÉ ESTO PROPONE Y NO ELIGE
 *
 * Por lo que dice la cabecera de `quote-reanchor.ts`, más una razón que sólo se
 * ve al mirar estas siete: dos de ellas están SOLDADAS de dos pasajes distintos
 * de la misma frase del acta —el extractor cosió el final de una oración con el
 * principio de otra—, y ahí no hay un literal correcto que calcular, hay que
 * decidir de cuál de los dos trozos hablaba la declaración. Un solapamiento
 * léxico alto es exactamente lo que produce una soldadura, así que el número que
 * parecería resolverlo es el que se equivoca.
 *
 * La cola nunca rellena `seleccion`, y `correctionCommand` sale con el hueco del
 * literal sin rellenar a propósito: dejarlo escrito sería elegir con otro nombre.
 *
 * QUIÉN DECIDE QUÉ ENTRA
 *
 * No esto. El llamante pasa los ids que la PUERTA DE PUBLICACIÓN retuvo,
 * calculados con `idsSinProcedencia` — el mismo emparejador y los mismos textos.
 * Si esta cola derivara su propia lista, la cola y la página acabarían
 * discrepando sobre cuáles están afectadas, que es el defecto que este
 * repositorio ya se ha contado dos veces.
 *
 * Módulo puro: no lee disco ni red.
 */
import { candidatePassages, type Candidate, type TranscriptIndex } from './quote-reanchor'

/** El CLI que sí escribe. Nada de este módulo lo invoca. */
export const CLAIM_REANCHOR_CLI = 'npm run reanchor-claim'

export const CLAIM_REANCHOR_QUEUE_VERSION = 'claim-reanchor-v1'

/**
 * Cuánto más ancha que la cita se busca. Exportada para que una prueba mida el
 * efecto en vez de recitar el número.
 */
export const VENTANA_HOLGADA = 1.5

/** Una transcripción de la sesión, con el nombre por el que se la puede citar. */
export interface FuenteIndexada {
  /** `current` o `superseded/<fichero>`. Es lo que acabará en `fuente`. */
  fuente: string
  index: TranscriptIndex
}

export interface ClaimReanchorRow {
  claimId: string
  plenoId: string
  plenoDate: string
  type: string
  speakerGroup: string | null
  verdict: string | null
  /** El literal tal y como está publicado. Byte a byte. */
  publishedVerbatim: string
  /**
   * El fragmento que el extractor guardó alrededor de la cita. Va en la cola
   * porque en cuatro de los siete casos contiene ya la frase entera del acta:
   * el extractor la tenía delante y la citó mal al copiarla. No es una fuente
   * —lo escribió el mismo modelo que se equivocó— y por eso no se propone como
   * candidato; se enseña para que se vea de dónde salió el desliz.
   */
  context: string
  /**
   * Los tramos que más comparten con la cita, por transcripción, ORDENADAS por
   * lo bueno que es su mejor candidato y no por dónde vive el fichero.
   *
   * Importa más de lo que parece: la transcripción vigente de `qz6weg` está en
   * INGLÉS —el motor la tradujo— y su procedencia está en la sustituida. Con las
   * fuentes en orden de carpeta, la primera fila que se lee es la que no puede
   * contener la respuesta.
   */
  candidatesPorFuente: Array<{ fuente: string; candidates: Candidate[] }>
  /** Siempre `null`. No hay rama que lo rellene. */
  seleccion: null
  correctionCommand: string
}

export interface ClaimReanchorQueue {
  _comment: string
  generatedAt: string
  queueVersion: string
  sourceSnapshot: { verified: string; verifiedComposedAt: string }
  stats: {
    /** Lo que la puerta retuvo — el denominador, que no lo pone esta cola. */
    retenidas: number
    encoladas: number
    conCandidatos: number
    sinCandidatos: number
    sinTranscripcion: number
    porTipo: Record<string, number>
  }
  rows: ClaimReanchorRow[]
}

export interface ReanchorClaimItem {
  claim: {
    id: string
    plenoId: string
    plenoDate?: string
    type?: string
    speakerGroup?: string | null
    verbatim: string
    context?: string
  }
  verification?: { verdict?: string } | null
}

/**
 * Construye la cola. Pura: `corpus` trae los índices ya calculados, y
 * `retenidas` viene de quien aplica la puerta.
 */
export function buildClaimReanchorQueue(
  items: readonly ReanchorClaimItem[],
  retenidas: ReadonlySet<string>,
  corpus: ReadonlyMap<string, readonly FuenteIndexada[]>,
  opts: { generatedAt: string; verifiedComposedAt?: string; top?: number },
): ClaimReanchorQueue {
  const rows: ClaimReanchorRow[] = []
  let sinTranscripcion = 0
  const porTipo: Record<string, number> = {}

  for (const it of items) {
    if (!retenidas.has(it.claim.id)) continue
    const fuentes = corpus.get(it.claim.plenoId) ?? []
    if (fuentes.length === 0) sinTranscripcion += 1
    const tipo = it.claim.type ?? 'sin-tipo'
    porTipo[tipo] = (porTipo[tipo] ?? 0) + 1

    const candidatesPorFuente = fuentes
      .map((f) => ({
        fuente: f.fuente,
        candidates: candidatePassages(it.claim.verbatim, f.index, {
          top: opts.top ?? 3,
          // El extractor recorta al citar, así que el original es más largo que
          // lo publicado. Ver `windowFactor` en `candidatePassages`.
          windowFactor: VENTANA_HOLGADA,
        }),
      }))
      .filter((c) => c.candidates.length > 0)
      .sort(
        (a, b) => (b.candidates[0]?.contentOverlap ?? 0) - (a.candidates[0]?.contentOverlap ?? 0),
      )

    rows.push({
      claimId: it.claim.id,
      plenoId: it.claim.plenoId,
      plenoDate: it.claim.plenoDate ?? '',
      type: tipo,
      speakerGroup: it.claim.speakerGroup ?? null,
      verdict: it.verification?.verdict ?? null,
      publishedVerbatim: it.claim.verbatim,
      context: it.claim.context ?? '',
      candidatesPorFuente,
      seleccion: null,
      correctionCommand:
        `${CLAIM_REANCHOR_CLI} -- ${it.claim.id} ` +
        '--verbatim "<el pasaje del acta, copiado tal cual>" ' +
        '--reason "<por qué, ≥20 caracteres>" --editor "<tu nombre>"',
    })
  }

  rows.sort((a, b) => {
    if (a.plenoDate !== b.plenoDate) return a.plenoDate < b.plenoDate ? 1 : -1
    return a.claimId < b.claimId ? -1 : 1
  })

  const conCandidatos = rows.filter((r) => r.candidatesPorFuente.length > 0).length
  return {
    _comment:
      'Cola de reanclaje de declaraciones retenidas por falta de procedencia. PROPONE, NO ELIGE: ' +
      '`seleccion` sale null en todas las filas y no hay rama que la rellene. El único escritor es ' +
      `\`${CLAIM_REANCHOR_CLI}\`, que exige que el literal conste ENTERO en una transcripción. ` +
      'Vive en editorial/ y no en public/: contiene pasajes de transcripción sin revisar.',
    generatedAt: opts.generatedAt,
    queueVersion: CLAIM_REANCHOR_QUEUE_VERSION,
    sourceSnapshot: {
      verified: 'public/data/pleno-claims-verified.json',
      verifiedComposedAt: opts.verifiedComposedAt ?? '',
    },
    stats: {
      retenidas: retenidas.size,
      encoladas: rows.length,
      conCandidatos,
      sinCandidatos: rows.length - conCandidatos,
      sinTranscripcion,
      porTipo,
    },
    rows,
  }
}
