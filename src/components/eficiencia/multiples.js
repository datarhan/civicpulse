// @ts-check
import { huecosSerie, puntosEnEscala } from './SerieServicio'

/**
 * Qué series entran en la rejilla de mini-series, y en qué orden.
 *
 * Los criterios no son nuevos, son los de siempre importados: una entrega
 * cuenta si la tarjeta la contaría (`estado === 'declarado'`, el filtro de
 * `ServicioCard`), y una serie se dibuja si el gráfico grande la dibujaría
 * (≥2 puntos de `puntosEnEscala`, el umbral de `SerieServicio`). Restatearlos
 * aquí es como se quedó verde el test que dejó escapar 298 contratos.
 *
 * El orden es el de la franja de posiciones —percentil descendente, los sin
 * banda al final— para que el lector que viene de la franja encuentre cada
 * servicio en el mismo sitio: el punto dice dónde queda hoy, la mini-serie por
 * dónde vino, y las dos vistas se leen en paralelo.
 */
export function seriesDibujables(indicadores = []) {
  return indicadores
    .map((indicador) => ({
      indicador,
      declarados: (indicador.serie ?? []).filter((p) => p.estado === 'declarado'),
    }))
    .filter((s) => puntosEnEscala(s.declarados).length >= 2)
    .sort((a, b) => {
      const pa = a.indicador.pares?.percentil
      const pb = b.indicador.pares?.percentil
      if (typeof pa === 'number' && typeof pb === 'number') {
        if (pb !== pa) return pb - pa
      } else if (typeof pa === 'number') return -1
      else if (typeof pb === 'number') return 1
      return (b.indicador.numerador?.valor ?? 0) - (a.indicador.numerador?.valor ?? 0)
    })
}

/**
 * El eje X que comparten todas las mini-series.
 *
 * Cada serie por su cuenta empezaría donde empieza su primera entrega, y
 * entonces «misma posición horizontal» dejaría de significar «mismo año» — que
 * es la única razón de poner trece gráficos en una retícula. El dominio es la
 * unión, y la serie que empieza tarde deja su hueco a la izquierda.
 */
export function dominioComun(listasDePuntos = []) {
  const anios = listasDePuntos.flat().map((p) => p.anio)
  if (!anios.length) return null
  return { x0: Math.min(...anios), x1: Math.max(...anios) }
}

/**
 * Los años sin entrega, agregados para decirlos UNA vez al pie.
 *
 * Las trece series carecen de la misma entrega y el gráfico grande rotula el
 * año dentro de cada tarjeta; en una rejilla eso serían trece rótulos idénticos
 * de doce píxeles. Se agrega la unión de los huecos de cada serie —los años que
 * su propio calendario declara ausentes— y el pie los nombra. Derivado del
 * dato, no escrito: si mañana el hueco es otro, la frase cambia sola.
 */
export function aniosSinEntrega(listasDePuntos = []) {
  const anios = new Set()
  for (const puntos of listasDePuntos) {
    for (const h of huecosSerie(puntos)) {
      for (let a = h.desde; a <= h.hasta; a++) anios.add(a)
    }
  }
  return [...anios].sort((a, b) => a - b)
}
