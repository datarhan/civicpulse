/**
 * Lanzar un guion con tsx sin pagar dos Node.
 *
 * `tsx guion.ts` arranca Node, carga su CLI y lo único que hace es arrancar OTRO
 * Node con estas cuatro opciones delante del guion. Una prueba de CLI lanza un
 * guion por `it`, así que pagaba dos arranques por prueba: medido el 01-11-2026,
 * 78 ms contra 50 con el mismo guion, en ficheros que lanzan más de doscientos.
 * Es la misma orden que ejecuta el hijo de tsx, y `tests/tsx-directo.test.ts`
 * comprueba que lo sigue siendo.
 *
 *   spawnSync(process.execPath, [...TSX_DIRECTO, guion, ...argv], { … })
 */
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const desdeAqui = createRequire(import.meta.url)

export const TSX_DIRECTO = [
  '--require',
  desdeAqui.resolve('tsx/preflight'),
  '--import',
  pathToFileURL(desdeAqui.resolve('tsx')).href,
]
