/**
 * Pedir a GitHub que republique las quejas en cuanto alguien retira la suya.
 *
 * Sin esto, una queja retirada con /olvidar seguía publicada hasta la
 * actualización diaria de `pull-quejas.yml`, y GitHub arranca esa ejecución
 * programada con horas de retraso: hubo días con más de 24 h entre una y la
 * siguiente. El bot sabe el momento exacto en que alguien retira una queja, así
 * que pide la ejecución entonces, por `workflow_dispatch`.
 *
 * Tres desenlaces, ninguno plegado dentro de otro, porque lo que el bot le
 * contesta al vecino depende de cuál fue:
 *
 *   · `pedida`     GitHub contestó 204, que es lo que devuelve al aceptar la petición.
 *   · `sin-token`  no hay `GITHUB_DISPATCH_TOKEN`, y no se llama a nada.
 *   · `fallo`      cualquier otra respuesta, o la llamada no llegó.
 *
 * El token es uno de acceso personal de grano fino, limitado a este repositorio y
 * con el permiso «Actions: read and write» (bot/DEPLOY.md). No sale en ningún
 * renglón del log, tampoco dentro del texto de un error.
 */
import { logger } from '../util/log.ts'

export type PeticionRepublicar = 'pedida' | 'sin-token' | 'fallo'

/** El workflow que trae `quejas.json` del bot, poda las fotos y comitea. */
export const WORKFLOW_REPUBLICAR = 'pull-quejas.yml'

export interface OpcionesRepublicar {
  token?: string
  repo?: string
  fetchImpl?: typeof fetch
  log?: (linea: string) => void
}

const API = 'https://api.github.com'
/** La respuesta a /olvidar no se queda esperando a GitHub más que esto. */
const ESPERA_MS = 10_000

export async function pedirRepublicacion(o: OpcionesRepublicar = {}): Promise<PeticionRepublicar> {
  const token = (o.token ?? process.env.GITHUB_DISPATCH_TOKEN ?? '').trim()
  const repo = (o.repo ?? process.env.GITHUB_REPO ?? '').trim() || 'datarhan/civicpulse'
  const log = o.log ?? ((linea: string) => logger.info('republicar', { linea }))
  const fetchImpl = o.fetchImpl ?? fetch

  if (!token) {
    log(
      '[republicar] sin GITHUB_DISPATCH_TOKEN: la web retirará la queja en su actualización diaria',
    )
    return 'sin-token'
  }
  // Un error de red puede traer la cabecera dentro de su mensaje.
  const sinToken = (texto: string) => texto.split(token).join('[token]')

  try {
    const r = await fetchImpl(
      `${API}/repos/${repo}/actions/workflows/${WORKFLOW_REPUBLICAR}/dispatches`,
      {
        method: 'POST',
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${token}`,
          'X-GitHub-Api-Version': '2022-11-28',
          'Content-Type': 'application/json',
          // Identificarse es la regla de la casa para cualquier llamada de fuera.
          'User-Agent': 'CivicPulse-bot (https://civicpulse.es)',
        },
        body: JSON.stringify({ ref: 'main' }),
        signal: AbortSignal.timeout(ESPERA_MS),
      },
    )
    if (r.status === 204) {
      log(`[republicar] pedida a ${repo}`)
      return 'pedida'
    }
    log(`[republicar] GitHub contestó ${r.status}: queda para la actualización diaria`)
    return 'fallo'
  } catch (e) {
    log(sinToken(`[republicar] no se pudo pedir: ${e instanceof Error ? e.message : String(e)}`))
    return 'fallo'
  }
}
