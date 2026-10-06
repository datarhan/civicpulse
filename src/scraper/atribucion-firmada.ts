/**
 * La atribución firmada: el grupo de quien habla en una declaración, escrito
 * por una persona que escuchó la sesión o, si no la escuchó, que lo dice en su
 * motivo (lo firma desde la transcripción y su propia identificación del grupo).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POR QUÉ UN QUINTO ESTRATO
 *
 * El overlay manda sobre el veredicto, las reclasificaciones sobre el tipo y los
 * reanclajes sobre el literal (verified-merge.ts). `speakerGroup` sólo vivía en
 * la base, que es gitignorada y reproducible, y la única CLI que lo toca,
 * `retract-attribution`, sólo sabe escribir `null` —por contrato: escribir un
 * grupo es una afirmación nueva sobre alguien—.
 *
 * La PR #218 llevó al registro de declaraciones las correcciones de atribución
 * de /hallazgos, y siete re-etiquetaban con prueba: el segundo de la grabación y
 * la frase con que la presidencia dio la palabra. Las siete quedaron «sin
 * atribuir» mientras su ficha decía el grupo bueno. Escribirlo en la base no
 * servía: una re-extracción lo borra, no guarda quién firmó, y
 * `carry:attribution` no distingue una firma de una adivinanza (472064bd).
 *
 * Diseño y decisiones del operador:
 * docs/superpowers/specs/2026-10-04-atribucion-firmada-design.md.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LO QUE NO DEJA ESCRIBIR
 *
 *  · Una firma que no es de una persona (`rechazoDeFirma`): ni la cuenta de rol,
 *    ni un modelo, ni el hueco de una orden sin rellenar.
 *  · Un grupo de un solo escaño, que nombra a su concejal por eliminación
 *    (nivel C, `decideAutomation({ namesIndividual: true })`), ni uno sin
 *    escaños, que no ocupa nadie. Ni un `from` de un escaño: el fichero se sirve
 *    y emparejaría la declaración con ese grupo.
 *  · Un tramo que no contiene las palabras de la declaración.
 *  · Un motivo que reimprime el literal (el fichero se sirve, y la puerta retiene
 *    algunas de estas declaraciones) o que nombra un grupo de un escaño.
 *
 * Y LO QUE NO PUBLICA: una entrada OBSOLETA —la base ya no dice `from`, el
 * literal cambió bajo el mismo id o el tramo ya no lo contiene— nunca publica un
 * grupo que contradiga la firma. Si la base pasó al grupo firmado, se queda; si
 * dice otro o ninguno, la declaración sale sin grupo. Es una bajada, de las que
 * corren sin nadie (nivel A).
 *
 * Puro: sin disco y sin reloj. Quien llama lee las transcripciones y
 * officials.json, y pasa la fecha.
 */
import { findPartiesInText } from '../lib/party-alias'
import { charlaDeTarea } from './charla-de-tarea'
import { seatsFromOfficials, singleSeatBlocs, type OfficialsDoc } from './corporation-seats'
import { rechazoDeFirma } from './firma-de-persona'
import { sha256Short } from './hash'
import type { PlenoClaim } from './pleno-claim'
import { SPEAKER_GROUPS, type SpeakerGroup } from './pleno-votes'
import { quoteAppearsIn } from './quote-match'
import { parseTimestampedSegments } from './quote-reanchor'
import type { VerifiedItem } from './verified-merge'

/** El tramo de la grabación que escuchó quien firma, en segundos. */
export interface TramoEscuchado {
  desde: number
  hasta: number
}

/** Una atribución firmada. `from` y `literal` fijan el estado de la BASE al firmarse. */
export interface AtribucionFirmada {
  /** El grupo firmado: siempre uno con varios escaños. */
  speakerGroup: string
  /** Lo que decía la base al firmarse. Si deja de decirlo, la entrada es obsoleta. */
  from: string | null
  /** La huella del literal de la base (`huellaDeLiteralFirmado`), nunca su texto. */
  literal: string
  segundos: TramoEscuchado
  /** La transcripción donde constan las palabras dentro del tramo. */
  fuente: string
  /** Cómo se sabe quién habla. Se sirve: sin el literal y sin grupos de un escaño. */
  reason: string
  /** Una persona, con su nombre. */
  editor: string
  appliedAt: string
}

export interface AtribucionesFirmadas {
  version: number
  generatedAt: string
  entries: Record<string, AtribucionFirmada>
}

/** Con qué composición se juzga: la deriva de officials.json quien llama. */
export interface Escanos {
  unEscano: readonly string[]
  variosEscanos: readonly string[]
}

