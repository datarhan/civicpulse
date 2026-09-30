/**
 * Lo que cada runner de segunda pasada escribe con lo que le devuelve su
 * verificador — fuera de `main()`, para que se pueda probar sin red ni ficheros
 * (importar un script ejecuta su `main()`).
 *
 * Hasta el 29-09-2026 los dos runners construían la entrada a mano y pisaban el
 * campo que el verificador acababa de rellenar:
 * `{ ...r.verification, checkedAgainst: [marca] }`. Desde la fase 1b
 * (bfaf8b01) `checkedAgainst` dice CONTRA QUÉ se cotejó y `derivedBy` QUÉ PASADA
 * lo produjo; el runner volvía a meter la pasada en el primero. En el de NLI eso
 * además lo dejaba sin poder subir nada: el suelo de evidencia no encontraba
 * corpus y lanzaba.
 *
 * Aquí la verificación se escribe tal y como la da el verificador. Y cada pasada
 * va a su sitio:
 *
 *   · el motor RETRACTA (tier A de `decideAutomation`): entrada de overlay;
 *   · el anclaje NLI SUBE, y lo automático sólo baja (docs/DATA_INTEGRITY.md,
 *     regla 4): su subida es una SUGERENCIA con `requiresHumanApproval: true`
 *     en una cola de `editorial/`, que no se publica. El overlay la rechaza con
 *     la marca y sin ella (`exigeFirma` en trinquete.ts).
 *
 * Puro: sin fs, sin red, sin Date (el llamante pasa el sello).
 */
import type { ClaimVerdict, ClaimVerification } from './claim-verifier'
import type { NliVerifierResult } from './claim-verifier-nli'
import { evidenciaSuficiente, type ApplyEntry, type OverlaySource } from './verified-merge'
import { TRINQUETE } from './trinquete'

// ─── El motor de veredictos ─────────────────────────────────────────────────

export type TipoDeEntradaDelMotor =
  /** Retracta un veredicto publicado (`desde`) a lo que juzgó el motor. */
  | { tipo: 'retractacion'; desde: ClaimVerdict }
  /** Re-deriva una retractación suya ya publicada (`--ids`). */
  | { tipo: 'rederivacion' }

/**
 * La entrada de overlay de una retractación del motor.
 *
 * Sólo firma como del motor lo que el motor produjo: `makeEngineVerifier`
 * devuelve el veredicto determinista cuando no llega a preguntar al modelo, y
 * escribirlo con `source: 'verdict-engine'` sería el campo con dos
 * significados otra vez.
 */
export function entradaDelMotor(
  a: { verification: ClaimVerification; modelo: string } & TipoDeEntradaDelMotor,
): ApplyEntry {
  const v = a.verification
  if (!(v.derivedBy ?? []).includes('verdict-engine')) {
    throw new Error(
      `[motor] ${v.claimId}: la verificación no la produjo el motor (derivedBy ` +
        `${JSON.stringify(v.derivedBy ?? null)}) — no se escribe como suya`,
    )
  }
  let reason: string
  if (a.tipo === 'rederivacion') {
    reason =
      `verdict-engine (${a.modelo}) re-derivó la retractación (sigue sin-datos): ${v.summary}`.slice(
        0,
        400,
      )
  } else {
    reason =
      `verdict-engine (${a.modelo}) re-judged ${a.desde}→${v.verdict}: ${v.summary || 'no candidate genuinely supports the claim'}`.slice(
        0,
        400,
      )
    if (reason.length < 20) reason = `${reason} (insufficient grounded evidence)`
  }
  return {
    claimId: v.claimId,
    verification: v,
    source: 'verdict-engine',
    reason,
    editor: `verdict-engine:${a.modelo}`,
  }
}

// ─── El anclaje NLI: la cola humana ─────────────────────────────────────────

/** Una subida que el anclaje PROPONE. No se publica: la firma una persona. */
export interface SugerenciaDeVeredicto {
  claimId: string
  /** Tal y como la dio el verificador: corpus en checkedAgainst, pasada en derivedBy. */
  verification: ClaimVerification
  source: 'nli'
  /** El veredicto publicado cuando se propuso: la sugerencia corrige ESE estado. */
  desde: ClaimVerdict
  /** Algún candidato contradecía la afirmación por encima del umbral. */
  contradiccionNli: boolean
  requiresHumanApproval: true
}

/**
 * Por qué no se propone subir una fila, o `null` si se puede.
 *
 * `fuente` es el canal por el que entró su veredicto publicado —el `source` de
 * su entrada de overlay—, o nada si es el de la base. Una fila que bajó una
 * etapa que sólo retracta —el motor, un curador— se bajó a propósito: la cola
 * le pediría a una persona deshacerlo sin decirle que alguien lo hizo. Se
 * deriva del trinquete, así que una etapa nueva que retracte entra sola.
 */
export function motivoParaNoProponer(fuente: OverlaySource | undefined): string | null {
  const etapa = fuente ? TRINQUETE[fuente] : undefined
  if (etapa?.direccion !== 'baja') return null
  return `retractada por «${etapa.nombre}» (${fuente})`
}

