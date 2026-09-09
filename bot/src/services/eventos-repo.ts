/**
 * Avisos de lo que pasa en el repositorio, por DM a los administradores.
 *
 * POR QUÉ POR SONDEO Y NO DESDE ACTIONS. La casa ya tiene el patrón contrario
 * —`batch-reminder.yml` llama a la API de Telegram desde un workflow— y ese
 * patrón acaba de enseñar su defecto. El 8-09-2026 hubo que BORRAR Y RECREAR el
 * repositorio para cerrar una fuga, y con él se perdieron sus `variables`. El
 * 9-09 se comprobó: `pull-quejas.yml` se ejecutó y salió **skipped**, porque su
 * puerta es `vars.BOT_EXPORT_URL` y esa variable ya no existe. Las quejas
 * llevaban desde entonces sin bajar al sitio y nada lo dijo: en la lista de
 * ejecuciones un trabajo saltado se lee casi igual que uno correcto.
 *
 * Sondear desde el bot no necesita variable ni secreto —el repositorio es
 * público desde el 8-09— así que no hay nada que perder en una recreación. Y no
 * abre un endpoint de entrada, que sería superficie nueva para un aviso interno.
 *
 * QUÉ SE AVISA, y el orden es el del daño:
 *
 *   · `derecho-replica` es lo ÚNICO urgente. Es una obligación legal con plazo:
 *     alguien nombrado en una superficie legalmente material ha respondido. No
 *     enterarse a tiempo no es una molestia, es incumplir el contrato editorial
 *     que el propio sitio publica en `/aviso-legal`.
 *   · PR abiertas y fusionadas, porque aquí las fusiona quien las escribe.
 *   · Workflows fallidos **y saltados**. Lo segundo es la cicatriz de arriba.
 *
 * Un workflow correcto NO avisa. El ruido es lo que enseña a ignorar los avisos,
 * y esa lección ya está pagada en `convocatorias.ts`.
 */
import { logger } from '../util/log.ts'

export type ClaseEvento =
  | 'pr-abierta'
  | 'pr-fusionada'
  | 'derecho-replica'
  | 'workflow-fallido'
  | 'workflow-saltado'

export interface Evento {
  /** Identidad estable del EVENTO, no del objeto: una PR da dos a lo largo de su vida. */
  id: string
  clase: ClaseEvento
  titulo: string
  url: string
  cuando: string
}

export interface AvisoRepo {
  evento: Evento
  texto: string
  urgente: boolean
}

/** Las formas que devuelve la API de GitHub, recortadas a lo que se usa. */
export interface PrGitHub {
  number: number
  title: string
  html_url: string
  state?: string
  merged_at?: string | null
  created_at?: string
}
export interface IssueGitHub {
  number: number
  title: string
  html_url: string
  labels?: { name: string }[]
  created_at?: string
  /** GitHub sirve las PR también por /issues; se descartan por este campo. */
  pull_request?: unknown
}
export interface RunGitHub {
  id: number
  name?: string
  conclusion?: string | null
  event?: string
  html_url: string
  created_at?: string
}

export interface DatosGitHub {
  prs: PrGitHub[]
  issues: IssueGitHub[]
  runs: RunGitHub[]
}

/**
 * Las etiquetas que marcan una respuesta de la persona nombrada. Son las mismas
 * que disparan los workflows de ingesta (`ingest-*-responses.yml`), y por eso se
 * escriben aquí una sola vez: si el aviso mirara otra etiqueta distinta de la
 * que ingiere, avisaría de lo que no llega y callaría de lo que sí.
 */
const ETIQUETAS_REPLICA = ['derecho-replica', 'derecho-réplica']

