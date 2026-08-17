/**
 * ¿Cuántos ayuntamientos vuelven a declarar la misma cifra en vez de volver a
 * medirla?
 *
 * Riba-roja declara 11.059,41 toneladas de residuos, 700.000 m² de limpieza
 * viaria y 4.514 puntos de luz. Los declara así en 2019, en 2021, en 2022, en
 * 2023 y en 2024: los mismos números, hasta el segundo decimal. En esas mismas
 * entregas el coste de esos tres servicios pasa de 1,53 a 2,52 millones.
 *
 * Una tonelada de basura no sale igual dos años seguidos. Que el numerador se
 * actualice cada entrega y el denominador no es lo que convierte una serie de
 * costes unitarios en una serie de **inflación de costes**: el cociente sólo
 * puede subir, y sube porque nadie volvió a pesar la basura.
 *
 * ## Por qué esto es una medición y no una sospecha
 *
 * Porque la comparación está dentro del mismo fichero: **la mayoría de las
 * series de unidad física de la banda no se mueven en años, mientras que casi
 * ninguna serie de coste se queda quieta**. Si el municipio de al lado hubiera
 * congelado las dos cosas, sería un ayuntamiento que no rellena el modelo. Que
 * congele sólo el denominador dice qué mitad del formulario se rellena de
 * verdad. Las proporciones exactas NO van aquí a propósito —este comentario ya
 * publicó un 19 % que llevaba meses siendo un 62 %—: viven en el bloque
 * `declaracion` de `dea.json`, que se recalcula cada noche.
 *
 * ## Para qué se usa
 *
 * Para que `/laboratorio/frontera` pueda publicar su serie temporal diciendo
 * qué mide, y para que la tarjeta de un servicio pueda avisar de que su
 * denominador lleva seis años sin cambiar. No es una acusación: puede que la
 * cifra sea correcta y estable. Es un dato sobre la calidad de la declaración,
 * que es justo lo que hay que saber antes de dividir por ella.
 *
 * Puro: sin red, sin reloj.
 */
import type { CesteRow } from './coste-efectivo'
import { resolverCoste, resolverUnidad } from './indicadores'
import { SERVICIOS } from './indicador-registry'

/**
 * Entregas mínimas para llamar congelada a una serie.
 *
 * Con dos o tres, repetir cifra es perfectamente normal —un padrón de puntos de
 * luz puede no moverse dos años— y marcarlo sería ruido. A partir de cuatro la
 * repetición exacta hasta el decimal deja de tener explicación inocente.
 */
export const MIN_ENTREGAS_CONGELADA = 4

export type MagnitudDeclarada = 'unidad' | 'coste'

export interface SerieDeclarada {
  ine: string
  programa: string
  magnitud: MagnitudDeclarada
  /** Entregas en las que la celda resolvió a un valor positivo. */
  entregas: number
  /** Valores distintos entre esas entregas. */
  distintos: number
  /**
   * Entregas consecutivas, contando desde la última hacia atrás, con el MISMO
   * valor que la última.
   *
   * Es lo que hay que mirar, y no `distintos === 1`. Riba-roja cambió sus
   * cifras alguna vez antes de 2019 y desde entonces repite las mismas seis
   * entregas seguidas: con la prueba de «todos los valores iguales» la serie
   * salía limpia y la página habría publicado que su denominador se actualiza.
   * La pregunta que importa no es si alguna vez se movió, sino si la cifra que
   * se está publicando HOY es una medición o una copia.
   */
  repeticionesFinales: number
  congelada: boolean
  /** El último valor declarado, el que se repite. */
  valor: number | null
  /** Primera entrega del tramo repetido. */
  congeladaDesde: number | null
  /** Primera y última entrega en las que aparece. */
  desde: number
  hasta: number
}

export interface ResumenDeclaracion {
  series: SerieDeclarada[]
  totales: {
    unidadSeries: number
    unidadCongeladas: number
    costeSeries: number
    costeCongeladas: number
    /** Entregas revisadas. Sin esto, «0 congeladas» y «no miré» son iguales. */
    entregas: number
    minEntregas: number
  }
}

/** Dos importes se consideran el mismo si coinciden al céntimo. */
const redondea = (v: number) => v.toFixed(4)

export function medirDeclaracionCongelada(
  filas: CesteRow[],
  programas: string[],
  anios: number[],
  opts: { minEntregas?: number } = {},
): ResumenDeclaracion {
  const minEntregas = opts.minEntregas ?? MIN_ENTREGAS_CONGELADA
  const porIne = new Map<string, CesteRow[]>()
  for (const f of filas) {
    const l = porIne.get(f.ine) ?? []
    l.push(f)
    porIne.set(f.ine, l)
  }

  const series: SerieDeclarada[] = []
  const ordenados = [...anios].sort((a, b) => a - b)

  for (const ine of [...porIne.keys()].sort()) {
    const rows = porIne.get(ine)!
    for (const programa of programas) {
      const def = SERVICIOS[programa]
      if (!def) continue
      for (const magnitud of ['unidad', 'coste'] as const) {
        const puntos: { anio: number; valor: number }[] = []
        for (const anio of ordenados) {
          const m =
            magnitud === 'unidad'
              ? resolverUnidad(rows, programa, anio, def.denominador)
              : resolverCoste(rows, programa, anio)
          if (m.estado === 'declarado' && (m.valor ?? 0) > 0) {
            puntos.push({ anio, valor: m.valor! })
          }
        }
        if (puntos.length < minEntregas) continue
        const distintos = new Set(puntos.map((p) => redondea(p.valor))).size
        const ultimo = redondea(puntos[puntos.length - 1].valor)
        let repeticionesFinales = 0
        for (let i = puntos.length - 1; i >= 0; i--) {
          if (redondea(puntos[i].valor) !== ultimo) break
          repeticionesFinales++
        }
        const congelada = repeticionesFinales >= minEntregas
        series.push({
          ine,
          programa,
          magnitud,
          entregas: puntos.length,
          distintos,
          repeticionesFinales,
          congelada,
          valor: puntos[puntos.length - 1].valor,
          congeladaDesde: congelada ? puntos[puntos.length - repeticionesFinales].anio : null,
          desde: puntos[0].anio,
          hasta: puntos[puntos.length - 1].anio,
        })
      }
    }
  }

  const de = (m: MagnitudDeclarada) => series.filter((s) => s.magnitud === m)
  return {
    series,
    totales: {
      unidadSeries: de('unidad').length,
      unidadCongeladas: de('unidad').filter((s) => s.congelada).length,
      costeSeries: de('coste').length,
      costeCongeladas: de('coste').filter((s) => s.congelada).length,
      entregas: ordenados.length,
      minEntregas,
    },
  }
}
