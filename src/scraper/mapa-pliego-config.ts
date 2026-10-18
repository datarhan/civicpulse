import type { ConfigMapa } from './mapa-pliego'

/**
 * Qué dibuja el mapa de situación de «matrículas y móviles», y por qué cada cosa.
 *
 * - Cada aparcamiento va con la calle «junto a» la que lo sitúa el pliego de
 *   prescripciones técnicas del expediente 98/2025 (ver `camaras.citaFuente` en
 *   la instantánea): ADL, «junto a la calle Eusebio Benedito»; Asunción de
 *   Nuestra Señora, «junto al Carrer Pobla de Vallbona»; Centro de Salud,
 *   «junto a la calle Colón». El nombre de la derecha es el EXACTO de la vía en
 *   OpenStreetMap: «calle Colón» es allí «Carrer de Cristòfol Colom».
 * - El parque es la relación 3774370 de OSM, «Parc Natural del Túria».
 * - Porxinos, por su nodo de lugar (13703361055): el pliego prevé los aparatos
 *   de aforo «previsiblemente en el Valle de Porxinos». Es un punto con nombre,
 *   no el contorno del valle, y la figura lo dice.
 * - El pueblo, por su nodo de lugar (1470838804), sólo para que el lector sepa
 *   dónde está el casco urbano.
 */
export const CONFIG_MAPA_PLIEGO: ConfigMapa = {
  parque: 3774370,
  rio: 'Riu Túria',
  aparcamientos: [
    { nombre: 'ADL', calle: "Carrer d'Eusebio Benedito" },
    { nombre: 'Asunción', calle: 'Carrer Pobla de Vallbona' },
    { nombre: 'Centro de Salud', calle: 'Carrer de Cristòfol Colom' },
  ],
  lugar: { nombre: 'Porxinos', nodo: 13703361055 },
  pueblo: { nombre: 'Riba-roja de Túria', nodo: 1470838804 },
  encuadre: [39.526, -0.61, 39.556, -0.535],
  toleranciaM: 6,
}
