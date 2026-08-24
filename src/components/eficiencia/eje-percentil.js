import { cruzaMediana } from '../../scraper/indicador-areas'

/**
 * La geometría del eje de posición, en un módulo puro y con una sola escala.
 *
 * Hasta el libro de servicios esta página codificaba UNA idea —dónde queda
 * Riba-roja entre sus comparables— con TRES geometrías distintas: una pista de
 * percentil 0–100 en la cabecera, una tira escalada al mínimo-máximo de los
 * VALORES dentro de cada tarjeta, y un «banda plausible 73–95» suelto en texto.
 * La segunda es la que mentía: con comparables que van de 0 a 924 €/m², el
 * punto de los colegios caía al 11 % de la tira debajo de un rótulo que decía
 * «percentil 85». Las dos cosas estaban en la misma tarjeta.
 *
 * Aquí la escala es FIJA, de percentil 0 a 100, y todo se mide contra ella: la
 * mediana siempre en el centro, el grueso del grupo siempre del 25 al 75, y el
 * marcador en su propio percentil. Un extremo de la muestra ya no puede
 * quedarse el carril.
 *
 * Se separa del componente porque una geometría que sólo existe dentro del JSX
 * es una geometría que nadie mide: las suites de esta casa comprueban texto, y
 * el defecto anterior sobrevivió a todas ellas.
 */

/** La mediana del grupo, siempre en el centro de la escala. */
export const PCT_MEDIANA = 50

/** El grueso del grupo (p25–p75), siempre la mitad central. */
export const PCT_IQR = { left: 25, width: 50 }

const recorta = (n) => Math.min(100, Math.max(0, n))

/**
 * El eje NO acepta un umbral legal, y la ausencia es deliberada.
 *
 * En /gestion la referencia del plazo de pago la fija la ley: 30 días. Pero el
 * eje va en PERCENTILES, y la fuente publica el percentil de Riba-roja (94) sin
 * publicar el de los 30 días. Lo único que se sabe de esa línea es que cae
 * entre el p75 —27,14 días— y el p94. Situarla a ojo sería inventar justo la
 * cifra que la fuente calla, en el sitio donde una línea roja más pesa. El
 * hecho legal se dice entero en texto, con su múltiplo y su norma enlazada.
 *
 * @param {object} arg
 * @param {number|null|undefined} arg.percentil  Puesto de Riba-roja, 0–100.
 * @param {[number, number]|null|undefined} arg.banda  Banda plausible del percentil.
 */
export function geometriaEje({ percentil, banda }) {
  const hayBanda = Array.isArray(banda) && banda.length === 2
  const cruza = cruzaMediana({ percentilBanda: banda })

  return {
    iqr: PCT_IQR,
    mediana: PCT_MEDIANA,
    banda: hayBanda
      ? { left: recorta(banda[0]), width: recorta(banda[1]) - recorta(banda[0]) }
      : null,
    // `null`, no un cero: un marcador en el 0 se lee como «el más barato de
    // todos», que es una afirmación, y aquí no hay ninguna que hacer.
    marcador:
      typeof percentil === 'number' && Number.isFinite(percentil)
        ? { left: recorta(percentil), hueco: cruza === true }
        : null,
  }
}

/**
 * Una raya por comparable, repartidas por PUESTO y no por valor.
 *
 * Es la misma decisión que la escala fija, a otra altura: ordenadas por valor,
 * el municipio que declara 924 €/m² amontonaría las otras cuarenta contra el
 * borde izquierdo y la ficha volvería a enseñar un extremo en lugar de un
 * reparto.
 */
export function ticksRango(n) {
  if (!n || n < 1) return []
  return Array.from({ length: n }, (_, k) => ((k + 1) / n) * 100)
}
