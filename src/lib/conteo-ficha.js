// @ts-check

/**
 * A count the councillor's ficha (/cargos/:slug) may print, from a snapshot
 * hook's `{loading, error, data}`.
 *
 * The ficha counted over `data ?? []`, so while plenos-agendas.json or
 * promises.json loaded — or if either failed — it printed «Puntos en pleno 0»
 * and «Sin promesas documentadas para este grupo» beside a named person. A zero
 * that means «not known yet» is a sentinel published as a value (DATA_INTEGRITY
 * rule 3), so the three outcomes stay three:
 *
 *   - `cargando`       — the snapshot has not arrived;
 *   - `no-disponible`  — it failed, or arrived in a shape `contar` cannot read;
 *   - `listo`          — read, with its count `n` (a zero here is a real zero).
 *
 * `ceroCierto` is for a zero known before reading anything: someone with no
 * delegated área has no agenda items in their áreas, and waiting for the file
 * would only delay a true statement.
 *
 * @template T
 * @param {{loading?: boolean, error?: unknown, data?: T}|undefined} res
 * @param {(data: T) => number} contar
 * @param {{ceroCierto?: boolean}} [opts]
 * @returns {{estado: 'cargando'|'no-disponible'} | {estado: 'listo', n: number}}
 */
export function conteoFicha(res, contar, { ceroCierto = false } = {}) {
  if (ceroCierto) return { estado: 'listo', n: 0 }
  if (!res) return { estado: 'cargando' }
  if (res.error) return { estado: 'no-disponible' }
  if (res.data == null)
    return res.loading === false ? { estado: 'no-disponible' } : { estado: 'cargando' }
  let n
  try {
    n = contar(res.data)
  } catch {
    return { estado: 'no-disponible' }
  }
  return Number.isFinite(n) ? { estado: 'listo', n } : { estado: 'no-disponible' }
}
