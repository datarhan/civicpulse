/**
 * ¿Dice la cita la cifra que el extractor le atribuye?
 *
 * `entities.amountEuros` lo escribe un modelo, y no siempre del literal: lo saca
 * de lo que oyó alrededor. El 27-10-2026 la revisión lectora leyó en
 * /plenos/k4olcs, pestaña Declaraciones, la cita k4olcs-019-cit-b9b013 —«sistema
 * de debate, captura y grabación de vídeo y control del salón de plenos
 * municipales.», sin una sola cifra— marcada «Verificado» con la explicación
 * «Lo que se cotejó: un contrato publicado imprime la cifra citada…». Los
 * 80.666 € los dijo quien hablaba en la frase SIGUIENTE (k4olcs-018-afi-7abae5),
 * y el extractor se los colgó también a ésta. El contrato es el bueno; la frase
 * de la tarjeta, sobre ESTA cita, era falsa.
 *
 * Es la avería que el camino de sólo-objeto ya cerró para la entidad
 * (claim-verifier.ts, bloque 3): «un parecido con lo que el modelo entendió no
 * es un parecido con lo que se dijo». Aquí, con la cifra: el camino del importe
 * sólo coteja una cifra que está en el literal.
 *
 * Por qué no es una máquina de falsos positivos: decir «no está» sólo puede
 * BAJAR un veredicto —la cita deja de cotejarse por su importe—, nunca subirlo,
 * y decir «está» deja lo de siempre. Por eso la cifra en letra no se lee: basta
 * un cardinal escrito («cuarenta y pico millones») para darla por dicha, que es
 * el lado de lo de antes. Medido el 27-10-2026 sobre las 755 citas que llegan al
 * camino del importe: 583 la traen en dígitos, 133 en letra, y de las 39
 * restantes la única con un veredicto más fuerte que `sin-datos` era ésa.
 *
 * Vive aparte del verificador, con el parecido de importes que necesita, para
 * que la tarjeta pueda preguntar lo mismo sin cargar el verificador entero.
 */

/**
 * Un importe «prácticamente exacto»: un parecido de al menos 0,98, que es un
 * cociente de al menos 0,99 — un 1 % de diferencia, el redondeo de una cifra
 * dicha de viva voz («80.666» por 80.666,66 €).
 */
export const IMPORTE_PRACTICAMENTE_EXACTO = 0.98

/**
 * El parecido de dos importes: el cociente del menor entre el mayor, al
 * cuadrado. Exportado con su umbral de «prácticamente exacto» porque la subida
 * firmada (subida-firmada.ts) lo usa para decidir si la fila de un registro
 * dice la cifra de una declaración: dos umbrales copiados acabarían diciendo
 * cosas distintas.
 */
export function similarAmount(claimed: number, found: number): number {
  if (claimed <= 0 || found <= 0) return 0
  const ratio = Math.min(claimed, found) / Math.max(claimed, found)
  return Math.max(0, ratio * ratio) // quadratic so 0.9 → 0.81 (meaningful gap)
}

/** Sin tildes y en minúscula: «Millón» y «millon» son la misma palabra. */
export function plano(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

/**
 * Los cardinales en letra, castellano y valenciano, como piezas de una
 * expresión regular. «un/una/uno» quedan fuera: son artículos casi siempre, y
 * con ellos toda frase tendría cifra.
 *
 * Sólo cantidades exactas. «Miles», «un centenar», «la mitad» no dicen una
 * cifra: el rótulo de tipo de la tarjeta los cuenta como cifra
 * (src/lib/claim-type-label.js, que añade los suyos a esta lista) y el
 * verificador no.
 */
export const CARDINALES_EN_LETRA: readonly string[] = [
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
  'mil',
  'millon\\w*',
  'milio\\w*',
]

const CARDINAL = new RegExp(`\\b(${CARDINALES_EN_LETRA.join('|')})\\b`)

/** Lo que multiplica la cifra escrita delante: «1,5 millones», «3,3 mill.», «46 M€». */
const MULTIPLICADOR: Record<string, number> = {
  mil: 1e3,
  k: 1e3,
  millon: 1e6,
  millones: 1e6,
  mill: 1e6,
  milio: 1e6,
  milions: 1e6,
  m: 1e6,
}

const CIFRA_ESCRITA = /(\d[\d.,]*\d|\d)(?:\s*(millones|millon|milions|milio|mill|mil|m|k)\b)?/g

/** Las cifras significativas, sin separadores ni ceros a los lados: «80.666» → «80666». */
function significativas(digitos: string): string {
  return digitos.replace(/\D/g, '').replace(/^0+/, '').replace(/0+$/, '')
}

/**
 * ¿Trae el literal la cifra? Escrita en dígitos, la cifra tiene que SER ella:
 * con el 1 % de `IMPORTE_PRACTICAMENTE_EXACTO`, leída como se escribe en
 * castellano —punto de miles, coma decimal— y con su multiplicador; o con las
 * mismas cifras significativas, que es como el extractor lee «3,3 mill.», «Hoy
 * 46» por 46 millones o un «15,334.918 €» con los separadores cambiados. Con una
 * sola cifra significativa no basta: «el punto 2» no dice dos millones.
 *
 * En letra no se lee el valor (arriba, por qué): basta un cardinal.
 *
 * Sin cifra positiva, `false`: un cero no casa con ningún importe
 * (`similarAmount`), y no hay nada que comprobar en el literal.
 */
export function cifraEnElLiteral(
  literal: string | null | undefined,
  cifra: number | null | undefined,
): boolean {
  if (typeof cifra !== 'number' || !Number.isFinite(cifra) || cifra <= 0) return false
  const texto = plano(literal ?? '')
  const deLaCifra = significativas(String(Math.round(cifra * 100)))
  for (const m of texto.matchAll(CIFRA_ESCRITA)) {
    const escrita = Number(m[1].replace(/\./g, '').replace(',', '.'))
    const leida = m[2] ? escrita * MULTIPLICADOR[m[2]] : escrita
    if (Number.isFinite(leida) && similarAmount(leida, cifra) >= IMPORTE_PRACTICAMENTE_EXACTO)
      return true
    const sig = significativas(m[1])
    if (sig.length >= 2 && sig === deLaCifra) return true
  }
  return CARDINAL.test(texto)
}

/**
 * La cifra de una cita, si la dice su literal; si no, `null`. Es lo que la
 * tarjeta puede llamar «la cifra citada».
 */
export function cifraCitada(claim: {
  verbatim?: string | null
  entities?: { amountEuros?: number | null } | null
}): number | null {
  const cifra = claim?.entities?.amountEuros
  return typeof cifra === 'number' && cifraEnElLiteral(claim.verbatim, cifra) ? cifra : null
}
