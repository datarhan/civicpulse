// @ts-check
/**
 * Agregación pura de la capa de incendios forestales. Sin React y sin fetch,
 * para que el deslizador, la leyenda y la cobertura lean lo mismo y no puedan
 * desviarse entre ellos.
 *
 * Reexporta las etiquetas de causa del parser en vez de copiarlas: el enum
 * tiene un dueño, y los componentes entran por aquí sin tocar src/scraper.
 */
export { CAUSA_ETIQUETA } from '../scraper/incendios'

/**
 * La escala de recencia, declarada una sola vez. La leyenda pinta ESTOS
 * colores y la capa dibuja con ESTA función: si divergieran, el cuadradito de
 * la leyenda diría una cosa y el polígono otra. Son hex literales a propósito
 * —un atributo `fill` de un SVG de Leaflet no resuelve `var()`— y evitan el
 * naranja DANA `#E08600` de la capa de gasto para que no se confundan.
 */
export const TONOS_RECENCIA = [
  { color: '#8C2A12', etiqueta: 'Últimos 10 años', corta: '−10 años', desde: 0, hasta: 0.34 },
  { color: '#C4653C', etiqueta: 'Hace 10-20 años', corta: '10-20', desde: 0.34, hasta: 0.67 },
  { color: '#CFA98E', etiqueta: 'Hace más de 20 años', corta: '+20 años', desde: 0.67, hasta: 1 },
]

/**
 * Tono de un incendio por su posición en la serie. `anyoMin === anyoMax` es un
 * rango de un solo año: sin la guarda, dividir por cero manda todo al mismo
 * extremo con un NaN por medio.
 */
export function tonoPorRecencia(anyo, anyoMin, anyoMax) {
  const rango = anyoMax - anyoMin
  const antiguedad = rango > 0 ? (anyoMax - anyo) / rango : 0
  const tramo = TONOS_RECENCIA.find((t) => antiguedad >= t.desde && antiguedad <= t.hasta)
  return (tramo ?? TONOS_RECENCIA[TONOS_RECENCIA.length - 1]).color
}

/**
 * Recuento por año en TODO el rango, con los años vacíos a cero. El deslizador
 * recorre años, no filas: sin los ceros explícitos se saltaría los huecos y la
 * serie parecería continua donde no lo es.
 *
 * Sólo cuenta lo que se dibuja (`intersecta`). Un incendio que la GVA atribuye
 * aquí pero cartografía fuera del término no puede sumar en un control que
 * gobierna polígonos.
 */
export function porAnyo(incendios, anyoMin, anyoMax) {
  const cuenta = new Map()
  for (const i of incendios ?? []) {
    if (!i.intersecta) continue
    cuenta.set(i.anyo, (cuenta.get(i.anyo) ?? 0) + 1)
  }
  const serie = []
  for (let a = anyoMin; a <= anyoMax; a += 1) {
    serie.push({ anyo: a, total: cuenta.get(a) ?? 0 })
  }
  return serie
}

/**
 * Reparto por grupo de causa. `sinClasificar` sale del numerador y se declara
 * aparte: «Otras Causas» y «Causa desconocida» significan «no se sabe», y un
 * porcentaje calculado sobre un denominador que las incluye afirma algo
 * distinto de lo que la fuente sostiene.
 */
export function repartoDeCausas(incendios) {
  const filas = (incendios ?? []).filter((i) => i.intersecta)
  const cuenta = new Map()
  let sinClasificar = 0
  for (const i of filas) {
    if (i.causa === 'sinClasificar') sinClasificar += 1
    else cuenta.set(i.causa, (cuenta.get(i.causa) ?? 0) + 1)
  }
  const conCausa = filas.length - sinClasificar
  const grupos = [...cuenta.entries()]
    .map(([causa, total]) => ({
      causa,
      total,
      pct: conCausa > 0 ? (100 * total) / conCausa : 0,
    }))
    .sort((a, b) => b.total - a.total)
  return { total: filas.length, conCausa, sinClasificar, grupos }
}

/**
 * Contratos municipales que hablan de incendios, y cuántos de ellos tienen un
 * punto en el mapa.
 *
 * Las dos listas son DECLARADAS y estrechas a propósito. Un regex ancho por
 * «emergencia» casa 72 contratos de los cuales ~63 son limpieza tras la DANA
 * —«contrato de emergencia» es un PROCEDIMIENTO de contratación, no un
 * incidente—, y pintarlos como prevención de incendios sería una afirmación
 * falsa sobre el ayuntamiento en una superficie que lo nombra.
 */
const HABLA_DE_INCENDIOS = /incendi|forestal|desbroce|cortafuego|brigada verde/i
const ES_DE_LA_DANA = /\bdana\b|temporal de lluvias|inundaci/i

export function contratosDeIncendio(contratos, assignments) {
  const situados = new Set((assignments ?? []).filter((a) => a?.point).map((a) => String(a.id)))
  const hallados = (contratos ?? []).filter((c) => {
    const t = c?.title ?? ''
    return HABLA_DE_INCENDIOS.test(t) && !ES_DE_LA_DANA.test(t)
  })
  return {
    total: hallados.length,
    situados: hallados.filter((c) => situados.has(String(c.id))).length,
    contratos: hallados,
  }
}
