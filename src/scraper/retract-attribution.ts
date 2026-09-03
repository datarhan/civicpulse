/**
 * Retirar la atribución de bloc de declaraciones concretas, por id.
 *
 * `retract-guessed-attributions.ts` es una MIGRACIÓN: pone a `null` todos los
 * `speakerGroup` que escribió el extractor viejo, en bloque. Esto es lo otro —
 * el bisturí— para cuando `check:claim-provenance` señala un puñado de filas
 * cuya atribución publicada contradice la transcripción.
 *
 * ── Sólo baja, nunca sube ───────────────────────────────────────────────────
 *
 * Aquí se pone `null` y no se pone otra cosa. NO existe forma de escribir un
 * bloc con esta herramienta, y eso es la mitad del diseño, no una carencia:
 *
 *  · Cambiar `PP` por `VOX` es un veredicto que SUBE —una afirmación NUEVA
 *    sobre otro grupo—, y `docs/DATA_INTEGRITY.md` sólo deja que lo automático
 *    mueva un veredicto publicado hacia abajo.
 *  · VOX, Compromís y EU-Podem tienen UN escaño cada uno, así que escribir ese
 *    bloc nombra a una persona por eliminación. Cruzar a un individuo lo hace
 *    un curador, por hallazgo, con prueba propia — no una alineación de texto.
 *
 * `null` es el valor que la interfaz ya pinta como «Grupo no identificado»
 * (`src/lib/party-label.js`): quita una afirmación sobre un grupo con nombre en
 * vez de añadir otra.
 */

/** Lo que se movió, para que la pasada pueda demostrar su alcance. */
export interface RetractionTally {
  /** ids que se han encontrado y retirado, con el bloc que tenían. */
  retracted: Map<string, string>
  /** ids que aparecían pero ya estaban en null: no es un fallo, es un no-op. */
  alreadyNull: Set<string>
}

export function emptyTally(): RetractionTally {
  return { retracted: new Map(), alreadyNull: new Set() }
}

/**
 * Devuelve un árbol NUEVO con `speakerGroup: null` en todo objeto cuyo `id`
 * esté en `ids`. Puro: no muta la entrada.
 *
 * El emparejamiento pide **las dos cosas en el mismo objeto** — un `id` de la
 * lista y un `speakerGroup` de tipo cadena. Sin esa condición, un `id` suelto
 * en cualquier otra parte del árbol (una referencia, una relación, una cola de
 * curación) bastaría para tocar un `speakerGroup` vecino que no es el suyo.
 */
export function retractAttributions<T>(
  node: T,
  ids: ReadonlySet<string>,
  tally: RetractionTally,
): T {
  if (Array.isArray(node)) {
    return node.map((n) => retractAttributions(n, ids, tally)) as unknown as T
  }
  if (!node || typeof node !== 'object') return node

  const src = node as Record<string, unknown>
  const out: Record<string, unknown> = {}
  const id = src.id
  const isTarget =
    typeof id === 'string' &&
    ids.has(id) &&
    Object.prototype.hasOwnProperty.call(src, 'speakerGroup')

  for (const [k, v] of Object.entries(src)) {
    if (isTarget && k === 'speakerGroup') {
      if (typeof v === 'string') {
        tally.retracted.set(id as string, v)
        out[k] = null
      } else {
        tally.alreadyNull.add(id as string)
        out[k] = v
      }
      continue
    }
    out[k] = retractAttributions(v, ids, tally)
  }
  return out as unknown as T
}

/**
 * ¿Movió esta transformación algo que no fuera `speakerGroup`?
 *
 * Compara los dos árboles ignorando ese campo en todas partes. Si difieren en
 * cualquier otro byte, la pasada no debe escribir: una migración que no puede
 * demostrar su propio alcance es una migración que nadie puede revisar. Mismo
 * contrato que `retract-guessed-attributions.ts`.
 */
export function onlySpeakerGroupMoved(before: unknown, after: unknown): boolean {
  const strip = (n: unknown): unknown => {
    if (Array.isArray(n)) return n.map(strip)
    if (!n || typeof n !== 'object') return n
    const o: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(n as Record<string, unknown>)) {
      if (k === 'speakerGroup') continue
      o[k] = strip(v)
    }
    return o
  }
  return JSON.stringify(strip(before)) === JSON.stringify(strip(after))
}
