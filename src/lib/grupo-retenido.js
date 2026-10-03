/**
 * La versión de una fila de bitácora que nombraba a un grupo de un solo escaño:
 * la marca que la sustituye en la copia servida y el rótulo con que la bitácora
 * lo dice. Una sola definición para la transformación
 * (src/scraper/grupos-retenidos.ts, que cuenta el porqué), la página y sus
 * pruebas.
 *
 * Vive aparte, sin datos y SIN IMPORTS, por lo mismo que `cita-retenida.js`: la
 * bitácora la comparten /laboratorio, /eficiencia, /gestion y /promesas, y
 * colgarles la transformación les colgaría sus ficheros en el grafo de rutas.
 */

/** El rótulo de la fila en la bitácora. */
export const ROTULO_GRUPO_RETENIDO = 'Grupo de un solo escaño'

/**
 * Lo que la copia servida pone en el lado de la fila que nombraba al grupo. Es
 * una marca y no una huella a propósito: la huella de un nombre entre cinco se
 * deshace probando los cinco.
 */
export const MARCA_GRUPO_RETENIDO = 'grupo de un solo escaño · no se reproduce'
