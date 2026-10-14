// @ts-check

/**
 * Quién se lleva el toque donde el punto de un barrio cae sobre un pin del dinero.
 *
 * En la portada los puntos de barrio van encima de los pines (panel de marcadores,
 * 600, sobre el del dinero, `cp-dinero`, 420), por la regla de CivicPoiLayer: lo
 * pequeño encima de lo grande, porque un punto de 8 px muerde un poco un pin y un
 * pin de hasta 52 px se tragaría el punto entero. La regla falla en un caso: cuando
 * el punto tapa el CENTRO del pin. Pasa siempre que el título de un contrato nombra
 * una urbanización, porque el resolutor sitúa el dinero en el punto del
 * nomenclátor, que es también el del barrio, y los dos quedan concéntricos; y, a
 * poco zoom, con alguna calle a pocos metros. El 06-10-2026 el clic en el centro del
 * primer pin (La Llobatera) abría la ficha del barrio y la del contrato no se abría
 * desde ahí.
 *
 * Así que ese punto, y sólo ése, cede: no recibe punteros y el toque llega al pin
 * (con el teclado se sigue abriendo: el marcador conserva su foco). El barrio no se
 * queda sin puerta: la ficha de todo pin que cubre su punto lleva a la suya, y es la
 * de un pin que cubre el punto la que abre un toque en él, sea el concéntrico o uno
 * mayor pintado encima.
 *
 * Todo en píxeles de pantalla, porque la distancia que cuenta cambia con el zoom.
 */

/**
 * Radio, en px, del punto de un barrio: mide 8 con su borde (`box-sizing:
 * border-box`, `.cp-osm-neigh-dot` en index.css) y su icono se ancla en su centro
 * (NeighborhoodsLayer), más medio píxel de margen. Si el punto crece o el ancla se
 * mueve, esto se queda corto sin avisar: lo vigila la sonda de
 * `tests/e2e/_pines-y-barrios.ts`, que pregunta al navegador qué recibe el toque.
 */
export const RADIO_PUNTO_BARRIO = 4.5

/**
 * @typedef {{ id: string, x: number, y: number }} PuntoBarrio
 * @typedef {{ x: number, y: number, radio: number }} PinEnPantalla
 */

/** @param {{ x: number, y: number }} a @param {{ x: number, y: number }} b */
const distancia = (a, b) => Math.hypot(a.x - b.x, a.y - b.y)

/**
 * Los barrios cuyo punto tapa el centro de algún pin pintado: ésos ceden el toque.
 *
 * @param {PuntoBarrio[]} barrios
 * @param {PinEnPantalla[]} pines
 * @returns {Set<string>}
 */
export function barriosQueCeden(barrios, pines) {
  const pintados = pines.filter((p) => p.radio > 0)
  return new Set(
    barrios
      .filter((b) => pintados.some((p) => distancia(p, b) <= RADIO_PUNTO_BARRIO))
      .map((b) => b.id),
  )
}

/**
 * De los barrios que ceden, los que quedan bajo este pin: su ficha lleva a ellos.
 *
 * @template {PuntoBarrio} B
 * @param {PinEnPantalla} pin
 * @param {B[]} barrios
 * @param {Set<string>} ceden
 * @returns {B[]}
 */
export function barriosBajoElPin(pin, barrios, ceden) {
  return barrios.filter((b) => ceden.has(b.id) && distancia(pin, b) <= pin.radio)
}
