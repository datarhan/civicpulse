// @ts-check
/**
 * Las declaraciones «cotejadas» y su desglose por veredicto.
 *
 * Cotejadas son las que se pudieron comparar con un documento municipal, saliera
 * a favor o en contra: verificadas + parciales + contradichas. Se llamaron «con
 * evidencia», que se leía «respaldada», y luego «contrastadas», que se lee
 * «comprobada»: la revisión lectora del 06-10-2026 leyó «8 contrastadas» en
 * /departamentos/medio-ambiente y las ocho eran parciales. Por eso, donde se da la
 * cifra, va detrás cuántas son de cada veredicto —«5 cotejadas (1 verificada, 4
 * parciales)»—, contado del dato y nunca escrito a mano.
 *
 * Un solo conjunto para todas las superficies (/plenos/:id, /departamentos,
 * /cargos/:slug, /declaraciones), que es también la definición de /metodologia.
 * `promesa-repetida` no entra: la compara /promesas, no un documento municipal.
 */
import { rellena } from './formatters'

/** Los veredictos que cuentan como cotejados, en el orden del desglose. */
export const VEREDICTOS_COTEJADOS = /** @type {const} */ (['verificado', 'parcial', 'contradicho'])

/**
 * Cuenta las cotejadas de una lista de declaraciones verificadas.
 *
 * @param {Array<{verification?: {verdict?: string}}>} items
 * @returns {{verificado: number, parcial: number, contradicho: number, total: number}}
 */
export function cuentaCotejadas(items) {
  const cuenta = { verificado: 0, parcial: 0, contradicho: 0, total: 0 }
  for (const it of items ?? []) {
    const v = it?.verification?.verdict
    if (v === 'verificado' || v === 'parcial' || v === 'contradicho') {
      cuenta[v] += 1
      cuenta.total += 1
    }
  }
  return cuenta
}

/**
 * Cada pieza del desglose, con sus claves escritas enteras: tests/i18n-catalogue
 * busca la clave literal para comprobar que alguien sustituye su `{n}`.
 *
 * @type {Record<(typeof VEREDICTOS_COTEJADOS)[number], (t: (clave: string) => string, n: number) => string>}
 */
const PIEZA = {
  verificado: (t, n) =>
    rellena(t(n === 1 ? 'cotejo.verificado.uno' : 'cotejo.verificado.varios'), { n }),
  parcial: (t, n) => rellena(t(n === 1 ? 'cotejo.parcial.uno' : 'cotejo.parcial.varios'), { n }),
  contradicho: (t, n) =>
    rellena(t(n === 1 ? 'cotejo.contradicho.uno' : 'cotejo.contradicho.varios'), { n }),
}

/**
 * «1 verificada, 4 parciales»: sólo las piezas que no son cero, o '' si no hay
 * ninguna. Lee los mismos campos que `cuentaCotejadas` y que el cubo de
 * declaraciones de `department-stats.js`.
 *
 * @param {(clave: string) => string} t
 * @param {{verificado?: number, parcial?: number, contradicho?: number}} cuenta
 * @returns {string}
 */
export function desgloseCotejadas(t, cuenta) {
  return VEREDICTOS_COTEJADOS.filter((v) => (cuenta?.[v] ?? 0) > 0)
    .map((v) => PIEZA[v](t, /** @type {number} */ (cuenta[v])))
    .join(', ')
}

/**
 * El desglose entre paréntesis y con su espacio delante —« (2 parciales)»—, o ''
 * cuando no hay cotejadas: un cero no lleva desglose.
 *
 * @param {(clave: string) => string} t
 * @param {{verificado?: number, parcial?: number, contradicho?: number}} cuenta
 */
export function entreParentesis(t, cuenta) {
  const d = desgloseCotejadas(t, cuenta)
  return d ? ` (${d})` : ''
}
