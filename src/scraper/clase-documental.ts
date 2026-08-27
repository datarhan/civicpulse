/**
 * Qué documento NOMBRA una declaración de pleno.
 *
 * Propiedad léxica, nunca un pronóstico. Esto no dice si la frase se puede
 * comprobar, ni si el documento existe, ni si el Ayuntamiento lo tiene: dice
 * qué documento menciona el hablante. Es la misma distinción que
 * `classifyClaimShape` sostiene en la cola de apoyo, y es lo único que hace
 * defendible clasificar miles de filas sin que un modelo adivine nada.
 *
 * Para qué sirve: el dimensionado de la cobertura encontró que una cuarta parte
 * de las declaraciones sin corpus son hechos municipales cuyo documento
 * probatorio no se publica. Agrupadas por el documento que nombran, esas filas
 * dejan de ser un límite y pasan a ser el material de una solicitud de acceso:
 * «estas 91 declaraciones dependen de un informe técnico que no está publicado».
 *
 * LA REGLA QUE MÁS IMPORTA: una frase que no nombra ningún documento se cuenta
 * APARTE y no se reparte entre las clases. Son el 87 % de las filas sin corpus,
 * y repartirlas haría que cualquier clase pareciera mayor de lo que es — que es
 * exactamente cómo se justifica una petición que el material no sostiene.
 */

/** Todas las clases que el clasificador sabe reconocer. */
export const CLASES_DOCUMENTALES = [
  'acta',
  'informe-tecnico',
  'expediente',
  'plan-interno',
  'convenio',
  'ordenanza',
  'contrato',
  'presupuesto',
] as const

export type ClaseDocumental = (typeof CLASES_DOCUMENTALES)[number]

/**
 * Las clases que tiene sentido PEDIR.
 *
 * `contrato` y `presupuesto` se nombran mucho —160 y 127 filas— pero de las dos
 * ya tenemos corpus: ahí el hueco es de emparejamiento, no de publicación, y
 * pedir lo que ya está publicado sería ruido que además debilita las otras
 * cuatro. `convenio` y `ordenanza` se quedan fuera por lo mismo: la ordenanza se
 * publica en el BOP y el convenio suele ir en el acta que ya se pide.
 */
export const CLASES_PEDIBLES = ['informe-tecnico', 'expediente', 'plan-interno', 'acta'] as const

export type ClasePedible = (typeof CLASES_PEDIBLES)[number]

/** Cómo se llama cada clase en la página. */
export const CLASE_ETIQUETA: Record<ClaseDocumental, string> = {
  acta: 'Actas y acuerdos plenarios',
  'informe-tecnico': 'Informes técnicos',
  expediente: 'Expedientes administrativos',
  'plan-interno': 'Planes internos',
  convenio: 'Convenios',
  ordenanza: 'Ordenanzas y reglamentos',
  contrato: 'Contratos y concesiones',
  presupuesto: 'Presupuesto y liquidaciones',
}

/**
 * Los patrones, exportados para que una prueba pueda recorrerlos.
 *
 * Deliberadamente estrechos: prefieren no reconocer a reconocer de más. Una
 * clase inflada pide un documento que su material no justifica, y ese error se
 * paga delante de una administración.
 */
export const PATRONES: Record<ClaseDocumental, RegExp> = {
  acta: /\b(actas?|acuerdos? plenarios?|acuerdo del pleno|en el pleno|pleno celebrado)\b/i,
  'informe-tecnico': /\b(informes?|dict[áa]men(es)?)\b/i,
  expediente: /\bexpedientes?\b/i,
  'plan-interno': /\b(plan(es)? de\b|plan director)/i,
  convenio: /\b(convenios?|adhesi[óo]n)\b/i,
  ordenanza: /\b(ordenanzas?|reglamentos?|bases reguladoras)\b/i,
  contrato: /\b(contratos?|concesi[óo]n|adjudicaci[óo]n|pliegos?|licitaci[óo]n)\b/i,
  presupuesto: /\b(presupuestos?|liquidaci[óo]n|remanente|partida|cr[ée]dito)\b/i,
}

/** Las clases que una frase nombra. Vacío si no nombra ninguna. */
export function claseDocumentalDe(verbatim?: string | null): ClaseDocumental[] {
  const t = (verbatim ?? '').trim()
  if (!t) return []
  return CLASES_DOCUMENTALES.filter((c) => PATRONES[c].test(t))
}

export interface AgrupacionDocumental {
  porClase: Partial<Record<ClaseDocumental, number>>
  /** Las que no nombran ningún documento. NO se reparten. */
  sinDocumento: number
  total: number
}

/**
 * Agrupa por clase nombrada, contando aparte las que no nombran ninguna.
 *
 * Una frase que nombra dos clases suma en las dos: la pregunta es «¿cuántas
 * declaraciones dependen de este documento?», y depende de los dos.
 */
export function agruparPorClaseDocumental(
  verbatims: ReadonlyArray<string | null | undefined>,
): AgrupacionDocumental {
  const porClase: Partial<Record<ClaseDocumental, number>> = {}
  let sinDocumento = 0
  for (const v of verbatims) {
    const clases = claseDocumentalDe(v)
    if (clases.length === 0) {
      sinDocumento += 1
      continue
    }
    for (const c of clases) porClase[c] = (porClase[c] ?? 0) + 1
  }
  return { porClase, sinDocumento, total: verbatims.length }
}
