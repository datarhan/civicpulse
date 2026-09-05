/**
 * Degenerate-transcript detector for the Whisper pipeline.
 *
 * Whisper (all engines, but especially whisper-1 fed one multi-hour request)
 * can collapse into a repetition loop seeded by music/silence: the July-2026
 * corpus produced five published transcripts that were nothing but
 * "Más información www.alimmenta.com", "Más palabras", "no", "." or
 * "SEÑOR PRESIDENTE DE LA JUNTA DE EXTREMADURA" repeated for hours, plus one
 * half-real/half-loop file. This gate sits between the engine and
 * public/data/pleno-transcripts/ — a transcript that fails is quarantined,
 * never published, and the pleno stays in the pipeline's backlog for retry.
 *
 * El SEGUNDO modo de fallo del motor, añadido el 5-09-2026: en vez de
 * degenerar, TRADUCE. Whisper devuelve el pasaje en inglés —«but that the
 * readjustment that we have had in this reorganization in 2023-2024»— con
 * `language='es'` puesto en las dos rutas del transcriptor, así que no es una
 * bandera que falte: es el modelo cambiando de tarea a media sesión, a veces
 * dentro del turno de un mismo hablante. Medido sobre las 44 transcripciones
 * publicadas: 12 traen alguna racha en inglés, la más larga de 6 líneas, y
 * `1r6yy0` llega al 6,9 % del fichero.
 *
 * Importa por lo mismo que la degeneración y no por purismo lingüístico: lo que
 * se publica es lo que dijo un concejal con nombre, y una traducción NO es lo
 * que dijo. Hoy no ha llegado a la superficie —0 de 4.663 declaraciones y 0 de
 * 131 citas firmadas salen de una línea traducida—, y esa cuenta es de suerte,
 * no de construcción: nada lo impedía.
 *
 * Lo que NO hace esta guarda, ni debe: traducir de vuelta. Devolver el pasaje
 * al castellano lo escribiríamos nosotros, y una cita que redactamos nosotros
 * es exactamente lo que este repositorio existe para no publicar. Se detecta,
 * se cuarentena y se vuelve a transcribir; el original, cuando existe, está en
 * la transcripción sustituida (es donde sigue el castellano de `qz6weg`).
 *
 * Thresholds are calibrated against the real corpus (2026-07-29 sweep):
 * every genuine transcript passes — including a 21-line extraordinario —
 * and all six degenerate files fail. Deliberately blunt: an honest miss
 * (quarantining a weird-but-real transcript) costs one retry; a false pass
 * publishes hallucinated text on a fact-checking site.
 */

export interface TranscriptSanityReport {
  ok: boolean
  /** Machine-readable failure slugs, empty when ok. */
  reasons: string[]
  /** Non-empty content lines (timestamp prefix stripped). */
  lines: number
  uniqueLines: number
  /** uniqueLines / lines (1 when lines = 0 has no meaning — reported as 0). */
  uniqueRatio: number
  /** Share of the single most repeated content line. */
  topLineShare: number
  /** Occurrences of that most repeated line. */
  topLineCount: number
  /** Total characters across the DISTINCT content lines. */
  uniqueContentChars: number
  /** Lines matching a known Whisper hallucination marker. */
  hallucinatedLines: number
  /** Líneas que el motor devolvió TRADUCIDAS al inglés en vez de transcritas. */
  translatedLines: number
  /** translatedLines / las líneas que se pudieron juzgar (no sobre el total). */
  translatedShare: number
  /** La racha seguida más larga. Un trozo traducido entero es una racha. */
  longestTranslatedRun: number
}

/** A real pleno session never yields fewer content lines than this. */
const MIN_LINES = 12
/** Below this distinct-line ratio the file is a loop, not speech. */
const MIN_UNIQUE_RATIO = 0.2
/** One line owning more than this share of the file means a stuck decoder… */
const MAX_TOP_LINE_SHARE = 0.3
/** …but only when it repeats this often (small files repeat "Gracias." honestly). */
const TOP_LINE_COUNT_FLOOR = 20
/** Distinct content below this many chars can't be a session (catches all-dots). */
const MIN_UNIQUE_CONTENT_CHARS = 800

