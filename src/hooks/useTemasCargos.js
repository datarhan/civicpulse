// @ts-check
import { useJsonFetch } from './useJsonFetch'

/**
 * El vocabulario del buscador «¿A quién le pregunto por…?» de /cargos: qué área
 * delegada corresponde a cada asunto. Curado; lo escribe `npm run tema-cargo`.
 * No nombra a nadie: la persona sale de la lista de cargos (`useOfficials`).
 * Reglas: `src/scraper/temas-cargos.ts`.
 *
 * `null` mientras carga o si no se puede leer: sin vocabulario, el buscador no
 * se pinta, en vez de contestar «no lo tenemos» a todo.
 */
export function useTemasCargos() {
  return useJsonFetch('/data/temas-cargos.json', null)
}
