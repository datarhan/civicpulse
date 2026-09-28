/**
 * La revisión automática de una queja antes de publicarla.
 *
 * Desde #137 ninguna queja sale sin que un administrador la decida. Con esto, un
 * modelo la lee antes, sobre el texto que ya limpió services/pii.ts, y puede
 * hacer dos cosas: señalar los fragmentos EXACTOS que nombran a un particular
 * —que se quitan del texto guardado, como hace pii.ts: lo quitado no se guarda
 * en el bot— y decir por qué motivos, de una lista cerrada
 * (services/moderacion-criterios.ts), tiene que verla una persona. No reescribe
 * nada.
 *
 * El código decide lo demás. Una respuesta que no se sostiene —un fragmento que
 * no está en el texto, un motivo que no existe, un campo que falta— no se
 * arregla ni se completa: la revisión es `invalida` y se reintenta, igual que un
 * error. Una queja sin motivos se publica sola sólo si `decideAutomation`
 * (src/scraper/automation-policy.ts) lo permite con lo medido; si no, la decide
 * una persona, que la tiene ya en su tarjeta. En periodo electoral no se publica
 * ninguna sin una persona.
 */
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Db } from '../db/client.ts'
import { anotarRevision, quejasSinRevisar, type QuejaSinRevisar } from '../db/queries.ts'
import {
  decideAutomation,
  loadMeasurements,
  type Measurement,
} from '../../../src/scraper/automation-policy.ts'
import {
  actualizarTarjetas,
  avisarRevisionAtascada,
  completarSeguimiento,
  type EnvioAdmin,
} from './avisos-admin.ts'
import { isLoregFrozen } from './freeze.ts'
import type { EstadoRevision } from './health.ts'
import { MARCA_RETIRADO } from './pii.ts'
import {
  AVISO_TRAS_FALLOS,
  AVISO_TRAS_HORAS,
  ESPERAS_REINTENTO_MIN,
  ESQUEMA_RESPUESTA,
  MAX_RECORTE,
  MODELO_POR_DEFECTO,
  MOTIVOS_DEL_MODELO,
  VERSION_PROMPT,
  clasePublicacion,
  pideInstrucciones,
  promptDeRevision,
  revisionDisponible,
  type MotivoRetencion,
} from './moderacion-criterios.ts'
import { pedirRepublicacion, type PeticionRepublicar } from './republicar.ts'
import { loadOfficials } from './router.ts'
import { logger } from '../util/log.ts'

const HERE = dirname(fileURLToPath(import.meta.url))

/** El texto de una queja, como se guarda y como se publica. */
export interface TextoQueja {
  titulo: string
  detalle: string
}

/** Una revisión con respuesta que se sostiene: lo que dijo, y el texto como queda. */
export interface RevisionValida {
  resultado: 'limpia' | 'marcada'
  motivos: MotivoRetencion[]
  /** Cuántos fragmentos se quitaron del texto. */
  retirados: number
  texto: TextoQueja
}

/** Una revisión que no dio respuesta que se sostenga: se reintenta. */
export interface RevisionFallida {
  resultado: 'invalida' | 'error'
  /** Un código corto; nunca el texto de la queja ni el cuerpo de una respuesta. */
  error: string
}

export type Revision = RevisionValida | RevisionFallida

const esMotivoDelModelo = (m: unknown): m is (typeof MOTIVOS_DEL_MODELO)[number] =>
  typeof m === 'string' && (MOTIVOS_DEL_MODELO as readonly string[]).includes(m)

const invalida = (error: string): RevisionFallida => ({ resultado: 'invalida', error })

const escapar = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Las apariciones SUELTAS de un fragmento: «Ana», no dentro de «Mariana». */
const suelto = (fragmento: string) =>
  new RegExp(`(?<![\\p{L}\\p{N}])${escapar(fragmento)}(?![\\p{L}\\p{N}])`, 'gu')

/**
 * Quita las apariciones sueltas de un fragmento, sin tocar las marcas que ya
 * había: se trabaja entre ellas. Devuelve el texto y cuántas quitó.
 */
function quitar(texto: string, fragmento: string): { texto: string; veces: number } {
  let veces = 0
  const partes = texto.split(MARCA_RETIRADO).map((p) =>
    p.replace(suelto(fragmento), () => {
      veces += 1
      return MARCA_RETIRADO
    }),
  )
  return { texto: partes.join(MARCA_RETIRADO), veces }
}

