// @ts-check
/**
 * EstadoLlano: el rótulo que un vecino lee en lugar del código de un estado.
 *
 * Cuatro páginas pintaban el código tal cual, medido sobre las 155 del mapa del
 * sitio el 26-10-2026: «SIN-DATOS» en /declaraciones, «biography» en cada
 * tarjeta de /laboratorio/agentes, «muestra-insuficiente» y
 * «sin-declaracion-propia» en /laboratorio/coste-esperado, y «verdict-engine»,
 * «curator-downgrade» y «curator-upgrade» en /laboratorio/cobertura. El patrón
 * que lo permite es la reserva cruda: `LABEL[v] || v`, o `rotuloDe` con el
 * propio valor de reserva, que un valor sin rótulo convierte en código impreso.
 *
 * Aquí sólo viven los prefijos del catálogo, sin imports, como
 * `cita-retenida.js`: importar los enums colgaría a cada página que lo use los
 * módulos de los que salen, en el grafo de rutas y en el mapa de prosa. Los
 * enums los importa la prueba (`tests/estado-llano.test.js`), que exige un
 * rótulo en los dos idiomas para cada valor y ninguno que sobre.
 */
import { rotuloDe } from '../i18n'

/**
 * Cada vocabulario publicado y la raíz de sus claves en el catálogo. Qué enum
 * exportado cubre cada uno lo dice la prueba, no este fichero.
 */
export const ESTADO_LLANO = /** @type {const} */ ({
  veredicto: 'declaraciones.veredicto',
  encargo: 'estado.encargo',
  pasada: 'estado.pasada',
  especificacionEsperada: 'estado.especificacionEsperada',
})

/**
 * El rótulo de `valor` en el vocabulario `tipo`, o `null` si no lo tiene.
 * Nunca el código: un valor sin rótulo no se pinta.
 *
 * @param {(clave: string) => string} t
 * @param {keyof typeof ESTADO_LLANO} tipo
 * @param {string | null | undefined} valor
 * @returns {string | null}
 */
export function estadoLlano(t, tipo, valor) {
  if (!valor) return null
  return rotuloDe(t, `${ESTADO_LLANO[tipo]}.${valor}`, null)
}
