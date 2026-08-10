/**
 * quote-reanchor — reunir, para cada literal publicado que ya no aparece en la
 * transcripción vigente de su sesión, los pasajes del texto nuevo entre los que
 * una persona pueda elegir.
 *
 * El problema, medido: 95 de los 177 literales de `/hallazgos` constan en la
 * transcripción que su sesión tenía antes de volverse a transcribir, y no en la
 * vigente. En casi todas esas sesiones el texto nuevo es más extenso, así que la
 * ausencia no es falta de cobertura — es que el primer motor oía mal («satombat»,
 * «Rivarroch»). Lo que hay entre comillas puede ser la voz del transcriptor.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POR QUÉ ESTO PROPONE Y NO ELIGE
 *
 * Reanclar una cita es decidir qué dijo exactamente una persona nombrable. Ni
 * la coincidencia léxica ni la marca de tiempo lo saben: el solapamiento de
 * palabras premia el vocabulario compartido, y dos intervenciones del mismo
 * punto del orden del día comparten casi todo. Elegir por el curador —o dejar
 * un candidato preseleccionado, que es elegir con otro nombre— convertiría un
 * cálculo en una atribución.
 *
 * Así que la cola:
 *   · nunca rellena `seleccion`, que sale `null` y no tiene otra vía;
 *   · da DOS evidencias independientes y no las mezcla en una puntuación:
 *     el solapamiento de palabras con contenido, y el tramo del texto nuevo que
 *     ocupa la misma marca de tiempo en la que la cita aparecía en el viejo;
 *   · muestra qué palabras de la cita faltan en cada candidato, que es lo que
 *     de verdad distingue «lo mismo dicho mejor» de «otro momento del debate».
 *
 * No escribe en `public/data/pleno-findings.json` ni puede: el único escritor
 * sigue siendo `npm run correct-pleno-finding --field quote.<i>.text`, que exige
 * un motivo de ≥20 caracteres, revalida el snapshot y deja fila en la bitácora
 * pública de la ficha. Esta cola sólo compone ese comando.
 *
 * Módulo puro: no lee disco ni red. El corpus se lo pasa el CLI.
 */
import { normaliseForQuoteMatch, quoteAppearsIn } from './quote-match'
import { MARKED_STATUS_IDS, type QuoteProvenanceEntry } from './quote-provenance'

/** La CLI que sí escribe. Nada de este módulo la invoca. */
export const REANCHOR_CLI = 'npm run correct-pleno-finding'

export const REANCHOR_QUEUE_VERSION = 'quote-reanchor-v1'

/**
 * Palabras sin carga léxica. Se descuentan del denominador del solapamiento
 * porque una cita de veinte palabras compartiría la mitad con cualquier tramo
 * de la sesión sólo por «de la que en el» — y un candidato con 50 % de
 * solapamiento vacío se lee como medio acierto cuando no lo es.
 *
 * Exportada para que una prueba pueda comprobar el efecto sin recitar la lista.
 */
export const STOPWORDS: ReadonlySet<string> = new Set([
  'a',
  'al',
  'ante',
  'antes',
  'como',
  'con',
  'contra',
  'cual',
  'cuando',
  'de',
  'del',
  'desde',
  'donde',
  'dos',
  'e',
  'el',
  'ella',
  'ellas',
  'ello',
  'ellos',
  'en',
  'entre',
  'era',
  'eran',
  'es',
  'esa',
  'esas',
  'ese',
  'eso',
  'esos',
  'esta',
  'estan',
  'estas',
  'este',
  'esto',
  'estos',
  'ha',
  'han',
  'hasta',
  'hay',
  'la',
  'las',
  'le',
  'les',
  'lo',
  'los',
  'mas',
  'me',
  'mi',
  'mucho',
  'muy',
  'ni',
  'no',
  'nos',
  'o',
  'os',
  'para',
  'pero',
  'por',
  'porque',
  'que',
  'quien',
  'se',
  'ser',
  'si',
  'sin',
  'sobre',
  'son',
  'su',
  'sus',
  'tambien',
  'te',
  'tiene',
  'todo',
  'todos',
  'tu',
  'un',
  'una',
  'uno',
  'unos',
  'y',
  'ya',
  'yo',
  'ese',
  'fue',
  'han',
  'hemos',
  'esta',
  'estamos',
  'vamos',
  'aqui',
  'alli',
  'ahi',
  'asi',
  'pues',
  'bien',
  'tal',
  'cada',
  'otro',
  'otra',
  'otros',
  'otras',
  'nuestro',
  'nuestra',
  'nuestros',
  'nuestras',
  'hacer',
  'decir',
  'tener',
  'estar',
  'haber',
])