const aparece = (texto: TextoQueja, fragmento: string) =>
  [texto.titulo, texto.detalle].some((t) =>
    t.split(MARCA_RETIRADO).some((p) => suelto(fragmento).test(p)),
  )

/**
 * Lo que dijo el modelo —el texto JSON de su respuesta—, contra el texto que se
 * le mandó. Pura: sin red y sin base.
 */
export function interpretarRevision(crudo: string, texto: TextoQueja): Revision {
  let r: unknown
  try {
    r = JSON.parse(crudo)
  } catch {
    return invalida('json')
  }
  if (typeof r !== 'object' || r === null || Array.isArray(r)) return invalida('forma')
  const { retirar, motivos } = r as { retirar?: unknown; motivos?: unknown }
  // Un campo que falta no es una lista vacía (regla 3 de docs/DATA_INTEGRITY.md).
  if (!Array.isArray(retirar) || !retirar.every((f) => typeof f === 'string')) {
    return invalida('sin-retirar')
  }
  if (!Array.isArray(motivos)) return invalida('sin-motivos')
  if (!motivos.every(esMotivoDelModelo)) return invalida('motivo-desconocido')

  const fragmentos = [...new Set(retirar.map((f) => f.normalize('NFC').trim()))]
  if (fragmentos.some((f) => f.length < 2)) return invalida('fragmento-vacio')
  // Todos tienen que estar en el texto que se mandó; se quitan de más largo a más
  // corto, y el que otro más largo ya se llevó («Paco» en «Paco García») cuenta.
  if (!fragmentos.every((f) => aparece(texto, f))) return invalida('fragmento-ausente')

  let { titulo, detalle } = texto
  let retirados = 0
  let quitados = 0
  for (const f of [...fragmentos].sort((a, b) => b.length - a.length)) {
    const t = quitar(titulo, f)
    const d = quitar(detalle, f)
    titulo = t.texto
    detalle = d.texto
    retirados += t.veces + d.veces
    quitados += f.length * (t.veces + d.veces)
  }

  const razones: MotivoRetencion[] = [...new Set(motivos)]
  if (quitados / Math.max(1, texto.titulo.length + texto.detalle.length) > MAX_RECORTE) {
    razones.push('recorte-excesivo')
  }
  if (
    !razones.includes('instrucciones') &&
    pideInstrucciones(`${texto.titulo}\n${texto.detalle}`)
  ) {
    razones.push('instrucciones')
  }
  return {
    resultado: razones.length > 0 ? 'marcada' : 'limpia',
    motivos: razones,
    retirados,
    texto: { titulo, detalle },
  }
}

/** Lo que pasa con una queja tras una revisión válida. */
export type DecisionRevision =
  | { hasta: 'publicada' }
  | { hasta: 'retenida'; motivos: MotivoRetencion[] }
  /** Sin motivos, pero la publicación automática no está permitida: la decide una persona. */
  | { hasta: 'pendiente'; razon: string }

/**
 * La política, pura. Con motivos, o en periodo electoral, la queja se retiene
 * para una persona. Sin motivos, se publica sólo si la publicación automática
 * está permitida (`decideAutomation` con la clase de moderacion-criterios.ts).
 */
export function decidirTrasRevision(
  r: RevisionValida,
  o: { congelado: boolean; automatizacion: { allow: boolean; reason: string } },
): DecisionRevision {
  const motivos: MotivoRetencion[] = o.congelado ? [...r.motivos, 'periodo-electoral'] : r.motivos
  if (motivos.length > 0) return { hasta: 'retenida', motivos }
  if (!o.automatizacion.allow) return { hasta: 'pendiente', razon: o.automatizacion.reason }
  return { hasta: 'publicada' }
}

/** Minutos que se espera, tras `fallos` revisiones fallidas seguidas, antes de la siguiente. */
export function esperaTrasFallos(fallos: number): number {
  const i = Math.min(Math.max(fallos, 1), ESPERAS_REINTENTO_MIN.length) - 1
  return ESPERAS_REINTENTO_MIN[i]
}

/** Una llamada al modelo que no dio respuesta. `codigo` se guarda: nunca lleva el cuerpo de la respuesta. */
export class FalloDeRevision extends Error {
  constructor(public readonly codigo: string) {
    super(codigo)
    this.name = 'FalloDeRevision'
  }
}

