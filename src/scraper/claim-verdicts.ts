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
