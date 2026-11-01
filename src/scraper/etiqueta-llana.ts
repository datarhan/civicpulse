/**
 * La etiqueta llana de un punto del orden del día.
 *
 * El título oficial de un punto lleva delante lo que la secretaría necesita y
 * un vecino no: el área en mayúsculas («RECURSOS HUMANOS,»), el número de
 * expediente («Expedient: 4305/2024/GEN,»), la fórmula del trámite («Acord
 * relatiu a», «Donar compte de») y, detrás, el código del contrato («(Ctto.
 * 122/2026)»). La lectura vecinal de /plenos enseña el punto sin eso.
 *
 * Tres reglas, de la auditoría de las dos lecturas (25-10-2026):
 *
 * - **No se reescribe nada.** Sólo se quita por delante y por detrás; lo que
 *   queda son palabras del título, en la lengua en que se convocó el punto.
 *   Una etiqueta que resumiera o tradujera sería prosa nuestra sin revisar
 *   (regla 4 de DATA_INTEGRITY).
 * - **El literal no se pierde.** La pestaña del orden del día de /plenos/:id
 *   sigue enseñando el título tal cual, con su área y su expediente.
 * - **Lo que se quita y dice algo, se devuelve aparte.** Que un punto entró
 *   por urgencia es un hecho de la sesión: sale del texto y vuelve como
 *   `urgente`.
 *
 * Cada paso se aplica sólo si deja al menos tres letras: «Dacio compte» y
 * «Despatx d'urgència. 9.1. Donar Compte» son la fórmula entera, y una
 * etiqueta vacía no dice nada.
 */

export interface EtiquetaLlana {
  /** El título sin el área, el expediente, la fórmula del trámite ni el código. */
  texto: string
  /** El punto entró como asunto de urgencia. */
  urgente: boolean
}

/** «Asuntos de urgencia.», «Assumpte d'Urgència 12.1.», «Despatx d'urgència. 9.1.», «ASUNTOS DE URGENCIA. 16.1» */
const URGENCIA =
  /^(?:asuntos?|assumptes?|despatx)\s+d(?:e\s+|['’]\s*)urg[eè]ncias?\s*[.:]?\s*(?:[–—-]\s*)?(?:\d+(?:\.\d+)*\.?\s+)?/i

/** El área en mayúsculas: «RECURSOS HUMANOS,», «URBANISME, :», «CONTRACTACIÓ Expte…». */
const AREA_EN_MAYUSCULAS = /^[A-ZÀ-ÝÑ][A-ZÀ-ÝÑ·/ ]{2,40}?(?:\s*[,.:]\s*|\s+(?=Exp(?:edient|te)))/

/** El área en minúsculas, sólo cuando va delante de un expediente: «Urbanisme, Expedient…». */
const AREA_ANTES_DEL_EXPEDIENTE = /^[A-ZÀ-ÝÑ][\p{L} ]{2,30}?[,.]\s*(?=Exp(?:edient|te))/u

/** «Expedient: 717/2026/GEN,», «Expediente 2162/2026/GEN», «Expte 5356/2022/GEN», «Expedient 5543/2020:». */
const EXPEDIENTE =
  /^(?:expediente?|expte)\.?\s*:?\s*\d+\/\d{2,4}(?:\/[A-Z]+)?\s*(?:[,:.]\s*|[–—-]\s+)?/i

/** Un código suelto por delante: «5559/2025/GEN,», «10/2026/PGRU,», «27/2023PGRU». */
const CODIGO = /^\d+\/\d{4}\/?[A-Z]+\s*[,:]?\s*/

/** «Proposta d'acord d'aprovació…» → «aprovació…». */
const PROPUESTA_DE_ACUERDO_DE =
  /^(?:propuesta\s+de\s+acuerdo\s+de\s+|proposta\s+d['’]acord\s+d['’])/i

/** «Acord relatiu a l'», «Acuerdo relativo al», «Proposta d'acord relativa al». */
const ACUERDO_RELATIVO =
  /^(?:propuesta\s+de\s+acuerdo|proposta\s+d['’]acord|acuerdo|acord)\s+relati(?:vo|va|u)\s+(?:als?|a)\s+(?:(?:la|las|los|les|el)\s+|l['’])?/i

/**
 * La fórmula del informe: «Dar cuenta de las», «Dación cuenta al Pleno de la»,
 * «Dació de compte al Ple de la Corporació de l'», «Donar compte dels». Que el
 * punto es un informe ya lo dice su parte del orden del día. Admite el «de»
 * repetido de «Donar compte de de la Sentència 635/2023».
 */
const DACION =
  /^(?:dar\s+cuenta|daci[oó]n?\s+(?:de\s+)?(?:cuenta|compt[ae]s?)|donar\s+compt[ae]s?)(?:\s+(?:al?\s+)?(?:pleno|ple)\b(?:\s+de\s+la\s+corporaci[oó]n?)?)?\s*(?:(?:de\s+)?(?:de\s+(?:la|las|los|les|el)\s+|de\s+l['’]|dels?\s+))?/i

/** «(Ctto. 122/2026)», «(Expte. …)» al final. */
const CODIGO_FINAL = /\s*\((?:ctto|expte|exp)\.?\s*[^)]*\)\s*$/i

const SIGNOS_DELANTE = /^[\s,.:;–—-]+/

function letras(s: string): number {
  return (s.match(/\p{L}/gu) ?? []).length
}

/** Quita `re` si lo que queda todavía dice algo. */
function quita(texto: string, re: RegExp): string {
  const resto = texto.replace(re, '')
  return letras(resto) >= 3 ? resto : texto
}

export function etiquetaDelPunto(titulo: string): EtiquetaLlana {
  let texto = titulo.trim()

  const sinUrgencia = quita(texto, URGENCIA)
  const urgente = sinUrgencia !== texto || URGENCIA.test(texto)
  texto = sinUrgencia

  // El área y el expediente llegan en cualquier orden y a veces dos veces
  // («Assumptes d'urgència. INTERVENCIÓ, Expedient 295/2025/GEN, …»).
  for (let vuelta = 0; vuelta < 3; vuelta++) {
    const antes = texto
    for (const re of [AREA_EN_MAYUSCULAS, AREA_ANTES_DEL_EXPEDIENTE, EXPEDIENTE, CODIGO]) {
      texto = quita(texto, re)
    }
    texto = quita(texto, SIGNOS_DELANTE)
    if (texto === antes) break
  }

  for (const re of [PROPUESTA_DE_ACUERDO_DE, ACUERDO_RELATIVO, DACION]) {
    texto = quita(texto, re)
  }

  texto = quita(texto, CODIGO_FINAL)
    .replace(/\.\s*$/, '')
    .trim()
  // Un título entero entre comillas: «“Aprovació PAI EDIL…”».
  const comillas = texto.match(/^[“"«](.*)[”"»]$/)
  if (comillas && letras(comillas[1]) >= 3) texto = comillas[1].trim()

  // Sólo se pone mayúscula si se ha quitado algo por delante: un título que
  // llega entero se queda como lo escribió la secretaría.
  if (!titulo.trim().startsWith(texto) && texto) {
    texto = texto.charAt(0).toLocaleUpperCase('es') + texto.slice(1)
  }
  return { texto, urgente }
}
