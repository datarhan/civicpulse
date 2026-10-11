// @ts-check
/**
 * El rótulo de tipo de una cita, derivado de lo que la cita DICE.
 *
 * El extractor define `afirmacion_numerica` como «cifra citada como hecho» y
 * `cita_convenio` como «subvención, convenio, fondo europeo»
 * (src/llm/prompts.ts), pero los usa también de cajón de sastre: la revisión
 * lectora del 11-10-2026 encontró en /plenos/k4olcs «Afirmación numérica»
 * encima de una lista de departamentos y «Convenio citado» encima de «esta
 * carta es una rendición de cuentas…», y la tarjeta se desmentía sola —su
 * propio veredicto decía «sin cifras» y «valoración retórica». Medido ese día
 * sobre los trozos servidos: ~385 de 2.167 numéricas sin cifra en el literal,
 * 298 de 620 convenios sin nombrar convenio, ayuda ni fondo.
 *
 * Por qué derivado y no corregido una a una: `reclassify-claim` sólo mueve
 * lejos de `acusacion_publica` (su dirección está cerrada a propósito), y
 * firmar setecientas reclasificaciones no arregla la siguiente extracción.
 *
 * Por qué no es una máquina de falsos positivos: el rótulo sólo puede BAJAR a
 * uno neutro, nunca subir, y no avisa a nadie. Una cifra que este detector no
 * ve —«quaranta-cinc» escrito raro— deja la tarjeta en «Afirmación», que no
 * afirma nada de más; un «nou» valenciano (nuevo) que cuenta como nueve deja el
 * rótulo de siempre. Ninguno de los dos errores publica algo falso.
 *
 * El TIPO del dato no se toca: lo siguen leyendo el verificador, los filtros y
 * los recuentos de /cobertura, que hablan del extractor y no de la tarjeta.
 */
import { CLAIM_TYPE_LABEL, CLAIM_TYPE_TONE } from '../hooks/usePlenoClaims.js'

/** La clave del rótulo neutro. No es un `ClaimType`: nadie la escribe en un dato. */
export const TIPO_NEUTRO = 'afirmacion'
export const ROTULO_NEUTRO = 'Afirmación'

/** @param {string} s */
function plano(s) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

// Números en letra, castellano y valenciano. «un/una/uno» quedan fuera: son
// artículos casi siempre, y con ellos toda frase tendría «cifra».
const NUMERO_EN_LETRA = new RegExp(
  '\\b(' +
    [
      'dos',
      'tres',
      'cuatro',
      'quatre',
      'cinco',
      'cinc',
      'seis',
      'sis',
      'siete',
      'set',
      'ocho',
      'huit',
      'vuit',
      'nueve',
      'nou',
      'diez',
      'deu',
      'once',
      'onze',
      'doce',
      'dotze',
      'trece',
      'tretze',
      'catorce',
      'catorze',
      'quince',
      'quinze',
      'setze',
      'disset',
      'divuit',
      'dinou',
      'dieci\\w+',
      'veint\\w*',
      'vint\\w*',
      'treinta\\w*',
      'trenta\\w*',
      'cuarenta\\w*',
      'quaranta\\w*',
      'cincuenta\\w*',
      'cinquanta\\w*',
      'sesenta\\w*',
      'seixanta\\w*',
      'setenta\\w*',
      'setanta\\w*',
      'ochenta\\w*',
      'huitanta\\w*',
      'vuitanta\\w*',
      'noventa\\w*',
      'noranta\\w*',
      'cien',
      'ciento',
      'cientos',
      'cientas',
      '\\w+cientos',
      '\\w+cientas',
      'cent',
      'cents',
      'centenar\\w*',
      'mil',
      'miles',
      'milers',
      'millon\\w*',
      'milio\\w*',
      'mitad',
      'meitat',
      'doble',
      'triple',
      'tercio',
      'terc',
      'cuarto',
      'quart',
      'docena',
      'dotzena',
      'porcentaje',
      'percentatge',
      'euros?',
    ].join('|') +
    ')\\b',
)

/**
 * ¿Trae la cita una cifra? Dígitos, «%», «€», un número en letra, o la cifra
 * que el propio extractor sacó a `entities`.
 * @param {{ verbatim?: string, entities?: { amountEuros?: unknown, count?: unknown } }} claim
 */
function traeCifra(claim) {
  const e = claim.entities ?? {}
  if (typeof e.amountEuros === 'number' || typeof e.count === 'number') return true
  const t = plano(claim.verbatim ?? '')
  return /\d|%|€/.test(t) || /\bpor ciento\b|\bper cent\b/.test(t) || NUMERO_EN_LETRA.test(t)
}

// Lo que el prompt pide a un `cita_convenio`, y sus parientes: quién paga
// (Generalitat, Diputació, Estado, la UE) y por qué vía (convocatoria, línea
// nominativa, transferencia, aportación).
const LEXICO_CONVENIO =
  /conveni|subvenci|ayuda|ajuda|fondo|\bfons\b|financ|feder|next ?generation|prtr|edusi|dana|pstd|generalitat|diputaci|ministeri|\bestado\b|europe|acuerdo|acord|colaboraci|consorci|mancomun|transferenc|aportaci|convocatori|nominativ/

/**
 * ¿Nombra la cita un convenio, una ayuda o un fondo? En el literal o en la
 * entidad que el extractor le asignó.
 * @param {{ verbatim?: string, entities?: { referencedEntity?: unknown } }} claim
 */
function nombraConvenio(claim) {
  const ent =
    typeof claim.entities?.referencedEntity === 'string' ? claim.entities.referencedEntity : ''
  return LEXICO_CONVENIO.test(plano(`${claim.verbatim ?? ''} ${ent}`))
}

/**
 * La clave de rótulo que corresponde a la cita: su tipo, o `TIPO_NEUTRO` si el
 * tipo promete algo que el literal no trae.
 * @param {{ type: string, verbatim?: string, entities?: Record<string, unknown> }} claim
 * @returns {string}
 */
export function tipoAMostrar(claim) {
  if (claim.type === 'afirmacion_numerica' && !traeCifra(claim)) return TIPO_NEUTRO
  if (claim.type === 'cita_convenio' && !nombraConvenio(claim)) return TIPO_NEUTRO
  return claim.type
}

/**
 * Texto y tono de la píldora de tipo.
 * @param {{ type: string, verbatim?: string, entities?: Record<string, unknown> }} claim
 * @returns {{ texto: string, tono: string }}
 */
export function rotuloDeTipo(claim) {
  const tipo = tipoAMostrar(claim)
  if (tipo === TIPO_NEUTRO) return { texto: ROTULO_NEUTRO, tono: 'neutral' }
  return {
    texto: /** @type {Record<string,string>} */ (CLAIM_TYPE_LABEL)[tipo] ?? tipo,
    tono: /** @type {Record<string,string>} */ (CLAIM_TYPE_TONE)[tipo] ?? 'neutral',
  }
}