/**
 * Text Whisper emits from its training data, not from the audio: YouTube
 * sign-offs, subtitle credits, and ads that belong to whatever corpus the
 * model memorised. All of these are present in the published corpus today —
 * `1du4rf5` carries 110 lines of "Más información www.alimmenta.com" (a
 * nutrition site) and `1237hbp` a line about the Church of Jesus Christ of
 * Latter-day Saints. Between them those two files supply 293 and 294
 * published claims.
 *
 * A handful of such lines does not make a transcript worthless, so this is
 * counted, not fatal on sight — the gate trips when they are a real share of
 * the file, or when a single marker repeats like a stuck loop.
 */
const HALLUCINATION_MARKERS: RegExp[] = [
  /alimmenta\.com/i,
  /suscr[ií]bete al canal/i,
  /gracias por ver el v[ií]deo/i,
  /subt[ií]tulos (?:realizados|por la comunidad)/i,
  /amara\.org/i,
  /iglesia de jesucristo de los santos/i,
  /junta de extremadura/i,
]

const TIMESTAMP_PREFIX = /^\[[^\]]*\]\s*/

// ─── Traducido en vez de transcrito ─────────────────────────────────────────

/**
 * Palabras función del inglés y de las dos lenguas de la sesión.
 *
 * Se comparan MARCADORES y no se detecta «idioma» en general, porque lo que hay
 * que distinguir aquí no es español de inglés: es castellano-y-valenciano
 * mezclados —que es como se habla realmente en este pleno, cambiando de lengua
 * a mitad de frase— de un pasaje que el motor ha traducido. Contar palabras
 * función a ambos lados sobrevive al cambio de código; un detector de idioma
 * por fichero no.
 *
 * Exportadas para que una prueba mida el efecto sin recitar la lista.
 */
export const MARCADORES_EN: ReadonlySet<string> = new Set(
  (
    'the and that with have this for from was were they which would been there ' +
    'their what when will about could should because being said them then than'
  ).split(' '),
)

export const MARCADORES_NATIVOS: ReadonlySet<string> = new Set(
  (
    'que de la el los las en para con por una del es no se al lo un como pero ' +
    'mas este esta muy ya sobre cuando tambien hay son ser esta amb aixo mes ' +
    'perque aquest jo als seva seu nostre aqui aixi'
  ).split(' '),
)

/** Mínimo de palabras para que una línea se pueda juzgar. */
const PALABRAS_MINIMAS = 6
/** Mínimo de marcadores (de cualquier lado) para no juzgar a ciegas. */
const MARCADORES_MINIMOS = 2

function palabrasDe(linea: string): string[] {
  return (
    linea
      .replace(/\[[^\]]*\]|\((?:SPEAKER_\d+|UNKNOWN)[^)]*\)/g, ' ')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .match(/[a-z']+/g) ?? []
  )
}

/**
 * ¿Devolvió el motor ESTA línea en inglés?
 *
 * `null` cuando no se puede juzgar —demasiado corta, o sin marcadores a ningún
 * lado—, que NO es lo mismo que «está bien»: las líneas no juzgables salen del
 * denominador en vez de contar como limpias. Un fichero de interjecciones
 * («Sí.», «Gracias.») daría 0 % de traducción por no tener nada que mirar, y
 * ese 0 % sería el verde hueco de siempre.
 */
export function lineaTraducida(linea: string): boolean | null {
  const w = palabrasDe(linea)
  if (w.length < PALABRAS_MINIMAS) return null
  let en = 0
  let nativo = 0
  for (const x of w) {
    if (MARCADORES_EN.has(x)) en += 1
    if (MARCADORES_NATIVOS.has(x)) nativo += 1
  }
  if (en + nativo < MARCADORES_MINIMOS) return null
  return en > nativo
}

