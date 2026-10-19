/**
 * Qué documento NOMBRA una declaración de pleno.
 *
 * Propiedad léxica, nunca un pronóstico. Esto no dice si la frase se puede
 * comprobar, ni si el documento existe, ni si el Ayuntamiento lo tiene: dice
 * qué documento menciona el hablante. Es la misma distinción que
 * `classifyClaimShape` sostiene en la cola de apoyo, y es lo único que hace
 * defendible clasificar miles de filas sin que un modelo adivine nada.
 *
 * Para qué sirve: agrupadas por el tipo de documento que nombran, las filas a
 * las que no se les lanzó ningún comparador son el material de una solicitud de
 * acceso. Pero nombrar un tipo de documento no es depender de él, y la página lo
 * dice así: «declaraciones que nombran ese tipo de documento», no «que
 * dependen». Leídas una a una el 19-10-2026, de 14 «actas» sólo 2 o 3 remitían a
 * un acta que no tengamos; de 53 «informes», una veintena eran de otro órgano.
 *
 * Por eso hay dos lecturas:
 *
 *   · `claseDocumentalDe` — la léxica, sin más: qué tipo de documento nombra;
 *   · `clasesQueCuentan` — la que cuenta la página y la carta: aparta lo que
 *     no se le puede pedir a este Ayuntamiento porque ya lo publicamos (el
 *     acta de una sesión que está en pleno-actas.json), porque no es suyo (un
 *     informe, plan o expediente cuyo autor la frase nombra: el Consell
 *     Jurídic Consultiu, la Confederación Hidrográfica, un ministerio…) o
 *     porque no es un acta de pleno (la de una reunión).
 *
 * LA REGLA QUE MÁS IMPORTA: una frase que no nombra ningún documento se cuenta
 * APARTE y no se reparte entre las clases. Repartirla haría que cualquier clase
 * pareciera mayor de lo que es — que es exactamente cómo se justifica una
 * petición que el material no sostiene. Lo mismo lo apartado: tiene su propio
 * contador, para que no desaparezca ni se cuele en otra casilla.
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
 * `contrato` y `presupuesto` se nombran mucho, pero de las dos ya tenemos
 * corpus: ahí el hueco es de emparejamiento, no de publicación, y pedir lo que
 * ya está publicado sería ruido que además debilita las otras cuatro.
 * `convenio` y `ordenanza` se quedan fuera por lo mismo: la ordenanza se
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

/** Un mes, para reconocer una sesión fechada. */
const MES =
  '(enero|febrero|marzo|abril|mayo|junio|julio|agosto|sept?iembre|octubre|noviembre|diciembre)'

/**
 * Una sesión plenaria CON FECHA: «en el pleno celebrado el 3 de junio», «en el
 * Pleno de febrero», «el pleno celebrado el día 12». Ésa sí depende de su acta.
 *
 * Casaba «en el pleno» y «pleno celebrado» sueltos, que en una sesión plenaria
 * son habla corriente: el 19-10-2026, 7 de las 16 declaraciones que la tabla de
 * solicitudes contaba como dependientes de un acta casaban sólo por eso, y dos
 * hablaban del tiempo de palabra («cada hora invertida en el pleno»). Un «como
 * dije en el pleno» no nombra ningún documento; una fecha, sí: la del acta.
 */
const SESION_FECHADA = new RegExp(
  `\\b(en el pleno|pleno celebrado)( (ordinario|extraordinario))?( celebrado)?` +
    `( (el|del?))?( d[íi]a)? (\\d|${MES}\\b)`,
  'i',
)

/**
 * Los patrones, exportados para que una prueba pueda recorrerlos.
 *
 * Deliberadamente estrechos: prefieren no reconocer a reconocer de más. Una
 * clase inflada pide un documento que su material no justifica, y ese error se
 * paga delante de una administración.
 */
