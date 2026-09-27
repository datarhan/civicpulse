/**
 * Cuánto se conservan los datos del canal de quejas. Un solo sitio: lo cumple
 * el bot (bot/src/services/retencion.ts) y lo cuentan /aviso-legal, `/start` y
 * la respuesta a `/olvidar`, que lo importan en vez de escribirlo.
 *
 * Hasta el 2026-09-27 los tres sitios prometían los cinco años a mano y ningún
 * código los cumplía. No importa nada, y tiene que seguir así: los workflows del
 * bot se disparan por las rutas que bot/src importa directamente.
 */

/**
 * Años que se conserva el registro de una queja desde lo último que le pasó —su
 * resolución o su última actualización— (art. 55 LOPD-GDD). Después se destruye.
 */
export const CONSERVACION_QUEJAS_ANIOS = 5

/** Días que se guarda una copia de seguridad de la base del bot: lleva datos personales. */
export const CONSERVACION_COPIAS_DIAS = 30
