/**
 * Quién firma una réplica a un informe del agente, dicho con un nombre.
 *
 * `response.from` es una clave: el nombre de un grupo municipal, `person` —la
 * persona de la que trata el informe— o `aludido` —una institución u otra
 * persona que el informe nombra, que firma con `fromName`—. La página y el
 * «alma» exportada la imprimían tal cual, y con `person` habrían publicado
 * «Réplica de person». `person` se escribe con el nombre del sujeto del
 * encargo, y `aludido` con el suyo; si no se conoce, con una descripción, nunca
 * con la clave. Un mantenedor comprueba el origen de cada réplica antes de
 * publicarla, así que nadie firma como otro sin serlo.
 *
 * Puro y sin dependencias: lo importan la página y el exportador del alma.
 */
export function quienReplica(
  response: { from: string; fromName?: string | null },
  nombreSujeto?: string | null,
): string {
  if (response.from === 'person') return nombreSujeto?.trim() || 'la persona del informe'
  if (response.from === 'aludido') {
    return response.fromName?.trim() || 'la persona o institución aludida'
  }
  return response.from
}
