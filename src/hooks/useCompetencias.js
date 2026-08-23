// @ts-check
import { useJsonFetch } from './useJsonFetch'
import { usePromises } from './usePromises'
import { nombresVisibles } from '../scraper/competencias'

/**
 * Quién responde de cada ficha del panel.
 *
 * El fichero es curado y congelado a propósito: `officials.json` se raspa cada
 * noche, y derivar el nombre en tiempo de render dejaría que un cron cambie
 * solo qué persona viva aparece junto a una cifra publicada. Aquí sólo se lee
 * lo firmado. Ver el docblock de `src/scraper/competencias.ts`.
 *
 * Constante a nivel de módulo, no un literal nuevo por render: la caché de
 * instantáneas compara por referencia.
 */
const EMPTY = { asignaciones: [], sinAsignar: [], replicas: [] }

export function useCompetencias() {
  return useJsonFetch('/data/competencias.json', EMPTY)
}

/**
 * `clave` → asignación, para que la tarjeta no recorra el array entero.
 *
 * Devuelve un Map vacío mientras carga, de modo que quien lo consume pinta la
 * ficha sin el nombre en vez de esperar: la cifra es lo que el lector vino a
 * ver, y el nombre es contexto.
 */
export function indexarCompetencias(data) {
  const m = new Map()
  for (const a of data?.asignaciones ?? []) m.set(a.clave, a)
  return m
}

/**
 * ¿Se pueden pintar los nombres hoy?
 *
 * El interruptor es el mismo que pone `/promesas` en sólo lectura durante la
 * ventana electoral (`npm run freeze:set`), leído del propio `promises.json`.
 * La decisión de si una fecha cae dentro la toma `nombresVisibles`, que es
 * pura y está probada; `isPromiseFrozen` contesta la misma pregunta para
 * `/promesas` con un `Date` en vez de una cadena, y
 * `tests/competencias-freeze-agreement.test.ts` obliga a las dos a coincidir —
 * dos definiciones de la misma ventana que discrepen en su último día es la
 * clase de deriva que este repositorio ya ha pagado.
 */
export function useNombresVisibles() {
  const { data } = usePromises()
  const hoy = new Date().toISOString().slice(0, 10)
  return nombresVisibles(data?.frozenUntil ?? null, hoy)
}