/**
 * Los grupos de un escaño y los de varios, de la composición publicada; `null`
 * si el documento no la trae. Las dos respuestas no se pliegan: con listas
 * vacías, «¿nombra esto a alguien por eliminación?» contestaría «no» sin haber
 * mirado nada (DATA_INTEGRITY, regla 2). Un grupo sin escaños no está en
 * ninguna de las dos.
 */
export function escanosDe(doc: OfficialsDoc | null | undefined): Escanos | null {
  const seats = seatsFromOfficials(doc ?? {})
  if (seats.length === 0) return null
  const enum_ = SPEAKER_GROUPS as readonly string[]
  return {
    unEscano: singleSeatBlocs(seats),
    variosEscanos: seats.filter((s) => s.seats >= 2 && enum_.includes(s.bloc)).map((s) => s.bloc),
  }
}

export const HUELLA_DE_LITERAL_FIRMADO_RE = /^literal firmado · sha256:[0-9a-f]{12}$/

/** La receta de las huellas de pleno-finding.ts, con su etiqueta. */
export function huellaDeLiteralFirmado(verbatim: string): string {
  return `literal firmado · sha256:${sha256Short(JSON.stringify(verbatim))}`
}

const MOTIVO_MINIMO = 20
/** La ventana con que la retirada de una declaración mide si un motivo la cita. */
const PALABRAS_DE_CITA = 6
const FECHA_ISO = /^\d{4}-\d{2}-\d{2}/
const FUENTE_RE = /^(current|superseded\/.+)$/

const esTramo = (t: unknown): t is TramoEscuchado => {
  const s = t as Partial<TramoEscuchado> | null
  return (
    !!s &&
    typeof s.desde === 'number' &&
    typeof s.hasta === 'number' &&
    Number.isFinite(s.desde) &&
    Number.isFinite(s.hasta) &&
    s.desde >= 0 &&
    s.desde < s.hasta
  )
}

/**
 * Por qué no se puede firmar este grupo, o `null`. El de un escaño no se nombra
 * en el mensaje: un registro de la CI es público, y «tal declaración · tal
 * grupo» es justo lo que esto existe para no publicar.
 */
function rechazoDeGrupo(grupo: unknown, escanos: Escanos): string | null {
  if (typeof grupo !== 'string' || grupo === '') return 'no nombra ningún grupo'
  if (escanos.unEscano.includes(grupo)) {
    return (
      'es un grupo de un solo escaño: nombraría a su concejal por eliminación, y eso lo firma ' +
      'un curador por hallazgo (nivel C), no esta vía'
    )
  }
  if (!escanos.variosEscanos.includes(grupo)) {
    return `«${grupo}» no es un grupo con varios escaños en la corporación (officials.json): sin escaños no lo ocupa nadie`
  }
  return null
}

function rechazoDeMotivo(motivo: unknown, escanos: Escanos): string | null {
  if (typeof motivo !== 'string' || motivo.trim().length < MOTIVO_MINIMO) {
    return `el motivo tiene que decir cómo se sabe quién habla, en ≥${MOTIVO_MINIMO} caracteres`
  }
  const charla = charlaDeTarea(motivo)
  if (charla) return `el motivo habla de la tarea del modelo (${charla}), no de la sesión`
  if (findPartiesInText(motivo).some((g: string) => escanos.unEscano.includes(g))) {
    return (
      'el motivo nombra un grupo de un solo escaño, y el fichero se sirve: di cómo se sabe ' +
      'quién habla sin nombrarlo'
    )
  }
  return null
}

const firmaNormalizada = (editor: string) => editor.normalize('NFC').replace(/\s+/g, ' ').trim()

/** Lo que se le dice a quien firma un motivo que cita la declaración. */
export const MOTIVO_QUE_CITA =
  'el motivo reimprime el literal de la declaración, y el fichero se sirve: di cómo se sabe ' +
  'quién habla sin citarlo'

/**
 * ¿Reimprime el motivo alguno de estos literales? La ventana de seis palabras
 * con que la retirada de una declaración (verified-merge.ts) mide lo mismo. Lo
 * pregunta la CLI al firmar y la recomposición al leer: el validador sólo tiene
 * la huella del literal, no su texto.
 */
export function motivoCitaElLiteral(motivo: string, literales: Iterable<string>): boolean {
  for (const literal of new Set(literales)) {
    if (literal && quoteAppearsIn(literal, motivo, PALABRAS_DE_CITA)) return true
  }
  return false
}

