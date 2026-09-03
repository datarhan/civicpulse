/**
 * Valoración pura del mapa base: sin red, sin fs, sin `process.exit`.
 *
 * El CLI que la usa es `scripts/check-basemap.ts`; el porqué de todo esto está
 * escrito allí y en `src/lib/basemap.js`. Lo que importa aquí: la única
 * pregunta que se puede hacer sobre una tesela de CARTO es si la que llega CON
 * clave difiere de la que llega SIN ella, porque una clave inválida no da 401
 * —da la tesela marcada, con un 200 impecable.
 */

export type Desenlace = 'ok' | 'marcada' | 'sin-clave' | 'inalcanzable'

export interface Parte {
  desenlace: Desenlace
  /** Huella de la tesela pedida CON clave, si se llegó a pedir. */
  conClave?: string
  /** Huella de la misma tesela SIN clave. */
  sinClave?: string
  mensaje: string
}

/** Los desenlaces que tienen que parar la nocturna. Se exporta para que
 *  ninguna prueba ni ningún llamador vuelva a escribir la lista a mano. */
export const DESENLACES_QUE_BLOQUEAN: readonly Desenlace[] = ['marcada', 'sin-clave']

export function bloquea(d: Desenlace): boolean {
  return DESENLACES_QUE_BLOQUEAN.includes(d)
}

/**
 * Nombra el desenlace a partir de las dos huellas.
 *
 * @param conClave huella de la tesela pedida con clave, o null si no contestó
 * @param sinClave huella de la misma tesela pedida sin clave, o null
 */
export function valorar(conClave: string | null, sinClave: string | null): Parte {
  if (conClave === null || sinClave === null) {
    return {
      desenlace: 'inalcanzable',
      mensaje: 'NO COMPROBADO · el servicio de teselas no respondió; no se afirma nada',
    }
  }
  if (conClave === sinClave) {
    return {
      desenlace: 'marcada',
      conClave,
      sinClave,
      mensaje:
        'la tesela con clave es IDÉNTICA a la de sin clave — la clave no se está ' +
        'honrando (ausente, mal escrita, revocada o cuota agotada), y el mapa ' +
        'publicado lleva «API KEY REQUIRED» estampado',
    }
  }
  return {
    desenlace: 'ok',
    conClave,
    sinClave,
    mensaje: 'la clave se honra: la tesela servida difiere de la marcada',
  }
}

/** El parte cuando ni siquiera hay clave que probar. */
export function sinClaveConfigurada(): Parte {
  return {
    desenlace: 'sin-clave',
    mensaje:
      'VITE_CARTO_API_KEY no está puesta: la construcción publicará los cuatro ' +
      'mapas con la marca de agua de CARTO',
  }
}
