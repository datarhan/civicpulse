/**
 * La unidad de un recuento extraído por el modelo, juzgada antes de publicarse.
 *
 * `entities.count` + `entities.countUnit` son «500 viviendas» → 500 +
 * «viviendas». La unidad es texto libre y el esquema sólo le exige 1-60
 * caracteres, así que pasa cualquier cosa que sea una cadena JSON válida. Dos
 * defectos lo hicieron y llegaron a /plenos/10yl550 (hallazgo del 2026-10-12):
 *
 *   · `fragmento-json` — gpt-4o-mini, con salida estructurada, escribió como
 *     VALOR la cadena «euros},» (y «millones de euros},», «comercios},»). No
 *     es un análisis indulgente que se coma una llave: la cadena es JSON
 *     correcto y el trozo va dentro. ClaimLedger pinta `{count} {countUnit}`
 *     tal cual y el lector leía «4 millones de euros},».
 *   · `moneda` — el dinero tiene su campo, `amountEuros`. Lo que el modelo deja
 *     en `count` junto a «euros» es un trozo de la cifra, no un recuento: «30»
 *     de 30.000 €, «1» de «un millón y pico», «4» de 8,4 M€. Publicado, «30
 *     euros» es una cifra falsa con una cita verbatim al lado.
 *
 * En los dos casos se descartan el número Y la unidad, y nada más. No se limpia
 * «euros},» a «euros» ni se pasa `count` a `amountEuros`: lo primero publicaría
 * «30 euros» por 30.000 y lo segundo inventaría la magnitud (¿4 o 4 millones?).
 * Un centinela nunca es un valor (DATA_INTEGRITY, regla 3): ante la duda, nada.
 *
 * Las tasas monetarias («euros por habitante», «euros al mes», «euros/día») sí
 * son una unidad — de un cociente, no de un importe — y se quedan. Que su
 * número cuadre con `amountEuros` es otra pregunta, que esto no contesta.
 */
import { stripDiacritics } from './normalize'

export type MotivoDeDescarte = 'fragmento-json' | 'moneda'

/** Los motivos, exportados para que un recuento por motivo no los repita a mano. */
export const MOTIVOS_DE_DESCARTE: readonly MotivoDeDescarte[] = ['fragmento-json', 'moneda']

export interface RecuentoSaneado {
  count?: number
  countUnit?: string
  /** Por qué se descartó el par, o `null` si se conservó tal cual. */
  descarte: MotivoDeDescarte | null
}

/** Llaves, corchetes, comillas o barra invertida: sintaxis JSON, no lenguaje. */
const SINTAXIS_JSON = /[{}[\]"\\]/

/**
 * Una moneda sola, con su multiplicador o sin él: «euros», «€», «millones de
 * euros», «mil», «milions d'euros». Sin denominador: «euros por habitante» no
 * casa, porque el `$` exige que la unidad acabe en la moneda.
 */
const MONEDA =
  /^(?:(?:mil|miles|milers|millon|millones|milio|milions)(?:\s+de\s+|\s+d['’]\s*|\s+)?)?(?:euros?|€|eur)$|^(?:mil|miles|milers|millon|millones|milio|milions)$/

function esMoneda(unidad: string): boolean {
  const plana = stripDiacritics(unidad).toLowerCase().replace(/\s+/g, ' ').trim()
  return MONEDA.test(plana)
}

export function sanearRecuento(e: {
  count?: number | null
  countUnit?: string | null
}): RecuentoSaneado {
  const unidad = e.countUnit?.trim() ? e.countUnit : null
  const conservado: RecuentoSaneado = {
    ...(e.count != null ? { count: e.count } : {}),
    ...(unidad ? { countUnit: unidad } : {}),
    descarte: null,
  }
  if (!unidad) return conservado
  if (SINTAXIS_JSON.test(unidad)) return { descarte: 'fragmento-json' }
  if (esMoneda(unidad)) return { descarte: 'moneda' }
  return conservado
}

export interface FilaSaneada {
  id: string
  plenoId: string
  motivo: MotivoDeDescarte
  count: number | null
  countUnit: string
}

/**
 * Lo mismo sobre filas ya escritas (`pleno-claims-suggestions.json`): devuelve
 * filas nuevas, sin tocar las de entrada, y la lista de lo que quitó. Sólo
 * cambia `entities.count` y `entities.countUnit` de las filas descartadas; la
 * CLI lo comprueba contra el original antes de escribir.
 */
export function sanearFilas<
  T extends {
    id: string
    plenoId: string
    entities: { count?: number | null; countUnit?: string | null }
  },
>(filas: readonly T[]): { filas: T[]; descartadas: FilaSaneada[] } {
  const descartadas: FilaSaneada[] = []
  const nuevas = filas.map((f) => {
    const r = sanearRecuento(f.entities)
    if (!r.descarte) return f
    descartadas.push({
      id: f.id,
      plenoId: f.plenoId,
      motivo: r.descarte,
      count: f.entities.count ?? null,
      countUnit: f.entities.countUnit ?? '',
    })
    const { count: _c, countUnit: _u, ...resto } = f.entities
    return { ...f, entities: resto }
  })
  return { filas: nuevas, descartadas }
}
