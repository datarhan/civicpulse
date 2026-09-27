/**
 * La pasada que anonimiza las fotos de las quejas, cada hora, en el servidor del bot.
 *
 * Hasta ahora sólo existía como `npm run process-photos`, a mano, y a mano no la
 * lanzaba nadie. Tampoco podía lanzarse bien en ningún sitio: en el portátil leía
 * una copia de la base de agosto, así que no veía ni las fotos nuevas ni las quejas
 * retiradas, y en Fly no había clave de visión. Aquí corre contra la base de
 * producción y escribe en el volumen (`QUEJAS_PHOTOS_DIR`), de donde el export las
 * enlaza y la actualización de la web las trae (`scripts/fotos-quejas.mjs`).
 *
 * Sin `QUEJAS_PHOTOS_DIR` no se arma. Fuera del volumen la carpeta por defecto está
 * junto a la base que haya a mano, y podar allí contra una copia vieja es justo el
 * defecto al que esto sustituye.
 *
 * No se pausa con el bloqueo LOREG: no escribe sobre cargos electos ni difunde nada,
 * anonimiza las fotos que la web publica en su siguiente actualización.
 */
import { resolve } from 'node:path'
import type { Db } from '../db/client.ts'
import { getQuejaViva, marcarFotoRetenidaAvisada, type FotoRetenida } from '../db/queries.ts'
import { escaparHtml } from '../util/html.ts'
import { logger } from '../util/log.ts'
import { chooseVisionBackend } from './photo-anonymize.ts'
import { processPhotos, type ProcessDeps, type ProcessResult } from './process-photos.ts'

const HORA_MS = 60 * 60 * 1000

export interface OpcionesPasada {
  db: Db
  token: string | undefined
  photosDir: string
  env?: Record<string, string | undefined>
  /** Inyectado en las pruebas; por defecto, la pasada de verdad. */
  procesar?: (deps: ProcessDeps) => Promise<ProcessResult>
  /** A quién avisar de las fotos que llevan un día retenidas (`ADMIN_USER_IDS`). */
  admins?: () => number[]
  /** Un DM en HTML de Telegram. Si falla, lanza. */
  sendDm?: (userId: number, textoHtml: string) => Promise<void>
  /** Inyectado en las pruebas; por defecto, el reloj. */
  ahora?: () => Date
  log?: (linea: string) => void
}

const logPorDefecto = (linea: string) => logger.info('fotos', { linea })

/** Un tic: procesa, poda y lo cuenta. No lanza nunca; `null` si no pudo pasar. */
export async function pasadaDeFotos(o: OpcionesPasada): Promise<ProcessResult | null> {
  const token = o.token ?? ''
  const escribe = o.log ?? logPorDefecto
  // El token del bot va dentro de las URL de Telegram, y un error de red puede traer
  // la URL entera en su mensaje. Da control total del bot: no sale a ningún log.
  const log = (linea: string) => escribe(token ? linea.split(token).join('[token]') : linea)
  if (!token) {
    log('[fotos] sin BOT_TOKEN: no se puede descargar ninguna foto de Telegram')
    return null
  }
  try {
    const r = await (o.procesar ?? processPhotos)({
      db: o.db,
      token,
      photosDir: o.photosDir,
      env: o.env ?? process.env,
      ahora: o.ahora,
      log,
    })
    // Un renglón sólo cuando la pasada hizo algo: «nada» cada hora es ruido.
    if (r.published.length || r.held.length || r.rechazadas.length || r.pruned.length) {
      log(
        `[fotos] pasada · publicadas=${r.published.length} retenidas=${r.held.length} ` +
          `rechazadas=${r.rechazadas.length} ya publicadas=${r.skipped} podadas=${r.pruned.length}`,
      )
    }
    if (r.paraAvisar.length > 0) await avisarRetenidas(o, r.paraAvisar, log)
    return r
  } catch (e) {
    log(`[fotos] la pasada falló: ${e instanceof Error ? e.message : String(e)}`)
    return null
  }
}

