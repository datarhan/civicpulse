import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  assessTranscriptSanity,
  lineaTraducida,
  MARCADORES_EN,
  MARCADORES_NATIVOS,
  MAX_TRANSLATED_RUN,
  MAX_TRANSLATED_SHARE,
} from '../src/scraper/transcript-sanity'

const fx = (name: string) => readFileSync(join(__dirname, 'fixtures', name), 'utf8')

// Real failure corpus, July 2026: whisper-1 fed a multi-hour single-request
// upload degenerates into repetition loops ("Más información www.alimmenta.com",
// "Más palabras", "SEÑOR PRESIDENTE DE LA JUNTA DE EXTREMADURA", "no", ".").
// The gate's contract: those transcripts NEVER reach public/data/, while every
// genuine transcript in the corpus — including the 21-line extraordinario —
// passes untouched.
describe('scraper/transcript-sanity — assessTranscriptSanity', () => {
  it('rejects the brxx5g-style full hallucination loop (repetition-loop)', () => {
    const r = assessTranscriptSanity(fx('transcript_halluc-loop_2026-07.txt'))
    expect(r.ok).toBe(false)
    expect(r.reasons).toContain('repetition-loop')
  })

  it('rejects the 1l7hhu7-style all-dots transcript (no-content)', () => {
    const r = assessTranscriptSanity(fx('transcript_halluc-dots_2023-02.txt'))
    expect(r.ok).toBe(false)
    expect(r.reasons).toContain('no-content')
    expect(r.reasons).toContain('repetition-loop')
  })

  it('rejects the 1r6yy0-style half-real half-loop transcript (dominant-line)', () => {
    const r = assessTranscriptSanity(fx('transcript_partial-loop_2023-01.txt'))
    expect(r.ok).toBe(false)
    expect(r.reasons).toContain('dominant-line')
  })

  it('accepts a healthy full-session transcript', () => {
    const r = assessTranscriptSanity(fx('transcript_healthy_2026-03.txt'))
    expect(r.ok).toBe(true)
    expect(r.reasons).toEqual([])
  })

  it('accepts a genuine 21-line extraordinario (short ≠ degenerate)', () => {
    const r = assessTranscriptSanity(fx('transcript_healthy-short_2026-07.txt'))
    expect(r.ok).toBe(true)
    expect(r.reasons).toEqual([])
  })

  it('rejects an empty / near-empty transcript (too-few-lines)', () => {
    expect(assessTranscriptSanity('').ok).toBe(false)
    expect(assessTranscriptSanity('').reasons).toContain('too-few-lines')
    const r = assessTranscriptSanity('[0.0 → 5.0] Buenos días.\n[5.0 → 9.0] Se abre la sesión.\n')
    expect(r.ok).toBe(false)
    expect(r.reasons).toContain('too-few-lines')
  })

  it('reports the metrics it decided on', () => {
    const loop = Array.from({ length: 100 }, (_, i) => `[${i}.0 → ${i + 1}.0] Más palabras`).join(
      '\n',
    )
    const r = assessTranscriptSanity(loop)
    expect(r.lines).toBe(100)
    expect(r.uniqueLines).toBe(1)
    expect(r.uniqueRatio).toBeCloseTo(0.01, 3)
    expect(r.topLineShare).toBeCloseTo(1.0, 3)
    expect(r.ok).toBe(false)
  })

  it('does not flag a small file where a routine line repeats (no topCount floor breach)', () => {
    // 30 lines, 8 of them "Gracias." — realistic for a short session; the
    // dominant-line rule needs an absolute count (≥20) besides the share.
    const lines = [
      ...Array.from({ length: 8 }, (_, i) => `[${i}.0 → ${i + 1}.0] Gracias.`),
      ...Array.from(
        { length: 22 },
        (_, i) =>
          `[${i + 10}.0 → ${i + 11}.0] Punto ${i + 1} del orden del día, expediente ${1000 + i}, se aprueba por unanimidad tras el debate correspondiente.`,
      ),
    ].join('\n')
    const r = assessTranscriptSanity(lines)
    expect(r.ok).toBe(true)
  })
})

describe('transcript sanity — Whisper hallucination markers', () => {
  const speech = (n: number) =>
    Array.from(
      { length: n },
      (_, i) =>
        `[${i}.0 → ${i + 1}.0] Intervención número ${i} sobre el expediente municipal correspondiente.`,
    ).join('\n')

  it('flags a file padded with subtitle-corpus text', () => {
    // Real: 1du4rf5 carries 110 lines of "Más información www.alimmenta.com" —
    // a nutrition site the model memorised — and supplies 293 published claims.
    const ads = Array.from(
      { length: 60 },
      (_, i) => `[${i}.0 → ${i + 1}.0] Más información www.alimmenta.com`,
    ).join('\n')
    const report = assessTranscriptSanity(`${speech(500)}\n${ads}`)
    expect(report.ok).toBe(false)
    expect(report.reasons).toContain('hallucination-markers')
    expect(report.hallucinatedLines).toBe(60)
  })

  it('tolerates a stray sign-off in a long real session', () => {
    // One "¡Suscríbete al canal!" in 500 lines of speech is noise, not a
    // degenerate decode. The gate exists to catch files that are mostly
    // hallucination, not to quarantine on a single line.
    const report = assessTranscriptSanity(`${speech(500)}\n[0.0 → 1.0] ¡Suscríbete al canal!`)
    expect(report.reasons).not.toContain('hallucination-markers')
    expect(report.hallucinatedLines).toBe(1)
  })
})

