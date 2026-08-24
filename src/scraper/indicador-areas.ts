/**
 * Agrupar las fichas por área funcional y contar posiciones — en un módulo
 * puro, no en la página.
 *
 * Las dos operaciones alimentan prosa visible («2 de 4 por debajo de la
 * mediana de su banda»), y una cuenta hecha inline en JSX es de las que nadie
 * vuelve a mirar. Aquí se importa el registro —el área la declara cada
 * servicio en `SERVICIOS`, nunca una lista local— y se cuentan percentiles con
 * una sola definición de «por debajo»/«por encima» que el resumen de cabecera
 * y las cabeceras de área comparten. Dos definiciones de «por debajo» que
 * divergen en el 50 exacto serían la página contradiciéndose a sí misma.
 *
 * Desde el libro de servicios esa definición vive aquí ENTERA, y es más
 * estrecha que antes: un percentil sólo da lado cuando su banda plausible no
 * toca la mediana. La expresión estaba suelta dentro de `indicador-lectura`,
 * convertida en una frase de salvedad y en nada más, mientras la partición de
 * cabecera repartía los doce comparables por percentil pelado. Las dos cosas
 * eran ciertas y se contradecían: la tarjeta avisaba de que no se distinguía y
 * la cabecera ya lo había contado como «por debajo».
 */
import { AREAS, SERVICIOS, type AreaId } from './indicador-registry'
import type { Indicador, ParesResumen } from './indicadores'

/**
 * De qué lado cae un servicio, con el enum exportado para que nadie lo
 * restate. `indistinguible` no es un empate: es que la muestra no da para
 * afirmar lado, que es una cosa distinta y más frecuente.
 */
export const POSICIONES = ['arriba', 'abajo', 'indistinguible', 'sin-comparacion'] as const
export type Posicion = (typeof POSICIONES)[number]

/**
 * ¿La banda plausible del percentil cruza la mediana?
 *
 * `null`, no `false`, cuando no hay banda: «no lo sé» y «no cruza» llevan a
 * pintar cosas distintas, y devolver `false` haría que un servicio sin
 * comparar heredara la marca de uno comparado. Es el mismo error que
 * `r?.findings ?? []`.
 */
export function cruzaMediana(pares?: Partial<ParesResumen> | null): boolean | null {
  const banda = pares?.percentilBanda
  if (!Array.isArray(banda) || banda.length !== 2) return null
  return banda[0] <= 50 && banda[1] >= 50
}

/** Cuántas veces la mediana de sus comparables es este coste unitario. */
export function razonMediana(i: Indicador): number | null {
  if (i.valor === null || !i.pares?.mediana) return null
  return i.valor / i.pares.mediana
}

/**
 * El veredicto de una ficha, en una función y no en seis sitios.
 * La banda manda sobre el percentil: un puesto 64 con banda 49–77 no está «por
 * encima», está sin distinguir.
 */
export function posicionServicio(i: Indicador): Posicion {
  if (i.valor === null || !i.pares) return 'sin-comparacion'
  if (cruzaMediana(i.pares) !== false) return 'indistinguible'
  return i.pares.percentil > 50 ? 'arriba' : 'abajo'
}

/** Recuento de posiciones frente a la banda, con una sola regla para toda la página. */
export interface Particion {
  /** Con cociente y banda de comparación. */
  situados: number
  /** Distinguibles por debajo de la mediana de su banda. */
  abajo: number
  /** Distinguibles por encima. */
  arriba: number
  /** Situados cuya banda plausible cruza la mediana: no sostienen un lado. */
  indistinguibles: number
  /** Con cociente pero sin banda (no llegan quince comparables). */
  sinSituar: number
}

export function particionPosiciones(indicadores: Indicador[]): Particion {
  const conRatio = indicadores.filter((i) => i.valor !== null)
  const situados = conRatio.filter((i) => i.pares)
  const de = (p: Posicion) => situados.filter((i) => posicionServicio(i) === p).length
  return {
    situados: situados.length,
    abajo: de('abajo'),
    arriba: de('arriba'),
    indistinguibles: de('indistinguible'),
    sinSituar: conRatio.length - situados.length,
  }
}

export interface GrupoArea {
  area: AreaId
  etiqueta: string
  /** Fichas del área, en el orden en que la página las pinta (gasto desc). */
  indicadores: Indicador[]
  /** Coste efectivo declarado por el área (suma de numeradores), para ordenar. */
  gasto: number
  particion: Particion
}

/**
 * Sólo las fichas CON cociente: las bloqueadas conservan su sección propia
 * («Servicios sin coste unitario»), porque son contenido sobre la rendición de
 * cuentas y no un resto que repartir entre bloques.
 */
export function agruparPorArea(indicadores: Indicador[]): GrupoArea[] {
  const conRatio = indicadores.filter((i) => i.valor !== null)
  const grupos: GrupoArea[] = []
  for (const [area, def] of Object.entries(AREAS) as [AreaId, { etiqueta: string }][]) {
    const del = conRatio.filter((i) => SERVICIOS[i.servicio!]?.area === area)
    if (del.length === 0) continue
    del.sort((a, b) => (b.numerador.valor ?? 0) - (a.numerador.valor ?? 0))
    grupos.push({
      area,
      etiqueta: def.etiqueta,
      indicadores: del,
      gasto: del.reduce((s, i) => s + (i.numerador.valor ?? 0), 0),
      particion: particionPosiciones(del),
    })
  }
  grupos.sort((a, b) => b.gasto - a.gasto)
  return grupos
}

/**
 * La mini-frase de la cabecera de cada área, derivada del recuento.
 * `null` cuando el área entera va sin banda: una frase de posiciones sobre
 * cero situados afirmaría algo que no se midió.
 *
 * Los indistinguibles van PRIMERO y con nombre. Antes no aparecían: se
 * repartían entre «por debajo» y «por encima» según el percentil pelado, así
 * que la frase afirmaba doce lados donde la muestra sostiene seis.
 */
export function fraseParticion(p: Particion): string | null {
  if (p.situados === 0) return null
  let frase: string
  if (p.situados === 1) {
    const lado =
      p.abajo === 1
        ? 'queda por debajo de la mediana de su banda'
        : p.arriba === 1
          ? 'queda por encima de la mediana de su banda'
          : 'no se distingue de la mediana de su banda'
    frase = `El servicio con comparación ${lado}`
  } else {
    const partes: string[] = []
    if (p.indistinguibles > 0) partes.push(`${p.indistinguibles} no se distinguen de la mediana`)
    if (p.abajo > 0) partes.push(`${p.abajo} por debajo`)
    if (p.arriba > 0) partes.push(`${p.arriba} por encima`)
    frase = `De ${p.situados} con comparación: ${partes.join(' · ')}`
  }
  return p.sinSituar > 0 ? `${frase} · ${p.sinSituar} sin banda comparable` : frase
}
