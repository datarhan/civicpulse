/**
 * Las cifras del presupuesto municipal, cada una con su nombre — y la guarda
 * que impide llamar «gastado» a lo que no se ha gastado.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POR QUÉ EXISTE
 *
 * El 5-09-2026 la revisión lectora destapó la MISMA confusión en siete sitios:
 *
 *   /presupuesto      «En qué SE GASTA el dinero público» sobre el desglose del
 *                     presupuesto (y su hermano «Para qué se gasta»)
 *   /gestion          «da 41,58 M€ DE GASTO para 2025»
 *   /gestion          «cuánto se aleja el presupuesto EJECUTADO del que se
 *                     debatió», explicando un indicador de MODIFICACIONES
 *   /reportajes/…dana «cuyo GASTO LIQUIDADO en todo 2025 fue de 41,58 millones»
 *   portada           «GASTOS PERSONAL · 20,3 M€ · 49 %»
 *   review-surfaces   la ficha del propio revisor, llamando a esa cifra «el
 *                     presupuesto DEFINITIVO rendido al ministerio»
 *
 * Siete no son siete defectos: son uno. El ayuntamiento tiene CINCO magnitudes
 * distintas que la prosa llama «gasto» sin distinguir, y ninguna vivía nombrada
 * en un sitio común, así que cada página se inventaba sus palabras. Con los
 * números de 2025 delante, la diferencia no es matizable:
 *
 *   crédito inicial            37.599.838,15 €
 *   + modificaciones           24.523.314,93 €
 *   = crédito definitivo       62.123.153,08 €
 *   rendido a CONPREL          41.578.252,26 €   (no cuadra con ninguna de las tres)
 *   OBLIGACIONES RECONOCIDAS   18.909.465,12 €   ← lo único que se ha gastado
 *
 * Un lector que sume los capítulos del presupuesto y lea «se gasta» se equivoca
 * por 2,2 veces. Y ninguna de las guardas de datos podía verlo: los números
 * estaban bien, la palabra estaba mal.
 *
 * ESTE MÓDULO NO ADIVINA. Sólo mira si una palabra de EJECUCIÓN acompaña a una
 * cifra que no es de ejecución, sin un término de previsión que lo aclare. No
 * detecta la prosa suelta —el caso de /gestion no lleva cifra al lado y se le
 * escapa— y es a propósito: una guarda determinista que se estira hasta juzgar
 * redacción acaba dando falsos positivos, y un falso positivo aquí gasta la
 * atención que hace falta para los ciertos.
 */

export interface MagnitudFiscal {
  clave: string
  valor: number
  /** Cómo se llama esta cifra sin ambigüedad. */
  etiqueta: string
  /** ¿Es dinero EJECUTADO? Sólo de éstas es cierto decir «gastado». */
  esEjecucion: boolean
}

/**
 * Palabras que afirman que el dinero YA SE GASTÓ. Exportadas para que una prueba
 * mida el efecto sin recitar la lista.
 */
export const PALABRAS_DE_EJECUCION: readonly string[] = [
  'gastado',
  // «gasto» a secas y «gastó» son la misma ficha una vez quitado el acento, así
  // que se lista la forma que de verdad aparece en las páginas — si no, el aviso
  // nombraba «gastó» sobre una frase que dice «gasto» y costaba entenderlo.
  'gasto',
  'se gasta',
  'gasto liquidado',
  'gasto real',
  'gasto efectivo',
  'ejecutado',
  'ejecutó',
  'liquidado',
  'obligaciones reconocidas',
  'desembolsado',
  'pagado',
]

/**
 * Términos que dicen que la cifra es una PREVISIÓN. Su presencia desactiva el
 * aviso: «en qué prevé gastarse» nombra el gasto y a la vez dice que no ha
 * ocurrido, que es exactamente la redacción correcta.
 */
export const PALABRAS_DE_PREVISION: readonly string[] = [
  'presupuest', // presupuesto, presupuestado, presupuestario…
  'crédito',
  'credito',
  'prevé',
  'preve',
  'previsto',
  'prevista',
  'autorizado',
  'consignad',
  'aprobado',
]

/**
 * Por debajo de esto una magnitud no entra en la comprobación.
 *
 * Medido el 5-09-2026 sobre /reportajes/reconstruccion-dana: el capítulo 8
 * («Activos financieros», 25.000 €) casaba DENTRO de «125.000 euros», que en esa
 * frase es gasto DANA geolocalizado de verdad y no tiene nada que ver. Las
 * fronteras de dígito ya lo impiden, pero el fondo sigue: una cifra pequeña y
 * redonda comparte orden de magnitud con cualquier contrato, y lo que la prosa
 * confunde son los AGREGADOS. Vigilar los capítulos pequeños añade ruido sin
 * añadir un solo acierto.
 */
export const SUELO_MAGNITUD = 1_000_000

/**
 * Cuántos caracteres alrededor de la cifra se consideran «al lado».
 *
 * Estrecha a propósito. Con 140 la frase de /reportajes/reconstruccion-dana se
 * escapaba: «es el PRESUPUESTO entero del municipio, cuyo gasto liquidado…»
 * traía un término de previsión ochenta caracteres antes, en otra oración, y
 * desactivaba el aviso de la que sí estaba mal. Lo que hay que mirar es qué
 * palabra CALIFICA a la cifra, no qué palabras hay en el párrafo.
 */
export const VENTANA = 60

const norm = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ')