/** ¿Aporta esta palabra algo que distinga un pasaje de otro? */
export function isContentWord(w: string): boolean {
  return w.length >= 4 && !STOPWORDS.has(w)
}

/**
 * Las palabras con contenido de una cita, sin repetir. Si la cita es tan corta
 * o tan funcional que no queda ninguna, se cae a todas sus palabras: un
 * denominador de cero convertiría cualquier tramo en un 100 % de acierto, que
 * es exactamente la forma de un cotejador que no coteja.
 */
export function contentWords(quote: string): string[] {
  const all = normaliseForQuoteMatch(quote).split(' ').filter(Boolean)
  const content = [...new Set(all.filter(isContentWord))]
  return content.length > 0 ? content : [...new Set(all)]
}

export interface TranscriptSegment {
  startSeconds: number
  endSeconds: number
  speaker: string | null
  /** El texto tal cual está en el fichero, sin normalizar. */
  text: string
}

/** `[390.8 → 392.9] (SPEAKER_00) …` — y la variante vieja, sin hablante. */
const SEGMENT_RE =
  /^\[(\d+(?:\.\d+)?)\s*→\s*(\d+(?:\.\d+)?)\]\s*(?:\((SPEAKER_\d+|UNKNOWN[^)]*)\))?\s*(.*)$/

/**
 * Trocea una transcripción en segmentos con marca de tiempo. Una línea sin
 * cabecera se anexa al segmento anterior (las transcripciones largas parten
 * frases), y si no hay ninguno todavía se descarta: sin marca de tiempo no hay
 * nada que ofrecerle al curador.
 */
export function parseTimestampedSegments(text: string): TranscriptSegment[] {
  const out: TranscriptSegment[] = []
  for (const line of text.split('\n')) {
    const m = SEGMENT_RE.exec(line.trim())
    if (m) {
      out.push({
        startSeconds: Number(m[1]),
        endSeconds: Number(m[2]),
        speaker: m[3] ?? null,
        text: (m[4] ?? '').trim(),
      })
    } else if (line.trim() && out.length > 0) {
      out[out.length - 1].text = `${out[out.length - 1].text} ${line.trim()}`.trim()
    }
  }
  return out
}

/** `4212.7` → `1:10:12`. Lo que un curador teclea en el reproductor del pleno. */
export function formatTimecode(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  const mm = String(m).padStart(h > 0 ? 2 : 1, '0')
  return `${h > 0 ? `${h}:` : ''}${mm}:${String(sec).padStart(2, '0')}`
}

export interface TranscriptIndex {
  segments: TranscriptSegment[]
  /** Todas las palabras normalizadas, en orden. */
  words: string[]
  /** Para cada palabra, el índice de su segmento. */
  wordSegment: number[]
}

/** Se construye UNA vez por sesión y se reutiliza para todas sus citas. */
export function indexTranscript(text: string): TranscriptIndex {
  const segments = parseTimestampedSegments(text)
  const words: string[] = []
  const wordSegment: number[] = []
  segments.forEach((seg, i) => {
    for (const w of normaliseForQuoteMatch(seg.text).split(' ')) {
      if (!w) continue
      words.push(w)
      wordSegment.push(i)
    }
  })
  return { segments, words, wordSegment }
}