/**
 * Revienta con un fichero mal formado. Se llama al ESCRIBIR y al LEER, como sus
 * tres hermanos de verified-merge.ts: un fichero editado a mano no puede mover lo
 * que la CLI no movería. Sin entradas no hace falta la composición; con
 * entradas y sin ella, falla cerrado.
 */
export function validarAtribucionesFirmadas(
  doc: AtribucionesFirmadas,
  escanos: Escanos | null,
): void {
  if (!doc || typeof doc.version !== 'number' || !doc.entries || typeof doc.entries !== 'object') {
    throw new Error('[relabel] mal formado: falta version o entries')
  }
  const entradas = Object.entries(doc.entries)
  if (entradas.length === 0) return
  if (escanos === null) {
    throw new Error(
      '[relabel] sin la composición de la corporación (officials.json) no se sabe qué grupo ' +
        'tiene un solo escaño: no se aplica ninguna atribución firmada',
    )
  }
  for (const [id, e] of entradas) {
    const donde = `[relabel] ${id}`
    if (!e || typeof e !== 'object') throw new Error(`${donde}: la entrada no es un objeto`)
    if ('requiresHumanApproval' in e) {
      throw new Error(
        `${donde}: lleva requiresHumanApproval — es una sugerencia que espera firma, no una firma`,
      )
    }
    const firma = rechazoDeFirma(e.editor)
    if (firma) throw new Error(`${donde}: la firma tiene que ser de una persona: ${firma}`)
    const grupo = rechazoDeGrupo(e.speakerGroup, escanos)
    if (grupo) throw new Error(`${donde}: el grupo firmado ${grupo}`)
    if (e.from !== null) {
      if (typeof e.from !== 'string' || !(SPEAKER_GROUPS as readonly string[]).includes(e.from)) {
        throw new Error(`${donde}: from tiene que ser un grupo de SPEAKER_GROUPS o null`)
      }
      if (escanos.unEscano.includes(e.from)) {
        throw new Error(
          `${donde}: from es un grupo de un solo escaño, y el fichero se sirve: retíralo antes ` +
            'con `npm run retract-attribution` y firma desde ninguno',
        )
      }
    }
    if (e.from === e.speakerGroup) {
      throw new Error(`${donde}: from ya es el grupo firmado; no se re-etiqueta nada`)
    }
    if (typeof e.literal !== 'string' || !HUELLA_DE_LITERAL_FIRMADO_RE.test(e.literal)) {
      throw new Error(
        `${donde}: el literal va como huella (literal firmado · sha256:<12 hex>), nunca su texto`,
      )
    }
    if (!esTramo(e.segundos)) {
      throw new Error(
        `${donde}: los segundos tienen que ser un tramo { desde, hasta }, numéricos y con 0 ≤ desde < hasta`,
      )
    }
    if (typeof e.fuente !== 'string' || !FUENTE_RE.test(e.fuente)) {
      throw new Error(
        `${donde}: fuente dice en qué transcripción constan las palabras (current o superseded/<fichero>)`,
      )
    }
    const motivo = rechazoDeMotivo(e.reason, escanos)
    if (motivo) throw new Error(`${donde}: ${motivo}`)
    if (
      typeof e.appliedAt !== 'string' ||
      !FECHA_ISO.test(e.appliedAt) ||
      Number.isNaN(Date.parse(e.appliedAt))
    ) {
      throw new Error(`${donde}: appliedAt tiene que ser una fecha ISO`)
    }
  }
}

/** Lo que pide una orden `relabel-attribution`. */
export interface FirmaPedida {
  claimId: string
  grupo: string
  desde: number
  hasta: number
  motivo: string
  editor: string
}

/** Lo que la CLI sabe de la declaración que se firma. */
export interface DeclaracionAFirmar {
  /** En la BASE: contra ella se mide después si la entrada sigue vigente. */
  base: { speakerGroup: string | null; verbatim: string; speakerSlug?: string | null }
  /** Publicada: su literal es el que se escuchó (un reanclaje puede cambiarlo). */
  publicada: { verbatim: string }
  /** Dónde constan sus palabras dentro del tramo (`fuenteDelTramo`), o `null`. */
  fuente: string | null
}

/**
 * Añade (o reemplaza) la entrada de una declaración. Puro: devuelve un fichero
 * nuevo, validado entero.
 */
