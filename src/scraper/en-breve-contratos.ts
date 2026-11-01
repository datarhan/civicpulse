/**
 * «En breve» de /contratos: las cifras de la primera capa, para quien llega
 * preguntando cuánto se contrata, a quién y cuánto sin concurso.
 *
 * Las mismas reglas que `en-breve-presupuesto.ts`:
 *
 * 1. Las cifras salen de las MISMAS funciones que la sección a la que enlaza
 *    cada respuesta (`isCommittedContract`, `importeAdjudicado`,
 *    `topContractors`, `pesoDelMayor`) y del mismo criterio que el indicador de
 *    /gestion (`PROCESOS_SIN_PUBLICIDAD`). Un resumen con su propia aritmética
 *    acabaría diciendo otra cosa que el detalle.
 * 2. Una respuesta que no se puede dar es `null`, nunca un cero. Sin una sola
 *    fila que declare su procedimiento no hay «0 de cada 100 sin concurso»: no
 *    se sabría, y un cero lo afirmaría.
 * 3. Una cifra no va sin lo que la matiza. La suma es de varios ejercicios, y
 *    una sola concesión pesa casi la mitad: se adjudica de una vez por todo su
 *    plazo, y no la paga el presupuesto sino el vecino en su factura. La
 *    salvedad se deriva y es condicional; si otro contrato grande reparte el
 *    peso, desaparece sola.
 *
 * «Adjudicado» no es «pagado»: es el importe de adjudicación sin IVA, y un
 * contrato adjudicado no es dinero desembolsado. Tampoco siempre paga el
 * Ayuntamiento: en una venta de parcela cobra, y esas filas están en la suma, como
 * en la portada y el mapa (`ventas` las cuenta; los bares no, porque el registro
 * no dice en qué sentido va su importe). Y un
 * contrato sigue en la suma aunque ya haya acabado o se haya resuelto: el registro
 * dice lo que se adjudicó, no lo que sigue en vigor. Ninguna frase de esta capa
 * dice «gastado».
 */
import {
  committedAwardYearSpan,
  comprometidosSinImporte,
  importeAdjudicado,
  ingresoMunicipal,
  isCommittedContract,
  isConcession,
} from '../lib/contract-status'
import { concentracion, resolverDeEmpresas, topContractors } from '../lib/tender-geo'
import { pesoDelMayor } from './contratos-menores'
import { coberturaDeBarrio, type BarrioEnBreve } from './en-breve-presupuesto'
import { ADJUDICACION_DOMINANTE, PROCESOS_SIN_PUBLICIDAD } from './indicadores-friccion'
import { nombraLaDana } from './tender-geo'

interface ContratoEB {
  title?: string | null
  permalink?: string | null
  status?: string
  assignee?: string
  awardDate?: string | null
  processType?: string
  contractType?: string | null
  finalAmount?: number | null
  finalAmountNoTaxes?: number | null
}

export interface EntradaContratos {
  tenders?: {
    contracts?: ContratoEB[]
    tenders?: { permalink?: string | null; title?: string | null }[]
  } | null
  entities?: { companies?: unknown[] } | null
  tenderGeo?: { universe?: { totalAmount?: number; locatedAmount?: number } | null } | null
}

export interface CuantoEnBreve {
  /** Contratos adjudicados o firmados, con importe publicado o sin él. */
  adjudicados: number
  /** Importe adjudicado, sin IVA. Suma sólo los que lo publican. */
  importe: number
  /** Adjudicados que no publican importe: no es cero, es desconocido. */
  sinImporte: number
  /** Ventas de un bien municipal: el Ayuntamiento cobra en vez de pagar. */
  ventas: number
  desde: number | null
  hasta: number | null
  ejercicios: number | null
  /** El mayor contrato, sólo cuando pesa más de un cuarto de la suma. */
  mayor: { importe: number; cuota: number; esConcesion: boolean } | null
}

export interface AQuienEnBreve {
  /** Adjudicatarios distintos con algún importe, con sus razones sociales unidas. */
  adjudicatarios: number
  /** De cada 100 € adjudicados, cuántos suman los `MAYORES` primeros. */
  deCada100: number
  /** De cada 100 €, cuántos el primero él solo. */
  mayorDeCada100: number
  /** Parte exacta de los `MAYORES` primeros, 0..1, para el ancho de la barra. */
  cuota: number
}

