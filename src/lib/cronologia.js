// @ts-check
/**
 * Lo que la tira de la cronología de «coste-efectivo» dibuja, calculado de los
 * hitos congelados de la pieza y de nada más.
 *
 * Cada hito trae la fecha del ACTO («17 de abril de 2019», como la publica la
 * pieza) y, sólo cuando su frase lo dice, `ficha`: el día en que la ficha del
 * expediente en la Plataforma de Contratación lo publicó. El hueco que la tira
 * marca es el mayor entre dos publicaciones consecutivas de la ficha. No se
 * infiere ninguna: una sentencia cuya publicación la pieza no fecha no tiene
 * `ficha`, y por eso no cuenta, en vez de contarse el día que se dictó.
 */

const MESES = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
]

/**
 * «17 de abril de 2019» → «2019-04-17». Null si la frase no tiene esa forma: la
 * tira no dibuja un hito que no sabe fechar.
 *
 * @param {string} f
 * @returns {string|null}
 */
export function isoDeFecha(f) {
  const m = /^(\d{1,2}) de ([a-z]+) de (\d{4})$/.exec(f?.trim() ?? '')
  if (!m) return null
  const mes = MESES.indexOf(m[2])
  if (mes < 0) return null
  return `${m[3]}-${String(mes + 1).padStart(2, '0')}-${m[1].padStart(2, '0')}`
}

/** «2021-02-11» → milisegundos UTC, para situar un punto en el eje. */
export const msDeIso = (/** @type {string} */ iso) => {
  const [a, m, d] = iso.split('-').map(Number)
  return Date.UTC(a, m - 1, d)
}

/**
 * El mayor hueco entre dos publicaciones consecutivas de la ficha.
 *
 * @param {{ ficha?: string }[]} hitos
 * @returns {{ desde: string, hasta: string } | null}
 */
export function silencioDeLaFicha(hitos) {
  const fechas = hitos
    .map((h) => h.ficha)
    .filter((f) => typeof f === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(f))
    .sort()
  let mejor = null
  for (let i = 1; i < fechas.length; i++) {
    const hueco = msDeIso(fechas[i]) - msDeIso(fechas[i - 1])
    if (!mejor || hueco > mejor.hueco) mejor = { desde: fechas[i - 1], hasta: fechas[i], hueco }
  }
  return mejor && { desde: mejor.desde, hasta: mejor.hasta }
}

/**
 * Años y meses cumplidos entre dos fechas ISO: «5 años y 2 meses».
 *
 * @param {string} desde
 * @param {string} hasta
 */
export function duracion(desde, hasta) {
  const [a1, m1, d1] = desde.split('-').map(Number)
  const [a2, m2, d2] = hasta.split('-').map(Number)
  let anios = a2 - a1
  let meses = m2 - m1
  if (d2 < d1) meses -= 1
  if (meses < 0) {
    anios -= 1
    meses += 12
  }
  const a = anios === 1 ? '1 año' : `${anios} años`
  const m = meses === 1 ? '1 mes' : `${meses} meses`
  if (anios <= 0) return m
  return meses ? `${a} y ${m}` : a
}
