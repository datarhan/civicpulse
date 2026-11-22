/**
 * El rendimiento de la tubería de plenos, en un renglón (paso 0.3 del plan de
 * plenos, 22-11-2026): ¿está produciendo lo que existe para producir, que son
 * declaraciones atribuidas a un grupo?
 *
 * Hasta aquí la última línea de cada pasada decía «DEGRADADO» siempre que el
 * manifiesto de `check:runs` traía un error o un aviso, y del 26-10 al 19-11 lo
 * dijo en TODAS las pasadas: una palabra que sale siempre no avisa de nada. Lo
 * que no decía nadie es lo que de verdad estaba parado —la atribución—, porque
 * las cifras que lo cuentan no estaban en ninguna pantalla.
 *
 * Tres pasos, porque cada uno se para por un motivo distinto y una sola cifra
 * los confundía:
 *
 *   · transcripciones: sólo las de AUDIO cuentan (`transcriptKind`). Las de acta
 *     —texto del acta con marcas `[0.0 → 0.0]`— no se pueden mapear ni atribuir,
 *     y llamarlas «transcritas» es justo lo que la cabecera de transcript-kind.js
 *     advierte. Se cuentan aparte, con las de tipo desconocido aparte también.
 *   · mapas de oradores: un FICHERO no es un mapa terminado (`isMapComplete`), y
 *     uno terminado puede haber dado trozos por perdidos; se dicen los dos, y uno
 *     que no se deja leer, aparte. Un mapa terminado cuya sesión no tiene ninguna
 *     declaración con grupo es trabajo pendiente igual que uno que falta.
 *   · declaraciones con grupo: las EXTRAÍDAS de sesiones de audio
 *     (pleno-claims-suggestions.json), que es lo que la máquina produce, y aparte
 *     las que se SIRVEN a la web (los trozos de pleno-claims/, ya pasados por la
 *     puerta editorial), para que el renglón no se lea como lo que enseña la web.
 *     Un grupo cuenta sólo si es uno de `SPEAKER_GROUPS`: cualquier otra cadena
 *     sería un centinela contado como atribución (reglas 1 y 3 de
 *     docs/DATA_INTEGRITY.md), y se cuenta aparte.
 *
 * Y el último hallazgo publicado, en días. Desde el 22-11-2026 los publica sólo
 * una persona; los anteriores pudo publicarlos la auto-curación.
 *
 * Lo que no se pudo leer es `null` y se imprime «?», nunca 0: un cero es un dato
 * que nadie midió (regla 3).
 *
 * Techo: atribuir una frase a un grupo de un solo concejal nombra a una persona,
 * que es nivel C (`singleSeatBlocs`), así que sin una persona el 100 % no se
 * alcanza nunca; el porcentaje es una tendencia, no una nota.
 */
import type { Alert } from './health-monitor'
import { SPEAKER_GROUPS } from './pleno-votes'

export interface Transcripcion {
  id: string
  tipo: 'audio' | 'acta' | 'unknown'
}

export interface Mapa {
  id: string
  /** El JSON se pudo leer. Uno que no, no es «a medias»: es «?». */
  legible: boolean
  /** `isMapComplete` bajo la puerta actual. */
  completo: boolean
  /** Trozos dados por perdidos que cuentan como terminados. */
  huecos: number
}

export interface Entradas {
  /** pleno-claims-suggestions.json `items`, o null si no se pudo leer. */
  extraidas: readonly { plenoId?: unknown; speakerGroup?: unknown }[] | null
  /** Los `claim` de cada trozo de pleno-claims/, o null. */
  publicadas: readonly { speakerGroup?: unknown }[] | null
  transcripciones: readonly Transcripcion[] | null
  mapas: readonly Mapa[] | null
  /** pleno-findings.json `items` (las retractadas van en `retractions`, fuera). */
  hallazgos: readonly { publishedAt?: unknown }[] | null
  /** Hoy, AAAA-MM-DD, en Europe/Madrid. */
  hoy: string
}

