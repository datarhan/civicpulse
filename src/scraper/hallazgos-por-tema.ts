/**
 * Los hallazgos de una sesión, agrupados por tema (auditoría de las dos
 * lecturas, §10).
 *
 * En /plenos/10yl550 se leían nueve títulos seguidos con casi repetidos —«Feria
 * de Comercio» y «Fira de Comercio», dos de movilidad, dos de vivienda— en dos
 * formatos de fecha. El título de un hallazgo es prosa firmada y nada
 * automático la reescribe (CLAUDE.md, regla 4): lo que cambia es el orden en
 * que se leen, con un rótulo de tema encima de cada grupo.
 *
 * - **El tema no es nuestro**: es el de las declaraciones que el hallazgo cita
 *   (`sourceClaimIds`), las mismas que /declaraciones pinta con ese tema. Se
 *   elige el más repetido; a igualdad, el de la que cita antes.
 * - **Sólo cuentan las declaraciones publicadas**, las del fragmento que sirve
 *   la página. Una que la puerta editorial retiene no está, y no puede decidir
 *   un rótulo que el lector no puede comprobar.
 * - **Sin ninguna, `null`**: el hallazgo va aparte, al final, y no se le pone
 *   un tema por eliminación.
 */
import type { ClaimTopic } from './pleno-claim'

export interface GrupoDeHallazgos<H> {
  tema: ClaimTopic | null
  hallazgos: H[]
}

/** El tema de un hallazgo según las declaraciones publicadas que cita, o null. */
export function temaDelHallazgo(
  hallazgo: { sourceClaimIds?: readonly string[] },
  temaDe: ReadonlyMap<string, string>,
): ClaimTopic | null {
  const veces = new Map<string, number>()
  for (const id of hallazgo.sourceClaimIds ?? []) {
    const tema = temaDe.get(id)
    if (tema) veces.set(tema, (veces.get(tema) ?? 0) + 1)
  }
  let mejor: string | null = null
  // Un Map recorre sus claves en el orden en que entraron: a igualdad, gana la
  // que el hallazgo citó antes.
  for (const [tema, n] of veces) if (mejor === null || n > veces.get(mejor)!) mejor = tema
  return mejor as ClaimTopic | null
}

/**
 * Cada hallazgo en un solo grupo. Los grupos van de más a menos hallazgos y, a
 * igualdad, por la posición de su primer hallazgo; el de los que no tienen tema,
 * al final. Dentro de un grupo, el orden de la lista recibida.
 */
export function hallazgosPorTema<H extends { sourceClaimIds?: readonly string[] }>(
  hallazgos: readonly H[],
  declaraciones: readonly { claim: { id: string; topic: string } }[],
): GrupoDeHallazgos<H>[] {
  const temaDe = new Map(declaraciones.map((d) => [d.claim.id, d.claim.topic]))
  const grupos = new Map<ClaimTopic | null, H[]>()
  for (const h of hallazgos) {
    const tema = temaDelHallazgo(h, temaDe)
    if (!grupos.has(tema)) grupos.set(tema, [])
    grupos.get(tema)!.push(h)
  }
  const orden = [...grupos.keys()]
  return orden
    .map((tema) => ({ tema, hallazgos: grupos.get(tema)! }))
    .sort((a, b) => {
      if ((a.tema === null) !== (b.tema === null)) return a.tema === null ? 1 : -1
      return (
        b.hallazgos.length - a.hallazgos.length || orden.indexOf(a.tema) - orden.indexOf(b.tema)
      )
    })
}
