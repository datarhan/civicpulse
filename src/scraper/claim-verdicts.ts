/**
 * Los veredictos y el desglose de `sin-datos`, en un módulo que el navegador
 * puede cargar.
 *
 * Vive aparte de `claim-verifier.ts` por una razón mecánica, no estética:
 * aquél alcanza —por importación dinámica— `semantic-shortlist.ts`, que usa
 * `node:fs`. Importarlo desde una página rompe el empaquetado con
 * «"existsSync" is not exported by "__vite-browser-external"». Ésa es la razón
 * de que `Declaraciones.jsx` tuviera la lista de veredictos copiada a mano: no
 * era descuido, era la única salida que había. Con esto la copia sobra y
 * `claim-verifier` reexporta desde aquí, así que la fuente sigue siendo una.
 *
 * Puro: sin fs, sin red, sin Date. No añadir aquí nada que no lo sea.
 */

/** Los veredictos, como VALOR y no sólo como tipo. */
export const CLAIM_VERDICTS = [
  'verificado',
  'parcial',
  'contradicho',
  'sin-datos',
  'promesa-repetida',
] as const

export type ClaimVerdict = (typeof CLAIM_VERDICTS)[number]

// ─── El desglose de `sin-datos` ─────────────────────────────────────────────
//
// `sin-datos` contesta dos preguntas distintas con el mismo número:
//
//   · se consultaron corpus y la afirmación no aparece en ninguno
//   · no se consultó NADA, porque para ese tipo de afirmación no hay corpus
//
// El primero dice algo sobre la afirmación. El segundo dice algo sobre
// NOSOTROS, y publicarlo como si fuera lo mismo hace que un hueco se lea como
// un cero. Es la agregación de `falta` de DeclaracionEntregas otra vez, y el
// centinela `Otro`.
//
// El discriminante ya viaja en el fichero: `checkedAgainst` —que es, en su
// propia definición, una afirmación sobre nuestro trabajo—. Así que esto se
// DERIVA y no se guarda: ni campo nuevo en la verificación, ni miembro nuevo en
// el enum de veredictos, que alimenta `isDowngrade`, el validador del overlay y
// las CLI de curación.

export interface ResumenSinDatos {
  /** `checkedAgainst` vacío: no se consultó ningún corpus. */
  sinCorpus: number
  /** Se consultaron corpus y no hubo coincidencia. */
  comprobadoSinHallar: number
}

/** Lo mínimo que hace falta mirar. Estructural a propósito, para que valga
 *  igual con el item servido en un trozo que con la verificación completa. */
export interface VerificacionCotejable {
  verdict?: string
  checkedAgainst?: readonly unknown[]
}

/**
 * Reparte las filas `sin-datos` en sus dos motivos. Las dos partes suman
 * exactamente el `sin-datos` del recuento por veredicto; las demás filas no se
 * miran.
 */
export function resumirSinDatos(
  verifications: ReadonlyArray<VerificacionCotejable | null | undefined>,
): ResumenSinDatos {
  let sinCorpus = 0
  let comprobadoSinHallar = 0
  for (const v of verifications) {
    if (v?.verdict !== 'sin-datos') continue
    if (corpusReales(v.checkedAgainst).length === 0) sinCorpus++
    else comprobadoSinHallar++
  }
  return { sinCorpus, comprobadoSinHallar }
}

// ─── Procedencia: corpus, pasadas y lo que no sabemos ──────────────────────
//
// `checkedAgainst` mezcla dos cosas que NO son lo mismo:
//
//   · corpus de datos —tenders, bdns, budget, promises, padron, paro—: contra
//     qué se cotejó la afirmación;
//   · marcas de pasada —verdict-engine, llm-second-pass, nli-grounding…—: CÓMO
//     se llegó al veredicto.
//
// Enseñarlas juntas infla la base de evidencia aparente, y CONTARLAS juntas
// hizo dos daños en un día: una cobertura del 59,8 % que era del 38,1 %, y
// once acusaciones publicadas por una puerta que sólo miraba si el array
// estaba vacío.
//
// La clasificación es por LISTA BLANCA, y la dirección importa. Con lista
// negra, un nombre no declarado contaba como corpus: el día que corriera NLI
// —cuya marca no estaba en la lista— la cobertura se habría inflado sola y en
// silencio. Con lista blanca se queda corta, que en una página cuyo argumento
// es no afirmar de más es el lado seguro. Y lo desconocido no desaparece: sale
// por `desconocidos` para que alguien lo declare de un lado o del otro.

/** Los corpus de datos que un verificador puede consultar. */
export const CORPUS_IDS = [
  'tenders',
  'tenders-ted',
  'bdns',
  'budget',
  'promises',
  'padron',
  'paro',
  'prior-claims',
  'factcheck',
  'boe',
] as const

export type CorpusId = (typeof CORPUS_IDS)[number]