export interface Rendimiento {
  extraidas: number | null
  extraidasDeAudio: number | null
  /** Extraídas de sesiones de audio con un grupo de `SPEAKER_GROUPS`. */
  conBloque: number | null
  sesionesConBloque: number | null
  /** Por sesión, para ver la que baja aunque el total suba. */
  porSesion: Record<string, number> | null
  /** Extraídas con un `speakerGroup` que no es ninguno de `SPEAKER_GROUPS`. */
  gruposDesconocidos: number | null
  publicadas: number | null
  publicadasConBloque: number | null
  audio: number | null
  acta: number | null
  desconocidas: number | null
  mapasCompletos: number | null
  mapasConHuecos: number | null
  /** Terminados sin ningún trozo dado por perdido: lo que de verdad se mapeó. */
  mapasEnteros: number | null
  mapasParciales: number | null
  mapasIlegibles: number | null
  /** Mapas terminados cuya sesión no tiene ninguna declaración extraída con grupo. */
  mapasSinBloque: number | null
  /** Sesiones de audio sin mapa terminado + mapas terminados sin ningún grupo. */
  pendiente: number | null
  hallazgos: number | null
  ultimoHallazgo: string | null
  diasSinHallazgo: number | null
}

const GRUPOS: ReadonlySet<string> = new Set(SPEAKER_GROUPS)
const esGrupo = (g: unknown) => typeof g === 'string' && GRUPOS.has(g)
const esOtraCosa = (g: unknown) => typeof g === 'string' && g.length > 0 && !GRUPOS.has(g)
const FECHA = /^\d{4}-\d{2}-\d{2}/

export function medirRendimiento(e: Entradas): Rendimiento {
  const audio = e.transcripciones
    ? new Set(e.transcripciones.filter((t) => t.tipo === 'audio').map((t) => t.id))
    : null
  const cuenta = (tipo: Transcripcion['tipo']) =>
    e.transcripciones ? e.transcripciones.filter((t) => t.tipo === tipo).length : null

  const deAudio =
    e.extraidas && audio
      ? e.extraidas.filter((c) => typeof c?.plenoId === 'string' && audio.has(c.plenoId))
      : null
  const conGrupo = deAudio ? deAudio.filter((c) => esGrupo(c?.speakerGroup)) : null
  let porSesion: Record<string, number> | null = null
  if (conGrupo) {
    porSesion = {}
    for (const c of conGrupo) {
      const id = c.plenoId as string
      porSesion[id] = (porSesion[id] ?? 0) + 1
    }
  }
  const sesionesConGrupo = porSesion ? new Set(Object.keys(porSesion)) : null

  // Sólo los mapas de sesiones de audio: uno huérfano de una transcripción que ya
  // no es de audio no es atribución posible.
  const mapas = e.mapas && audio ? e.mapas.filter((m) => audio.has(m.id)) : null
  const legibles = mapas ? mapas.filter((m) => m.legible) : null
  const completos = legibles ? legibles.filter((m) => m.completo) : null
  const sinBloque =
    completos && sesionesConGrupo
      ? completos.filter((m) => !sesionesConGrupo.has(m.id)).length
      : null
  const ilegibles = mapas && legibles ? mapas.length - legibles.length : null

  let ultimo: string | null = null
  if (e.hallazgos) {
    for (const h of e.hallazgos) {
      const f =
        typeof h?.publishedAt === 'string' && FECHA.test(h.publishedAt)
          ? h.publishedAt.slice(0, 10)
          : null
      if (f && (ultimo === null || f > ultimo)) ultimo = f
    }
  }

  return {
    extraidas: e.extraidas ? e.extraidas.length : null,
    extraidasDeAudio: deAudio ? deAudio.length : null,
    conBloque: conGrupo ? conGrupo.length : null,
    sesionesConBloque: sesionesConGrupo ? sesionesConGrupo.size : null,
    porSesion,
    gruposDesconocidos: e.extraidas
      ? e.extraidas.filter((c) => esOtraCosa(c?.speakerGroup)).length
      : null,
    publicadas: e.publicadas ? e.publicadas.length : null,
    publicadasConBloque: e.publicadas
      ? e.publicadas.filter((c) => esGrupo(c?.speakerGroup)).length
      : null,
    audio: audio ? audio.size : null,
    acta: cuenta('acta'),
    desconocidas: cuenta('unknown'),
    mapasCompletos: completos ? completos.length : null,
    mapasConHuecos: completos ? completos.filter((m) => m.huecos > 0).length : null,
    mapasEnteros: completos ? completos.filter((m) => m.huecos === 0).length : null,
    mapasParciales: legibles ? legibles.filter((m) => !m.completo).length : null,
    mapasIlegibles: ilegibles,
    mapasSinBloque: sinBloque,
    // Con un mapa ilegible no se sabe si está terminado: la cuenta queda en «?».
    pendiente:
      audio && completos && sinBloque !== null && ilegibles === 0
        ? audio.size - completos.length + sinBloque
        : null,
    hallazgos: e.hallazgos ? e.hallazgos.length : null,
    ultimoHallazgo: e.hallazgos ? ultimo : null,
    diasSinHallazgo: e.hallazgos && ultimo ? diasEntre(ultimo, e.hoy) : null,
  }
}