export function firmarAtribucion(
  doc: AtribucionesFirmadas,
  pedida: FirmaPedida,
  declaracion: DeclaracionAFirmar,
  escanos: Escanos | null,
  stampIso: string,
): AtribucionesFirmadas {
  const donde = `[relabel] ${pedida.claimId}`
  if (escanos === null) {
    throw new Error(
      `${donde}: sin la composición de la corporación (officials.json) no se firma nada: no se ` +
        'sabe qué grupo tiene un solo escaño',
    )
  }
  const firma = rechazoDeFirma(pedida.editor)
  if (firma) throw new Error(`${donde}: la firma tiene que ser de una persona: ${firma}`)
  const grupo = rechazoDeGrupo(pedida.grupo, escanos)
  if (grupo) throw new Error(`${donde}: el grupo pedido ${grupo}`)

  const { base } = declaracion
  if (base.speakerSlug) {
    throw new Error(
      `${donde}: la declaración nombra a un concejal (speakerSlug); esta vía firma grupos, no personas`,
    )
  }
  const desdeLaBase = base.speakerGroup ?? null
  if (desdeLaBase !== null && escanos.unEscano.includes(desdeLaBase)) {
    throw new Error(
      `${donde}: la base lleva un grupo de un solo escaño; retíralo antes con ` +
        '`npm run retract-attribution` y firma desde ninguno',
    )
  }
  if (desdeLaBase === pedida.grupo) {
    throw new Error(`${donde}: la base ya dice ese grupo; no hay nada que firmar`)
  }

  const segundos = { desde: pedida.desde, hasta: pedida.hasta }
  if (!esTramo(segundos)) {
    throw new Error(`${donde}: los segundos tienen que ser un tramo, con 0 ≤ desde < hasta`)
  }
  if (declaracion.fuente === null) {
    throw new Error(
      `${donde}: las palabras de la declaración no constan en ninguna transcripción de la sesión ` +
        `entre los segundos ${segundos.desde} y ${segundos.hasta}: el tramo firmado tiene que contenerlas`,
    )
  }

  const motivo = (pedida.motivo ?? '').trim()
  const malMotivo = rechazoDeMotivo(motivo, escanos)
  if (malMotivo) throw new Error(`${donde}: ${malMotivo}`)
  if (motivoCitaElLiteral(motivo, [base.verbatim, declaracion.publicada.verbatim])) {
    throw new Error(`${donde}: ${MOTIVO_QUE_CITA}`)
  }
  if (!FECHA_ISO.test(stampIso) || Number.isNaN(Date.parse(stampIso))) {
    throw new Error(`${donde}: la fecha de la firma tiene que ser ISO («${stampIso}»)`)
  }

  const entrada: AtribucionFirmada = {
    speakerGroup: pedida.grupo,
    from: desdeLaBase,
    literal: huellaDeLiteralFirmado(base.verbatim),
    segundos,
    fuente: declaracion.fuente,
    reason: motivo,
    editor: firmaNormalizada(pedida.editor),
    appliedAt: stampIso,
  }
  const next: AtribucionesFirmadas = {
    version: doc?.version ?? 1,
    generatedAt: stampIso,
    entries: { ...(doc?.entries ?? {}), [pedida.claimId]: entrada },
  }
  validarAtribucionesFirmadas(next, escanos)
  return next
}

/** Lo que pide `relabel-attribution --retirar`. */
export interface RetiradaDeFirmaPedida {
  claimId: string
  motivo: string
  editor: string
}

/**
 * Quita la entrada de una declaración. Es la única salida: el gancho de ficheros
 * curados deniega editarlo a mano. El motivo va al cuerpo del commit, que es el
 * registro, como en `retract-attribution`.
 */
export function retirarAtribucionFirmada(
  doc: AtribucionesFirmadas,
  pedida: RetiradaDeFirmaPedida,
  stampIso: string,
): AtribucionesFirmadas {
  const donde = `[relabel] ${pedida.claimId}`
  const firma = rechazoDeFirma(pedida.editor)
  if (firma) throw new Error(`${donde}: una retirada la firma una persona: ${firma}`)
  if ((pedida.motivo ?? '').trim().length < MOTIVO_MINIMO) {
    throw new Error(
      `${donde}: el motivo de la retirada tiene que tener ≥${MOTIVO_MINIMO} caracteres`,
    )
  }
  if (!doc?.entries?.[pedida.claimId]) {
    throw new Error(`${donde}: no hay ninguna atribución firmada que retirar`)
  }
  const { [pedida.claimId]: _retirada, ...resto } = doc.entries
  return { version: doc.version, generatedAt: stampIso, entries: resto }
}

