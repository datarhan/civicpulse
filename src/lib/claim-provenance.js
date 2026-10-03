/**
 * Quién dice haber comprobado una cita, dicho de forma que no invente crédito.
 *
 * `/declaraciones` rotula cada bloque de evidencia con la procedencia de la
 * comprobación. Era un ternario de dos ramas dentro del JSX:
 *
 *     v.checkedAgainst?.includes('llm-second-pass')
 *       ? 'verificador LLM'
 *       : 'verificador determinista'
 *
 * y ahí está el defecto: un `checkedAgainst` vacío significa «no consta qué
 * comprobó esto» y caía por el `else`, saliendo publicado con la procedencia
 * más fuerte que esta página sabe dar. Contra el snapshot del 2026-08-14, de
 * las 24 citas que lucían «verificador determinista» sólo 4 lo eran: las otras
 * 20 no tenían nada anotado.
 *
 * Es la regla nº3 de docs/DATA_INTEGRITY.md, «un centinela no es un valor», en
 * una página que cita a grupos municipales con nombre y apellidos. La misma
 * avería que hacía que `Otro` significara a la vez «un partido» y «no se puede
 * saber».
 *
 * La segunda vuelta del mismo defecto (2026-09-29): la pasada se buscaba sólo
 * entre las marcas de `checkedAgainst`, contra una lista recitada. Pero desde
 * la fase 1b el motor y el anclaje NLI escriben ahí el corpus de su evidencia y
 * su nombre en `derivedBy`, y desde #164 la verificación servida trae el
 * `source` de su entrada de overlay. La primera subida de NLI con esa forma
 * habría salido como «verificador determinista», y una retractación del motor
 * como «sin verificador anotado». Por eso la verificación entra ENTERA: quien
 * pasara sólo `checkedAgainst` volvería a leer media procedencia sin enterarse.
 *
 * Vive fuera del JSX para que se pueda medir contra el corpus publicado en vez
 * de sólo contra un render.
 */
import {
  CLASE_DE_PASADA,
  COLA_SIN_IMPORTE,
  RESUMEN_CASI_FIJO,
  corpusReales,
  desenlaceDeCotejo,
  esCorpus,
  esMarcaDePasada,
  esResumenCasi,
  esResumenSinRegistro,
  leyoContratos,
  resumenCasi,
  resumenSinRegistro,
} from '../scraper/claim-verdicts'

/** Lo que se dice cuando no consta quién comprobó la cita. */
export const SIN_VERIFICADOR = 'sin verificador anotado'

/** El rótulo de cada clase de verificador de `CLASE_DE_PASADA`. */
const ROTULO_DE_CLASE = {
  curador: 'corregido por un curador',
  llm: 'verificador LLM',
  nli: 'verificador NLI',
}

const lista = (x) => (Array.isArray(x) ? x : [])

/**
 * Las pasadas declaradas que una verificación dice que la produjeron, en los
 * tres sitios donde puede decirlo y en este orden: el canal del overlay
 * (`source`), lo que el verificador declara (`derivedBy`) y las marcas viejas
 * de `checkedAgainst`, que siguen en las filas servidas.
 *
 * El orden decide sólo si discrepan, que ningún escritor de hoy hace: manda el
 * canal porque es el que valida `validateOverlay`, la misma regla con la que
 * `mergeVerified` lo estampa por encima de lo que la verificación traiga.
 */
function pasadasDe(v) {
  return [v?.source, ...lista(v?.derivedBy), ...lista(v?.checkedAgainst)].filter(
    (n) => typeof n === 'string' && esMarcaDePasada(n),
  )
}

/**
 * «Determinista» por lista blanca: sólo corpus declarados en `checkedAgainst`,
 * y ninguna pasada en ningún sitio, declarada o no. Una pasada que nadie ha
 * declarado no es un cotejo escrito a mano; si cayera aquí, la próxima pasada
 * nueva repetiría el defecto con otro nombre.
 */
function esCotejoDeterminista(v) {
  if (v?.source || lista(v?.derivedBy).length > 0) return false
  const ca = lista(v?.checkedAgainst)
  return ca.length > 0 && ca.every((c) => typeof c === 'string' && esCorpus(c))
}