function diasEntre(desde: string, hasta: string): number | null {
  const a = Date.parse(`${desde}T00:00:00Z`)
  const b = Date.parse(`${hasta.slice(0, 10)}T00:00:00Z`)
  return Number.isFinite(a) && Number.isFinite(b) ? Math.round((b - a) / 86_400_000) : null
}

/** Hoy en Europe/Madrid, AAAA-MM-DD: el pleno y el lector están aquí, no en UTC. */
export function hoyEnMadrid(ahora: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(ahora)
}

const n = (x: number | null | undefined) =>
  x === null || x === undefined
    ? '?'
    : x.toLocaleString('es-ES', { maximumFractionDigits: 0, useGrouping: 'always' })

const pct = (parte: number | null, total: number | null) =>
  parte === null || total === null || total <= 0
    ? '?'
    : `${((parte / total) * 100).toLocaleString('es-ES', { maximumFractionDigits: 1 })} %`

export function lineaRendimiento(r: Rendimiento): string {
  const hallazgo =
    r.ultimoHallazgo === null
      ? r.hallazgos === 0
        ? 'ningún hallazgo publicado'
        : 'último hallazgo ?'
      : `último hallazgo ${r.ultimoHallazgo} (hace ${n(r.diasSinHallazgo)} días; desde el 22-11-2026 sólo los publica una persona)`
  const raros =
    r.gruposDesconocidos === null || r.gruposDesconocidos > 0
      ? `; ${n(r.gruposDesconocidos)} con un grupo que no es ninguno de los conocidos, sin contar`
      : ''
  const ilegibles =
    r.mapasIlegibles === null || r.mapasIlegibles > 0
      ? `, ${n(r.mapasIlegibles)} que no se dejan leer`
      : ''
  return [
    `rendimiento · extraídas con grupo ${n(r.conBloque)} de ${n(r.extraidasDeAudio)} de audio ` +
      `(${pct(r.conBloque, r.extraidasDeAudio)}; ${n(r.extraidas)} en total${raros}) en ${n(r.sesionesConBloque)} sesión(es)`,
    `servidas a la web con grupo ${n(r.publicadasConBloque)} de ${n(r.publicadas)}`,
    `mapas terminados ${n(r.mapasCompletos)} de ${n(r.audio)} de audio ` +
      `(${n(r.mapasConHuecos)} con trozos dados por perdidos, ${n(r.mapasParciales)} a medias${ilegibles}; ` +
      `${n(r.mapasSinBloque)} sin ninguna declaración con grupo; ` +
      `${n(r.acta)} de acta y ${n(r.desconocidas)} sin tipo, fuera)`,
    hallazgo,
  ].join(' · ')
}

// ── la comparación con la pasada anterior ────────────────────────────────────

/**
 * Lo que se compara: los NUMERADORES de la atribución. No los porcentajes —uno
 * baja con sólo extraer una sesión nueva sin mapa, y eso no es ir a peor— ni el
 * total de extraídas, que una re-extracción o una retirada bajan a propósito.
 * De los mapas, los ENTEROS: uno que se da por terminado porque se rindió en sus
 * trozos fallidos no es atribución nueva, y contarlo como avance cortaba la racha
 * de SIN AVANCE.
 */
export const NUMERADORES = ['conBloque', 'sesionesConBloque', 'mapasEnteros'] as const
type Numerador = (typeof NUMERADORES)[number]

/** Lo que una pasada deja para la siguiente (.cache/, desechable). */
export interface Previa {
  at: string
  /** El último valor CONOCIDO de cada numerador: una noche sin leer no lo borra. */
  valores: Partial<Record<Numerador, number>>
  /** Declaraciones con grupo por sesión, la última vez que se pudo leer. */
  porSesion: Record<string, number> | null
  /** Errores del manifiesto de la última pasada que los pudo contar, o null. */
  errores: number | null
  /** Pasadas seguidas con trabajo pendiente y ningún numerador al alza. */
  sinAvance: number
  /** Desde cuándo: la pasada anterior a la primera de la racha. */
  sinAvanceDesde: string | null
  /** El veredicto de esta pasada, para que el parte de salud lo repita. */
  veredicto: string | null
}

export interface Veredicto {
  /** «DEGRADADO …», «SIN AVANCE …», «avanza …», «al día …» o «sin comparar …». */
  texto: string
  degradado: boolean
  siguiente: Previa
}

