/**
 * Los enlaces viejos de la contratación.
 *
 * Hasta el 1-11-2026 los contratos, las obras, los anuncios del TED y las
 * subvenciones vivían en /presupuesto, debajo de la deuda. Ya no están ahí, pero
 * los enlaces siguen circulando: un vecino puede tener guardado el de su barrio
 * (`?barrio=<slug>`, que se comparte a propósito) y `/presupuesto#menores` estaba
 * en la propia página. Aterrizar en /presupuesto sin la sección pedida sería un
 * enlace roto que no lo parece, así que se reenvían con su ancla y su barrio.
 */

/** Las anclas que se fueron con la contratación. */
export const ANCLAS_DE_CONTRATOS = [
  '#menores',
  '#obras',
  '#ted',
  '#subvenciones',
  '#mapa-gasto',
  '#mapa-gasto-barrio',
] as const

/**
 * Adónde lleva ahora un enlace a /presupuesto, o `null` si lo que pide sigue ahí.
 *
 * `barrio` basta por sí solo: la zona se abre en el mapa, y el mapa ya no está.
 */
export function destinoEnContratos(search: string, hash: string): string | null {
  const conBarrio = new URLSearchParams(search).has('barrio')
  const conAncla = (ANCLAS_DE_CONTRATOS as readonly string[]).includes(hash)
  return conBarrio || conAncla ? `/contratos${search}${hash}` : null
}
