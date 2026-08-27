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

// ─── Corpus de datos frente a marcas de pasada ──────────────────────────────
//
// `checkedAgainst` mezcla dos cosas que NO son lo mismo:
//
//   · corpus de datos —tenders, bdns, budget, promises…—: contra qué se cotejó
//   · marcas de pasada —verdict-engine, llm-second-pass, curator-downgrade—:
//     CÓMO se llegó al veredicto
//
// Enseñarlas juntas bajo «contra qué se coteja» infla la base de evidencia
// aparente: un veredicto revisado por el motor no está respaldado por una
// fuente más. En una página cuyo argumento entero es no afirmar de más, eso
// sería justo el error que denuncia.
//
// Lo desconocido se trata como CORPUS, no como marca: una marca nueva sin
// declarar aparece a la vista —y se corrige— en vez de desaparecer callando.

/**
 * Los nombres de pasada que aparecen en `checkedAgainst`.
 *
 * Hay DOS esquemas de nombres conviviendo y esta lista tiene que cubrir los
 * dos: el que escribe cada verificador en `checkedAgainst`
 * (`nli-grounding`, `llm-second-pass`, `verdict-engine`) y el de
 * `OverlaySource` (`nli`, `llm`, `verdict-engine`, `curator-downgrade`).
 *
 * `nli-grounding` faltaba y lo cazó la prueba de la puerta el mismo día: es una
 * lista negra escrita a mano, y una lista negra a mano dentro de un control
 * contra el estancamiento se estanca ella sola. Vive con fecha de caducidad —
 * la fase 1 separa `checkedAgainst` (corpus) de `derivedBy` (pasadas) y
 * entonces esto se borra, porque ya no hará falta clasificar nada.
 *
 * Mientras exista: lo desconocido cuenta como corpus, que es la dirección
 * INSEGURA. La fase 1 lo invierte.
 */
export const MARCAS_DE_PASADA = [
  'verdict-engine',
  'llm-second-pass',
  'nli-grounding',
  'nli',
  'llm',
  'curator-downgrade',
] as const

export function esMarcaDePasada(nombre: string): boolean {
  return (MARCAS_DE_PASADA as readonly string[]).includes(nombre)
}

/**
 * Los corpus DE VERDAD de un `checkedAgainst`, sin las marcas de pasada.
 *
 * Contar la longitud cruda de `checkedAgainst` daba por «comprobada» una fila
 * cotejada contra nada: 1.014 de las 4.675 publicadas llevan sólo marcas, y
 * con ellas dentro la cobertura salía al 59,8 % cuando era del 38,1 %. La
 * sobreafirmación exacta que /laboratorio/cobertura existe para no cometer.
 *
 * Cualquier cosa que no esté declarada como marca cuenta como corpus: un
 * nombre nuevo se ve —y se corrige— en vez de desaparecer callando.
 */
export function corpusReales(checkedAgainst?: readonly unknown[] | null): string[] {
  return (checkedAgainst ?? []).filter(
    (c): c is string => typeof c === 'string' && !esMarcaDePasada(c),
  )
}
