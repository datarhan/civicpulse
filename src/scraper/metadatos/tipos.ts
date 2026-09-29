/**
 * Tipos compartidos por los lectores de metadatos y por la política que los
 * juzga (`index.ts`). Van aparte para que un lector no importe la política ni
 * la política a sí misma a través de un lector.
 */

/**
 * Qué clase de dato es un campo, que es lo que decide si se señala:
 *
 *   autoria      quién escribió o guardó un DOCUMENTO — lo rellena el programa
 *                con la cuenta de quien lo usa, sin que nadie lo decida.
 *   credito      la firma de un fotógrafo o de un ilustrador — la pone su autor
 *                a propósito, y es información de derechos.
 *   dispositivo  números de serie, dueño de la cámara, rutas del disco de
 *                alguien, nombres de fichero originales.
 *   localizacion coordenadas.
 *   presencia    que hay metadatos, sin más: un comentario, un segmento EXIF.
 */
export type Clase = 'autoria' | 'credito' | 'dispositivo' | 'localizacion' | 'presencia'

/** Bytes que la limpieza escribe en su sitio: misma longitud que lo que tapan. */
export interface Tramo {
  inicio: number
  bytes: Uint8Array
}

export interface Campo {
  /** Dónde vive, para una persona: «SummaryInformation · LastAuthor». */
  campo: string
  valor: string
  clase: Clase
  /** Si se puede vaciar en su sitio: qué bytes del FICHERO lo tapan. */
  tramos?: Tramo[]
  /** En un zip, la parte que lo lleva y el elemento o atributo XML. */
  parte?: string
  elemento?: string
}

/** Quita los NUL y los blancos de los bordes: «vacío» es vacío de verdad. */
export const sinRelleno = (s: string) => s.replaceAll('\u0000', '').trim()
