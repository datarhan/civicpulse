/**
 * Dónde se corta el audio de un pleno antes de transcribirlo.
 *
 * Un pleno de tres horas se transcribe en trozos de unos veinte minutos (una
 * sola petición de horas degenera en bucles de alucinación: postmortem del
 * 29-07-2026 en scripts/transcribe-pleno.sh). Cada trozo se transcribe y se
 * diariza por separado, sin nada del anterior: el modelo que diariza no admite
 * `prompt`. Así que lo que cae justo en la costura se pierde o se parte.
 *
 * Se cortaba a ciegas cada 1200 s. Medido el 19-11-2026 sobre 23
 * transcripciones: 124 de 195 costuras caen en plena habla y 71 a mitad de
 * frase. En `rx4hb4`, a 2400 s, una misma frase queda en dos trozos y en dos
 * etiquetas de orador —«…que los servicios jurídicos municipales la redacción» |
 * «aprobación de un reglamento…»—, y la declaración `rx4hb4-075-pro-4b9e8e`
 * cita sólo la primera mitad.
 *
 * Ahora cada corte busca el silencio más largo a ±`VENTANA_S` de su marca (como
 * hace WhisperX con la actividad de voz) y corta en medio. Sin silencio cerca,
 * corta en la marca y lo cuenta como corte a ciegas. No se solapan trozos: unir
 * dos transcripciones del mismo audio reescribiría el texto, que es justo lo que
 * este sitio no puede hacer con una cita.
 */

/** La duración nominal de un trozo. */
export const TROZO_S = 1200

/** Hasta aquí, el audio se sube entero, en una sola petición. */
export const UMBRAL_TROCEO_S = 1500

/** Cuánto puede moverse un corte de su marca para caer en un silencio. */
export const VENTANA_S = 60

/**
 * Un resto más corto que esto se suma al trozo anterior: un trozo de 3 s
 * («chunk 12/12: 1 segs», 19-11-2026) se transcribe sin ningún contexto y, si
 * es más corto aún, puede rechazarlo la API después de pagados los demás.
 *
 * Era 30 s. El 23-11-2026, en `1237hbp`, el último corte buscó silencio y cayó
 * en 5977 s de 6040: 63 s de la música del cierre, solos, volvieron como 200
 * sin texto, y la regla del trozo vacío negó la sesión entera —con razón: un
 * trozo vacío no se distingue de una lectura fallida, así que esa regla no se
 * afloja—. Los plenos acaban con música; a 120 s la cola queda pegada a la
 * habla que la precede. El último trozo llega así a `TROZO_S + COLA_MIN_S`
 * (1320 s), por debajo de lo que ya se sube de una vez (`UMBRAL_TROCEO_S`).
 */
export const COLA_MIN_S = 120

/** El filtro de ffmpeg que produce lo que lee `parseSilencios`. */
export const FILTRO_SILENCIOS = 'silencedetect=noise=-30dB:d=0.3'

export interface Silencio {
  inicio: number
  fin: number
}

/**
 * Los silencios del stderr de `ffmpeg -af silencedetect`. Uno que no se cierra
 * dura hasta el final del audio.
 */
export function parseSilencios(stderr: string, duracion: number): Silencio[] {
  const out: Silencio[] = []
  let abierto: number | null = null
  for (const linea of stderr.split('\n')) {
    const ini = linea.match(/silence_start:\s*(-?[\d.]+)/)
    if (ini) {
      abierto = Math.max(0, Number(ini[1]))
      continue
    }
    const fin = linea.match(/silence_end:\s*([\d.]+)/)
    if (fin && abierto !== null) {
      out.push({ inicio: abierto, fin: Number(fin[1]) })
      abierto = null
    }
  }
  if (abierto !== null && duracion > abierto) out.push({ inicio: abierto, fin: duracion })
  return out
}

export interface Cortes {
  /** Los instantes de corte, en segundos, sin el 0 ni el final. */
  cortes: number[]
  /** Cuántos no encontraron silencio cerca y cayeron en su marca. */
  ciegos: number
}

const redondea = (n: number) => Math.round(n * 1000) / 1000

/**
 * Los cortes de un audio de `duracion` segundos. Cada marca se mide desde el
 * corte anterior, así que ningún trozo pasa de `TROZO_S + VENTANA_S`, y el
 * último nunca baja de `COLA_MIN_S` ni pasa de `TROZO_S + COLA_MIN_S`.
 */
export function elegirCortes(duracion: number, silencios: readonly Silencio[]): Cortes {
  const cortes: number[] = []
  let ciegos = 0
  if (!(duracion > UMBRAL_TROCEO_S)) return { cortes, ciegos }
  let previo = 0
  while (duracion - previo > TROZO_S + COLA_MIN_S) {
    const marca = previo + TROZO_S
    const lo = marca - VENTANA_S
    const hi = Math.min(marca + VENTANA_S, duracion - COLA_MIN_S)
    let mejor: { punto: number; largo: number } | null = null
    for (const s of silencios) {
      const a = Math.max(s.inicio, lo)
      const b = Math.min(s.fin, hi)
      if (b <= a) continue
      const largo = b - a
      const punto = (a + b) / 2
      if (
        !mejor ||
        largo > mejor.largo ||
        (largo === mejor.largo && Math.abs(punto - marca) < Math.abs(mejor.punto - marca))
      )
        mejor = { punto, largo }
    }
    const corte = redondea(mejor ? mejor.punto : marca)
    if (!mejor) ciegos += 1
    cortes.push(corte)
    previo = corte
  }
  return { cortes, ciegos }
}

/** Dónde empieza cada trozo en el audio entero: el desplazamiento de sus marcas de tiempo. */
export function desplazamientos(cortes: readonly number[]): number[] {
  return [0, ...cortes]
}
