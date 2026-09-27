/**
 * Cuánto mueve la cesta la puntuación de Riba-roja, medido del snapshot y no
 * escrito a mano.
 *
 * EL FALLO, medido el 2026-09-25: /metodologia, /nosotros y /about decían que
 * «cuatro cestas igual de defendibles» movían la puntuación «media escala», y
 * /laboratorio/frontera titulaba «Cuatro cestas defendibles, cuatro
 * resultados» sobre dos tarjetas que dicen «sin puntuación». Ningún dea.json
 * publicado lo sostuvo nunca: desde el primero, del 12-08-2026, dos de las
 * cuatro cestas no llegan a grados de libertad y entre las otras dos θ va de
 * 0,43 a 0,53 —una décima de escala—. La frase describía una ejecución anterior
 * a la versión final del experimento, y ninguna guarda podía verlo: el dato
 * estaba bien y la frase mal. Es la prosa que envejece cuando el dato se mueve,
 * salvo que aquí ya nació vieja.
 *
 * Así que esas frases salen de aquí, y dicen sólo lo que se puede medir:
 *
 * - cuántas cestas se probaron y cuántas dan puntuación;
 * - el recorrido de θ entre las que la dan;
 * - cuántos puestos se mueve Riba-roja entre ellas, y SÓLO cuando las dos
 *   clasificaciones son la misma muestra. Una cesta con más servicios deja
 *   fuera a quien falle en cualquiera de ellos (`construirDmus`), así que si
 *   una cesta contiene a la otra y las dos tienen el mismo n, los municipios
 *   son los mismos. Sin eso, restar puestos de dos clasificaciones distintas
 *   no mide nada, y la frase se calla la cifra.
 *
 * Puro: sin red, sin React. Lo leen las páginas y las pruebas.
 */
import type { AnalisisEspecificacion } from './dea-especificacion'

/** Lo que hace falta de cada especificación publicada en `dea.json`. */
export type EspecificacionLeida = Pick<
  AnalisisEspecificacion,
  'anio' | 'estado' | 'programas' | 'propia' | 'distribucion'
>

export interface SensibilidadCestas {
  /** Cestas probadas: todas las especificaciones del snapshot. */
  probadas: number
  /** Las que reúnen comparables suficientes para dar una puntuación. */
  conPuntuacion: number
  /**
   * θ de Riba-roja, la menor y la mayor entre las cestas con puntuación.
   * `cambia` compara las cifras tal como se imprimen: dos θ que se escriben
   * igual no pueden anunciarse como distintas. `null` con menos de dos.
   */
  theta: { min: number; max: number; cambia: boolean } | null
  /**
   * El mayor salto de Riba-roja, en puestos, entre dos cestas que clasifican a
   * los mismos `de` municipios; `pares` dice cuántas parejas de cestas cumplen
   * esa condición. `null` si ninguna la cumple.
   */
  puestos: { movimiento: number; de: number; pares: number } | null
}

export const fmtTheta = (v: number): string =>
  v.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

type ConNota = EspecificacionLeida & {
  propia: NonNullable<EspecificacionLeida['propia']>
  distribucion: NonNullable<EspecificacionLeida['distribucion']>
}

const tieneNota = (e: EspecificacionLeida): e is ConNota =>
  e.estado === 'publicada' &&
  e.propia != null &&
  e.distribucion != null &&
  Number.isFinite(e.propia.theta)

/** Cuántos municipios de la clasificación quedan por debajo de Riba-roja. */
const porDebajo = (e: ConNota) => Math.round((e.propia.percentil / 100) * e.distribucion.n)

const contiene = (mayor: ConNota, menor: ConNota) => {
  const codigos = new Set(mayor.programas.map((p) => p.programa))
  return menor.programas.every((p) => codigos.has(p.programa))
}

const mismaMuestra = (a: ConNota, b: ConNota) =>
  a.anio === b.anio && a.distribucion.n === b.distribucion.n && (contiene(a, b) || contiene(b, a))

export function sensibilidadCestas(
  especificaciones?: readonly EspecificacionLeida[] | null,
): SensibilidadCestas {
  const todas = Array.isArray(especificaciones) ? especificaciones : []
  const conNota = todas.filter(tieneNota)

  let theta: SensibilidadCestas['theta'] = null
  if (conNota.length >= 2) {
    const valores = conNota.map((e) => e.propia.theta)
    const min = Math.min(...valores)
    const max = Math.max(...valores)
    theta = { min, max, cambia: fmtTheta(min) !== fmtTheta(max) }
  }

  let puestos: SensibilidadCestas['puestos'] = null
  for (let i = 0; i < conNota.length; i++) {
    for (let j = i + 1; j < conNota.length; j++) {
      const [a, b] = [conNota[i], conNota[j]]
      if (!mismaMuestra(a, b)) continue
      const movimiento = Math.abs(porDebajo(a) - porDebajo(b))
      const pares = (puestos?.pares ?? 0) + 1
      puestos =
        puestos && puestos.movimiento >= movimiento
          ? { ...puestos, pares }
          : { movimiento, de: a.distribucion.n, pares }
    }
  }

  return {
    probadas: todas.length,
    conPuntuacion: todas.filter((e) => e.estado === 'publicada').length,
    theta,
    puestos,
  }
}

const FEMENINO = [
  'ninguna',
  'una',
  'dos',
  'tres',
  'cuatro',
  'cinco',
  'seis',
  'siete',
  'ocho',
  'nueve',
  'diez',
]
const MASCULINO = [
  'ningún',
  'un',
  'dos',
  'tres',
  'cuatro',
  'cinco',
  'seis',
  'siete',
  'ocho',
  'nueve',
  'diez',
]
const INGLES = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten']

/** Del cero al diez en letra, con el género del sustantivo que acompaña; después, cifra. */
export const cardinalEs = (n: number, genero: 'f' | 'm'): string =>
  (genero === 'f' ? FEMENINO : MASCULINO)[n] ?? String(n)

export const cardinalEn = (n: number): string => INGLES[n] ?? String(n)

const mayuscula = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/**
 * El titular de la sección de cestas en /laboratorio/frontera. Decía «Cuatro
 * cestas defendibles, cuatro resultados» encima de dos tarjetas «sin
 * puntuación»; ahora cuenta las que puntúan, con la misma palabra que las
 * pastillas de cada tarjeta.
 */
export function tituloCestas({ probadas, conPuntuacion }: SensibilidadCestas): string {
  if (probadas === 1) {
    return `Una cesta defendible, ${conPuntuacion ? 'con' : 'sin'} puntuación`
  }
  const cuantas = conPuntuacion === probadas ? 'todas' : cardinalEs(conPuntuacion, 'f')
  return `${mayuscula(cardinalEs(probadas, 'f'))} cestas defendibles, ${cuantas} con puntuación`
}