/**
 * @param {{ checkedAgainst?: unknown[] | null, derivedBy?: unknown[] | null,
 *   source?: string } | null | undefined} v  la verificación servida, entera.
 * @returns {string} la procedencia, en minúsculas, tal cual va a la página.
 */
export function etiquetaVerificador(v) {
  const clases = pasadasDe(v).map((p) => CLASE_DE_PASADA[p])
  // El curador va primero, esté donde esté: si una persona ha corregido el
  // veredicto, eso es lo que hay que decir, y no en qué se apoyó la máquina a
  // la que corrigió.
  const clase = clases.includes('curador') ? 'curador' : clases[0]
  // Una clase sin rótulo tampoco hereda el de «determinista».
  if (clase) return ROTULO_DE_CLASE[clase] ?? SIN_VERIFICADOR
  if (esCotejoDeterminista(v)) return 'verificador determinista'
  // Nada anotado, o algo que no se puede nombrar. Ninguno de los dos puede
  // heredar la etiqueta de los que sí.
  return SIN_VERIFICADOR
}

/**
 * Contra qué se cotejó la cita: la otra mitad de lo que `checkedAgainst` mezcla.
 *
 * La tarjeta de `ClaimLedger` imprimía el array tal cual bajo «Fuentes
 * comprobadas», y con él las marcas de pasada. Medido el 2026-09-29 en los
 * trozos servidos: 920 tarjetas de 4.964 daban `verdict-engine` o
 * `curator-downgrade` como si fueran una fuente consultada.
 *
 * Sólo cuentan los corpus de `corpusReales`, la lista blanca con la que ya
 * deciden la puerta editorial y el reparto de `sin-datos`; recitarla aquí
 * haría que esta línea y /declaraciones pudieran separarse.
 *
 * Y sin corpus hay dos respuestas, no una:
 *
 *   · nada anotado → «ninguna»: lo que /declaraciones cuenta como «sin corpus
 *     que consultar»;
 *   · algo anotado que no es un corpus (una pasada, en `checkedAgainst`, en
 *     `derivedBy` o como `source`, o un nombre sin declarar) → «no constan».
 *     La pasada SUSTITUYÓ la lista (`verificacionDeBajada` escribe sólo su
 *     marca; el motor, sólo el corpus de una evidencia que en una retractación
 *     no hay): no sabemos cuáles se miraron, que no es lo mismo que ninguno. De
 *     los 878 resúmenes del motor servidos, 871 cuentan qué contratos o
 *     subvenciones examinó, y las cinco bajadas a «parcial» enseñan una fila
 *     CONTRATO; «ninguna» debajo contradiría la propia tarjeta. Regla nº3 otra
 *     vez: el hueco no es un cero.
 *
 * Las tres salen de `desenlaceDeCotejo`, que es también la regla del recuento
 * de encima: el reparto de /declaraciones contaba esas filas como «sin corpus
 * que consultar» mientras su tarjeta decía «no constan» (2026-09-29).
 *
 * @param {{ checkedAgainst?: unknown[] | null, derivedBy?: unknown[] | null,
 *   source?: string } | null | undefined} v  la verificación servida, entera.
 * @returns {string} los corpus separados por « · », o una de las dos frases.
 */
export function fuentesComprobadas(v) {
  const desenlace = desenlaceDeCotejo(v)
  if (desenlace === 'con-corpus') return corpusReales(v?.checkedAgainst).join(' · ')
  return desenlace === 'sin-corpus' ? 'ninguna' : 'no constan'
}

