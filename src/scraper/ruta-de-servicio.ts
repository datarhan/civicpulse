/**
 * Enlaces legibles a la ficha de un servicio (auditoría de las dos lecturas,
 * §7 y fase 5).
 *
 * Un enlace a /eficiencia/b132-130p-coste-unitario no dice nada a quien lo
 * recibe; /eficiencia/policia-local dice qué es. El id sigue siendo el
 * canónico: los hallazgos de eficiencia, las competencias, las preguntas
 * registradas y la revisión lectora lo usan, y se congelaron con él. El alias es
 * otra forma de llegar, y la que pintan los enlaces de la página.
 *
 * - **El alias se cura en el registro** (`SERVICIOS[*].alias`), al lado del
 *   nombre del servicio. Ver allí por qué no se deriva del nombre.
 * - **Ningún alias tiene forma de id** (los ids acaban en `-coste-unitario`; lo
 *   comprueba la prueba), así que un parámetro es una cosa o la otra.
 * - **Un enlace siempre lleva a su ficha.** Un id que el registro no conoce se
 *   enlaza por el id.
 * - **Un alias tecleado a mano llega igual**, con tildes o mayúsculas:
 *   «policía-local» es «policia-local».
 */
import { SERVICIOS, idDeServicio } from './indicador-registry'
import { slugify } from './normalize'

const ALIAS_DE_ID = new Map(
  Object.entries(SERVICIOS).map(([programa, s]) => [idDeServicio(programa), s.alias]),
)
const ID_DE_ALIAS = new Map([...ALIAS_DE_ID].map(([id, alias]) => [alias, id]))

/** La ruta con que se enlaza una ficha: por su alias si el registro le da uno; si no, por su id. */
export function rutaDeServicio(id: string): string {
  return `/eficiencia/${ALIAS_DE_ID.get(id) ?? id}`
}

/** El id de la ficha a la que lleva un parámetro de /eficiencia/:id: su alias o el id mismo. */
export function idDeParametro(parametro: string): string {
  return ID_DE_ALIAS.get(slugify(parametro)) ?? parametro
}
