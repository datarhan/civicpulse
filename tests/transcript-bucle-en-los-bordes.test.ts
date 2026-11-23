/**
 * Reproductor: el bucle de Whisper en los BORDES de una sesión.
 *
 * Las dos fixtures son los ficheros publicados tal cual, copiados el
 * 23-11-2026 de `public/data/pleno-transcripts/`:
 *
 *   1xmr0do — los diez primeros minutos (la música antes de empezar) salen como
 *             «La Lucha de los Malditos» 19 veces seguidas, y una vigésima línea
 *             que la repite entera; los cuatro últimos, «La Lucha por la Vida».
 *   1237hbp — la primera media hora, «La Lucha de los Malditos» con huecos
 *             vacíos en medio; el final, «no, no, no…».
 *
 * Entre los bordes está la sesión de verdad, así que ninguna de las medidas
 * GLOBALES de la puerta salta: la línea más repetida es el 17 % y el 20 % del
 * fichero (el corte es el 30 %), sale 19 veces en 1xmr0do (el suelo es 20), y
 * la cuota duplicada de `assessTranscript` da justo el 25 % en 1xmr0do, que no
 * supera el «> 25 %». Lo que delata el bucle no es cuánto ocupa, es que se
 * REPITE SEGUIDO: en el corpus publicado, ninguna sesión sana repite la misma
 * línea más de tres veces seguidas; estas dos, 20 y 32.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  assessTranscriptSanity,
  rachaDeBucle,
  MAX_RACHA_DE_BUCLE,
} from '../src/scraper/transcript-sanity'
import { assessTranscript } from '../src/scraper/transcript-quality'

const fx = (name: string) => readFileSync(join(__dirname, 'fixtures', name), 'utf8')

const BUCLES = [
  'transcript_loop-bookends-1xmr0do_2026-09.txt',
  'transcript_loop-bookends-1237hbp_2026-07.txt',
]
const SANAS = [
  'transcript_healthy_2026-03.txt',
  'transcript_healthy-short_2026-07.txt',
  'transcript_bilingual-clean_2026-09.txt',
]

describe('transcript-sanity — bucle en los bordes de la sesión', () => {
  for (const f of BUCLES) {
    it(`${f}: la puerta de transcripción lo rechaza por racha de bucle`, () => {
      const r = assessTranscriptSanity(fx(f))
      expect(r.longestLoopRun).toBeGreaterThanOrEqual(MAX_RACHA_DE_BUCLE)
      expect(r.reasons).toContain('loop-run')
      expect(r.ok).toBe(false)
    })

    it(`${f}: la puerta del extractor tampoco lo deja pasar`, () => {
      const a = assessTranscript(fx(f))
      expect(a.ok).toBe(false)
      expect(a.issues.some((i) => i.includes('bucle'))).toBe(true)
    })
  }

  for (const f of SANAS) {
    it(`${f}: una sesión sana no llega a la racha`, () => {
      const r = assessTranscriptSanity(fx(f))
      // Que midió algo: una sesión con líneas tiene racha ≥ 1.
      expect(r.longestLoopRun).toBeGreaterThanOrEqual(1)
      expect(r.longestLoopRun).toBeLessThan(MAX_RACHA_DE_BUCLE)
      expect(r.reasons).not.toContain('loop-run')
    })
  }
})

describe('rachaDeBucle', () => {
  const t = (xs: string[]) => xs.map((x, i) => `[${i * 30}.0 → ${(i + 1) * 30}.0] ${x}`).join('\n')

  it('cuenta las líneas idénticas seguidas', () => {
    expect(rachaDeBucle(t(['a uno', 'b dos', 'b dos', 'b dos', 'c tres']))).toBe(3)
  })

  it('las líneas vacías no cortan la racha (1237hbp las intercala)', () => {
    expect(rachaDeBucle(t(['La Lucha', '', 'La Lucha', '', '', 'La Lucha']))).toBe(3)
  })

  it('una línea que repite la frase entera cuenta como esa frase', () => {
    const r = rachaDeBucle(
      t([
        'La Lucha de los Malditos',
        'La Lucha de los Malditos La Lucha de los Malditos La Lucha de los Malditos',
      ]),
    )
    expect(r).toBe(2)
  })

  it('las marcas de hablante no la esconden', () => {
    expect(rachaDeBucle(t(['(SPEAKER_01) Sí.', '(SPEAKER_02) Sí.']))).toBe(2)
  })

  it('un fichero vacío no tiene racha', () => {
    expect(rachaDeBucle('')).toBe(0)
  })
})
