/**
 * Cuándo un hallazgo lleva el nombre del concejal que habla
 * (`individualSpeaker`). Lo decide `promote-claim`, y sólo así se cruza de
 * «un grupo dijo» a «esta persona dijo» en /hallazgos.
 *
 * Hasta el 2026-11-23 el valor por defecto era `auto`: si las declaraciones
 * citadas compartían un `speakerSlug` —que el extractor escribía a partir de
 * la identificación por voz—, el nombre salía sin que el curador lo pidiera ni
 * dijera qué había escuchado. Ahora:
 *
 *   - sin `--individual-speaker <slug>` no se nombra a nadie;
 *   - `auto` es un error, no un valor: el nombre lo pide una persona;
 *   - nombrar exige el tramo del audio escuchado (`--escuchado desde-hasta`, en
 *     segundos), que queda en el hallazgo;
 *   - en veda electoral no se nombra (LOREG, `frozenUntil`);
 *   - un concejal de un grupo de un escaño ya está nombrado por su grupo, y
 *     eso es nivel C: pide `--nivel-c` expreso.
 */

export interface Escuchado {
  desde: number
  hasta: number
}

/** «1200.5-1260» → { desde: 1200.5, hasta: 1260 }; `null` si no es un tramo. */
export function leerEscuchado(texto: string | null | undefined): Escuchado | null {
  const m = (texto ?? '').trim().match(/^(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)$/)
  if (!m) return null
  const desde = Number(m[1])
  const hasta = Number(m[2])
  if (!(hasta > desde)) return null
  return { desde, hasta }
}

export interface PeticionOrador {
  /** Lo que pasó el curador en `--individual-speaker`: `none` o un slug. */
  pedido: string
  /** `--escuchado`, sin leer. */
  escuchado: string | null
  /** Fecha de fin de la veda si está activa (`vedaActiva()`), si no `null`. */
  veda: string | null
  /** Partido del concejal pedido, de officials.json. */
  partido: string
  /** `singleSeatBlocs()` de la composición actual. */
  gruposDeUnEscano: readonly string[]
  /** `--nivel-c`: el curador reconoce que nombrar a este concejal es nivel C. */
  nivelC: boolean
}

export type DecisionOrador =
  { nombrar: false } | { nombrar: false; error: string } | { nombrar: true; escuchado: Escuchado }

export function decidirOradorIndividual(p: PeticionOrador): DecisionOrador {
  if (p.pedido === 'none') return { nombrar: false }
  if (p.pedido === 'auto') {
    return {
      nombrar: false,
      error:
        '`--individual-speaker auto` ya no existe: el nombre lo pide el curador con un slug, ' +
        'después de escuchar el tramo, no lo deduce de las declaraciones',
    }
  }
  if (p.veda) {
    return { nombrar: false, error: `veda electoral hasta ${p.veda}: no se nombra a ningún orador` }
  }
  const escuchado = leerEscuchado(p.escuchado)
  if (!escuchado) {
    return {
      nombrar: false,
      error:
        'nombrar al orador exige `--escuchado <desde>-<hasta>`: el tramo del audio del pleno, ' +
        'en segundos, que se ha escuchado para comprobar quién habla',
    }
  }
  if (p.gruposDeUnEscano.includes(p.partido) && !p.nivelC) {
    return {
      nombrar: false,
      error:
        `${p.partido} tiene un escaño: su grupo ya nombra a esta persona y nombrarla es nivel C. ` +
        'Pasa `--nivel-c` si lo has decidido expresamente',
    }
  }
  return { nombrar: true, escuchado }
}