export interface Candidate {
  /** Orden de presentación, 1 = más solapamiento léxico. NO es un veredicto. */
  rank: number
  startSeconds: number
  endSeconds: number
  timecode: string
  speakers: string[]
  /** Verbatim de la transcripción vigente, sin recortar ni limpiar. */
  text: string
  /** Palabras con contenido de la cita presentes en el tramo, 0–1. */
  contentOverlap: number
  /** Las que faltan. Es lo que distingue un reanclaje de una coincidencia. */
  missingWords: string[]
  /**
   * true cuando este tramo ocupa, en el texto nuevo, la marca de tiempo en la
   * que la cita aparecía en el viejo. Señal independiente del solapamiento; se
   * muestra, no se suma.
   */
  matchesSupersededTimecode: boolean
}

/**
 * Los tramos del texto nuevo que más palabras con contenido comparten con la
 * cita, sin solaparse entre sí.
 *
 * La ventana mide lo que mide la cita: buscar una frase de 20 palabras en
 * tramos de 20 evita que un pasaje larguísimo gane por acumulación.
 */
export function candidatePassages(
  quote: string,
  index: TranscriptIndex,
  opts: { top?: number; supersededAt?: { start: number; end: number } | null } = {},
): Candidate[] {
  const top = opts.top ?? 4
  const wanted = contentWords(quote)
  const quoteLen = normaliseForQuoteMatch(quote).split(' ').filter(Boolean).length
  if (quoteLen === 0 || index.words.length === 0) return []
  const win = Math.max(6, Math.min(quoteLen, index.words.length))
  const wantedSet = new Set(wanted)

  // Recuento deslizante: cuántas veces aparece cada palabra buscada dentro de la
  // ventana. Una pasada sobre la transcripción por cita, no una por ventana.
  const counts = new Map<string, number>()
  let distinct = 0
  const add = (w: string) => {
    if (!wantedSet.has(w)) return
    const n = counts.get(w) ?? 0
    counts.set(w, n + 1)
    if (n === 0) distinct += 1
  }
  const drop = (w: string) => {
    if (!wantedSet.has(w)) return
    const n = counts.get(w) ?? 0
    counts.set(w, n - 1)
    if (n === 1) distinct -= 1
  }

  const scored: Array<{ start: number; score: number }> = []
  for (let i = 0; i < index.words.length; i += 1) {
    add(index.words[i])
    if (i >= win) drop(index.words[i - win])
    if (i >= win - 1) scored.push({ start: i - win + 1, score: distinct / wanted.length })
  }

  // Selección voraz por puntuación, descartando ventanas que se pisan: cuatro
  // encuadres del mismo pasaje son un candidato, no cuatro.
  scored.sort((a, b) => (b.score !== a.score ? b.score - a.score : a.start - b.start))
  const picked: Array<{ start: number; score: number }> = []
  for (const s of scored) {
    if (s.score <= 0) break
    if (picked.some((p) => Math.abs(p.start - s.start) < win)) continue
    picked.push(s)
    if (picked.length >= top) break
  }

  const materialise = (start: number, score: number, byTime: boolean): Candidate => {
    const end = Math.min(start + win - 1, index.words.length - 1)
    const segFrom = index.wordSegment[start]
    const segTo = index.wordSegment[end]
    const segs = index.segments.slice(segFrom, segTo + 1)
    const text = segs.map((s) => s.text).join(' ')
    const present = new Set(normaliseForQuoteMatch(text).split(' '))
    return {
      rank: 0,
      startSeconds: segs[0]?.startSeconds ?? 0,
      endSeconds: segs[segs.length - 1]?.endSeconds ?? 0,
      timecode: formatTimecode(segs[0]?.startSeconds ?? 0),
      speakers: [...new Set(segs.map((s) => s.speaker).filter((s): s is string => !!s))],
      text,
      contentOverlap: Number(score.toFixed(2)),
      missingWords: wanted.filter((w) => !present.has(w)),
      matchesSupersededTimecode: byTime,
    }
  }

  const out = picked.map((p) => materialise(p.start, p.score, false))

  // La segunda evidencia, siempre presente cuando se puede calcular: el tramo
  // que en el texto nuevo ocupa la misma franja de tiempo. Un cotejo léxico
  // puede fallar entero si el motor viejo inventó las palabras clave; el reloj
  // no depende de eso.
  if (opts.supersededAt) {
    const mid = (opts.supersededAt.start + opts.supersededAt.end) / 2
    let best = -1
    let bestDist = Infinity
    index.segments.forEach((seg, i) => {
      const d = Math.abs((seg.startSeconds + seg.endSeconds) / 2 - mid)
      if (d < bestDist) {
        bestDist = d
        best = i
      }
    })
    if (best >= 0) {
      const wordAt = index.wordSegment.findIndex((s) => s >= best)
      if (wordAt >= 0) {
        const start = Math.max(0, Math.min(wordAt, index.words.length - win))
        const existing = out.find(
          (c) => Math.abs(c.startSeconds - (index.segments[best]?.startSeconds ?? 0)) < 1,
        )
        if (existing) existing.matchesSupersededTimecode = true
        else {
          const counted = new Set(index.words.slice(start, start + win))
          const score = wanted.filter((w) => counted.has(w)).length / wanted.length
          out.push(materialise(start, score, true))
        }
      }
    }
  }

  return out.map((c, i) => ({ ...c, rank: i + 1 }))
}

