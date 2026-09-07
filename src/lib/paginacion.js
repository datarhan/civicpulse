// @ts-check
/**
 * El reparto en páginas de un listado.
 *
 * Vive fuera de los componentes porque en /presupuesto paginan DOS listados —los
 * contratos y las obras— y la parte delicada no es cortar el array: es qué pasa
 * cuando el conjunto encoge debajo. Un refresco nocturno puede dejar menos filas
 * sin que nadie toque un filtro, y «página 7 de 2» es una lista vacía con toda
 * la pinta de un fallo de datos. Acotándolo aquí, los dos listados no pueden
 * discrepar sobre el mismo caso.
 *
 * La página se acota al CALCULAR, no sólo al pulsar un botón: quien llama puede
 * guardar en su estado una página que ya no existe, y esto la devuelve a la
 * última que sí.
 *
 * @param {number} total cuántos elementos hay en el conjunto entero
 * @param {number} paginaPedida la página que quiere quien llama, 1-indexada
 * @param {number} porPagina cuántos elementos caben en una página
 * @returns {{pagina: number, paginas: number, desde: number, hasta: number}}
 *   `pagina` ya acotada, y el corte `[desde, hasta)` para `Array.slice`.
 */
export function paginar(total, paginaPedida, porPagina) {
  const n = Math.max(0, Math.floor(total) || 0)
  const tam = Math.max(1, Math.floor(porPagina) || 1)
  // Un conjunto vacío tiene UNA página vacía, no cero: con cero, el rótulo
  // diría «página 1 de 0» y los botones no sabrían dónde están.
  const paginas = Math.max(1, Math.ceil(n / tam))
  const pagina = Math.min(Math.max(1, Math.floor(paginaPedida) || 1), paginas)
  const desde = (pagina - 1) * tam
  return { pagina, paginas, desde, hasta: Math.min(desde + tam, n) }
}
