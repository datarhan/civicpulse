/**
 * Quién firma una réplica a un informe del agente, dicho con un nombre.
 *
 * `response.from` es una clave: el nombre de un grupo municipal o `person`, la
 * persona de la que trata el informe. La página y el «alma» exportada la
 * imprimían tal cual, y con `person` habrían publicado «Réplica de person».
 * `person` se escribe con el nombre del sujeto del encargo; si no se conoce, con
 * una descripción, nunca con la clave. Un mantenedor comprueba el origen de cada
 * réplica antes de publicarla, así que nadie firma como la persona del informe
 * sin serlo.
 *
 * Puro y sin dependencias: lo importan la página y el exportador del alma.
 */
export function quienReplica(from: string, nombreSujeto?: string | null): string {
  if (from !== 'person') return from
  const nombre = nombreSujeto?.trim()
  return nombre ? nombre : 'la persona del informe'
}