/** Dónde aparecía la cita en la transcripción sustituida, si se puede situar. */
export function locateInSuperseded(
  quote: string,
  index: TranscriptIndex,
): { start: number; end: number; timecode: string; text: string } | null {
  for (let i = 0; i < index.segments.length; i += 1) {
    // Ventana de tres segmentos: las transcripciones viejas parten frases en
    // tramos fijos de 30 s, así que una cita cruza el corte casi siempre.
    const window = index.segments.slice(i, i + 3)
    const joined = window.map((s) => s.text).join(' ')
    if (!quoteAppearsIn(quote, joined)) continue
    return {
      start: window[0].startSeconds,
      end: window[window.length - 1].endSeconds,
      timecode: formatTimecode(window[0].startSeconds),
      text: joined,
    }
  }
  return null
}

// ─── La cola ────────────────────────────────────────────────────────────────

export interface ReanchorRow {
  key: string
  findingId: string
  plenoId: string
  plenoDate: string
  title: string
  severity: string
  quoteIndex: number
  /** El literal tal y como está publicado. Byte a byte. */
  publishedQuote: string
  speakerGroup: string | null
  status: string
  reason: string | null
  /** Dónde consta en el texto que se sustituyó, si se puede situar. */
  supersededAt: { start: number; end: number; timecode: string; text: string } | null
  candidates: Candidate[]
  /**
   * Siempre `null`. No hay rama que lo rellene, y es la garantía de la pantalla:
   * la cola propone, no elige.
   */
  seleccion: null
  correctionCommand: string
}

export interface ReanchorQueue {
  _comment: string
  generatedAt: string
  queueVersion: string
  sourceSnapshot: { findings: string; provenance: string; provenanceGeneratedAt: string }
  stats: {
    /** Citas marcadas en el snapshot de procedencia — el denominador. */
    marcadas: number
    encoladas: number
    conCandidatos: number
    sinCandidatos: number
    conMarcaDeTiempo: number
    porEstado: Record<string, number>
  }
  rows: ReanchorRow[]
}

export interface ReanchorFinding {
  id: string
  plenoId: string
  plenoDate: string
  title: string
  severity: string
  quotes?: Array<{ text?: string; speakerGroup?: string | null }>
}

