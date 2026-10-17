/**
 * Extracción de prensa acumulada, artículo a artículo — puro, sin E/S.
 *
 * `extract:press-claims` tomaba los `--max` titulares más nuevos y reescribía
 * `press-claims-suggestions.json` entero. La pasada que se auditó en octubre de
 * 2026 sólo había visto los titulares del 7 al 9 de octubre, y de ahí salieron
 * tres defectos a la vez:
 *
 *   · lo extraído en ventanas anteriores desaparecía en cada pasada, porque el
 *     fichero nuevo sólo sabía de la ventana nueva;
 *   · el triaje de cada artículo («no hay afirmación comprobable») se tiraba,
 *     así que no quedaba constancia de qué se había mirado;
 *   · /laboratorio imprimía «El extractor no sacó ninguna afirmación de este
 *     titular» en TODA tarjeta sin afirmaciones, incluidas las que el extractor
 *     nunca vio. Es la regla 2 de CLAUDE.md al pie de la letra: «nunca
 *     intentado» doblado en «intentado, no encontró nada».
 *
 * Este módulo da las tres piezas que lo arreglan, para que la CLI y la página
 * las cableen sin repetir la lógica:
 *
 *   · `desenlaceDe` — qué le pasó a UN artículo en esta pasada, con un valor
 *     por desenlace y sin centinelas: «el LLM no respondió» no es «no hay nada».
 *     Vale para las dos llamadas: el triaje y la extracción. Si el triaje dio
 *     positivo y la extracción no respondió, press-claim-llm.ts devuelve el
 *     triaje real con `claims: []` — idéntico a «miró y no encontró nada». La
 *     CLI tiene que avisar con `extraccionSinRespuesta`; sin el aviso, esa
 *     pasada incompleta borraría las afirmaciones anteriores y el artículo no
 *     volvería nunca a la cola.
 *   · `fundirExtraccion` — une la pasada con lo publicado. Sigue la regla de
 *     DIRECCIÓN de `decideSnapshotWrite` (snapshot-write.ts) a escala de
 *     artículo: una pasada incompleta puede AÑADIR, nunca QUITAR. Un
 *     `llm-no-disponible` no borra un desenlace anterior ni sus afirmaciones.
 *   · `elegirPendientes` — a qué artículos dedicar el tope: primero lo nunca
 *     visto junto con lo que no llegó al modelo, más nuevo antes — un apagón
 *     del LLM no debe dejar los titulares más nuevos detrás del atraso —, y
 *     después lo que cambió de huella.
 *     Lo ya procesado y sin cambios no se reenvía; sus claves de `.llm-cache`
 *     acertarían igual, pero ocuparían plazas del tope que son de trabajo nuevo.
 */

/** Desenlaces posibles de un artículo. La página importa este enum; no lo copies. */
export const DESENLACES_EXTRACCION = [
  'extraido',
  'sin-afirmaciones',
  'descartado-en-triaje',
  'llm-no-disponible',
] as const

export type DesenlaceExtraccion = (typeof DESENLACES_EXTRACCION)[number]

/** Lo que se sabe de un artículo tras la última pasada que lo procesó. */
export interface ExtraccionArticulo {
  articleId: string
  /** Huella del titular tal como se procesó; si cambia, el artículo vuelve a la cola. */
  fingerprint: string
  desenlace: DesenlaceExtraccion
  /** Fecha de la pasada que fijó este desenlace. */
  procesadoEl: string
}

/** El `reasoning` con que press-claim-llm.ts marca un triaje que no llegó al modelo. */
const RAZON_LLM_NO_DISPONIBLE = 'llm-unavailable'

/** Desenlace de UN artículo de esta pasada. */
export function desenlaceDe(t: {
  triage: { hasCheckableClaim: boolean; reasoning?: string }
  claims: number
  /** La extracción (tras un triaje positivo) no obtuvo respuesta del modelo. */
  extraccionSinRespuesta?: boolean
}): DesenlaceExtraccion {
  // Primero: un triaje sin modelo trae `hasCheckableClaim: false`, que leído
  // a secas sería «descartado» — la mentira que este módulo existe para evitar.
  if (t.triage.reasoning === RAZON_LLM_NO_DISPONIBLE) return 'llm-no-disponible'
  // Y una extracción sin respuesta trae `claims: []` tras un triaje positivo,
  // que leído a secas sería «sin-afirmaciones»: la misma mentira, un paso después.
  if (t.extraccionSinRespuesta === true) return 'llm-no-disponible'
  if (t.claims > 0) return 'extraido'
  if (!t.triage.hasCheckableClaim) return 'descartado-en-triaje'
  return 'sin-afirmaciones'
}