export interface SinConcursoEnBreve {
  /** Adjudicados sin convocatoria abierta. */
  n: number
  /** Adjudicados en total. */
  de: number
  deCada100: number
  menores: number
  negociados: number
  /** Negociados cuyo título, o el de su licitación, nombra la DANA. */
  negociadosDana: number
  /** Importe de los `n`. Suma sólo los que lo publican. */
  importe: number
  importeMenores: number
  importeNegociados: number
  importeNegociadosDana: number
  /** Importe de todos los adjudicados. */
  importeTotal: number
  /** Parte del importe, en porcentaje con decimales. null sin importes. */
  importePct: number | null
  /**
   * La misma parte apartando el mayor contrato, sólo cuando ese contrato pesa
   * más de un cuarto de la suma y no es de los que se están contando.
   */
  importeSinElMayorPct: number | null
}

export interface EnBreveContratos {
  cuanto: CuantoEnBreve | null
  aQuien: AQuienEnBreve | null
  sinConcurso: SinConcursoEnBreve | null
  barrio: BarrioEnBreve | null
}

const importe = (c: ContratoEB): number => importeAdjudicado(c) ?? 0
const suma = (filas: ContratoEB[]): number => filas.reduce((s, c) => s + importe(c), 0)
const esSinPublicidad = (c: ContratoEB): boolean =>
  (PROCESOS_SIN_PUBLICIDAD as readonly string[]).includes(c.processType ?? '')

export function enBreveContratos(e: EntradaContratos): EnBreveContratos {
  const barrio = coberturaDeBarrio(e.tenderGeo?.universe)
  const contratos = e.tenders?.contracts ?? []
  const adjudicados = contratos.filter((c) => isCommittedContract(c))
  if (adjudicados.length === 0) return { cuanto: null, aQuien: null, sinConcurso: null, barrio }
  const titulos = new Map((e.tenders?.tenders ?? []).map((t) => [t.permalink, t.title]))
  const licitacionDe = (c: ContratoEB) => titulos.get(c.permalink) ?? null

  const total = suma(adjudicados)
  const mayor = adjudicados.reduce((a, b) => (importe(b) > importe(a) ? b : a))
  const pesa = total > 0 && importe(mayor) / total >= ADJUDICACION_DOMINANTE

  let cuanto: CuantoEnBreve | null = null
  if (total > 0) {
    const span = committedAwardYearSpan(contratos)
    cuanto = {
      adjudicados: adjudicados.length,
      importe: total,
      sinImporte: comprometidosSinImporte(contratos),
      ventas: adjudicados.filter((c) => ingresoMunicipal(c, licitacionDe(c)) === 'enajenacion')
        .length,
      desde: span?.from ?? null,
      hasta: span?.to ?? null,
      ejercicios: span ? span.to - span.from + 1 : null,
      mayor: pesa
        ? {
            importe: importe(mayor),
            cuota: Math.round((importe(mayor) / total) * 100),
            esConcesion: isConcession(mayor),
          }
        : null,
    }
  }

  // La lista entera y no los quince que pinta la pestaña: el total de esta cuota
  // son todos los adjudicatarios. `Infinity` porque `topContractors` corta con
  // `slice`, y el mismo cálculo evita una segunda definición de quién es quién.
  const aQuien: AQuienEnBreve | null = concentracion(
    topContractors(contratos, Infinity, resolverDeEmpresas(e.entities?.companies)),
  )

  let sinConcurso: SinConcursoEnBreve | null = null
  if (adjudicados.some((c) => c.processType)) {
    const filas = adjudicados.filter(esSinPublicidad)
    const menores = filas.filter((c) => c.processType === 'minor_contract')
    const negociados = filas.filter((c) => c.processType !== 'minor_contract')
    const negociadosDana = negociados.filter((c) => nombraLaDana(c.title, licitacionDe(c)))
    const importeFilas = suma(filas)
    const peso =
      pesa && !esSinPublicidad(mayor) ? pesoDelMayor(adjudicados.map(importe), importeFilas) : null
    sinConcurso = {
      n: filas.length,
      de: adjudicados.length,
      deCada100: Math.round((filas.length / adjudicados.length) * 100),
      menores: menores.length,
      negociados: negociados.length,
      negociadosDana: negociadosDana.length,
      importe: importeFilas,
      importeMenores: suma(menores),
      importeNegociados: suma(negociados),
      importeNegociadosDana: suma(negociadosDana),
      importeTotal: total,
      importePct: total > 0 ? (importeFilas / total) * 100 : null,
      importeSinElMayorPct: peso?.cuotaSinElMayor ?? null,
    }
  }

  return { cuanto, aQuien, sinConcurso, barrio }
}