/**
 * ¿Constan las palabras de la declaración en el tramo firmado? Devuelve la
 * primera transcripción, en el orden en que se dan, que las contiene entre esos
 * segundos, o `null`.
 *
 * Lee las dos formas de línea: la vigente, con hablante, y la de las sustituidas
 * viejas, en tramos de 30 s sin él (`parseTimestampedSegments`); medido el
 * 04-10-2026, cinco de las siete declaraciones que trajeron esto sólo constan en
 * una sustituida de esa forma. El emparejador es el de la procedencia
 * (`quoteAppearsIn`): la pregunta es dónde está la declaración, no si se citó
 * entera.
 */
export function fuenteDelTramo(
  verbatim: string,
  textos: ReadonlyArray<{ fuente: string; texto: string }>,
  segundos: TramoEscuchado,
): string | null {
  for (const { fuente, texto } of textos) {
    const enElTramo = parseTimestampedSegments(texto)
      .filter((s) => s.endSeconds >= segundos.desde && s.startSeconds <= segundos.hasta)
      .map((s) => s.text)
      .join(' ')
    if (enElTramo && quoteAppearsIn(verbatim, enElTramo)) return fuente
  }
  return null
}

/** Por qué una entrada ya no se aplica. Se exporta; nadie lo recita. */
export const PORQUES_DE_OBSOLETA = ['grupo', 'literal', 'tramo'] as const

export type PorQueObsoleta = (typeof PORQUES_DE_OBSOLETA)[number]

function porQueObsoleta(
  base: { speakerGroup?: string | null; verbatim: string },
  entrada: AtribucionFirmada,
  tramoPerdido: boolean,
): PorQueObsoleta | null {
  if ((base.speakerGroup ?? null) !== entrada.from) return 'grupo'
  if (huellaDeLiteralFirmado(base.verbatim) !== entrada.literal) return 'literal'
  if (tramoPerdido) return 'tramo'
  return null
}

/**
 * La declaración con su atribución firmada, para `mergeVerified`.
 *
 * Se juzga contra la declaración de la BASE (`base`), y se escribe sobre la ya
 * corregida por los otros estratos (`claim`): un reanclaje cambia el literal
 * publicado, pero la entrada se firmó sobre la base y contra ella se mide.
 *
 * Vigente: el grupo firmado y la marca `atribucionFirmada`. Obsoleta: nunca un
 * grupo que contradiga la firma —el de la base si es el firmado; si no, ninguno—.
 */
export function conAtribucionFirmada(
  base: PlenoClaim,
  claim: PlenoClaim,
  entrada: AtribucionFirmada | undefined,
  tramoPerdido: boolean,
): PlenoClaim {
  if (!entrada) return claim
  if (porQueObsoleta(base, entrada, tramoPerdido) === null) {
    return {
      ...claim,
      speakerGroup: entrada.speakerGroup as SpeakerGroup,
      atribucionFirmada: { desde: entrada.segundos.desde, hasta: entrada.segundos.hasta },
    }
  }
  const deLaBase = base.speakerGroup ?? null
  if (deLaBase === null || deLaBase === entrada.speakerGroup) return claim
  return { ...claim, speakerGroup: null }
}

/**
 * Qué hizo la composición con cada entrada: aplicada, obsoleta con su porqué o
 * sin declaración en la base, contadas aparte (DATA_INTEGRITY, regla 2).
 */
export function desenlacesDeAtribucionFirmada(
  baseItems: VerifiedItem[],
  doc: AtribucionesFirmadas,
  tramoPerdido?: ReadonlySet<string>,
): {
  aplicadas: string[]
  obsoletas: Array<{ id: string; porque: PorQueObsoleta }>
  sinClaim: string[]
} {
  const byId = new Map(baseItems.map((it) => [it.claim.id, it]))
  const aplicadas: string[] = []
  const obsoletas: Array<{ id: string; porque: PorQueObsoleta }> = []
  const sinClaim: string[] = []
  for (const [id, e] of Object.entries(doc?.entries ?? {})) {
    const item = byId.get(id)
    if (item == null) {
      sinClaim.push(id)
      continue
    }
    const porque = porQueObsoleta(item.claim, e, tramoPerdido?.has(id) ?? false)
    if (porque === null) aplicadas.push(id)
    else obsoletas.push({ id, porque })
  }
  return { aplicadas, obsoletas, sinClaim }
}

/** ¿Lleva esta declaración publicada una atribución firmada aplicada? */
export function tieneAtribucionFirmada(claim: { atribucionFirmada?: unknown } | null): boolean {
  return claim?.atribucionFirmada != null
}