/** Por qué no hay previa con la que comparar, si no la hay. */
export type SinPrevia = 'no-hay' | 'ilegible'

/**
 * ¿Fue esta pasada a peor que la anterior?
 *
 *   · DEGRADADO si un numerador BAJÓ, o si una sesión perdió declaraciones con
 *     grupo aunque el total suba por otra (nombradas: «con grupo 188→150»), o si
 *     el manifiesto trae más errores que la última pasada que los pudo contar.
 *     Una bajada puede ser correcta —una retirada, una re-etiqueta de un
 *     curador—, así que se dice como lo que es, «bajó desde la pasada anterior»,
 *     y lo mira una persona. Los avisos del manifiesto no se comparan: crecen con
 *     el número de ventanas, miden el tamaño de la pasada, no su salud.
 *   · SIN AVANCE (n pasadas) si queda trabajo pendiente y ningún numerador subió.
 *     Plano no es «igual que ayer, todo bien»: con sesiones por mapear, quieto es
 *     lo que no se intentó (regla 2 de DATA_INTEGRITY). Dice cuántos numeradores
 *     pudo comparar.
 *   · «avanza» si algún numerador subió y nada bajó; «al día» sin pendiente.
 *   · «sin comparar» sin pasada previa (o ilegible, y lo dice), o si no se pudo
 *     leer nada que comparar.
 *
 * `errores` es null cuando el manifiesto no se pudo contar —sin manifiestos en
 * la ventana, o `check:runs` que no contestó—: ni se compara ni pisa el último
 * conocido, o la pasada siguiente parecería «más errores» que un cero inventado.
 */
export function compararConPrevia(
  r: Rendimiento,
  previa: Previa | null,
  errores: number | null,
  ahora: string,
  sinPrevia: SinPrevia = 'no-hay',
): Veredicto {
  const valores: Partial<Record<Numerador, number>> = { ...(previa?.valores ?? {}) }
  for (const k of NUMERADORES) if (r[k] !== null) valores[k] = r[k] as number
  const base = {
    at: ahora,
    valores,
    porSesion: r.porSesion ?? previa?.porSesion ?? null,
    errores: errores ?? previa?.errores ?? null,
  }
  const fin = (texto: string, degradado: boolean, racha = 0, desde: string | null = null) => ({
    texto,
    degradado,
    siguiente: { ...base, sinAvance: racha, sinAvanceDesde: desde, veredicto: texto },
  })

  if (!previa) {
    return fin(
      sinPrevia === 'ilegible'
        ? 'sin comparar (la pasada previa guardada no se deja leer; se empieza de nuevo)'
        : 'sin comparar (no hay pasada previa guardada)',
      false,
    )
  }

  const bajadas: string[] = []
  const subidas: string[] = []
  let comparados = 0
  for (const k of NUMERADORES) {
    const antes = previa.valores[k]
    const ahoraV = r[k]
    if (typeof antes !== 'number' || ahoraV === null) continue
    comparados++
    if (ahoraV < antes) bajadas.push(`${ETIQUETA[k]} ${n(antes)}→${n(ahoraV)}`)
    else if (ahoraV > antes) subidas.push(`${ETIQUETA[k]} ${n(antes)}→${n(ahoraV)}`)
  }
  // La sesión que pierde declaraciones con grupo, aunque otra gane más.
  const sesionesQueBajan: string[] = []
  if (r.porSesion && previa.porSesion) {
    for (const [id, antes] of Object.entries(previa.porSesion)) {
      const ahoraV = r.porSesion[id] ?? 0
      if (ahoraV < antes) sesionesQueBajan.push(`${id} ${n(antes)}→${n(ahoraV)}`)
    }
  }
  const masErrores =
    errores !== null && previa.errores !== null && errores > previa.errores
      ? `errores del manifiesto ${previa.errores}→${errores}`
      : null

  if (comparados === 0 && !masErrores) {
    return fin('sin comparar (no se pudo leer ninguna cifra de las que se comparan)', false)
  }

  if (bajadas.length > 0 || sesionesQueBajan.length > 0 || masErrores) {
    const partes = [
      ...(bajadas.length ? [`bajó desde la pasada anterior: ${bajadas.join(', ')}`] : []),
      ...(sesionesQueBajan.length
        ? [`sesiones con menos declaraciones con grupo: ${resumir(sesionesQueBajan)}`]
        : []),
      ...(masErrores ? [masErrores] : []),
      ...(subidas.length ? [`subió: ${subidas.join(', ')}`] : []),
    ]
    return fin(`DEGRADADO — ${partes.join(' · ')}`, true)
  }

  if (subidas.length > 0) return fin(`avanza — ${subidas.join(', ')}`, false)

  const cuantos =
    comparados < NUMERADORES.length ? ` (${comparados} de ${NUMERADORES.length} comparados)` : ''
  if (r.pendiente === null || r.pendiente > 0) {
    const racha = previa.sinAvance + 1
    // La racha empieza en la pasada anterior: desde ella no sube nada.
    const desde = previa.sinAvanceDesde ?? previa.at.slice(0, 10)
    return fin(
      `SIN AVANCE (${racha} pasada(s) seguidas, desde ${desde}) — ` +
        `${r.pendiente === null ? '? sesiones' : `${n(r.pendiente)} sesión(es)`} por mapear o mapeadas sin ninguna declaración con grupo, ` +
        `y ningún numerador subió${cuantos}`,
      false,
      racha,
      desde,
    )
  }

  return fin(`al día — nada pendiente de mapear${cuantos}`, false)
}