/**
 * Las fotos que llevan un día retenidas, por DM a los administradores y UNA vez:
 * se marcan avisadas sólo si el mensaje le llegó al menos a uno. Hasta el
 * 2026-09-27 una foto retenida se reintentaba cada hora para siempre sin que
 * nadie lo supiera.
 */
async function avisarRetenidas(
  o: OpcionesPasada,
  filas: FotoRetenida[],
  log: (linea: string) => void,
): Promise<void> {
  const admins = o.admins?.() ?? []
  if (!o.sendDm || admins.length === 0) {
    log(
      `[fotos] ${filas.length} foto(s) llevan más de un día retenidas y ADMIN_USER_IDS ` +
        'no tiene a quién avisar',
    )
    return
  }
  const texto = textoRetenidas(o.db, filas)
  let llego = false
  for (const a of admins) {
    try {
      await o.sendDm(a, texto)
      llego = true
    } catch (e) {
      log(`[fotos] no se pudo avisar a ${a}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }
  if (!llego) return
  const ahora = (o.ahora ?? (() => new Date()))()
  for (const f of filas) marcarFotoRetenidaAvisada(o.db, f.queja_id, ahora)
}

/** El aviso, en HTML de Telegram: lo que escribió un vecino y el motivo van escapados. */
function textoRetenidas(db: Db, filas: FotoRetenida[]): string {
  const MAX = 20
  const lineas = filas.slice(0, MAX).map((f) => {
    const titulo = getQuejaViva(db, f.queja_id)?.title
    const desde = f.desde.replace('T', ' ').slice(0, 16)
    return (
      `• <code>${escaparHtml(f.queja_id)}</code>` +
      (titulo ? ` · «${escaparHtml(titulo.slice(0, 120))}»` : '') +
      `\n  retenida desde ${desde} UTC · ${f.intentos} intento(s)` +
      `\n  motivo: ${escaparHtml(f.motivo.slice(0, 300))}`
    )
  })
  if (filas.length > MAX) lineas.push(`… y ${filas.length - MAX} más.`)
  return [
    '📷 <b>Fotos retenidas desde hace más de un día</b>',
    'La pasada horaria no ha podido anonimizarlas, así que su queja se publica sin foto. ' +
      'Se sigue intentando cada hora; este aviso no se repite.',
    '',
    ...lineas,
  ].join('\n')
}

export interface OpcionesCronFotos extends Omit<OpcionesPasada, 'photosDir'> {
  /** Inyectado en las pruebas; por defecto `setInterval`. */
  programar?: (tic: () => void, ms: number) => unknown
}

/** Arma el tic horario y pasa ya una vez. Devuelve si quedó armado. */
export function startFotosCron(o: OpcionesCronFotos): boolean {
  const env = o.env ?? process.env
  const log = o.log ?? logPorDefecto
  const carpeta = env.QUEJAS_PHOTOS_DIR?.trim()
  if (!carpeta) {
    log(
      '[fotos] cron sin armar: falta QUEJAS_PHOTOS_DIR. Fuera del volumen la pasada ' +
        'escribiría y podaría contra la base que haya a mano',
    )
    return false
  }
  const photosDir = resolve(carpeta)
  // Un renglón al arrancar que distinga los dos casos: sin clave cada foto se retiene,
  // y eso tiene que leerse en el arranque, no deducirse de un silencio.
  log(
    `[fotos] cron armado · cada hora · ${photosDir} · ` +
      (chooseVisionBackend(env)
        ? 'análisis con Gemini'
        : 'sin GEMINI_API_KEY: cada foto se retiene y no se publica ninguna'),
  )

  // Una pasada con muchas fotos puede durar más que la hora: la siguiente espera.
  let enCurso = false
  const tic = () => {
    if (enCurso) return
    enCurso = true
    void pasadaDeFotos({ ...o, env, photosDir, log }).finally(() => {
      enCurso = false
    })
  }
  const programar = o.programar ?? ((fn: () => void, ms: number) => setInterval(fn, ms))
  tic()
  programar(tic, HORA_MS)
  return true
}
