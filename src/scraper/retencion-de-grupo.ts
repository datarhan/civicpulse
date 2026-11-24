/**
 * Which group from the speaker map an automatic pass must NOT write.
 *
 * A group with a single seat names its councillor by elimination, so writing
 * it names a person: tier C, which no unattended pass crosses however well the
 * speaker map vouches for it. The same goes for a group the composition does
 * not list: not knowing how many seats it has is not knowing it has several.
 * The policy (`decideAutomation`) decides, not this file.
 * CLAUDE.md: «a one-seat bloc is not bloc-level».
 *
 * Written once. The extractor applies it while extracting
 * (`pleno-claim-llm.ts`), and the re-join (`reunir-atribucion.ts`) applies it to
 * statements that were extracted before their map existed. With two copies the
 * two paths would drift the day one changed (DATA_INTEGRITY rule 1, applied to a
 * predicate rather than an enum).
 */
import { decideAutomation } from './automation-policy'
import { singleSeatBlocs, type BlocSeats } from './corporation-seats'

export type MotivoDeRetencion = 'unEscano' | 'fueraDeLaComposicion'

/**
 * Given the current composition, returns a function that says why a group from
 * the map is withheld, or `null` when it may be written.
 */
export function retencionDeGrupo(
  currentSeats: readonly BlocSeats[],
): (bloc: string | null) => MotivoDeRetencion | null {
  const unEscano = new Set(singleSeatBlocs(currentSeats))
  const enLaComposicion = new Set(currentSeats.map((s) => s.bloc))
  const nombrarAUnaPersona = decideAutomation({ kind: 'name-individual', namesIndividual: true })
  return (bloc) => {
    if (bloc === null || nombrarAUnaPersona.allow) return null
    if (unEscano.has(bloc)) return 'unEscano'
    if (!enLaComposicion.has(bloc)) return 'fueraDeLaComposicion'
    return null
  }
}