const resumir = (xs: string[]) =>
  xs.length <= 5 ? xs.join(', ') : `${xs.slice(0, 5).join(', ')} y ${xs.length - 5} más`

const ETIQUETA: Record<Numerador, string> = {
  conBloque: 'extraídas con grupo',
  sesionesConBloque: 'sesiones con grupo',
  mapasEnteros: 'mapas terminados sin trozos perdidos',
}

/** Lee una previa guardada; cualquier forma rara cuenta como «no hay». */
export function leerPrevia(j: unknown): Previa | null {
  if (!j || typeof j !== 'object') return null
  const o = j as Record<string, unknown>
  if (typeof o.at !== 'string' || !o.valores || typeof o.valores !== 'object') return null
  const valores: Partial<Record<Numerador, number>> = {}
  for (const k of NUMERADORES) {
    const v = (o.valores as Record<string, unknown>)[k]
    if (typeof v === 'number' && Number.isFinite(v)) valores[k] = v
  }
  let porSesion: Record<string, number> | null = null
  if (o.porSesion && typeof o.porSesion === 'object') {
    porSesion = {}
    for (const [k, v] of Object.entries(o.porSesion as Record<string, unknown>))
      if (typeof v === 'number' && Number.isFinite(v)) porSesion[k] = v
  }
  return {
    at: o.at,
    valores,
    porSesion,
    errores: typeof o.errores === 'number' && Number.isFinite(o.errores) ? o.errores : null,
    sinAvance: typeof o.sinAvance === 'number' && o.sinAvance >= 0 ? Math.floor(o.sinAvance) : 0,
    sinAvanceDesde: typeof o.sinAvanceDesde === 'string' ? o.sinAvanceDesde : null,
    veredicto: typeof o.veredicto === 'string' ? o.veredicto : null,
  }
}

/**
 * El veredicto de la última pasada, para el parte de salud. Sin esto la palabra
 * DEGRADADO salía una vez, en el log de la tubería, y la base de la pasada
 * siguiente ya la daba por normal: quien sólo lee el parte no la veía nunca.
 */
export function lineaUltimaPasada(p: Previa | null): string {
  if (!p) return 'última pasada de plenos: sin veredicto guardado'
  return `última pasada de plenos (${p.at.slice(0, 10)}): ${p.veredicto ?? 'sin veredicto guardado'}`
}

/** Cuántos días vale el DEGRADADO de una pasada: la siguiente llega en tres o cuatro. */
export const DIAS_AVISO_PASADA = 5

/**
 * El DEGRADADO de la última pasada como aviso del parte. Sin esto sólo viajaba
 * pegado a un parte que ya tuviera otros avisos: un día sin avisos, o con los
 * mismos de ayer, no salía nada. El código lleva la hora de la pasada, así que
 * cambia la huella y se envía una vez por pasada, no a diario.
 */
export function avisoDePasada(p: Previa | null, ahora: Date): Alert | null {
  if (!p?.veredicto?.startsWith('DEGRADADO')) return null
  const t = Date.parse(p.at)
  if (!Number.isFinite(t) || ahora.getTime() - t > DIAS_AVISO_PASADA * 86_400_000) return null
  return {
    code: `plenos-a-peor:${p.at}`,
    severity: 'warning',
    title: 'La última pasada de plenos fue a peor que la anterior',
    detail: `${p.at.slice(0, 10)}: ${p.veredicto}`,
    remedy:
      'Puede ser una retirada o una re-etiqueta correctas; si no, el log de la tubería ' +
      '(scripts/logs/hallazgos-pipeline.log) y npm run rendimiento:plenos.',
  }
}
