/**
 * ¿Sigue estando la cita de una declaración donde dice que está?
 *
 * `check:finding-quotes` hace esta pregunta para las citas de los HALLAZGOS —la
 * prosa curada y firmada— y la hace bien. Las declaraciones publicadas, que son
 * dos órdenes de magnitud más, no las miraba nadie. La primera vez que se
 * contaron, el 3-sep-2026, salió esto sobre 4.664:
 *
 *   · 3.076 en la transcripción vigente
 *   · **1.564 (33 %) SÓLO en la transcripción superseded**
 *   ·    24 en ninguna de las dos
 *   ·   291 atribuciones que la evidencia actual ya no sostiene
 *   ·     4 que nombran el partido EQUIVOCADO
 *
 * La causa no es que nadie inventara nada: cuatro sesiones se re-transcribieron
 * después de extraer sus declaraciones, y nada re-derivó ni las citas ni las
 * atribuciones. `transcribe-pleno.sh` ya avisa de que reemplazar una
 * transcripción puede dejar huérfana una cita publicada; lo que faltaba era
 * alguien que lo midiera.
 *
 * ── Por qué CUATRO desenlaces y no dos ──────────────────────────────────────
 *
 * Porque «no hay transcripción que leer» NO es «no encontré la cita», y
 * doblar el uno dentro del otro es exactamente cómo una puerta acaba
 * imprimiendo su propio visto bueno (regla 2 de DATA_INTEGRITY; el defecto
 * `r?.findings ?? []`). Y porque «sólo está en la versión anterior» no es «no
 * está»: la procedencia existe, es más vieja. Tratarlas igual convertiría un
 * tercio del corpus en una alarma, y una puerta que se equivoca de cada tres
 * es una puerta que todo el mundo se salta —la misma línea que traza
 * `check:citations` al bloquear sólo con `dead`.
 *
 * Se usa `quoteAppearsIn`, que es EL matcher de la casa. Medido: con
 * `locateQuote` (un ayudante de alineación, con umbral de cobertura) el mismo
 * corpus daba 491 «sin rastro» en vez de 24 — veinte veces la alarma real. El
 * instrumento se equivoca antes que el dato.
 */
import { prepararHeno, quoteAppearsInPrepared, type HenoPreparado } from './quote-match'

export type ProvenanceOutcome = 'vigente' | 'solo-superseded' | 'sin-rastro' | 'sin-transcripcion'

export type AttributionOutcome =
  | 'coincide'
  | 'sin-sosten'
  | 'sin-publicar'
  | 'partido-distinto'
  | 'sin-mapa'

/** Los dos únicos desenlaces que paran una publicación. */
const BLOCKING_PROVENANCE: ReadonlySet<ProvenanceOutcome> = new Set(['sin-rastro'])
const BLOCKING_ATTRIBUTION: ReadonlySet<AttributionOutcome> = new Set(['partido-distinto'])

export function classifyClaimProvenance(input: {
  verbatim: string
  /** Texto de la transcripción vigente, o null si no hay ninguna. */
  current: string | null
  /**
   * Las transcripciones SUSTITUIDAS de esta sesión, o null si no hay ninguna.
   *
   * Acepta una lista porque una sesión se re-transcribe más de una vez y el
   * archivo guarda una predecesora por ranura — ver `superseded-archive.ts`.
   * Con una sola ranura, tres citas publicadas se quedaron sin procedencia
   * cuando la segunda re-transcripción pisó el archivo de la primera. Un
   * `string` suelto se sigue aceptando: es el caso de una sola predecesora y
   * lo usan las pruebas y los llamadores viejos.
   */
  superseded: string | readonly string[] | null
}): ProvenanceOutcome {
  const anteriores =
    input.superseded === null
      ? []
      : typeof input.superseded === 'string'
        ? [input.superseded]
        : input.superseded
  return classifyClaimProvenancePreparado({
    verbatim: input.verbatim,
    current: input.current === null ? null : prepararHeno(input.current),
    superseded: anteriores.map(prepararHeno),
  })
}

/**
 * Lo mismo, con los textos ya normalizados.
 *
 * Existe por el coste, no por la lógica: normalizar es el 100 % del trabajo de
 * `quoteAppearsIn`, así que preguntar por 6.919 declaraciones normalizaba las
 * ~25 transcripciones 6.919 veces — 42 s, de los que 41,8 eran repetir lo
 * mismo. La puerta de publicación entra por aquí; todo lo demás sigue entrando
 * por arriba. LOS CUATRO DESENLACES SE DECIDEN UNA SOLA VEZ, aquí: dos copias
 * de esta escalera es exactamente cómo empiezan a discrepar la puerta que
 * retira y el parte que cuenta.
 */
export function classifyClaimProvenancePreparado(input: {
  verbatim: string
  current: HenoPreparado | null
  superseded: readonly HenoPreparado[]
}): ProvenanceOutcome {
  const { verbatim, current, superseded } = input
  // Sin acta no se ha comprobado nada. Su propia categoría, siempre.
  if (current === null) return 'sin-transcripcion'
  if (quoteAppearsInPrepared(verbatim, current)) return 'vigente'
  if (superseded.some((t) => quoteAppearsInPrepared(verbatim, t))) return 'solo-superseded'
  return 'sin-rastro'
}

export function classifyAttribution(input: {
  /** El `speakerGroup` que está PUBLICADO. */
  stored: string | null
  /** El que da hoy el mapa de voces sobre la transcripción vigente. */
  fresh: string | null
  /** Si no hay mapa, no hay con qué cotejar — y eso no es un acuerdo. */
  hasMap: boolean
}): AttributionOutcome {
  const { stored, fresh, hasMap } = input
  if (!hasMap) return 'sin-mapa'
  if (stored === fresh) return 'coincide'
  if (stored !== null && fresh === null) return 'sin-sosten'
  if (stored === null && fresh !== null) return 'sin-publicar'
  return 'partido-distinto'
}

export interface ProvenanceRow {
  provenance: ProvenanceOutcome
  attribution: AttributionOutcome
}

export interface ProvenanceTally {
  total: number
  provenance: Partial<Record<ProvenanceOutcome, number>>
  attribution: Partial<Record<AttributionOutcome, number>>
  blocking: number
  ok: boolean
  motivo: string
}

export function tallyProvenance(rows: readonly ProvenanceRow[]): ProvenanceTally {
  const provenance: Partial<Record<ProvenanceOutcome, number>> = {}
  const attribution: Partial<Record<AttributionOutcome, number>> = {}
  let blocking = 0
  for (const r of rows) {
    provenance[r.provenance] = (provenance[r.provenance] ?? 0) + 1
    attribution[r.attribution] = (attribution[r.attribution] ?? 0) + 1
    if (BLOCKING_PROVENANCE.has(r.provenance) || BLOCKING_ATTRIBUTION.has(r.attribution)) {
      blocking += 1
    }
  }
  // Cero filas NO es un aprobado. Un corpus que no se carga imprimiría, sin
  // esto, el visto bueno más limpio del repositorio.
  if (rows.length === 0) {
    return {
      total: 0,
      provenance,
      attribution,
      blocking: 0,
      ok: false,
      motivo:
        'no se leyó ninguna declaración: sin corpus no hay nada comprobado, ' +
        'y eso no es lo mismo que no haber encontrado nada',
    }
  }
  return {
    total: rows.length,
    provenance,
    attribution,
    blocking,
    ok: blocking === 0,
    motivo:
      blocking === 0
        ? `${rows.length} declaración(es) con procedencia comprobada`
        : `${blocking} declaración(es) sin rastro en ninguna transcripción o con el partido cambiado`,
  }
}
