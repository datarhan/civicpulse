/**
 * Las páginas de sesión de regmeet tal cual se descargaron, una por sesión, en
 * `.cache/regmeet-sesiones/<plenoId>.html` (gitignorado).
 *
 * Las escribe `scrape:pleno-actas`, que ya pide cada día las 6 sesiones más
 * recientes y una ventana rotatoria del resto, y las lee `scrape:pleno-videos-regmeet`,
 * que así no pide nada a regmeet: una tercera pasada por las mismas páginas
 * encontraba la conexión cerrada (cabecera de `src/scraper/pleno-videos-regmeet-pasada.ts`).
 * El día de una página es el de su fichero: se reescribe cada vez que se descarga.
 */
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const PROJECT_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

export const PAGINAS_SESION = join(PROJECT_ROOT, '.cache/regmeet-sesiones')

export const paginaDeSesion = (plenoId: string) => join(PAGINAS_SESION, `${plenoId}.html`)
