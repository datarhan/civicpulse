/**
 * Las líneas de transcripción de UN trozo devuelto por OpenAI
 * (`gpt-4o-transcribe-diarize`, `response_format=diarized_json`).
 *
 * Vivía como `node -e` dentro de scripts/transcribe-pleno.sh, sin prueba, y
 * escribía lo que viniera en un 200, también nada: un trozo con
 * `segments: []` dejaba un hueco de veinte minutos, y la comprobación de
 * cobertura sólo mira la última marca de tiempo. La rama de Gemini ya se
 * negaba; ésta ahora también (regla 2 de DATA_INTEGRITY: «no recibí nada» no es
 * «no había nada»).
 *
 * Las etiquetas son LOCALES al trozo: «A» en el trozo 2 no es «A» en el 1,
 * porque cada subida se diariza por separado. Numerarlas por trozo evita fundir
 * a dos personas en un mismo orador. La forma SPEAKER_NN es obligatoria:
 * voice-id.ts lee las transcripciones con /\((SPEAKER_\d+|UNKNOWN)\)/.
 */

interface Segmento {
  start?: number
  end?: number
  speaker?: string | null
  text?: string | null
}

export interface Resumen {
  segmentos: number
  oradores: number
  /** Primer y último segundo con habla, ya desplazados. */
  desde: number
  hasta: number
  /** El mayor hueco sin habla entre dos segmentos del trozo, en segundos. */
  mayorHueco: number
}

export type ResultadoTrozo =
  { ok: true; lineas: string[]; resumen: Resumen } | { ok: false; motivo: string }

/** Cuántas etiquetas caben por trozo antes de pisar las del siguiente. */
export const ETIQUETAS_POR_TROZO = 20

export function lineasDeTrozoOpenAI(
  datos: { segments?: readonly Segmento[] | null },
  { desplazamiento, indice }: { desplazamiento: number; indice: number },
): ResultadoTrozo {
  const segs = (datos.segments ?? []).filter((s) => String(s.text ?? '').trim() !== '')
  if (segs.length === 0)
    return {
      ok: false,
      motivo: `trozo ${indice}: 200 OK sin ningún segmento con texto — no se publica un silencio que nadie ha oído`,
    }
  // Una marca de tiempo que falta no es el segundo 0: publicarla así pondría la
  // frase al principio del trozo. Un segmento sin las dos marcas invalida el trozo.
  const sinMarca = segs.findIndex((s) => !Number.isFinite(s.start) || !Number.isFinite(s.end))
  if (sinMarca >= 0)
    return {
      ok: false,
      motivo: `trozo ${indice}: el segmento ${sinMarca} no trae marcas de tiempo — no se le inventa una`,
    }
  const orden: string[] = []
  const etiqueta = (sp: string | null | undefined): string => {
    if (!sp) return 'UNKNOWN'
    if (!orden.includes(sp)) orden.push(sp)
    const n = orden.indexOf(sp)
    if (n >= ETIQUETAS_POR_TROZO)
      throw new Error(
        `trozo ${indice}: más de ${ETIQUETAS_POR_TROZO} oradores; la etiqueta pisaría las del trozo siguiente`,
      )
    return `SPEAKER_${String(indice * ETIQUETAS_POR_TROZO + n).padStart(2, '0')}`
  }
  const lineas: string[] = []
  let mayorHueco = 0
  let finAnterior: number | null = null
  for (const s of segs) {
    const ini = Number(s.start)
    const fin = Number(s.end)
    if (finAnterior !== null) mayorHueco = Math.max(mayorHueco, ini - finAnterior)
    finAnterior = finAnterior === null ? fin : Math.max(finAnterior, fin)
    lineas.push(
      `[${(ini + desplazamiento).toFixed(1)} → ${(fin + desplazamiento).toFixed(1)}] (${etiqueta(s.speaker)}) ${String(s.text).trim()}`,
    )
  }
  return {
    ok: true,
    lineas,
    resumen: {
      segmentos: segs.length,
      oradores: orden.length,
      desde: Number(segs[0].start) + desplazamiento,
      hasta: Number(finAnterior) + desplazamiento,
      mayorHueco: Math.round(mayorHueco * 10) / 10,
    },
  }
}
