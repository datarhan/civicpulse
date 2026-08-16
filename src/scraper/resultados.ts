/**
 * El escalón que faltaba: RESULTADOS, al lado del coste y nunca dentro de él.
 *
 * `/eficiencia` publica lo que cada servicio costó. Desde su primera entrega,
 * cada tarjeta de producto termina igual: «la fuente no publica ningún
 * indicador de resultado con el que contrastarlo». Este módulo es ese
 * indicador, traído de las fuentes oficiales que sí lo publican — y con tres
 * reglas que no son documentación sino forma del tipo:
 *
 *  1. **Al lado, nunca dividido.** Un resultado no tiene numerador ni
 *     denominador de gasto: el tipo no tiene dónde ponerlos. «Euros por delito
 *     evitado» inventaría una relación que ningún dato sostiene.
 *  2. **Nunca causal.** La criminalidad municipal agrega a todos los cuerpos
 *     (el SEC junta Policía Nacional, Guardia Civil y locales); el ayuntamiento
 *     no controla la seguridad pública del término. La frase no-causal viaja
 *     en `comoSeLee`, obligatoria, y el validador la exige.
 *  3. **Nunca una ficha firmada.** `draft:indicadores` no lee este array, y el
 *     test lo fija: colgar un resultado de la gestión municipal es una
 *     afirmación materialmente distinta de las que ese cauce firma.
 *
 * Y la cuarta, heredada de `eficiencia-finding`: ningún campo puede nombrar a
 * una persona. El validador rechaza las claves del esquema de pleno igual que
 * lo hace el de fichas, por si alguien copia una fila entre familias.
 *
 * Módulo puro: sin red, sin ficheros. Los CLIs le pasan los datos.
 */

/** Claves que delatan una fila copiada de la familia equivocada. */
const CAMPOS_PROHIBIDOS = [
  'individualSpeaker',
  'speakerGroup',
  'quotes',
  'sourceClaimIds',
  'plenoId',
  'severity',
  'curatorName',
  'numerador',
  'denominador',
] as const

export interface PuntoResultado {
  /** Año natural (los acumulados trimestrales NO entran: sólo años completos). */
  anio: number
  valor: number
}

export interface ParesResultado {
  /** Descripción del conjunto, p. ej. `cv-15k-40k > 20.000 hab`. */
  conjunto: string
  /** SIEMPRE el N propio de esta fuente, nunca el de las bandas de coste. */
  n: number
  percentil: number
  p25: number
  mediana: number
  p75: number
}

export interface IndicadorResultado {
  id: string
  /**
   * La tarjeta de coste JUNTO a la que se publica, si existe. «Junto» es
   * literal: el bloque se renderiza dentro de esa tarjeta, después de su banda,
   * y jamás combinado aritméticamente con ella.
   */
  servicioRelacionado: string | null
  etiqueta: string
  valor: number
  unidad: string
  periodo: string
  serie: PuntoResultado[]
  pares: ParesResultado | null
  /**
   * La frase no-causal, obligatoria y visible: qué agrega la fuente y por qué
   * el resultado no es producto del servicio municipal.
   */
  comoSeLee: string
  caveats: string[]
  fuente: { nombre: string; url: string; atribucion: string }
}

export interface ResultadosBloque {
  items: IndicadorResultado[]
  /**
   * Los resultados que NO existen, dichos: la ausencia medida es un dato. Sin
   * estación de aire en el término no hay indicador de aire, y publicar esa
   * ausencia vale más que tomar prestada la estación del vecino.
   */
  ausencias: { tema: string; motivo: string }[]
}

function esNumeroFinito(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v)
}

/**
 * Valida el bloque entero. Lanza con mensaje concreto: un resultado a medias
 * publicado es peor que ninguno, porque hereda la credibilidad de las tarjetas
 * de al lado.
 */
export function validarResultados(bloque: unknown): ResultadosBloque {
  const b = bloque as Partial<ResultadosBloque> | null
  if (!b || !Array.isArray(b.items) || !Array.isArray(b.ausencias)) {
    throw new Error('[resultados] el bloque necesita items[] y ausencias[]')
  }
  for (const raw of b.items) {
    const r = raw as Record<string, unknown>
    for (const campo of CAMPOS_PROHIBIDOS) {
      if (campo in r) {
        throw new Error(
          `[resultados] «${String(r.id ?? '?')}» trae «${campo}» — un resultado no lleva ` +
            `personas ni mitades de cociente; si viene de otra familia, no se copia`,
        )
      }
    }
    const i = raw as IndicadorResultado
    if (!i.id || !i.etiqueta) throw new Error('[resultados] item sin id o etiqueta')
    if (!esNumeroFinito(i.valor)) throw new Error(`[resultados] «${i.id}» sin valor numérico`)
    if (!i.periodo) throw new Error(`[resultados] «${i.id}» sin periodo`)
    if (!i.comoSeLee || i.comoSeLee.length < 40) {
      throw new Error(
        `[resultados] «${i.id}» sin frase no-causal (comoSeLee): es obligatoria y visible`,
      )
    }
    if (!i.fuente?.url || !i.fuente?.atribucion) {
      throw new Error(`[resultados] «${i.id}» sin fuente con url y atribución`)
    }
    for (const p of i.serie ?? []) {
      if (!esNumeroFinito(p.valor) || !esNumeroFinito(p.anio)) {
        throw new Error(`[resultados] «${i.id}» con punto de serie no numérico`)
      }
    }
    if (i.pares) {
      if (!esNumeroFinito(i.pares.n) || i.pares.n < 1) {
        throw new Error(`[resultados] «${i.id}» con pares sin n propio`)
      }
      if (!i.pares.conjunto) {
        throw new Error(`[resultados] «${i.id}» con pares sin conjunto declarado`)
      }
    }
  }
  for (const a of b.ausencias) {
    if (!a?.tema || !a?.motivo || a.motivo.length < 30) {
      throw new Error('[resultados] una ausencia necesita tema y motivo explicado')
    }
  }
  return b as ResultadosBloque
}