/**
 * La sugerencia que deja una subida del anclaje, o `null` si no subió.
 *
 * No propone lo que no llega al suelo: pedir a una persona que firme un
 * veredicto fuerte sin corpus es pedirle que firme lo que el overlay rechaza.
 * Ni a partir de una retractación (`motivoParaNoProponer`): el runner ya las
 * aparta y las cuenta, y esto lo sostiene si otro llamante no lo hiciera.
 */
export function sugerenciaDelAnclaje(a: {
  r: NliVerifierResult | null
  desde: ClaimVerdict
  /** El `source` de la entrada de overlay de la fila publicada, si la tiene. */
  fuente?: OverlaySource
}): SugerenciaDeVeredicto | null {
  if (!a.r?.upgraded) return null
  const v = a.r.verification
  const motivo = motivoParaNoProponer(a.fuente)
  if (motivo) {
    throw new Error(`[anclaje] ${v.claimId}: no se propone subir una fila ${motivo}`)
  }
  if (!(v.derivedBy ?? []).includes('nli-grounding')) {
    throw new Error(`[anclaje] ${v.claimId}: la verificación no la produjo el anclaje NLI`)
  }
  if (!TRINQUETE.nli.puedeEmitir.includes(v.verdict)) {
    throw new Error(`[anclaje] ${v.claimId}: el anclaje no propone ${v.verdict}`)
  }
  if (!evidenciaSuficiente(v)) {
    throw new Error(
      `[anclaje] ${v.claimId}: ${v.verdict} no llega al suelo de evidencia — no nombra ningún ` +
        'corpus real o no trae evidencia, y no se propone lo que no se podría publicar',
    )
  }
  return {
    claimId: v.claimId,
    verification: v,
    source: 'nli',
    desde: a.desde,
    contradiccionNli: a.r.nliContradictionFlag,
    requiresHumanApproval: true,
  }
}

/** Gitignorado, fuera de `public/`: nada de aquí es fetchable por URL. */
export const COLA_SUGERENCIAS_NLI = 'editorial/pleno-claims-sugerencias-nli.json'

export interface FilaDeCola extends SugerenciaDeVeredicto {
  /** Cuándo la propuso la corrida que la dejó aquí. */
  propuestaEn: string
}

export interface ColaDeSugerencias {
  _comment: string
  version: number
  generatedAt: string
  entries: Record<string, FilaDeCola>
}

const COMENTARIO =
  'COLA DE SUGERENCIAS DE VEREDICTO — no publicada, y no debe publicarse. Vive en editorial/ ' +
  '(gitignored) porque todo lo que hay bajo public/ es fetchable por URL. El anclaje NLI PROPONE ' +
  'subir un veredicto; no lo sube: lo automático sólo baja (docs/DATA_INTEGRITY.md, regla 4), y el ' +
  'overlay rechaza estas filas con su marca y sin ella. Publicar una subida pide una vía firmada ' +
  'por una persona, que hoy no existe: downgrade-verdict sólo baja.'

/**
 * La cola tras una corrida. Pura: devuelve una nueva.
 *
 * Lo que la corrida juzgó (`juzgadas`) se reemplaza por lo que dijo ahora —su
 * sugerencia, o ninguna si ya no sube—; lo que no miró se queda con su sello.
 */
export function actualizarCola(
  cola: ColaDeSugerencias | null,
  juzgadas: readonly string[],
  sugerencias: readonly SugerenciaDeVeredicto[],
  stamp: string,
): ColaDeSugerencias {
  const entries: Record<string, FilaDeCola> = { ...(cola?.entries ?? {}) }
  for (const id of juzgadas) delete entries[id]
  for (const s of sugerencias) entries[s.claimId] = { ...s, propuestaEn: stamp }
  const next: ColaDeSugerencias = {
    _comment: COMENTARIO,
    version: cola?.version ?? 1,
    generatedAt: stamp,
    entries,
  }
  validarCola(next)
  return next
}

/** Revienta con una cola malformada. Se llama al escribir y al leer. */
export function validarCola(c: ColaDeSugerencias): void {
  if (!c || typeof c.version !== 'number' || !c.entries || typeof c.entries !== 'object') {
    throw new Error('[cola-nli] malformada: falta version/entries')
  }
  for (const [id, f] of Object.entries(c.entries)) {
    if (!f || typeof f !== 'object') throw new Error(`[cola-nli] ${id}: la fila no es un objeto`)
    if (f.requiresHumanApproval !== true) {
      throw new Error(`[cola-nli] ${id}: requiresHumanApproval tiene que ser true en toda fila`)
    }
    if (f.source !== 'nli') throw new Error(`[cola-nli] ${id}: source ${String(f.source)}`)
    if (f.claimId !== id) throw new Error(`[cola-nli] ${id}: claimId ${String(f.claimId)}`)
    const v = f.verification
    if (!v || !TRINQUETE.nli.puedeEmitir.includes(v.verdict)) {
      throw new Error(`[cola-nli] ${id}: veredicto ${String(v?.verdict)} fuera de lo que propone`)
    }
    if (!evidenciaSuficiente(v)) throw new Error(`[cola-nli] ${id}: no llega al suelo de evidencia`)
    if (typeof f.propuestaEn !== 'string') throw new Error(`[cola-nli] ${id}: falta propuestaEn`)
  }
}