/**
 * Los nombres de pasada que aparecen en `checkedAgainst`.
 *
 * Conviven dos esquemas y hay que cubrir los dos: el que escribe cada
 * verificador (`nli-grounding`, `llm-second-pass`, `verdict-engine`) y el de
 * `OverlaySource` (`nli`, `llm`, `curator-downgrade`).
 */
export const PASADAS = [
  'verdict-engine',
  'llm-second-pass',
  'nli-grounding',
  'nli',
  'llm',
  'curator-downgrade',
] as const

export type Pasada = (typeof PASADAS)[number]

/** Alias histórico. La lista es la de pasadas. */
export const MARCAS_DE_PASADA = PASADAS

/**
 * Qué CLASE de verificador es cada pasada: lo que /declaraciones y /plenos le
 * dicen al lector de quién dio el veredicto.
 *
 *   · `llm` — un modelo de lenguaje decidió el veredicto: el motor y las dos
 *     segundas pasadas LLM, la viva y la retirada.
 *   · `nli` — un modelo de inferencia puntuó si un extracto implica la
 *     afirmación. No genera texto, pero tampoco es un cotejo escrito a mano.
 *   · `curador` — una persona bajó el veredicto con `downgrade-verdict`.
 *
 * La página lo deducía de una lista recitada de pasadas «de modelo», y lo que
 * no estaba en ella salía como «verificador determinista»: `llm`, `nli` y
 * `nli-grounding` lo eran por omisión. Con `Record<Pasada, …>` una pasada nueva
 * que no diga qué es no compila, en vez de heredar el rótulo más fuerte.
 */
export type ClaseDeVerificador = 'llm' | 'nli' | 'curador'

export const CLASE_DE_PASADA: Record<Pasada, ClaseDeVerificador> = {
  'verdict-engine': 'llm',
  'llm-second-pass': 'llm',
  'nli-grounding': 'nli',
  nli: 'nli',
  llm: 'llm',
  'curator-downgrade': 'curador',
}

/**
 * Pasadas RETIRADAS: siguen apareciendo en veredictos publicados, pero ya no
 * forman parte de la tubería.
 *
 * `verify-pleno-claims-llm` se declara a sí misma «LEGACY / SUPERSEDED … do
 * not use in the pipeline» desde el corte base/overlay; sus veredictos
 * sobrevivieron a la migración y hoy sostienen 87 filas fuertes sin un solo
 * corpus detrás.
 *
 * Se declara aquí, como dato, para que una guarda pueda distinguir «esto es
 * cola vieja que hay que re-fundamentar» de «esto lo acaba de romper alguien».
 * Con las dos cosas en el mismo saco, la guarda saldría roja todas las noches
 * hasta la fase 6 — y una guarda siempre roja es una guarda que alguien apaga.
 */
export const PASADAS_RETIRADAS = ['llm', 'llm-second-pass'] as const

export function esPasadaRetirada(nombre: string): boolean {
  return (PASADAS_RETIRADAS as readonly string[]).includes(nombre)
}

export interface ClasificacionProcedencia {
  corpus: CorpusId[]
  pasadas: Pasada[]
  /** Ni corpus declarado ni pasada declarada. Se reporta; no se adivina. */
  desconocidos: string[]
}

export function esMarcaDePasada(nombre: string): boolean {
  return (PASADAS as readonly string[]).includes(nombre)
}

export function esCorpus(nombre: string): boolean {
  return (CORPUS_IDS as readonly string[]).includes(nombre)
}

/** Reparte un `checkedAgainst` en corpus, pasadas y desconocidos. */
export function clasificarProcedencia(
  checkedAgainst?: readonly unknown[] | null,
): ClasificacionProcedencia {
  const corpus: CorpusId[] = []
  const pasadas: Pasada[] = []
  const desconocidos: string[] = []
  for (const x of checkedAgainst ?? []) {
    if (typeof x !== 'string') continue
    if (esCorpus(x)) corpus.push(x as CorpusId)
    else if (esMarcaDePasada(x)) pasadas.push(x as Pasada)
    else desconocidos.push(x)
  }
  return { corpus, pasadas, desconocidos }
}

/**
 * Los corpus DE VERDAD de un `checkedAgainst`.
 *
 * Desaparece en cuanto `derivedBy` lleve las pasadas y este campo signifique
 * una sola cosa: entonces esto será `checkedAgainst.length` y ya está.
 */
export function corpusReales(checkedAgainst?: readonly unknown[] | null): CorpusId[] {
  return clasificarProcedencia(checkedAgainst).corpus
}