/**
 * El techo, medido el 5-09-2026 sobre las 44 transcripciones publicadas.
 *
 * Reparto real de la cuota traducida: 6,9 % (`1r6yy0`), 2,7 % (`19xkzxw`), y
 * las otras diez por debajo del 1,7 %. Rachas: la más larga de todo el corpus
 * son 6 líneas seguidas.
 *
 * El corte va en 5 % y 8 líneas: hoy suspende `1r6yy0` —que es un acierto, esas
 * 55 líneas están de verdad en inglés y esa sesión merece volver a pasar por el
 * motor— y deja pasar el resto, donde son rachas sueltas que se cuentan y se
 * dicen. La alternativa, cortar por debajo de eso, cuarentenaría una de cada
 * cuatro transcripciones nuevas y la tubería acabaría con la guarda apagada.
 *
 * Los dos criterios miran cosas distintas a propósito: la CUOTA caza un motor
 * que va y viene durante toda la sesión, y la RACHA caza un trozo entero
 * traducido de una vez, que puede ser poco porcentaje de un fichero largo y aun
 * así ser una intervención completa puesta en boca de alguien en otro idioma.
 */
export const MAX_TRANSLATED_SHARE = 0.05
export const MAX_TRANSLATED_RUN = 8

export function assessTranscriptSanity(raw: string): TranscriptSanityReport {
  const contentLines = raw
    .split('\n')
    .map((l) => l.replace(TIMESTAMP_PREFIX, '').trim())
    .filter((l) => l.length > 0)

  const counts = new Map<string, number>()
  for (const line of contentLines) counts.set(line, (counts.get(line) ?? 0) + 1)

  let hallucinatedLines = 0
  for (const line of contentLines) {
    if (HALLUCINATION_MARKERS.some((re) => re.test(line))) hallucinatedLines += 1
  }

  // Traducido en vez de transcrito. El denominador son las líneas JUZGABLES,
  // no todas: ver `lineaTraducida`.
  let translatedLines = 0
  let judgedLines = 0
  let run = 0
  let longestTranslatedRun = 0
  for (const line of contentLines) {
    const v = lineaTraducida(line)
    if (v === null) continue
    judgedLines += 1
    if (v) {
      translatedLines += 1
      run += 1
      if (run > longestTranslatedRun) longestTranslatedRun = run
    } else {
      run = 0
    }
  }
  const translatedShare = judgedLines > 0 ? translatedLines / judgedLines : 0

  const lines = contentLines.length
  const uniqueLines = counts.size
  let topLineCount = 0
  let uniqueContentChars = 0
  for (const [line, n] of counts) {
    if (n > topLineCount) topLineCount = n
    uniqueContentChars += line.length
  }
  const uniqueRatio = lines > 0 ? uniqueLines / lines : 0
  const topLineShare = lines > 0 ? topLineCount / lines : 0

  const reasons: string[] = []
  if (lines < MIN_LINES) reasons.push('too-few-lines')
  if (lines >= MIN_LINES && uniqueRatio < MIN_UNIQUE_RATIO) reasons.push('repetition-loop')
  if (topLineShare > MAX_TOP_LINE_SHARE && topLineCount >= TOP_LINE_COUNT_FLOOR)
    reasons.push('dominant-line')
  if (lines >= MIN_LINES && uniqueContentChars < MIN_UNIQUE_CONTENT_CHARS)
    reasons.push('no-content')
  // Either a meaningful share of the file, or an absolute wall of it.
  if (lines > 0 && (hallucinatedLines / lines > 0.02 || hallucinatedLines >= 25))
    reasons.push('hallucination-markers')
  // Traducir no es transcribir. Los dos criterios miran cosas distintas: ver
  // MAX_TRANSLATED_SHARE.
  if (translatedShare > MAX_TRANSLATED_SHARE || longestTranslatedRun >= MAX_TRANSLATED_RUN)
    reasons.push('translated-passages')

  return {
    ok: reasons.length === 0,
    reasons,
    lines,
    uniqueLines,
    uniqueRatio,
    topLineShare,
    topLineCount,
    uniqueContentChars,
    hallucinatedLines,
    translatedLines,
    translatedShare,
    longestTranslatedRun,
  }
}
