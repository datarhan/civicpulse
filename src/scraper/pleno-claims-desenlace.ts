/**
 * Cómo acabó cada sesión en `extract-pleno-claims`, y qué apunta eso en el
 * manifiesto.
 *
 * Sale del script para poder probarlo sin un modelo detrás: las ramas de
 * conservación sólo se alcanzan después de ~200 llamadas, y fue justo en una de
 * ellas donde el manifiesto mentía. El 2026-11-23 re-extraer `1237hbp` hizo 225
 * llamadas, la guarda de huérfanos se negó a sobrescribir —con razón— y el
 * manifiesto salió `attempted 0 · skipped {}`: idéntico a una pasada que no
 * llegó a hacer nada. La rama no llamaba a `run.*` en absoluto.
 *
 * Regla 2 de DATA_INTEGRITY: intentado / hecho / nunca intentado /
 * saltado-con-motivo, por separado. Cada desenlace tiene aquí UNA forma de
 * anotarse, y el `switch` exhaustivo hace que un desenlace nuevo no compile
 * hasta que alguien decida qué cuenta.
 */
import { SKIP_ORPHAN_GUARD, type RunRecorder } from './run-manifest'

export type Desenlace =
  /** Veda electoral y la sesión ya lleva grupos: ni se extrajo. */
  | { tipo: 'conservada-veda' }
  /** Se extrajo, salió vacía y ya había declaraciones: se conservan las viejas. */
  | { tipo: 'preserved-empty' }
  /** Se extrajo, pero sobrescribir dejaría sin cita a hallazgos publicados. */
  | { tipo: 'orphan-guard'; orphans: string[] }
  /** Se extrajo y se publica lo nuevo (con o sin huérfanos forzados). */
  | { tipo: 'overwrite'; claims: number; orphansForced: string[] }
  /** Se extrajo, salió vacía y no había nada antes. */
  | { tipo: 'empty' }

export const SKIP_LOREG_FREEZE = 'loreg-freeze — atribución conservada'
export const SKIP_EXTRACTION_EMPTY = 'extraction empty — previous claims preserved'

/**
 * Qué hacer con lo extraído. El orden importa y es el del script desde
 * 2026-08-03: la guarda de vacío va primero y NO la salta
 * `--force-orphan-findings` — son preguntas distintas («dejaría huérfanos» frente
 * a «no hay con qué sobrescribir»).
 */
export function decidirDesenlace(input: {
  fresh: ReadonlyArray<{ id: string }>
  previous: ReadonlyArray<unknown>
  cited: ReadonlySet<string> | undefined
  forceOrphanFindings: boolean
}): Exclude<Desenlace, { tipo: 'conservada-veda' }> {
  const { fresh, previous, cited, forceOrphanFindings } = input
  if (fresh.length === 0 && previous.length > 0) return { tipo: 'preserved-empty' }
  let orphans: string[] = []
  if (cited && cited.size > 0) {
    const freshIds = new Set(fresh.map((c) => c.id))
    orphans = [...cited].filter((cid) => !freshIds.has(cid))
    if (orphans.length > 0 && !forceOrphanFindings) return { tipo: 'orphan-guard', orphans }
  }
  if (fresh.length === 0) return { tipo: 'empty' }
  return { tipo: 'overwrite', claims: fresh.length, orphansForced: orphans }
}

export function anotarDesenlace(run: RunRecorder, d: Desenlace): void {
  switch (d.tipo) {
    case 'conservada-veda':
      // Saltada, NO intentada: «no la toqué por la veda» no es «la intenté y no
      // salió nada».
      run.skip(SKIP_LOREG_FREEZE)
      return
    case 'preserved-empty':
      run.attempt()
      run.skip(SKIP_EXTRACTION_EMPTY)
      return
    case 'orphan-guard':
      // Intentada (el modelo contestó) y saltada con su motivo: lo extraído se
      // descartó para no romper citas publicadas.
      run.attempt()
      run.skip(SKIP_ORPHAN_GUARD)
      return
    case 'overwrite':
      run.attempt()
      run.judge()
      run.record('claims', d.claims)
      if (d.orphansForced.length > 0) run.record('orphansForced', d.orphansForced.length)
      return
    case 'empty':
      // Una sesión vacía es o una sesión sin nada o un backend muerto; el
      // manifiesto la separa de una buena para que se vea la diferencia.
      run.attempt()
      run.neverAttempt()
      return
    default: {
      const nunca: never = d
      throw new Error(`desenlace sin anotar: ${JSON.stringify(nunca)}`)
    }
  }
}