// ─── De la evidencia al corpus ──────────────────────────────────────────────
//
// Cada pasada escribía SU PROPIO NOMBRE en `checkedAgainst` en vez de decir
// contra qué había cotejado, y con el suelo de evidencia puesto eso dejó a NLI
// sin poder subir nada: la pasada que hace falta para re-fundamentar las filas
// de procedencia retirada era, de hecho, imposible de aplicar.
//
// La traducción va por el `kind` de la evidencia, que es el registro real de
// fuentes. Un kind sin corpus produce un veredicto que el suelo rechaza —una
// pasada que nace muerta— y por eso hay una prueba que exige la tabla
// EXHAUSTIVA sobre `EVIDENCE_KINDS`.

const CORPUS_DE_KIND: Record<string, CorpusId> = {
  tender: 'tenders',
  bdns: 'bdns',
  budget: 'budget',
  promise: 'promises',
  'prior-claim': 'prior-claims',
  factcheck: 'factcheck',
  boe: 'boe',
}

/**
 * Los corpus que una lista de evidencia cita, sin repetir y en orden estable.
 *
 * Un `kind` que no esté en la tabla NO inventa corpus: se cae fuera y el suelo
 * hará su trabajo. Callar es la dirección segura; adivinar, no.
 */
export function corpusDeEvidencia(evidence?: readonly unknown[] | null): CorpusId[] {
  const out: CorpusId[] = []
  for (const e of evidence ?? []) {
    const kind = (e as { kind?: unknown } | null)?.kind
    const k = typeof kind === 'string' ? CORPUS_DE_KIND[kind] : undefined
    if (k && !out.includes(k)) out.push(k)
  }
  return out
}

// ─── La explicación de un sin-datos que no encontró nada ───────────────────
//
// Hasta el 29-09-2026 el verificador escribía la MISMA frase en todo
// `sin-datos` sin evidencia —«No se encontró registro en tenders / BDNS /
// presupuesto…»—, mirara lo que mirara, mientras su `checkedAgainst` sólo
// apuntaba un corpus cuando su comparador corría de verdad. La tarjeta de
// /plenos/:id imprime las dos una encima de otra, y se contradecían: sobre los
// 4.964 trozos servidos, 2.246 tarjetas decían «no se encontró registro en…»
// encima de «Fuentes comprobadas: ninguna» o «no constan», y de las 4.243 que
// la llevaban sólo 463 tenían detrás los corpus que nombra.
//
// Por eso la frase se DERIVA de la lista, y de la misma manera que la línea:
// `corpusReales`, que es la lista blanca con la que ya deciden la puerta y el
// reparto de `sin-datos`. Nombra esos corpus, con sus nombres, y sin ninguno no
// habla de búsqueda: ni «se buscó», que no consta, ni «no se buscó», que con
// «no constan» tampoco se sabe.

/**
 * La frase fija de antes. Sigue en lo publicado —en la base hasta que se vuelva
 * a verificar, y en las retractaciones del motor que la copiaron, que viven en
 * el overlay curado—, y por eso hay que poder reconocerla.
 */
export const RESUMEN_SIN_REGISTRO_FIJO =
  'No se encontró registro en tenders / BDNS / presupuesto. El claim puede ser cierto pero no está atestiguado por los datos abiertos publicados.'

/** Lo que vale para todo `sin-datos`, se mirara lo que se mirara. */
const DESCARGO = 'Un «sin datos» no es un desmentido: la afirmación puede ser cierta.'
const PREFIJO = 'No se encontró registro en '
const INFIJO = ' que la sostenga. '

/** `a`, `a y b`, `a, b y c`: los nombres tal cual, sin traducir. */
function enumerar(nombres: readonly string[]): string {
  if (nombres.length === 1) return nombres[0]
  return `${nombres.slice(0, -1).join(', ')} y ${nombres[nombres.length - 1]}`
}

/**
 * La explicación de un `sin-datos` que no encontró nada, dicha desde lo que
 * consta como consultado. Recibe el `checkedAgainst` entero: las marcas de
 * pasada no son corpus y no se nombran.
 */
export function resumenSinRegistro(checkedAgainst?: readonly unknown[] | null): string {
  const corpus = corpusReales(checkedAgainst)
  if (corpus.length === 0) return DESCARGO
  return `${PREFIJO}${enumerar(corpus)}${INFIJO}${DESCARGO}`
}

/**
 * ¿Es un texto de esta familia —la frase fija de antes o una de
 * `resumenSinRegistro`—? Se reconoce rehaciéndolo con los nombres que lleva, no
 * por parecido: una explicación del motor que empezara igual no es nuestra y no
 * se toca.
 */
export function esResumenSinRegistro(texto: unknown): boolean {
  if (typeof texto !== 'string') return false
  if (texto === RESUMEN_SIN_REGISTRO_FIJO || texto === DESCARGO) return true
  const fin = texto.indexOf(INFIJO)
  if (!texto.startsWith(PREFIJO) || fin < 0) return false
  const nombres = texto.slice(PREFIJO.length, fin).split(/, | y /)
  return resumenSinRegistro(nombres) === texto
}
