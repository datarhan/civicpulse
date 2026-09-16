// @ts-check
/**
 * Lotes: qué parte de un expediente es una fila de `contracts`, y por qué su
 * importe no es el que enseña el enlace.
 *
 * Gobierto sirve la tabla `contratos` con UNA FILA POR LOTE. Las filas de un
 * mismo expediente comparten `id` —el parser las desempata con un sufijo
 * `#n`— y, lo que aquí importa, comparten `permalink`: el enlace es el
 * deeplink de PLACSP del expediente ENTERO. Esa ficha titula el presupuesto
 * base de todos los lotes juntos y esconde las adjudicaciones detrás de «Ver
 * detalle de la adjudicación», así que el número que el lector ve al otro lado
 * no es el que le enseñamos aquí.
 *
 * El caso que lo destapó, visto en la portada el 16-09-2026: «UE casco 5 ·
 * 6.900 €» y «UE vella 6 · 20.251 €», dos filas con el MISMO enlace, el del
 * expediente 106/2025 —«…unidad de ejecución Casco 5, Vella 6 y Pous 6,
 * dividido en varios lotes»—, cuya única cifra visible es 53.409,63 €. Las
 * tres cifras eran ciertas y ninguna decía de qué era.
 *
 * La agrupación va por PERMALINK, no por id base. Son cosas distintas: los
 * contratos derivados de un SDA comparten id base con su padre pero cada uno
 * tiene SU propia ficha de PLACSP, así que su enlace sí resuelve a su fila y
 * no son lotes. Lo que este módulo marca es exactamente la condición del
 * defecto —«el enlace no distingue esta fila de sus hermanas»—, no un parecido
 * de identificadores.
 */

/**
 * Agrupa contratos por la ficha de PLACSP a la que enlazan.
 * Una fila sin enlace es su propio grupo: nadie puede confundirla con otra.
 * @template {{id?: string|number, permalink?: string|null}} C
 * @param {C[]} contracts
 * @returns {Map<string, C[]>}
 */
export function agrupaPorExpediente(contracts) {
  const m = /** @type {Map<string, C[]>} */ (new Map())
  for (const c of contracts || []) {
    const key = c?.permalink || 'sin-enlace:' + String(c?.id ?? '')
    const cur = m.get(key)
    if (cur) cur.push(c)
    else m.set(key, [c])
  }
  return m
}

/**
 * ¿Esta fila comparte su enlace con otra? Es decir: ¿el enlace lleva a una
 * ficha que habla de más cosas que esta fila?
 *
 * `batchNumber` NO basta por sí solo: la fuente lo trae a 1 en cientos de
 * contratos de lote único, y marcar ésos como «lote 1» sería ruido en cada
 * ficha del sitio. El aviso existe para explicar por qué el enlace dice otra
 * cifra, y en un expediente de un solo lote eso no pasa.
 * @template {{id?: string|number, permalink?: string|null}} C
 * @param {C} c
 * @param {Map<string, C[]>} grupos
 * @returns {boolean}
 */
export function esLote(c, grupos) {
  const key = c?.permalink || 'sin-enlace:' + String(c?.id ?? '')
  return (grupos.get(key)?.length ?? 0) > 1
}

/**
 * Lo que hace falta para que el lector entienda la diferencia entre esta fila
 * y la ficha que abre: qué lote es, de cuántos, de qué expediente, y cuál es
 * el presupuesto base que va a leer allí.
 *
 * El total de lotes sale de `numberOfBatches` de la LICITACIÓN homónima, que
 * es la fuente declarándolo, no de cuántas filas tengamos nosotros: si algún
 * día faltara un lote en la instantánea, «lote 1 de 2» sería falso mientras
 * «lote 1 de 3» seguiría siendo cierto. Cuando no hay licitación que lo
 * declare, `total` queda a null y la etiqueta se queda en «lote N» — un
 * denominador que no se puede ver no se escribe.
 *
 * De la licitación se leen SÓLO campos estructurales (número de expediente,
 * número de lotes, presupuesto base). Nunca su `status` ni su adjudicatario:
 * divergen del contrato a propósito y `tests/tenders-colision-id.test.ts` fija
 * que el desenlace se lee siempre de `contracts`.
 *
 * @template {{id?: string|number, permalink?: string|null, batchNumber?: number}} C
 * @param {C} c
 * @param {Map<string, C[]>} grupos
 * @param {Array<{permalink?: string|null, documentNumber?: string|null, numberOfBatches?: number, initialAmountNoTaxes?: number}>} [tenders]
 * @returns {{numero: number|null, total: number|null, expediente: string|null, presupuestoBase: number|null}|null}
 */
export function infoLote(c, grupos, tenders) {
  if (!esLote(c, grupos)) return null
  const lic = c?.permalink ? buscaLicitacion(c.permalink, tenders) : null
  const total = lic?.numberOfBatches && lic.numberOfBatches > 1 ? lic.numberOfBatches : null
  return {
    numero: c?.batchNumber && c.batchNumber > 0 ? c.batchNumber : null,
    total,
    expediente: lic?.documentNumber || null,
    presupuestoBase:
      lic?.initialAmountNoTaxes && lic.initialAmountNoTaxes > 0 ? lic.initialAmountNoTaxes : null,
  }
}

/**
 * Índice permalink → licitación, memorizado por array para no recorrer las
 * ~430 licitaciones una vez por fila pintada.
 * @type {WeakMap<object, Map<string, any>>}
 */
const indices = new WeakMap()

/**
 * @param {string} permalink
 * @param {Array<{permalink?: string|null}>} [tenders]
 */
function buscaLicitacion(permalink, tenders) {
  if (!tenders) return null
  let idx = indices.get(tenders)
  if (!idx) {
    idx = new Map()
    // La primera gana: dos licitaciones con el mismo enlace serían el mismo
    // expediente, y sus campos estructurales coinciden.
    for (const t of tenders) if (t?.permalink && !idx.has(t.permalink)) idx.set(t.permalink, t)
    indices.set(tenders, idx)
  }
  return idx.get(permalink) ?? null
}
