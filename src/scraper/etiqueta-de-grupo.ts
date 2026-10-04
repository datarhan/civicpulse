/**
 * Cuándo una declaración NO puede llevar el grupo de quien habla sin la firma
 * de una persona. Dos reglas, escritas una vez.
 *
 *   · etiquetaDeUnEscano — un grupo con un solo concejal le nombra por
 *     eliminación, y nombrar a alguien es nivel C
 *     (`decideAutomation({ namesIndividual: true })`). CLAUDE.md: «a one-seat
 *     bloc is not bloc-level». Los grupos los deriva de officials.json quien
 *     llama (`oneSeatBlocsOf`), nunca una lista escrita.
 *   · etiquetaSinMapa — la atribución se une desde el mapa de voces, donde cada
 *     grupo se sostiene sobre la frase con que la presidencia dio la palabra.
 *     Sin mapa de la sesión no hay grupo: es lo que /metodologia publica.
 *
 * Las exige sobre lo publicado la prueba de corpus de #218
 * (tests/declaraciones-escano-unico.test.ts), y `carry:attribution` no puede
 * devolver lo que ellas retiran. Vivían dentro de la prueba; con dos copias,
 * el arrastre y la prueba habrían empezado a discrepar el día que una
 * cambiara (regla 1 de docs/DATA_INTEGRITY.md, sobre un predicado en vez de un
 * enum).
 *
 * Lo que aquí NO se juzga: una etiqueta en una sesión CON mapa. Si el mapa la
 * sostiene hoy lo dice `classifyAttribution` (claim-provenance.ts), y esa
 * pregunta no cabe en una prueba de corpus: un mapa rehecho puede dejar sin
 * sostén una etiqueta hasta la re-extracción, y eso lo cuenta
 * `check:claim-provenance` sin parar la nocturna.
 */

/** Lo que estas reglas leen de una declaración. */
export interface DeclaracionConGrupo {
  id: string
  plenoId?: string | null
  speakerGroup?: string | null
}

/**
 * La sesión de una declaración: su `plenoId`, o el prefijo de su id, que es
 * `<pleno>-<n>-<tipo>-<huella>`.
 */
export function plenoDeDeclaracion(d: { id: string; plenoId?: string | null }): string {
  return d.plenoId ?? d.id.split('-')[0]
}

/**
 * Las sesiones con mapa de voces, a partir de los nombres de fichero de
 * `pleno-speaker-map/` (uno `<pleno>.json` por sesión). Quien llama lista el
 * directorio; aquí no se toca el disco.
 */
export function plenosConMapa(ficheros: readonly string[]): Set<string> {
  return new Set(ficheros.filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5)))
}

/** La declaración lleva el grupo de un concejal único. */
export function etiquetaDeUnEscano(
  d: { speakerGroup?: string | null },
  unEscano: readonly string[],
): boolean {
  return !!d.speakerGroup && unEscano.includes(d.speakerGroup)
}

/** La declaración lleva un grupo en una sesión sin mapa de voces. */
export function etiquetaSinMapa(d: DeclaracionConGrupo, conMapa: ReadonlySet<string>): boolean {
  return !!d.speakerGroup && !conMapa.has(plenoDeDeclaracion(d))
}