export const PATRONES: Record<ClaseDocumental, RegExp> = {
  acta: new RegExp(
    `\\b(actas?|acuerdos? plenarios?|acuerdo del pleno)\\b|${SESION_FECHADA.source}`,
    'i',
  ),
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

// ─── Lo que no se le puede pedir a este Ayuntamiento ────────────────────────

/**
 * Marcadores de que el documento es de ESTE Ayuntamiento.
 *
 * No se usan para exigir señal municipal —eso rechaza de más: en un pleno lo
 * municipal es el caso por defecto—. Se usan sólo para NO excluir por error
 * algo que sí lo es, en `deAmbitoAjeno`. Vivían en la carta
 * (scripts/lib/solicitud-borrador.ts), que sigue reexportándolos.
 */
const MUNICIPAL =
  /\b(pleno|plenari|ayuntamiento|ajuntament|ayto|municipi|municipal|concejal|regidor|secretar[ií]a|vicesecretar|intervenci[oó]n|mesa de contrataci|junta de gobierno|alcald|este consistorio)/i

/**
 * Ámbito claramente AJENO: otra administración como sujeto, o historia general.
 * Excluía de la carta «el plan de estabilización económica del Opus Dei» de
 * 1959, que la página seguía contando.
 */
const AJENO =
  /\b(opus dei|falangist|aut[áa]rquic|franquis|d[ée]cada|siglo [xiv]+|gobierno de espa[ñn]a|uni[óo]n europea|directiva europea|salario m[íi]nimo|otros ayuntamientos|otras administraciones|estado espa[ñn]ol)\b/i

/** Conjunción a propósito: sólo cae lo que nombra otro ámbito Y no nombra el nuestro. */
export function deAmbitoAjeno(verbatim: string): boolean {
  return AJENO.test(verbatim) && !MUNICIPAL.test(verbatim)
}

/**
 * Un ÓRGANO que no es este Ayuntamiento, nombrado como autor.
 *
 * Aquí no hay veto municipal, y es a propósito: «el dictamen emés pel Consell
 * Jurídic Consultiu … procedeix que el Ple de l'Ajuntament acorde…» nombra el
 * pleno, y el dictamen sigue siendo del Consell. Si la frase nombra al autor, el
 * documento es suyo y se le pide a él. Cuando nombra los dos («los informes del
 * Servicio de Urbanismo y de Consellería») se aparta igual: se cuenta de menos,
 * que es la dirección segura delante de una administración.
 *
 * El periodo medio de pago no es un órgano, pero es lo mismo para esta columna:
 * el informe lo publica Hacienda, y este sitio lo enseña en /gestion.
 */
const ORGANO_AJENO = new RegExp(
  [
    'consell jur[íi]dic consultiu',
    'consejo jur[íi]dico consultivo',
    'confederaci[óo] hidrogr[àá]fica',
    'chj',
    'ministeri[o]?',
    'conseller[ií]a',
    'serveis? territorials?',
    'servicios? territoriales?',
    'comissi[óo] territorial',
    'comisi[óo]n territorial',
    'diputaci[óo]n?',
    'generalitat',
    'renfe',
    'uni[óo]n? europea',
    'plan de recuperaci[óo]n',
    'prtr',
    'casa 47',
    'sindicatura de comptes',
    'tribunal de cuentas',
    'periodo medio de pago',
    'per[íi]ode mitj[àa] de pagament',
    'morosidad',
  ]
    .map((p) => `(?:^|[^\\p{L}\\p{N}])${p}(?![\\p{L}\\p{N}])`)
    .join('|'),
  'iu',
)

/** ¿Nombra la frase a otro órgano como autor, o un informe que ya publica otro? */
/**
 * Otro ayuntamiento, por su nombre: «los informes técnicos del Ayuntamiento de
 * Mislata». Aparte y sin `i`, porque lo que lo distingue es la MAYÚSCULA del
 * nombre: «l'informe dels serveis tècnics de l'Ajuntament de data 26
 * d'octubre» es de éste, y con mayúsculas y minúsculas indistintas casaba.
 */
const OTRO_AYUNTAMIENTO =
  /(?:^|[^\p{L}\p{N}])(?:[Aa]yuntamiento|[Aa]juntament) de (?![Rr][ií][bv]a)\p{Lu}/u

export function nombraOrganoAjeno(verbatim: string): boolean {
  return ORGANO_AJENO.test(verbatim) || OTRO_AYUNTAMIENTO.test(verbatim)
}

/**
 * Un acta DE PLENO: «acuerdo plenario», «acuerdo del pleno», «acta del pleno /
 * de la sesión» o una sesión fechada. «Un acta pormenorizada de dicha reunión»
 * nombra un acta, pero no la de un pleno, y no está en el archivo que se pide.
 */
const ACTA_DE_PLENO = new RegExp(
  `\\b(acuerdos? plenarios?|acuerdo del pleno|actas? (del pleno|de la sesi[óo]n|plenarias?))\\b|${SESION_FECHADA.source}`,
  'i',
)

// ─── La sesión de la que se habla ───────────────────────────────────────────

const MESES: Record<string, number> = {
  enero: 1,
  gener: 1,
  febrero: 2,
  febrer: 2,
  marzo: 3,
  març: 3,
  marc: 3,
  abril: 4,
  mayo: 5,
  maig: 5,
  junio: 6,
  juny: 6,
  julio: 7,
  juliol: 7,
  agosto: 8,
  agost: 8,
  septiembre: 9,
  setiembre: 9,
  setembre: 9,
  octubre: 10,
  noviembre: 11,
  novembre: 11,
  diciembre: 12,
  desembre: 12,
}

// Sin lookbehind: el módulo lo carga también el navegador, y Safari anterior
// a la 16.4 no lo entiende. Un carácter consumido delante no estorba.
const B = '(?:^|[^\\p{L}\\p{N}])'
const E = '(?![\\p{L}\\p{N}])'
/** «3 de junio de 2024», «febrero del 21», «9 de febrero», «julio del 24», «12 de març de 2021». */
const FECHA = new RegExp(
  `${B}(?:(\\d{1,2}) d(?:e |')\\s?)?(${Object.keys(MESES).join('|')})${E}` +
    `(?: (?:de |del |d')(\\d{4})${E}| del (\\d{2})${E})?`,
  'giu',
)
const ANYO = new RegExp(`${B}(19\\d{2}|20\\d{2})${E}`, 'gu')

/**
 * Una sesión mencionada, con la precisión que da la frase: el día, el mes o el
 * año. Nunca se completa lo que la frase no dice, salvo el año de un día o un
 * mes sin él: es el último que ya había pasado cuando se dijo.
 */
export type SesionMencionada = { dia: string } | { mes: string } | { anyo: string }

const dos = (n: number) => String(n).padStart(2, '0')

/**
 * Las sesiones que la frase fecha, sin las posteriores a la sesión en que se
 * dijo —«habrán de celebrarse durante el año 2025» no es un pleno pasado—.
 * Vacío si no fecha ninguna.
 */
export function sesionesMencionadas(verbatim: string, plenoDate: string): SesionMencionada[] {
  const hoy = plenoDate.slice(0, 10)
  const anyoHoy = Number(hoy.slice(0, 4))
  const out: SesionMencionada[] = []
  let conMes = false
  for (const m of verbatim.matchAll(FECHA)) {
    conMes = true
    const dia = m[1] ? Number(m[1]) : null
    const mes = MESES[m[2].toLowerCase()]
    let anyo = m[3] ? Number(m[3]) : m[4] ? 2000 + Number(m[4]) : null
    if (anyo === null) {
      // Sin año: el último que ya había pasado cuando se dijo.
      const ese = `${anyoHoy}-${dos(mes)}-${dos(dia ?? 1)}`
      anyo = ese <= hoy ? anyoHoy : anyoHoy - 1
    }
    if (dia !== null) {
      const iso = `${anyo}-${dos(mes)}-${dos(dia)}`
      if (iso <= hoy) out.push({ dia: iso })
    } else {
      const ym = `${anyo}-${dos(mes)}`
      if (ym <= hoy.slice(0, 7)) out.push({ mes: ym })
    }
  }
  if (conMes) return out
  for (const m of verbatim.matchAll(ANYO)) {
    if (Number(m[1]) <= anyoHoy) out.push({ anyo: m[1] })
  }
  return out
}

/**
 * ¿Ya publicamos el acta de la sesión de la que habla? Si la frase no fecha
 * ninguna, habla de la sesión en que se dice. Si fecha varias, tienen que estar
 * todas: basta una sin acta para que dependa de algo que no tenemos.
 *
 * Un mes o un año valen como publicados si hay alguna acta de ese mes o ese
 * año: la frase no dice cuál, y dar por pendiente lo que puede estar publicado
 * contaría de más, que es la dirección que se paga delante de una
 * administración.
 */
export function actaYaPublicada(
  verbatim: string,
  plenoDate: string,
  sesionesConActa: ReadonlySet<string>,
): boolean {
  const menciones = sesionesMencionadas(verbatim, plenoDate)
  const objetivo: SesionMencionada[] =
    menciones.length > 0 ? menciones : [{ dia: plenoDate.slice(0, 10) }]
  const fechas = [...sesionesConActa]
  return objetivo.every((s) =>
    'dia' in s
      ? sesionesConActa.has(s.dia)
      : 'mes' in s
        ? fechas.some((f) => f.startsWith(`${s.mes}-`))
        : fechas.some((f) => f.startsWith(`${s.anyo}-`)),
  )
}

// ─── Lo que cuenta la página ────────────────────────────────────────────────

/** Una fila publicada: el literal y la sesión en que se dijo. */
export interface FilaDocumental {
  verbatim?: string | null
  plenoDate?: string | null
}

/**
 * Lo que hace falta además del literal. `sesionesConActa` son las fechas de
 * public/data/pleno-actas.json; `null` si no se pudo leer, y entonces no se
 * aparta ninguna acta por publicada: no poder leer el registro no es saber que
 * están todas.
 */
export interface ContextoDocumental {
  sesionesConActa: ReadonlySet<string> | null
}

/**
 * Las clases que una fila NOMBRA y que cuentan: la lectura léxica, menos lo que
 * no se le puede pedir a este Ayuntamiento. Vacío si no queda ninguna.
 */
export function clasesQueCuentan(fila: FilaDocumental, ctx: ContextoDocumental): ClaseDocumental[] {
  const t = (fila.verbatim ?? '').trim()
  const plenoDate = fila.plenoDate ?? ''
  const ajeno = deAmbitoAjeno(t) || nombraOrganoAjeno(t)
  return claseDocumentalDe(t).filter((c) => {
    if (c === 'acta') {
      if (!ACTA_DE_PLENO.test(t)) return false
      if (ctx.sesionesConActa && plenoDate && actaYaPublicada(t, plenoDate, ctx.sesionesConActa))
        return false
      return true
    }
    if (c === 'informe-tecnico' || c === 'plan-interno' || c === 'expediente') return !ajeno
    return true
  })
}

export interface AgrupacionDocumental {
  porClase: Partial<Record<ClaseDocumental, number>>
  /** Las que no nombran ningún documento. NO se reparten. */
  sinDocumento: number
  /**
   * Las que nombran alguno, pero todo lo que nombran se apartó: un acta que ya
   * publicamos, un informe de otro órgano. Tampoco se reparten.
   */
  apartadas: number
  total: number
}

/**
 * Agrupa por clase nombrada, contando aparte las que no nombran ninguna y las
 * que sólo nombran algo apartado.
 *
 * Una frase que nombra dos clases suma en las dos: la pregunta es «¿cuántas
 * declaraciones nombran este tipo de documento?», y nombra los dos.
 */
export function agruparPorClaseDocumental(
  filas: ReadonlyArray<FilaDocumental>,
  ctx: ContextoDocumental,
): AgrupacionDocumental {
  const porClase: Partial<Record<ClaseDocumental, number>> = {}
  let sinDocumento = 0
  let apartadas = 0
  for (const f of filas) {
    if (claseDocumentalDe(f.verbatim).length === 0) {
      sinDocumento += 1
      continue
    }
    const clases = clasesQueCuentan(f, ctx)
    if (clases.length === 0) {
      apartadas += 1
      continue
    }
    for (const c of clases) porClase[c] = (porClase[c] ?? 0) + 1
  }
  return { porClase, sinDocumento, apartadas, total: filas.length }
}
