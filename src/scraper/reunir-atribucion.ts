/**
 * Re-join a statement's group from its session's speaker map WITHOUT
 * re-extracting it, for statements extracted before their map existed.
 *
 * ## Why this exists
 *
 * Attribution is joined in exactly one place, during extraction: the extractor
 * calls `blocResolverFor` on each literal it emits (`pleno-claim-llm.ts`). A
 * session whose statements came first and whose map came later only got its
 * groups if it was RE-EXTRACTED, and on 2026-11-23, 12 of the 16 mapped sessions
 * with published statements had never been re-joined. Three causes, all in
 * `hallazgos-pipeline.sh`:
 *
 *   · Before 2026-11-22 a session mapped on a night with no text backend was
 *     left «EN ESPERA» with no list to come back to, and a complete map took it
 *     out of `speaker-map:backlog` (1sqj7is, 19gax3o, 1pe3qs8, toa3rc, 1qi8axv).
 *   · Re-extracting a session whose statements a finding cites is refused by the
 *     extractor's orphan guard (`SKIPPED — n cited claim(s) would be orphaned`),
 *     because the model mints new claim ids. Until b0d0fb59 (2026-11-22) the
 *     pipeline logged that as «✓ claims re-extracted with map attribution» and
 *     forgot the session (1du4rf5 three times, otxq2c, …).
 *   · Even with that detected, re-extraction is the only re-join, so a session
 *     cited by findings stays unattributed for as long as it is cited.
 *
 * Re-extracting to re-join is the wrong tool anyway: it regenerates the whole
 * statement set (new ids, new topics) to change one field. This changes that
 * field only, on the SAME statements, with the SAME join the extractor runs:
 * `blocResolverFor` through `resolverDeGrupo`, then `retencionDeGrupo`, which
 * holds back one-seat groups via `decideAutomation({ namesIndividual: true })`.
 * It names no one the extractor would not have named had the map come first.
 *
 * ## What it never does
 *
 *   · overwrite a group already there (that is reconcile's job, and reconcile
 *     only ever retracts);
 *   · touch a statement whose group a person signed — the signature stores what
 *     the base said when signed (`from`), so changing the base would void it;
 *   · touch a statement whose quote on /hallazgos had its group corrected or
 *     withdrawn with a signature (`correct-pleno-finding --field
 *     quote.<i>.speakerGroup`). A person decided what that quote may say about
 *     who spoke; an automatic pass only ever goes down (CLAUDE.md, rule 4).
 *     `tests/declaraciones-escano-unico.test.ts` caught the first run of this
 *     putting PSOE back on qz6weg-249-cit-3e02ef, withdrawn on its finding;
 *   · write a one-seat group, or one outside the composition;
 *   · write anything outside `SPEAKER_GROUPS`;
 *   · write `speakerSlug` — a councillor's name is not a group.
 */
import { SPEAKER_GROUPS } from './pleno-votes'
import { isSpeakerGroupField } from './pleno-finding'
import { seguirPosicion } from '../lib/posicion-en-bitacora.js'
import { plenoDeDeclaracion } from './etiqueta-de-grupo'
import type { MotivoDeRetencion } from './retencion-de-grupo'

/** Every statement in a session the pass looks at lands in exactly one of these. */
export const DESENLACES = [
  'unida',
  'ya-atribuida',
  'firmada',
  'corregida-en-ficha',
  'mapa-no-acredita',
  'grupo-de-un-escano',
  'fuera-de-la-composicion',
  'fuera-del-enum',
] as const
export type Desenlace = (typeof DESENLACES)[number]

/** What the report says of each outcome, for a reader who does not open this. */
export const POR_QUE: Record<Desenlace, string> = {
  unida: 'el mapa de voces le da un grupo de varios concejales y se escribe',
  'ya-atribuida': 'ya lleva un grupo, y no se pisa',
  firmada: 'la firmó una persona (pleno-claim-relabels.json); la base no se toca',
  'corregida-en-ficha': 'una persona corrigió o retiró con firma el grupo de su cita en /hallazgos',
  'mapa-no-acredita': 'el mapa de voces no acredita quién hablaba',
  'grupo-de-un-escano': 'nombra a su concejal por eliminación: lo firma una persona',
  'fuera-de-la-composicion': 'la composición no dice cuántos concejales tiene',
  'fuera-del-enum': 'no es un grupo de SPEAKER_GROUPS',
}

export interface Declaracion {
  id: string
  plenoId?: string | null
  speakerGroup?: string | null
  verbatim: string
}