export interface Extraccion<T extends { articleId: string }> {
  articulos: ExtraccionArticulo[]
  items: T[]
}

/**
 * Une la pasada con lo anterior: claims y desenlaces por artículo.
 *
 *   1. Un artículo de la pasada sustituye su desenlace Y sus afirmaciones.
 *   2. Un artículo que la pasada no tocó conserva ambos.
 *   3. DIRECCIÓN: si la pasada dice `llm-no-disponible` de un artículo que ya
 *      tenía otro desenlace, se queda el anterior con sus afirmaciones — la
 *      pasada no es prueba de nada sobre él.
 *   4. Orden estable para que el diff diga sólo lo que cambió: artículos por
 *      `articleId`; afirmaciones previas en su orden y después las nuevas.
 *
 * Genérico en `T` para que la CLI pase sus `PressClaim` enteros sin tocarlos.
 */
export function fundirExtraccion<T extends { articleId: string }>(
  prev: Extraccion<T> | null,
  run: Extraccion<T>,
): Extraccion<T> {
  const porId = new Map<string, ExtraccionArticulo>()
  for (const a of prev?.articulos ?? []) porId.set(a.articleId, a)

  const sustituidos = new Set<string>()
  const rechazados = new Set<string>()
  for (const a of run.articulos) {
    const anterior = porId.get(a.articleId)
    if (
      a.desenlace === 'llm-no-disponible' &&
      anterior &&
      anterior.desenlace !== 'llm-no-disponible'
    ) {
      rechazados.add(a.articleId)
      continue
    }
    rechazados.delete(a.articleId)
    sustituidos.add(a.articleId)
    porId.set(a.articleId, a)
  }

  const articulos = [...porId.values()].sort((x, y) =>
    x.articleId < y.articleId ? -1 : x.articleId > y.articleId ? 1 : 0,
  )
  const items = [
    ...(prev?.items ?? []).filter((it) => !sustituidos.has(it.articleId)),
    ...run.items.filter((it) => !rechazados.has(it.articleId)),
  ]
  return { articulos, items }
}

/** Milisegundos de una fecha; lo ilegible va al final, no al principio. */
function instante(fecha: string): number {
  const ms = Date.parse(fecha)
  return Number.isNaN(ms) ? -Infinity : ms
}

/**
 * Qué artículos procesar, hasta `max`:
 *
 *   1. lo nunca visto y lo que no llegó al modelo (`llm-no-disponible`), en un
 *      solo grupo, más nuevo antes;
 *   2. lo que cambió de huella, más nuevo antes.
 *
 * Lo procesado con la misma huella no se reenvía. `max` sólo deja de ser tope
 * cuando es `Infinity`; un `NaN` o un negativo no procesan nada — un tope
 * ilegible no puede convertirse en «manda todo al LLM».
 */
export function elegirPendientes<T extends { id: string; fingerprint: string; date: string }>(
  items: T[],
  prev: ExtraccionArticulo[],
  max: number,
): T[] {
  const anterior = new Map<string, ExtraccionArticulo>()
  for (const a of prev) anterior.set(a.articleId, a)

  const pendientes: T[] = []
  const cambiados: T[] = []
  for (const it of items) {
    const a = anterior.get(it.id)
    if (!a) pendientes.push(it)
    else if (a.fingerprint !== it.fingerprint) cambiados.push(it)
    else if (a.desenlace === 'llm-no-disponible') pendientes.push(it)
    // Procesado y sin cambios: no se reenvía.
  }

  const masNuevoAntes = (x: T, y: T) => instante(y.date) - instante(x.date) || 0
  const cola = [pendientes, cambiados].flatMap((g) => [...g].sort(masNuevoAntes))
  if (max === Infinity) return cola
  if (Number.isNaN(max) || max <= 0) return []
  return cola.slice(0, Math.floor(max))
}
