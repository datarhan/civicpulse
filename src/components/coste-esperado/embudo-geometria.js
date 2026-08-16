// @ts-check
import { intervaloPrediccion } from '../../scraper/coste-esperado'

/**
 * Geometría del embudo: qué se dibuja, calculado fuera del JSX.
 *
 * La banda NO se recalcula aquí con otra fórmula: se muestrea la misma
 * `intervaloPrediccion` del modelo publicado, que es la que la guarda
 * reproduce. Si divergieran, el dibujo mentiría con el dato al lado.
 */

/** Potencias de diez que caen dentro del rango, para los ejes log. */
export function ticksLog(min, max) {
  if (!(min > 0) || !(max > min)) return []
  const out = []
  for (let e = Math.ceil(Math.log10(min)); Math.pow(10, e) <= max; e++) {
    out.push(Math.pow(10, e))
  }
  return out
}

/**
 * La banda de predicción muestreada en pasos iguales de log(población).
 * Devuelve puntos {poblacion, esperado, inferior, superior} de izquierda a
 * derecha, listos para dos caminos SVG (línea central y área).
 */
export function curvaBanda(modelo, pobMin, pobMax, pasos = 40) {
  if (!modelo || !(pobMin > 0) || !(pobMax > pobMin)) return []
  const x0 = Math.log(pobMin)
  const x1 = Math.log(pobMax)
  const out = []
  for (let i = 0; i <= pasos; i++) {
    const poblacion = Math.exp(x0 + ((x1 - x0) * i) / pasos)
    out.push({ poblacion, ...intervaloPrediccion(modelo, poblacion) })
  }
  return out
}

/** Formato corto de euros para ejes: 1 k€, 1 M€. */
export function etiquetaEuros(v) {
  if (v >= 1e6) return `${v / 1e6} M€`
  if (v >= 1e3) return `${v / 1e3} k€`
  return `${v} €`
}

/** Formato corto de habitantes para ejes. */
export function etiquetaHabitantes(v) {
  if (v >= 1e6) return `${v / 1e6} M hab`
  if (v >= 1e3) return `${v / 1e3} mil hab`
  return `${v} hab`
}