export function eventosDe(d: DatosGitHub): Evento[] {
  const out: Evento[] = []

  for (const pr of d.prs ?? []) {
    if (pr.merged_at) {
      out.push({
        id: `pr:${pr.number}:fusionada`,
        clase: 'pr-fusionada',
        titulo: pr.title,
        url: pr.html_url,
        cuando: pr.merged_at,
      })
    } else if (pr.state === 'open') {
      out.push({
        id: `pr:${pr.number}:abierta`,
        clase: 'pr-abierta',
        titulo: pr.title,
        url: pr.html_url,
        cuando: pr.created_at ?? '',
      })
    }
  }

  for (const is of d.issues ?? []) {
    // GitHub sirve las PR también por el listado de issues. Sin esto, cada PR
    // contaría dos veces y una con la clase equivocada.
    if (is.pull_request) continue
    const etiquetas = (is.labels ?? []).map((l) => l.name.toLowerCase())
    if (!etiquetas.some((e) => ETIQUETAS_REPLICA.includes(e))) continue
    out.push({
      id: `issue:${is.number}`,
      clase: 'derecho-replica',
      titulo: is.title,
      url: is.html_url,
      cuando: is.created_at ?? '',
    })
  }

  for (const r of d.runs ?? []) {
    const c = (r.conclusion ?? '').toLowerCase()
    if (c === 'failure' || c === 'timed_out') {
      out.push({
        id: `run:${r.id}:fallo`,
        clase: 'workflow-fallido',
        titulo: r.name ?? 'workflow',
        url: r.html_url,
        cuando: r.created_at ?? '',
      })
    } else if (c === 'skipped' && r.event === 'schedule') {
      // Sólo el PROGRAMADO: un salto a mano es la decisión de alguien que
      // estaba delante; éste ocurre de madrugada y no lo mira nadie.
      out.push({
        id: `run:${r.id}:salto`,
        clase: 'workflow-saltado',
        titulo: r.name ?? 'workflow',
        url: r.html_url,
        cuando: r.created_at ?? '',
      })
    }
  }

  return out
}

export function nuevos(eventos: Evento[], yaVistos: Set<string>): Evento[] {
  return eventos.filter((e) => !yaVistos.has(e.id))
}

export function formatear(e: Evento): AvisoRepo {
  const urgente = e.clase === 'derecho-replica'
  const cabecera: Record<ClaseEvento, string> = {
    'derecho-replica': '⚖️ DERECHO DE RÉPLICA — tiene plazo',
    'pr-abierta': '🔵 PR abierta',
    'pr-fusionada': '🟣 PR fusionada',
    'workflow-fallido': '🔴 Workflow FALLIDO',
    'workflow-saltado': '🟡 Workflow SALTADO (programado)',
  }
  const cola: Partial<Record<ClaseEvento, string>> = {
    'derecho-replica':
      '\nUna persona nombrada ha respondido. Se atiende por la CLI de correcciones, no editando la prosa a mano.',
    'workflow-saltado':
      '\nUn salto no es un fallo y no se ve en la lista: suele ser una `vars` o un secreto que ya no existe.',
  }
  return {
    evento: e,
    urgente,
    texto: `${cabecera[e.clase]}\n${e.titulo}\n${e.url}${cola[e.clase] ?? ''}`,
  }
}

export interface CorridaEventos {
  /** Distinto de «no hay novedades»: es el defecto `r?.findings ?? []`. */
  consultado: boolean
  nuevos: number
  enviados: number
  sinAdministradores: boolean
  error?: string
}

export interface OpcionesEventos {
  admins: number[]
  traer: () => Promise<DatosGitHub>
  sendDm: (userId: number, texto: string) => Promise<void>
  yaVistos: Set<string>
  recordar: (id: string) => void
}

export async function runEventosOnce(o: OpcionesEventos): Promise<CorridaEventos> {
  let datos: DatosGitHub
  try {
    datos = await o.traer()
  } catch (e) {
    // No haber podido preguntar NO es que no haya nada. Se dice y se sale.
    return {
      consultado: false,
      nuevos: 0,
      enviados: 0,
      sinAdministradores: o.admins.length === 0,
      error: String(e instanceof Error ? e.message : e),
    }
  }

  const pendientes = nuevos(eventosDe(datos), o.yaVistos)
  if (pendientes.length === 0) {
    return {
      consultado: true,
      nuevos: 0,
      enviados: 0,
      sinAdministradores: o.admins.length === 0,
    }
  }

  // Lo urgente primero: si el mensaje se lee en diagonal, que lo de arriba sea
  // lo que tiene plazo.
  const avisos = pendientes.map(formatear).sort((a, b) => Number(b.urgente) - Number(a.urgente))
  const cuerpo = ['📌 *Repositorio*', '', ...avisos.map((a) => a.texto)].join('\n\n')

  let enviados = 0
  for (const a of o.admins) {
    try {
      await o.sendDm(a, cuerpo)
      enviados += 1
    } catch (e) {
      logger.warn?.(`[eventos-repo] no se pudo avisar a ${a}: ${String(e)}`)
    }
  }

  // Sólo se marca como visto lo que de verdad salió. Si no había a quién
  // mandarlo, se guarda igual para no acumular un aluvión el día que se
  // configuren los administradores — pero eso se decide arriba, en el cron,
  // que es quien sabe si el silencio fue por falta de destinatarios.
  for (const p of pendientes) o.recordar(p.id)

  return {
    consultado: true,
    nuevos: pendientes.length,
    enviados,
    sinAdministradores: o.admins.length === 0,
  }
}