/**
 * Lo que la tarjeta dice bajo la cita, cuando es el «no se encontró registro»
 * del verificador: re-derivado de la procedencia servida, la misma que lee
 * `fuentesComprobadas`, para que las dos líneas no puedan contradecirse.
 *
 * Esa explicación va guardada, y la tarjeta la imprimía tal cual encima de
 * «Fuentes comprobadas». Era una frase fija —«No se encontró registro en
 * tenders / BDNS / presupuesto…»— se mirara lo que se mirara: medido el
 * 2026-09-29 en /plenos/k4olcs, de las 20 primeras tarjetas 8 la ponían sobre
 * «ninguna», 10 sobre «no constan» y 1 sobre «tenders · tenders-ted». Y aunque
 * el verificador escriba ya la derivada (`resumenSinRegistro`), guardada puede
 * seguir mintiendo: la retractación del motor copia la verificación del
 * determinista y le cambia la procedencia (`{ ...r, checkedAgainst:
 * ['verdict-engine'] }`), así que la explicación viaja y la lista no.
 *
 * Sólo se re-deriva esa familia (`esResumenSinRegistro`) y sólo en un
 * `sin-datos`, que es el único veredicto que la escribe. Cualquier otra
 * explicación —la del motor, la de un curador— sale como vino.
 *
 * La otra frase del verificador para un `sin-datos`, la del expediente que se
 * parece (claim-verdicts.ts, «El expediente que se parece»), se lee con la
 * regla de `evidenciaSegunFuentes`: sin contratos cotejados, la fila no se
 * pinta y la explicación es la del «no se encontró registro», derivada igual;
 * con ellos, la fija de antes —que hablaba de «la cifra del claim» y acababa
 * en «el que hay no dice eso»— se cambia por la de ahora.
 *
 * @param {{ verdict?: string, summary?: string, checkedAgainst?: unknown[] | null,
 *   evidence?: Array<{ kind?: string, snippet?: string }> | null }
 *   | null | undefined} v  la verificación servida, entera.
 * @param {string | null | undefined} [texto]  la explicación a imprimir; por
 *   defecto, el `summary`. `null` (retirada) pasa tal cual.
 * @returns {string | null | undefined}
 */
export function resumenSegunFuentes(v, texto = v?.summary) {
  if (v?.verdict !== 'sin-datos') return texto
  if (esResumenCasi(texto)) {
    if (!leyoContratos(v?.checkedAgainst)) return resumenSinRegistro(v?.checkedAgainst)
    if (texto !== RESUMEN_CASI_FIJO) return texto
    const fila = lista(v?.evidence).find((e) => e?.kind === 'tender')
    return resumenCasi(!String(fila?.snippet ?? '').endsWith(COLA_SIN_IMPORTE))
  }
  if (!esResumenSinRegistro(texto)) return texto
  return resumenSinRegistro(v?.checkedAgainst)
}

/**
 * Las filas de evidencia que la tarjeta pinta: todas, salvo el expediente
 * parecido de una verificación que no consta que cotejara contratos.
 *
 * El verificador enseñaba ese expediente también en citas sin cifra, donde el
 * camino del importe no corre y `tenders` no se anota (claim-verdicts.ts, «El
 * expediente que se parece»). Medido el 30-09-2026 sobre los trozos servidos:
 * 47 tarjetas pintaban una fila CONTRATO encima de «Fuentes comprobadas:
 * ninguna» o «promises», y /declaraciones la contaba como «1 evidencia» dentro
 * de «Sin corpus que consultar». El verificador ya no las escribe; las
 * publicadas siguen en su trozo hasta que se vuelva a verificar, que es una
 * decisión editorial.
 *
 * Es una retirada —el nivel A de `decideAutomation`: sólo quita, y quitar una
 * fila que no funda nada no refuerza ninguna afirmación—, y como la de
 * `resumenes-retirados.js`, no toca los datos: el trozo servido la conserva.
 * Se reconoce por la frase que la acompaña (`esResumenCasi`), no por su forma:
 * una fila CONTRATO bajo otra explicación —las bajadas de curador que salen
 * sobre «no constan», porque su pasada sustituyó la lista— sale como vino.
 *
 * @param {{ verdict?: string, summary?: string, checkedAgainst?: unknown[] | null,
 *   evidence?: Array<{ kind?: string }> | null } | null | undefined} v
 * @returns {Array<{ kind?: string }>}
 */
export function evidenciaSegunFuentes(v) {
  const evidencia = lista(v?.evidence)
  if (v?.verdict !== 'sin-datos' || !esResumenCasi(v?.summary) || leyoContratos(v?.checkedAgainst))
    return evidencia
  return evidencia.filter((e) => e?.kind !== 'tender')
}