/** Lo que un servicio que se niega a leer un texto por su contenido dice en `finishReason`. */
const FINES_POR_CONTENIDO = new Set(['SAFETY', 'PROHIBITED_CONTENT', 'BLOCKLIST', 'SPII'])

/**
 * Los filtros de Gemini, abiertos: lo que tiene que ver una persona —una amenaza,
 * un insulto— es justo lo que el modelo tiene que leer para decirlo. Si aun así
 * el servicio se niega, la queja se retiene (`bloqueada`).
 */
const SIN_FILTRO = [
  'HARM_CATEGORY_HARASSMENT',
  'HARM_CATEGORY_HATE_SPEECH',
  'HARM_CATEGORY_SEXUALLY_EXPLICIT',
  'HARM_CATEGORY_DANGEROUS_CONTENT',
].map((category) => ({ category, threshold: 'BLOCK_NONE' }))

export type RespuestaDelModelo =
  { tipo: 'texto'; texto: string } | { tipo: 'bloqueada'; razon: string }

/**
 * Le pregunta al modelo. La clave va en la cabecera y no en la URL (como en
 * photo-anonymize.ts); la queja, entre marcas y como dato, sin su autor ni su
 * barrio. Lanza `FalloDeRevision` si no hay respuesta.
 */
export async function consultarModelo(
  texto: TextoQueja,
  o: {
    env: Record<string, string | undefined>
    fetchImpl?: typeof fetch
    modelo: string
    cargos: readonly string[]
    tiempoMs?: number
  },
): Promise<RespuestaDelModelo> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${o.modelo}:generateContent`
  let res: Response
  try {
    res = await (o.fetchImpl ?? fetch)(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': o.env.GEMINI_API_KEY ?? '' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: promptDeRevision(o.cargos) }] },
        contents: [
          {
            role: 'user',
            parts: [
              { text: `<<<QUEJA\nTítulo: ${texto.titulo}\n\nDetalle: ${texto.detalle}\nQUEJA>>>` },
            ],
          },
        ],
        safetySettings: SIN_FILTRO,
        generationConfig: {
          temperature: 0,
          responseMimeType: 'application/json',
          responseSchema: ESQUEMA_RESPUESTA,
        },
      }),
      signal: AbortSignal.timeout(o.tiempoMs ?? 30_000),
    })
  } catch (err) {
    throw new FalloDeRevision((err as Error)?.name === 'TimeoutError' ? 'tiempo' : 'red')
  }
  if (!res.ok) throw new FalloDeRevision(`HTTP ${res.status}`)
  let json: any
  try {
    json = await res.json()
  } catch {
    throw new FalloDeRevision('respuesta-ilegible')
  }
  const bloqueo = json?.promptFeedback?.blockReason
  if (bloqueo) return { tipo: 'bloqueada', razon: String(bloqueo) }
  const candidata = json?.candidates?.[0]
  const partes: Array<{ text?: unknown; thought?: unknown }> = candidata?.content?.parts ?? []
  const respuesta = partes
    .filter((p) => !p.thought && typeof p.text === 'string')
    .map((p) => p.text as string)
    .join('')
  if (!respuesta && FINES_POR_CONTENIDO.has(candidata?.finishReason)) {
    return { tipo: 'bloqueada', razon: String(candidata.finishReason) }
  }
  if (!respuesta) throw new FalloDeRevision('sin-texto')
  return { tipo: 'texto', texto: respuesta }
}

/** Los cargos electos de hoy, «Nombre (cargo)», de officials.json. */
export function cargosActuales(): string[] {
  return (loadOfficials().officials ?? [])
    .filter((c) => c.name)
    .map((c) => (c.role ? `${c.name} (${c.role})` : c.name))
}

/** Lo medido, de `.automation-measurements.json` en la raíz del repositorio (lo copia la imagen). */
export function medidasActuales(): Measurement[] {
  return loadMeasurements(resolve(HERE, '..', '..', '..', '.automation-measurements.json'))
}

export interface DepsRevision {
  db: Db
  env: Record<string, string | undefined>
  envio: EnvioAdmin
  admins: () => number[]
  fetchImpl?: typeof fetch
  /** Por defecto, `cargosActuales`. */
  cargos?: () => string[]
  /** Por defecto, `medidasActuales`. */
  medidas?: () => Measurement[]
  /** Por defecto, el bloqueo LOREG de promises.json. */
  congelado?: () => boolean
  republicar?: () => Promise<PeticionRepublicar>
  ahora?: () => Date
}

/** Lo que hizo una pasada, contado por separado (regla 2 de docs/DATA_INTEGRITY.md). */
export interface ResultadoPasada {
  /** Si no pudo correr, lo que falta. */
  apagada?: 'GEMINI_API_KEY' | 'GEMINI_NIVEL'
  /** Pendientes sin una revisión válida. */
  porRevisar: number
  /** Las que esperan la hora de su reintento. */
  esperando: number
  /** Las que tocaba revisar y se quedan para la pasada siguiente, por el tope. */
  aplazadas: number
  intentadas: number
  limpias: number
  marcadas: number
  invalidas: number
  errores: number
  publicadas: number
  retenidas: number
  /** Limpias que no puede publicar sola: las decide una persona. */
  aUnaPersona: number
  /** Revisiones válidas de quejas que una persona o su autor decidieron mientras tanto. */
  sinAplicar: number
  /** Quejas cuya revisión atascada se avisó en esta pasada. */
  avisadas: number
}

const msDe = (sqlite: string) => Date.parse(`${sqlite.replace(' ', 'T')}Z`)

function esAtascada(c: QuejaSinRevisar, ahora: Date): boolean {
  if (c.fallos >= AVISO_TRAS_FALLOS) return true
  return (
    c.primer_fallo !== null &&
    ahora.getTime() - msDe(c.primer_fallo) >= AVISO_TRAS_HORAS * 3_600_000
  )
}

async function republicar(d: DepsRevision, id: string): Promise<void> {
  const p = await (d.republicar ?? pedirRepublicacion)()
  if (p !== 'pedida') logger.warn('moderacion.republicar', { queja: id, peticion: p })
}

const CONTADOR = {
  limpia: 'limpias',
  marcada: 'marcadas',
  invalida: 'invalidas',
  error: 'errores',
} as const

async function revisarUna(
  d: DepsRevision,
  c: QuejaSinRevisar,
  ahora: Date,
  r: ResultadoPasada,
): Promise<void> {
  const enviado: TextoQueja = { titulo: c.title, detalle: c.detail }
  const modelo = d.env.GEMINI_MODERACION_MODEL?.trim() || MODELO_POR_DEFECTO
  let revision: Revision
  try {
    const resp = await consultarModelo(enviado, {
      env: d.env,
      fetchImpl: d.fetchImpl,
      modelo,
      cargos: (d.cargos ?? cargosActuales)(),
    })
    revision =
      resp.tipo === 'bloqueada'
        ? { resultado: 'marcada', motivos: ['bloqueada'], retirados: 0, texto: enviado }
        : interpretarRevision(resp.texto, enviado)
  } catch (err) {
    revision = { resultado: 'error', error: err instanceof FalloDeRevision ? err.codigo : 'fallo' }
    logger.warn('moderacion.revision', { queja: c.id, err: String(err) })
  }
  r[CONTADOR[revision.resultado]] += 1

  let decision: DecisionRevision | null = null
  if (revision.resultado === 'limpia' || revision.resultado === 'marcada') {
    const congelado = (d.congelado ?? isLoregFrozen)()
    decision = decidirTrasRevision(revision, {
      congelado,
      automatizacion: decideAutomation(
        clasePublicacion(congelado),
        (d.medidas ?? medidasActuales)(),
        ahora,
      ),
    })
  }
  const a = anotarRevision(d.db, c.id, {
    revision,
    enviado,
    modelo,
    version: VERSION_PROMPT,
    decision,
    cuando: ahora,
  })
  if (!a.anotada) return
  if (decision && a.hasta === null) r.sinAplicar += 1
  if (a.hasta === 'publicada') {
    r.publicadas += 1
    await completarSeguimiento(d.db, c.id, { envio: d.envio })
    await republicar(d, c.id)
  } else if (a.hasta === 'retenida' || a.hasta === 'pendiente') {
    if (a.hasta === 'retenida') r.retenidas += 1
    else r.aUnaPersona += 1
    await actualizarTarjetas(d.db, c.id, { envio: d.envio })
  } else if (a.recortada) {
    // Una persona decidió mientras el modelo leía: su decisión se queda, pero el
    // nombre sale, y si ya era pública, la web tiene que volver a publicarse.
    await actualizarTarjetas(d.db, c.id, { envio: d.envio })
    if (a.moderacion === 'publicada') await republicar(d, c.id)
  }
}

/**
 * Una pasada: revisa las quejas que esperan y a las que les toca —la primera
 * vez, en cuanto llegan; tras un fallo, a su hora—, como mucho `max`, y avisa una
 * vez a quien modera de las que no avanzan.
 */
export async function pasadaDeRevision(
  d: DepsRevision,
  o: { max?: number } = {},
): Promise<ResultadoPasada> {
  const ahora = (d.ahora ?? (() => new Date()))()
  const r: ResultadoPasada = {
    porRevisar: 0,
    esperando: 0,
    aplazadas: 0,
    intentadas: 0,
    limpias: 0,
    marcadas: 0,
    invalidas: 0,
    errores: 0,
    publicadas: 0,
    retenidas: 0,
    aUnaPersona: 0,
    sinAplicar: 0,
    avisadas: 0,
  }
  const candidatas = quejasSinRevisar(d.db)
  r.porRevisar = candidatas.length
  const disponible = revisionDisponible(d.env)
  if (!disponible.ok) return { ...r, apagada: disponible.falta }

  const max = o.max ?? 5
  for (const c of candidatas) {
    const toca =
      c.fallos === 0 ||
      ahora.getTime() >= msDe(c.ultimo_fallo!) + esperaTrasFallos(c.fallos) * 60_000
    if (!toca) r.esperando += 1
    else if (r.intentadas >= max) r.aplazadas += 1
    else {
      r.intentadas += 1
      await revisarUna(d, c, ahora, r)
    }
  }

  for (const c of quejasSinRevisar(d.db)) {
    if (!esAtascada(c, ahora)) continue
    const avisados = await avisarRevisionAtascada(d.db, c.id, {
      admins: d.admins(),
      envio: d.envio,
      fallos: c.fallos,
      error: c.ultimo_error,
    })
    if (avisados > 0) {
      r.avisadas += 1
      await actualizarTarjetas(d.db, c.id, { envio: d.envio })
    }
  }
  return r
}

/** Cómo va la revisión automática, para /health. */
export function estadoRevision(
  db: Db,
  env: Record<string, string | undefined>,
  ahora = new Date(),
): EstadoRevision {
  const disponible = revisionDisponible(env)
  const candidatas = quejasSinRevisar(db)
  return {
    disponible: disponible.ok,
    ...(disponible.ok ? {} : { falta: disponible.falta }),
    porRevisar: candidatas.length,
    atascadas: disponible.ok ? candidatas.filter((c) => esAtascada(c, ahora)).length : 0,
  }
}

const MINUTO_MS = 60_000

/**
 * Cada minuto, una pasada: una queja nueva se revisa en cuanto llega, sin que
 * quien la escribe espere. Una pasada no se solapa con la anterior.
 */
export function startRevisionCron(d: DepsRevision): () => void {
  let enMarcha = false
  const tick = async () => {
    if (enMarcha) return
    enMarcha = true
    try {
      const r = await pasadaDeRevision(d)
      if (r.intentadas > 0 || r.avisadas > 0) logger.info('moderacion.pasada', { ...r })
    } catch (err) {
      logger.error('moderacion.pasada', { err: String(err) })
    } finally {
      enMarcha = false
    }
  }
  void tick()
  const handle = setInterval(() => void tick(), MINUTO_MS)
  return () => clearInterval(handle)
}

/** Cómo se revisa hoy una queja nueva: lo que se le dice a quien la escribe. */
export type ComoSeRevisa = 'automatica' | 'persona-tras-lectura' | 'persona'

/**
 * `automatica`: la revisión corre y puede publicar sola lo que no retiene;
 * `persona-tras-lectura`: corre, pero la publicación automática no está
 * permitida —sin medición, o en periodo electoral— y decide una persona;
 * `persona`: no corre.
 */
export function comoSeRevisa(
  d: Pick<DepsRevision, 'env' | 'medidas' | 'congelado' | 'ahora'>,
): ComoSeRevisa {
  if (!revisionDisponible(d.env).ok) return 'persona'
  const congelado = (d.congelado ?? isLoregFrozen)()
  const permitida = decideAutomation(
    clasePublicacion(congelado),
    (d.medidas ?? medidasActuales)(),
    (d.ahora ?? (() => new Date()))(),
  ).allow
  return permitida ? 'automatica' : 'persona-tras-lectura'
}