/* ---------------------------------------------------------------------------
 * La parte con red. Todo lo de arriba es puro y se prueba contra fixtures.
 * ------------------------------------------------------------------------- */

/**
 * El repositorio que se sondea. Es PÚBLICO desde el 8-09-2026, así que la API
 * responde sin credencial — que es justo lo que hace este aviso inmune a la
 * pérdida de `vars` y `secrets` que dejó `pull-quejas.yml` saltando en silencio.
 *
 * Sin token el límite son 60 peticiones por hora y por IP; aquí son 3 por hora.
 */
const REPO = process.env.GITHUB_REPO?.trim() || 'datarhan/civicpulse'
const API = 'https://api.github.com'

async function traerJson<T>(ruta: string): Promise<T> {
  const r = await fetch(`${API}${ruta}`, {
    headers: {
      Accept: 'application/vnd.github+json',
      // Identificarse es la regla de la casa para cualquier raspado.
      'User-Agent': 'CivicPulse-bot (https://civicpulse.es)',
    },
  })
  if (!r.ok) throw new Error(`${r.status} ${r.statusText} en ${ruta}`)
  return (await r.json()) as T
}

/**
 * Ventanas cortas a propósito: el cron corre cada hora y sólo interesa lo
 * reciente. Pedir más páginas gastaría cuota para volver a ver lo ya avisado.
 */
export async function traerDeGitHub(): Promise<DatosGitHub> {
  const [prs, issues, runs] = await Promise.all([
    traerJson<PrGitHub[]>(`/repos/${REPO}/pulls?state=all&sort=updated&direction=desc&per_page=20`),
    traerJson<IssueGitHub[]>(
      `/repos/${REPO}/issues?state=all&sort=updated&direction=desc&per_page=20`,
    ),
    traerJson<{ workflow_runs: RunGitHub[] }>(`/repos/${REPO}/actions/runs?per_page=30`).then(
      (d) => d.workflow_runs ?? [],
    ),
  ])
  return { prs, issues, runs }
}

const TICK_MS = 60 * 60 * 1000

/**
 * Tic horario. A diferencia del de convocatorias no espera a una hora concreta:
 * un derecho de réplica tiene plazo y esperar a mañana por la mañana sería
 * gastar un día del que corre contra nosotros.
 *
 * NO se pausa con el bloqueo LOREG, por lo mismo que el de convocatorias: esto
 * no publica nada ni escribe sobre cargos electos, es un DM interno. Y pararlo
 * en campaña sería justamente callar los derechos de réplica, que es cuando más
 * llegan.
 */
export function startEventosRepoCron(opciones: {
  admins: () => number[]
  sendDm: (userId: number, texto: string) => Promise<void>
  yaVistos: () => Set<string>
  recordar: (id: string) => void
  podar?: () => number
}): void {
  const tick = async () => {
    const r = await runEventosOnce({
      admins: opciones.admins(),
      traer: traerDeGitHub,
      sendDm: opciones.sendDm,
      yaVistos: opciones.yaVistos(),
      recordar: opciones.recordar,
    })
    // Cuatro desenlaces, ninguno plegado dentro de otro.
    if (!r.consultado) {
      logger.warn?.(`[eventos-repo] no se pudo consultar GitHub: ${r.error}`)
    } else if (r.sinAdministradores && r.nuevos > 0) {
      logger.warn?.(
        `[eventos-repo] ${r.nuevos} evento(s) y ADMIN_USER_IDS sin configurar — nadie los recibe`,
      )
    } else if (r.nuevos > 0) {
      logger.info?.(`[eventos-repo] ${r.nuevos} evento(s) a ${r.enviados} administrador(es)`)
    }
    opciones.podar?.()
  }

  // Un renglón al arrancar: sin esto, un cron que casi siempre calla es
  // indistinguible de uno que no cargó. Misma regla que `proximoHito`.
  logger.info?.(`[eventos-repo] cron armado · sondeando ${REPO} cada hora`)

  void tick()
  setInterval(() => void tick(), TICK_MS)
}
