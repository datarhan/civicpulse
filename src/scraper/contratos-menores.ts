/**
 * Contratación menor — el gasto que se adjudica sin concurso.
 *
 * El contrato menor es la vía directa: sin licitación, sin publicidad previa,
 * con un informe de necesidad. Por eso es la partida que más interesa vigilar,
 * y por eso el propio portal de transparencia del Ayuntamiento se compromete a
 * publicarla «como mínimo trimestralmente».
 *
 * El dato ya venía en `tenders.json` —`minorContract`, leído de ribalicita— y
 * no lo enseñaba nadie: ni un fichero del front nombraba el campo.
 *
 * ## El techo se mide SIN IVA
 *
 * El art. 118 de la Ley 9/2017 define el contrato menor por su valor estimado,
 * que es sin impuestos. Medir con el importe bruto no es un matiz: sobre los
 * importes CON IVA salen quince contratos por encima del techo y sobre los
 * netos salen cuatro. Los once de diferencia son 39.900 € netos que con el
 * 21 % se leen como 48.279 € — justo por encima de los 40.000 de obras.
 *
 * Publicar los quince habría firmado que el Ayuntamiento se salta la ley once
 * veces más de lo que se la salta.
 *
 * ## El denominador son los ADJUDICADOS
 *
 * De las 809 filas del snapshot, 108 no son un contrato vivo: 49 anuladas, 7
 * revocadas, 9 desistidas y 43 sin clasificar. Comparar un numerador que
 * incluye menores anulados contra ese total, y llamarlo «contratos
 * publicados», diluye el peso de la vía directa — 190 de 809 es 23 %, y lo
 * cierto es 184 de 701, un 26 %. Lo cazó la revisión lectora antes de que
 * llegara a producción.
 *
 * El predicado no se reescribe aquí: `isCommittedContract` existe desde que
 * escribir `status === 'awarded'` dejó fuera 314 contratos firmados y 53,5 M€.
 *
 * ## Lo que esto NO dice
 *
 * Un contrato por encima del techo no es aquí un veredicto: la marca
 * `minorContract` la pone la fuente, no nosotros, y una etiqueta equivocada en
 * origen se parece exactamente a un incumplimiento. Esto mide y enseña la
 * distancia al límite legal; llamarlo infracción es un paso que sólo da una
 * persona, y con derecho de réplica delante.
 */

import { isCommittedContract, CANCELLED_STATUSES } from '../lib/contract-status'

/** Contrato sin depender de la forma completa de `tenders.json`. */
export interface ContratoMenorEntrada {
  minorContract?: boolean
  status?: string | null
  contractType?: string | null
  initialAmountNoTaxes?: number | null
  finalAmountNoTaxes?: number | null
  awardDate?: string | null
  formalizedDate?: string | null
  startDate?: string | null
  title?: string | null
  permalink?: string | null
}

/**
 * Los techos del art. 118 de la Ley 9/2017, SIN impuestos. Se exportan para que
 * ninguna prueba y ninguna vista los vuelva a escribir: una tabla copiada a
 * mano que se separa de la producción es el defecto más caro de este
 * repositorio.
 */
export const TECHO_MENOR_SIN_IVA: Readonly<Record<string, number>> = Object.freeze({
  construction: 40_000,
  services: 15_000,
  supplies: 15_000,
})

export const NORMA_MENOR =
  'https://www.boe.es/buscar/act.php?id=BOE-A-2017-12902&p=20231228&tn=1#a118'

export interface ContratoSobreTecho {
  title: string
  contractType: string
  importeSinIva: number
  techo: number
  permalink: string | null
}

export interface ResumenMenores {
  /** Menores ADJUDICADOS o firmados. Los anulados no cuentan aquí. */
  n: number
  /** Menores cuya adjudicación se deshizo. Se cuentan, no se esconden. */
  anulados: number
  importeSinIva: number
  /** Sin importe neto declarado: no se juzgan, y se cuentan aparte. */
  sinImporte: number
  /** Tipos de contrato sin techo declarado en la ley para esta vía. */
  sinTecho: number
  porAnio: { anio: number; n: number; importeSinIva: number }[]
  sobreTecho: ContratoSobreTecho[]
}