/**
 * Por PALABRA ENTERA, no por subcadena.
 *
 * Sin esto «gastó» —que sin acento es «gasto»— casaba dentro de «GASTOS», y
 * entonces cualquier «presupuesto de gastos» disparaba el aviso. Un presupuesto
 * DE GASTOS es la expresión correcta: «gastos» no afirma ejecución, y una guarda
 * que lo tratara así avisaría de casi todas las páginas de hacienda del sitio.
 */
function contienePalabra(texto: string, palabra: string): boolean {
  const p = norm(palabra).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(^|[^a-z0-9])${p}([^a-z0-9]|$)`).test(texto)
}

/**
 * Las formas en que una cifra puede aparecer escrita en la página.
 *
 * Deliberadamente restrictivas: la agrupada completa («41.578.252») y la
 * compacta en millones CON su marca («41,58 M€», «41,6M», «€41,6M»). Una
 * compacta suelta —«41,6»— aparecería por casualidad en cualquier porcentaje,
 * y esta guarda vale lo que valga su tasa de falsos positivos.
 */
export function formasDe(valor: number): string[] {
  const formas = new Set<string>()
  const entero = Math.round(valor)
  formas.add(entero.toLocaleString('es-ES'))
  formas.add(valor.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }))
  const millones = valor / 1e6
  for (const dec of [1, 2]) {
    const m = millones.toLocaleString('es-ES', {
      minimumFractionDigits: dec,
      maximumFractionDigits: dec,
    })
    formas.add(`${m} m€`)
    formas.add(`${m}m€`)
    formas.add(`€${m}m`)
    formas.add(`${m} millones`)
  }
  return [...formas].map(norm)
}

export interface AvisoMagnitud {
  clave: string
  /** La forma de la cifra que se encontró en el texto. */
  forma: string
  /** La palabra de ejecución que la acompaña. */
  palabra: string
  /** El fragmento, para que quien lo lea vea el problema sin abrir nada. */
  fragmento: string
}

/**
 * ¿Hay alguna cifra que NO es de ejecución acompañada de una palabra que dice
 * que sí lo es, sin nada que lo aclare?
 */
export function revisarMagnitudes(
  texto: string,
  magnitudes: readonly MagnitudFiscal[],
): AvisoMagnitud[] {
  const hay = norm(texto)
  const avisos: AvisoMagnitud[] = []
  const vistos = new Set<string>()
  for (const m of magnitudes) {
    if (m.esEjecucion) continue
    if (m.valor < SUELO_MAGNITUD) continue
    for (const forma of formasDe(m.valor)) {
      let i = hay.indexOf(forma)
      while (i !== -1) {
        // Con frontera de DÍGITO, y no por la misma razón estética que las
        // palabras: sin ella «25.000» casaba dentro de «125.000» y el aviso
        // señalaba una frase que no tenía nada que ver.
        const antes = i > 0 ? hay[i - 1] : ' '
        const despues = hay[i + forma.length] ?? ' '
        if (/[0-9.,]/.test(antes) || /[0-9]/.test(despues)) {
          i = hay.indexOf(forma, i + 1)
          continue
        }
        const ventana = hay.slice(Math.max(0, i - VENTANA), i + forma.length + VENTANA)
        // La previsión se busca por PREFIJO («presupuest» cubre presupuesto,
        // presupuestado, presupuestario), la ejecución por palabra entera.
        const prevision = PALABRAS_DE_PREVISION.some((p) => ventana.includes(norm(p)))
        if (!prevision) {
          const palabra = PALABRAS_DE_EJECUCION.find((p) => contienePalabra(ventana, p))
          if (palabra !== undefined) {
            const clave = `${m.clave}|${palabra}`
            if (!vistos.has(clave)) {
              vistos.add(clave)
              avisos.push({ clave: m.clave, forma, palabra, fragmento: ventana.trim() })
            }
          }
        }
        i = hay.indexOf(forma, i + 1)
      }
    }
  }
  return avisos
}

/**
 * Las magnitudes de un ejercicio, DERIVADAS de los dos snapshots. Nadie las
 * escribe a mano: una tabla de cifras dentro de un control contra cifras mal
 * rotuladas se quedaría rancia ella misma.
 */
export function magnitudesDe(
  budget: {
    snapshot?: {
      totalExpense?: number
      expenseByEconomicChapter?: { code?: string; label?: string; amount?: number }[]
    }
  } | null,
  ejecucion: {
    latest?: {
      gastos?: {
        total?: { inicial?: number; modificaciones?: number; actual?: number; ejecutado?: number }
      }
    }
  } | null,
): MagnitudFiscal[] {
  const out: MagnitudFiscal[] = []
  const g = ejecucion?.latest?.gastos?.total
  const push = (clave: string, valor: unknown, etiqueta: string, esEjecucion: boolean) => {
    if (typeof valor === 'number' && Number.isFinite(valor) && valor > 0)
      out.push({ clave, valor, etiqueta, esEjecucion })
  }
  push('credito-inicial', g?.inicial, 'crédito INICIAL de gasto', false)
  push('modificaciones', g?.modificaciones, 'modificaciones de crédito', false)
  push('credito-actual', g?.actual, 'crédito DEFINITIVO (inicial + modificaciones)', false)
  push('conprel', budget?.snapshot?.totalExpense, 'crédito de gastos rendido a CONPREL', false)
  push('reconocido', g?.ejecutado, 'obligaciones RECONOCIDAS (lo efectivamente gastado)', true)
  for (const c of budget?.snapshot?.expenseByEconomicChapter ?? []) {
    push(
      `capitulo-${c.code ?? c.label ?? '?'}`,
      c.amount,
      `crédito del capítulo ${c.label ?? c.code ?? '?'}`,
      false,
    )
  }
  return out
}
