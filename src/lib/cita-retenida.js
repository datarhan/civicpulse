/**
 * El rótulo del hueco que deja una cita retenida.
 *
 * Lo pinta `CitaRetenida` y lo nombra la nota de «acusación no contrastada»
 * (PlenoFindings.jsx), y la bitácora de correcciones rotula con él las filas
 * cuyo literal retiene la copia servida (src/scraper/literales-retenidos.ts).
 *
 * Vive aparte, sin datos, porque la bitácora la comparten /laboratorio y
 * /eficiencia: importarlo de PlenoFindings les colgaba a esas rutas los
 * ficheros de hallazgos en el grafo de rutas, y con ellos el mapa de prosa
 * (`tests/stale-copy-paths.test.js` lo cazó).
 */
export const ROTULO_CITA_RETENIDA = 'Literal retenido'
