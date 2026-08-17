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
 */
import { AREAS, SERVICIOS, type AreaId } from './indicador-registry'
import type { Indicador } from './indicadores'

/** Recuento de posiciones frente a la banda, con una sola regla para toda la página. */
export interface Particion {
  /** Con cociente y banda de comparación. */
  situados: number
  /** percentil < 50: el coste unitario queda por debajo de la mediana de su banda. */
  abajo: number
  /** percentil > 50. */
  arriba: number
  /** percentil === 50 exacto: ni un lado ni el otro, y se dice. */
  enMediana: number
  /** Con cociente pero sin banda (no llegan quince comparables). */
  sinSituar: number
}

export function particionPosiciones(indicadores: Indicador[]): Particion {
  const conRatio = indicadores.filter((i) => i.valor !== null)
  const situados = conRatio.filter((i) => i.pares)
  return {
    situados: situados.length,
    abajo: situados.filter((i) => i.pares!.percentil < 50).length,
    arriba: situados.filter((i) => i.pares!.percentil > 50).length,
    enMediana: situados.filter((i) => i.pares!.percentil === 50).length,
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
 */
export function fraseParticion(p: Particion): string | null {
  if (p.situados === 0) return null
  let frase: string
  if (p.situados === 1) {
    const lado = p.abajo === 1 ? 'por debajo de' : p.arriba === 1 ? 'por encima de' : 'en'
    frase = `El servicio con comparación queda ${lado} la mediana de su banda`
  } else {
    const partes: string[] = []
    if (p.abajo > 0) partes.push(`${p.abajo} por debajo de la mediana de su banda`)
    if (p.arriba > 0) partes.push(`${p.arriba} por encima`)
    if (p.enMediana > 0) partes.push(`${p.enMediana} en la mediana`)
    frase = `De ${p.situados} con comparación: ${partes.join(' · ')}`
  }
  return p.sinSituar > 0 ? `${frase} · ${p.sinSituar} sin banda comparable` : frase
}