/**
 * Construye la cola. Pura: `corpus` trae los índices ya calculados.
 *
 * Encola exactamente las citas que el snapshot de procedencia marca —los dos
 * estados vienen de `MARKED_STATUS_IDS`, no de una lista escrita aquí—, así que
 * la cola y la página no pueden discrepar sobre cuáles están afectadas.
 */
export function buildReanchorQueue(
  findings: ReanchorFinding[],
  provenance: { quotes?: Record<string, QuoteProvenanceEntry[]>; generatedAt?: string },
  corpus: ReadonlyMap<
    string,
    { current: TranscriptIndex | null; superseded: TranscriptIndex | null }
  >,
  opts: { generatedAt: string; top?: number },
): ReanchorQueue {
  const rows: ReanchorRow[] = []
  const porEstado: Record<string, number> = {}
  let marcadas = 0

  for (const f of findings) {
    const entries = provenance.quotes?.[f.id] ?? []
    const texts = corpus.get(f.plenoId)
    ;(f.quotes ?? []).forEach((q, i) => {
      const entry = entries[i]
      if (!entry || !MARKED_STATUS_IDS.includes(entry.status as never)) return
      marcadas += 1
      porEstado[entry.status] = (porEstado[entry.status] ?? 0) + 1
      const quote = (q.text ?? '').trim()
      const supersededAt =
        texts?.superseded != null ? locateInSuperseded(quote, texts.superseded) : null
      const candidates =
        texts?.current != null
          ? candidatePassages(quote, texts.current, { top: opts.top, supersededAt })
          : []
      rows.push({
        key: `${f.id}::${i}`,
        findingId: f.id,
        plenoId: f.plenoId,
        plenoDate: f.plenoDate,
        title: f.title,
        severity: f.severity,
        quoteIndex: i,
        publishedQuote: q.text ?? '',
        speakerGroup: q.speakerGroup ?? null,
        status: entry.status,
        reason: entry.reason ?? null,
        supersededAt,
        candidates,
        seleccion: null,
        correctionCommand:
          `${REANCHOR_CLI} -- ${f.id} --field quote.${i}.text ` +
          '--new "<el literal del texto nuevo, copiado tal cual>" ' +
          '--reason "<por qué, ≥20 caracteres>" --editor "<tu nombre>"',
      })
    })
  }

  rows.sort((a, b) => {
    if (a.plenoDate !== b.plenoDate) return a.plenoDate < b.plenoDate ? 1 : -1
    if (a.findingId !== b.findingId) return a.findingId < b.findingId ? -1 : 1
    return a.quoteIndex - b.quoteIndex
  })

  return {
    _comment:
      'COLA DE REANCLAJE — no publicada, y no debe publicarse. Vive en editorial/ (gitignored) ' +
      'porque todo lo que hay bajo public/ es fetchable por URL esté enlazado o no. PROPONE ' +
      'pasajes; no elige ninguno (`seleccion` es siempre null) y no afirma que ninguno sea la ' +
      `cita. Decide una persona, y el único escritor del snapshot publicado es \`${REANCHOR_CLI}\`.`,
    generatedAt: opts.generatedAt,
    queueVersion: REANCHOR_QUEUE_VERSION,
    sourceSnapshot: {
      findings: 'public/data/pleno-findings.json',
      provenance: 'public/data/finding-quote-provenance.json',
      provenanceGeneratedAt: provenance.generatedAt ?? '',
    },
    stats: {
      marcadas,
      encoladas: rows.length,
      conCandidatos: rows.filter((r) => r.candidates.length > 0).length,
      sinCandidatos: rows.filter((r) => r.candidates.length === 0).length,
      conMarcaDeTiempo: rows.filter((r) => r.candidates.some((c) => c.matchesSupersededTimecode))
        .length,
      porEstado,
    },
    rows,
  }
}