const neto = (c: ContratoMenorEntrada): number | null => {
  const v = c.finalAmountNoTaxes ?? c.initialAmountNoTaxes
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

const anioDe = (c: ContratoMenorEntrada): number | null => {
  const s = c.awardDate ?? c.formalizedDate ?? c.startDate ?? ''
  const m = /^(\d{4})/.exec(String(s))
  return m ? Number(m[1]) : null
}

/** El resumen de la contratación menor, medido sobre importes SIN IVA. */
export function resumenMenores(contratos: ContratoMenorEntrada[]): ResumenMenores {
  const marcados = contratos.filter((c) => c.minorContract === true)
  const anulados = marcados.filter((c) => CANCELLED_STATUSES.includes(String(c.status))).length
  // Reprocharle a alguien un contrato anulado es reprocharle algo que no llegó
  // a pasar, así que el techo tampoco se mide sobre ellos.
  const menores = marcados.filter((c) => isCommittedContract(c))
  const porAnio = new Map<number, { anio: number; n: number; importeSinIva: number }>()
  const sobreTecho: ContratoSobreTecho[] = []
  let importeSinIva = 0
  let sinImporte = 0
  let sinTecho = 0

  for (const c of menores) {
    const v = neto(c)
    if (v === null) {
      // Un importe que falta no es un importe bajo. Contarlo como «dentro del
      // techo» daría por hecha una comprobación que no se ha hecho.
      sinImporte++
    } else {
      importeSinIva += v
      const anio = anioDe(c)
      if (anio !== null) {
        const fila = porAnio.get(anio) ?? { anio, n: 0, importeSinIva: 0 }
        fila.n++
        fila.importeSinIva += v
        porAnio.set(anio, fila)
      }
      const techo = TECHO_MENOR_SIN_IVA[String(c.contractType)]
      if (techo === undefined) sinTecho++
      else if (v > techo) {
        sobreTecho.push({
          title: String(c.title ?? '—'),
          contractType: String(c.contractType),
          importeSinIva: v,
          techo,
          permalink: c.permalink ?? null,
        })
      }
    }
  }

  return {
    n: menores.length,
    anulados,
    importeSinIva: Math.round(importeSinIva * 100) / 100,
    sinImporte,
    sinTecho,
    porAnio: [...porAnio.values()].sort((a, b) => a.anio - b.anio),
    sobreTecho: sobreTecho.sort((a, b) => b.importeSinIva - a.importeSinIva),
  }
}

export interface PesoDelMayor {
  /** Qué porcentaje del total adjudicado es el contrato más grande. */
  cuotaDelMayor: number
  /** Qué porcentaje sería la contratación menor si se aparta esa pieza. */
  cuotaSinElMayor: number
  importeDelMayor: number
}

/**
 * Cuánto pesa el contrato más grande dentro del total, y qué queda sin él.
 *
 * Existe porque decir «los menores son el 2,5 % del importe» descansa en un
 * denominador que domina UNA concesión de agua de 55,7 M€ adjudicada de una vez
 * por todo su plazo: el 45 % de todo lo contratado desde 2017. Sin ella los
 * menores son el 4,6 %, casi el doble. Las dos cifras son ciertas y sólo una
 * de las dos, dicha sola, tranquiliza.
 *
 * Se deriva y no se escribe en la prosa: una concesión nueva mueve el reparto,
 * y un porcentaje escrito a mano en una página se queda falso sin que nadie lo
 * note. Es la razón de ser del gancho `remind-stale-copy`.
 */
export function pesoDelMayor(importes: number[], importeMenores: number): PesoDelMayor | null {
  const total = importes.reduce((a, b) => a + b, 0)
  if (total <= 0 || importes.length === 0) return null
  const mayor = Math.max(...importes)
  const resto = total - mayor
  if (resto <= 0) return null
  return {
    cuotaDelMayor: Math.round((mayor / total) * 100),
    cuotaSinElMayor: Math.round((importeMenores / resto) * 1000) / 10,
    importeDelMayor: mayor,
  }
}
