/**
 * La cola de reanclaje: los pasajes de la transcripción vigente entre los que
 * una persona elige, para un literal publicado que ya no aparece en ella.
 *
 * Lo que estas pruebas tienen que medir no es «¿acierta?» — la cola no afirma
 * acertar — sino que **propone sin elegir**, que no encola de más ni de menos, y
 * que sus candidatos salen del texto real y no de una plantilla. El caso de
 * manual es `10yl550`, donde el primer motor convirtió «Está tombada» en «Es un
 * satombat» y esas dos palabras se publicaron entre comillas.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import {
  buildReanchorQueue,
  candidatePassages,
  contentWords,
  formatTimecode,
  indexTranscript,
  isContentWord,
  locateInSuperseded,
  parseTimestampedSegments,
  REANCHOR_QUEUE_VERSION,
  STOPWORDS,
} from '../src/scraper/quote-reanchor'
import { MARKED_STATUS_IDS, type QuoteProvenanceSnapshot } from '../src/scraper/quote-provenance'
import { validateFindingsSnapshot } from '../src/scraper/pleno-finding'
import { loadSessionTexts } from '../scripts/lib/transcript-corpus'

const ROOT = join(__dirname, '..')
const FINDINGS = validateFindingsSnapshot(
  readFileSync(join(ROOT, 'public/data/pleno-findings.json'), 'utf8'),
)
const PROVENANCE = JSON.parse(
  readFileSync(join(ROOT, 'public/data/finding-quote-provenance.json'), 'utf8'),
) as QuoteProvenanceSnapshot

const SESSIONS = loadSessionTexts(
  FINDINGS.items.map((f) => f.plenoId),
  {
    transcriptsDir: join(ROOT, 'public/data/pleno-transcripts'),
    supersededDir: join(ROOT, 'public/data/pleno-transcripts/superseded'),
  },
)
const CORPUS = new Map(
  [...SESSIONS].map(([id, s]) => [
    id,
    {
      current: s.current ? indexTranscript(s.current) : null,
      superseded: s.superseded ? indexTranscript(s.superseded) : null,
    },
  ]),
)
const QUEUE = buildReanchorQueue(FINDINGS.items, PROVENANCE, CORPUS, {
  generatedAt: '2026-08-10T00:00:00.000Z',
})

describe('la cola PROPONE y no elige', () => {
  it('ninguna fila llega con un candidato seleccionado', () => {
    expect(QUEUE.rows.length).toBeGreaterThan(50)
    for (const r of QUEUE.rows) expect(r.seleccion).toBeNull()
    // Y no por otro nombre: ninguna fila trae una marca de «éste es».
    const serialised = JSON.stringify(QUEUE)
    expect(serialised).not.toMatch(/"(selected|elegido|chosen|best|recommended)"\s*:\s*true/)
  })

  it('propone de verdad: casi todas las filas traen pasajes que leer', () => {
    expect(QUEUE.stats.conCandidatos).toBeGreaterThan(50)
    expect(QUEUE.stats.conCandidatos + QUEUE.stats.sinCandidatos).toBe(QUEUE.rows.length)
    for (const r of QUEUE.rows) {
      for (const c of r.candidates) {
        expect(c.text.length).toBeGreaterThan(0)
        expect(c.timecode).toMatch(/^\d+:\d{2}(:\d{2})?$/)
      }
    }
  })

  it('el orden es solapamiento léxico, y se declara como tal en cada fila', () => {
    const withMany = QUEUE.rows.filter(
      (r) => r.candidates.filter((c) => !c.matchesSupersededTimecode).length > 1,
    )
    expect(withMany.length).toBeGreaterThan(10)
    for (const r of withMany) {
      const byOverlap = r.candidates.filter((c) => !c.matchesSupersededTimecode)
      for (let i = 1; i < byOverlap.length; i += 1) {
        expect(byOverlap[i].contentOverlap).toBeLessThanOrEqual(byOverlap[i - 1].contentOverlap)
      }
      // El número está, pero acompañado de lo que falta: sin eso, un 60 % se
      // lee como «casi seguro» cuando puede ser vocabulario compartido.
      expect(Array.isArray(byOverlap[0].missingWords)).toBe(true)
    }
  })

  it('cada fila compone el comando de corrección, y ninguna lo ejecuta', () => {
    for (const r of QUEUE.rows) {
      expect(r.correctionCommand).toContain(`--field quote.${r.quoteIndex}.text`)
      expect(r.correctionCommand).toContain('npm run correct-pleno-finding')
      expect(r.correctionCommand).toContain(r.findingId)
      // El texto nuevo es un hueco a rellenar por una persona, nunca un
      // candidato ya metido en el comando.
      expect(r.correctionCommand).toMatch(/--new "<[^"]*>"/)
    }
  })
})

describe('la cola encola exactamente lo que la página marca', () => {
  it('una fila por cita marcada, ni una más', () => {
    const expected = PROVENANCE.stats.soloEnSustituida + PROVENANCE.stats.sinDeterminar
    expect(expected).toBeGreaterThan(0)
    expect(QUEUE.rows).toHaveLength(expected)
    expect(QUEUE.stats.encoladas).toBe(expected)
    expect(QUEUE.stats.marcadas).toBe(expected)
  })

  it('no encola ninguna cita que la página da por buena', () => {
    for (const r of QUEUE.rows) expect(MARKED_STATUS_IDS).toContain(r.status)
    const keys = new Set(QUEUE.rows.map((r) => r.key))
    let sound = 0
    for (const f of FINDINGS.items) {
      ;(PROVENANCE.quotes[f.id] ?? []).forEach((e, i) => {
        if (e.status !== 'en-vigente') return
        sound += 1
        expect(keys.has(`${f.id}::${i}`)).toBe(false)
      })
    }
    expect(sound).toBeGreaterThan(50)
  })

  it('el literal encolado es byte a byte el publicado', () => {
    for (const r of QUEUE.rows) {
      expect(r.publishedQuote).toBe(
        FINDINGS.items.find((f) => f.id === r.findingId)!.quotes[r.quoteIndex].text,
      )
    }
  })

  it('lleva su versión, para que una cola vieja no se lea como nueva', () => {
    expect(QUEUE.queueVersion).toBe(REANCHOR_QUEUE_VERSION)
  })
})

describe('el caso de manual: «satombat» → «Está tombada»', () => {
  const row = QUEUE.rows.find((r) => r.publishedQuote.includes('satombat'))

  it('la cita degradada está encolada', () => {
    expect(row).toBeTruthy()
    expect(row!.plenoId).toBe('10yl550')
  })

  it('el pasaje real del texto nuevo está entre los candidatos', () => {
    // No se afirma que sea el elegido — se afirma que la cola se lo PONE
    // delante al curador. Sin esto, «propone sin elegir» sería compatible con
    // proponer basura.
    expect(row!.candidates.some((c) => /tombada/i.test(c.text))).toBe(true)
  })

  it('sitúa dónde constaba en el texto sustituido, con marca de tiempo', () => {
    expect(row!.supersededAt).toBeTruthy()
    expect(row!.supersededAt!.text).toMatch(/satombat/i)
    expect(row!.supersededAt!.timecode).toMatch(/^\d+:\d{2}:\d{2}$/)
  })
})

describe('trocear una transcripción', () => {
  const TXT = [
    '[390.8 → 392.9] (SPEAKER_00) Un protest, ara',
    '[392.9 → 393.1] (SPEAKER_01) Um.',
    'una línea suelta que continúa la anterior',
    '[0.0 → 30.0] Música',
  ].join('\n')

  it('lee marca de tiempo y hablante, y tolera la variante sin hablante', () => {
    const segs = parseTimestampedSegments(TXT)
    expect(segs).toHaveLength(3)
    expect(segs[0]).toEqual({
      startSeconds: 390.8,
      endSeconds: 392.9,
      speaker: 'SPEAKER_00',
      text: 'Un protest, ara',
    })
    expect(segs[2].speaker).toBeNull()
  })

  it('una línea sin cabecera se pega al segmento anterior en vez de perderse', () => {
    expect(parseTimestampedSegments(TXT)[1].text).toBe(
      'Um. una línea suelta que continúa la anterior',
    )
  })

  it('formatTimecode da lo que se teclea en el reproductor', () => {
    expect(formatTimecode(0)).toBe('0:00')
    expect(formatTimecode(92.7)).toBe('1:32')
    expect(formatTimecode(4212.7)).toBe('1:10:12')
  })

  it('indexa cada palabra con su segmento', () => {
    const idx = indexTranscript(TXT)
    expect(idx.words.length).toBe(idx.wordSegment.length)
    expect(idx.words.length).toBeGreaterThan(5)
    expect(idx.wordSegment[0]).toBe(0)
    expect(idx.wordSegment[idx.wordSegment.length - 1]).toBe(2)
  })
})

describe('el solapamiento cuenta palabras que distinguen, no relleno', () => {
  it('las funcionales no entran en el denominador', () => {
    expect(isContentWord('de')).toBe(false)
    expect(isContentWord('que')).toBe(false)
    expect(isContentWord('contenedores')).toBe(true)
    expect(STOPWORDS.has('para')).toBe(true)
  })

  it('una cita sin palabras con contenido no vale 100 % contra cualquier cosa', () => {
    // Denominador cero ⇒ todo encaja: la forma exacta de un cotejador que no
    // cotejaba. Se cae a todas las palabras en vez de a ninguna.
    expect(contentWords('de la que en el')).toEqual(['de', 'la', 'que', 'en', 'el'])
  })

  it('no repite una palabra que la cita dice dos veces', () => {
    expect(contentWords('contrato contrato basura')).toEqual(['contrato', 'basura'])
  })

  it('un pasaje que comparte el tema pero no las palabras no gana al que sí', () => {
    const idx = indexTranscript(
      [
        '[0.0 → 10.0] (SPEAKER_00) Hablamos del contrato de recogida de residuos y de los contenedores del casco antiguo.',
        '[10.0 → 20.0] (SPEAKER_01) El presupuesto de fiestas se aprobó en junta de gobierno la semana pasada.',
      ].join('\n'),
    )
    const out = candidatePassages('contrato de recogida de residuos y contenedores', idx, {
      top: 2,
    })
    expect(out[0].text).toMatch(/residuos/)
    expect(out[0].contentOverlap).toBeGreaterThan(out[1]?.contentOverlap ?? 0)
  })

  it('sin transcripción no inventa candidatos', () => {
    expect(candidatePassages('lo que sea', indexTranscript(''))).toEqual([])
    expect(candidatePassages('', indexTranscript('[0.0 → 1.0] hola'))).toEqual([])
  })

  it('locateInSuperseded devuelve null cuando la cita no está', () => {
    const idx = indexTranscript('[0.0 → 30.0] Música música música')
    expect(
      locateInSuperseded('una frase que nadie dijo jamás en este pleno municipal', idx),
    ).toBeNull()
  })
})
