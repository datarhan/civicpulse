// @ts-check
/**
 * Qué fila de la trayectoria política es un CARGO, cuál es el cargo actual y
 * desde cuándo se ocupa sin interrupción.
 *
 * El chip «EN EL CARGO desde …» tomaba el año más bajo de toda la trayectoria,
 * candidaturas incluidas: una candidata sin escaño en 2019 salía «desde 2019»
 * (entró en 2023) y el alcalde «desde 2010» por un acta suelta de concejal,
 * cuando lo es sin interrupción desde 2015. Tres sitios (chip, subtítulo,
 * ficha lateral) derivaban el dato cada uno a su manera; ahora los tres leen
 * de aquí.
 *
 * Reglas:
 * - Cargo = el rol nombra un cargo municipal y NO es candidatura, personal
 *   eventual ni asesoría, y el órgano es el ayuntamiento. Una asesoría en la
 *   Diputació es trayectoria, no el cargo que la página describe.
 * - Cargo actual = la fila de cargo ABIERTA (endYear null) de inicio más
 *   reciente. Sin fila abierta, no hay cargo actual: nunca se cae a la primera
 *   fila histórica, porque un centinela no es un valor.
 * - «Desde» = el inicio de la cadena de cargos que desemboca en el actual sin
 *   hueco: un mandato que termina el año en que empieza el siguiente continúa
 *   la cadena (relevo 2019→2023); uno que termina antes, no.
 */

const CARGO_RE = /\b(alcald|concejal|regidor|teniente de alcalde|portavoz)/i
const NO_CARGO_RE = /candidat|sin (obtener )?escaño|personal eventual|asesor|assessor/i
const AYUNTAMIENTO_RE = /ayuntamiento|ajuntament/i

/**
 * @typedef {{ role: string, org: string, startYear?: number | null, endYear?: number | null }} CareerItem
 */

/**
 * @param {CareerItem[] | null | undefined} items
 * @returns {CareerItem[]}
 */
export function officeItems(items) {
  return (items ?? []).filter(
    (i) =>
      i != null &&
      typeof i.role === 'string' &&
      CARGO_RE.test(i.role) &&
      !NO_CARGO_RE.test(i.role) &&
      AYUNTAMIENTO_RE.test(String(i.org ?? '')) &&
      Number.isFinite(i.startYear),
  )
}

/**
 * @param {CareerItem[] | null | undefined} items
 * @returns {CareerItem | null}
 */
export function currentOffice(items) {
  const open = officeItems(items).filter((i) => i.endYear == null)
  if (open.length === 0) return null
  return open.reduce((best, i) =>
    /** @type {number} */ (i.startYear) > /** @type {number} */ (best.startYear) ? i : best,
  )
}

/**
 * @param {CareerItem[] | null | undefined} items
 * @returns {number | null}
 */
export function officeSince(items) {
  const current = currentOffice(items)
  if (!current) return null
  let since = /** @type {number} */ (current.startYear)
  const closed = officeItems(items)
    .filter((i) => i !== current && i.endYear != null)
    .sort((a, b) => /** @type {number} */ (b.startYear) - /** @type {number} */ (a.startYear))
  for (const i of closed) {
    if (/** @type {number} */ (i.endYear) >= since) {
      since = Math.min(since, /** @type {number} */ (i.startYear))
    }
  }
  return since
}

/**
 * La fila de cargo más reciente, abierta o cerrada — para el subtítulo de un
 * ex cargo, que sigue teniendo un último mandato aunque ya no tenga uno actual.
 *
 * @param {CareerItem[] | null | undefined} items
 * @returns {CareerItem | null}
 */
export function latestOffice(items) {
  const current = currentOffice(items)
  if (current) return current
  const closed = officeItems(items)
  if (closed.length === 0) return null
  return closed.reduce((best, i) => {
    const bs = /** @type {number} */ (best.startYear)
    const is = /** @type {number} */ (i.startYear)
    if (is !== bs) return is > bs ? i : best
    return (i.endYear ?? 0) > (best.endYear ?? 0) ? i : best
  })
}