/**
 * El SEGUNDO modo de fallo del motor: en vez de degenerar, TRADUCE.
 *
 * Medido el 5-09-2026 sobre las 44 transcripciones publicadas: 12 traen alguna
 * racha en inglés y `1r6yy0` llega al 6,9 % del fichero, con `language='es'`
 * puesto en las dos rutas del transcriptor. No es una bandera que falte: es el
 * modelo cambiando de tarea a media sesión. Importa porque lo que se publica es
 * lo que dijo un concejal con nombre, y una traducción no es lo que dijo.
 */
describe('traducido en vez de transcrito', () => {
  it('suspende un pasaje realmente traducido, y por ESE motivo', () => {
    const r = assessTranscriptSanity(fx('transcript_translated_2026-09.txt'))
    expect(r.ok).toBe(false)
    expect(r.reasons).toContain('translated-passages')
    // Y sólo por ése: si además saltara `repetition-loop` la prueba no estaría
    // midiendo el detector nuevo sino los viejos.
    expect(r.reasons).toEqual(['translated-passages'])
    expect(r.translatedLines).toBeGreaterThan(0)
  })

  /**
   * EL CONTROL, y es el que sostiene todo lo demás. Este pleno se habla
   * cambiando de lengua a mitad de frase —castellano y valencià— y un detector
   * que confunda eso con una traducción cuarentenaría transcripciones buenas
   * hasta que alguien lo apagara. El fixture sale del corpus real, no inventado.
   */
  it('un pleno bilingüe castellano/valencià pasa limpio', () => {
    const r = assessTranscriptSanity(fx('transcript_bilingual-clean_2026-09.txt'))
    expect(r.reasons).not.toContain('translated-passages')
    expect(r.translatedLines).toBe(0)
    expect(r.ok).toBe(true)
  })

  it('no juzga lo que no puede juzgar, y no lo cuenta como limpio', () => {
    // Cortas o sin marcadores: fuera del denominador, no «bien».
    expect(lineaTraducida('Sí.')).toBeNull()
    expect(lineaTraducida('Gracias, muchas gracias.')).toBeNull()
    expect(lineaTraducida('[12.0 → 15.0] (SPEAKER_02) Vale.')).toBeNull()
    // Un fichero entero de interjecciones no puede salir «0 % traducido» por no
    // haber mirado nada: sale 0 porque no hay denominador, y lo dice el 0 de
    // líneas juzgadas, no un visto bueno.
    const r = assessTranscriptSanity(Array(40).fill('Sí.').join('\n'))
    expect(r.translatedLines).toBe(0)
    expect(r.translatedShare).toBe(0)
  })

  it('reconoce las dos lenguas de la sesión y el inglés, línea a línea', () => {
    expect(
      lineaTraducida('El punto siguiente del orden del día es la aprobación de la cuenta.'),
    ).toBe(false)
    expect(
      lineaTraducida("Però anem a començar el ple en el primer punt de l'ordre del dia."),
    ).toBe(false)
    expect(
      lineaTraducida('Because they are talking about failing the system of the government.'),
    ).toBe(true)
  })

  /**
   * Los dos criterios miran cosas distintas a propósito: la CUOTA caza un motor
   * que va y viene toda la sesión; la RACHA caza un trozo entero traducido de
   * una vez, que en un fichero largo puede ser poco porcentaje y aun así ser
   * una intervención completa puesta en boca de alguien en otro idioma.
   */
  it('la cuota y la racha suspenden por separado', () => {
    const es = 'El punto siguiente del orden del día es la aprobación de la cuenta general.'
    const en = 'The council has decided that this budget would be approved with the same terms.'
    const monta = (nEs: number, ingles: string[]) => [...Array(nEs).fill(es), ...ingles].join('\n')

    // Racha larga, cuota baja: 8 seguidas entre 200 nativas = 3,8 %.
    const racha = assessTranscriptSanity(monta(200, Array(MAX_TRANSLATED_RUN).fill(en)))
    expect(racha.translatedShare).toBeLessThan(MAX_TRANSLATED_SHARE)
    expect(racha.longestTranslatedRun).toBe(MAX_TRANSLATED_RUN)
    expect(racha.reasons).toContain('translated-passages')

    // Cuota alta, racha de 1: intercaladas.
    const sueltas = Array.from({ length: 200 }, (_, i) => (i % 8 === 0 ? en : es)).join('\n')
    const cuota = assessTranscriptSanity(sueltas)
    expect(cuota.longestTranslatedRun).toBe(1)
    expect(cuota.translatedShare).toBeGreaterThan(MAX_TRANSLATED_SHARE)
    expect(cuota.reasons).toContain('translated-passages')

    // Y el control: por debajo de los dos, no suspende por esto.
    const poco = assessTranscriptSanity(monta(200, [en]))
    expect(poco.reasons).not.toContain('translated-passages')
  })

  it('los marcadores se exportan; nadie los recita', () => {
    expect(MARCADORES_EN.has('the')).toBe(true)
    expect(MARCADORES_NATIVOS.has('que')).toBe(true)
    expect(MARCADORES_NATIVOS.has('amb')).toBe(true) // valencià, no sólo castellano
  })
})