export interface CriterioDeUnion {
  /** Sessions to re-join. Sessions outside it are not looked at, and say so. */
  sesiones: ReadonlySet<string>
  /** The map's group for a literal, or null (`resolverDeGrupo`). Null resolver = unreadable map. */
  resolverDe: (plenoId: string) => ((verbatim: string) => string | null) | null
  /** `retencionDeGrupo(currentSeats)` — the extractor's own rule. */
  retener: (bloc: string | null) => MotivoDeRetencion | null
  /** Ids of statements whose group a person signed. */
  firmadas: ReadonlySet<string>
  /** Ids of statements whose quote's group a finding corrected with a signature (`corregidasEnFichas`). */
  corregidas: ReadonlySet<string>
}

interface FichaConBitacora {
  quotes?: ReadonlyArray<{ sourceClaimId?: string | null }>
  corrections?: ReadonlyArray<{ field?: string }>
}

/**
 * The statements behind every quote whose group a finding's correction log
 * changed — whatever it changed it to, and even if a later row changed it again.
 * Withholding one too many is the safe error here.
 *
 * The row's index is the quote's position on the day of the row; `seguirPosicion`
 * follows it through later quote removals to today's position, as the log on
 * /hallazgos does. A quote removed since has no statement left to protect.
 */
export function corregidasEnFichas(fichas: readonly FichaConBitacora[]): Set<string> {
  const out = new Set<string>()
  for (const f of fichas) {
    const cs = f.corrections ?? []
    cs.forEach((fila, i) => {
      if (!isSpeakerGroupField(String(fila?.field ?? ''))) return
      const hoy = seguirPosicion(cs, i)?.hoy ?? null
      const id = hoy === null ? null : (f.quotes?.[hoy]?.sourceClaimId ?? null)
      if (id) out.add(id)
    })
  }
  return out
}

export interface PorSesion {
  declaraciones: number
  conGrupoAntes: number
  conGrupoDespues: number
  desenlaces: Record<Desenlace, number>
  /** Groups written, by group. */
  porGrupo: Record<string, number>
}

export interface ResultadoUnion<T> {
  items: T[]
  porSesion: Record<string, PorSesion>
  /** Sessions asked for whose map or transcript could not be read: nothing attempted. */
  sinMapaLegible: string[]
}

const vacio = (): Record<Desenlace, number> =>
  Object.fromEntries(DESENLACES.map((d) => [d, 0])) as Record<Desenlace, number>

export function reunirAtribucion<T extends Declaracion>(
  items: readonly T[],
  c: CriterioDeUnion,
): ResultadoUnion<T> {
  const porSesion: Record<string, PorSesion> = {}
  const resolvedores = new Map<string, ((v: string) => string | null) | null>()
  const sinMapaLegible = new Set<string>()

  const out = items.map((it) => {
    const pleno = plenoDeDeclaracion(it)
    if (!c.sesiones.has(pleno)) return it
    if (!resolvedores.has(pleno)) resolvedores.set(pleno, c.resolverDe(pleno))
    const resolver = resolvedores.get(pleno) ?? null
    if (!resolver) {
      sinMapaLegible.add(pleno)
      return it
    }
    const s = (porSesion[pleno] ??= {
      declaraciones: 0,
      conGrupoAntes: 0,
      conGrupoDespues: 0,
      desenlaces: vacio(),
      porGrupo: {},
    })
    s.declaraciones += 1
    if (it.speakerGroup) s.conGrupoAntes += 1

    const d = desenlace(it, resolver, c)
    s.desenlaces[d.desenlace] += 1
    if (d.desenlace !== 'unida') {
      if (it.speakerGroup) s.conGrupoDespues += 1
      return it
    }
    s.conGrupoDespues += 1
    s.porGrupo[d.grupo] = (s.porGrupo[d.grupo] ?? 0) + 1
    return { ...it, speakerGroup: d.grupo }
  })

  return { items: out, porSesion, sinMapaLegible: [...sinMapaLegible].sort() }
}

function desenlace(
  it: Declaracion,
  resolver: (v: string) => string | null,
  c: CriterioDeUnion,
): { desenlace: Exclude<Desenlace, 'unida'> } | { desenlace: 'unida'; grupo: string } {
  if (it.speakerGroup) return { desenlace: 'ya-atribuida' }
  if (c.firmadas.has(it.id)) return { desenlace: 'firmada' }
  if (c.corregidas.has(it.id)) return { desenlace: 'corregida-en-ficha' }
  const grupo = resolver(it.verbatim)
  if (grupo === null) return { desenlace: 'mapa-no-acredita' }
  const motivo = c.retener(grupo)
  if (motivo === 'unEscano') return { desenlace: 'grupo-de-un-escano' }
  if (motivo === 'fueraDeLaComposicion') return { desenlace: 'fuera-de-la-composicion' }
  if (!(SPEAKER_GROUPS as readonly string[]).includes(grupo)) return { desenlace: 'fuera-del-enum' }
  return { desenlace: 'unida', grupo }
}
