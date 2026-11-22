/**
 * La cola de la recuperación (paso 0.2): qué sesiones transcritas siguen sin
 * extraer. Sobre transcripciones REALES del repositorio, no inventadas: una de
 * audio, una de acta y la de audio repetida hasta que la puerta de calidad la
 * rechaza (la forma de línea es la real; sólo se repite).
 */
import { readFileSync, readdirSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { transcriptKind } from '../src/lib/transcript-kind.js'
import { colaDeExtraccion, type Candidata } from '../src/scraper/extraccion-pendiente'
import { assessTranscript } from '../src/scraper/transcript-quality'

const DIR = 'public/data/pleno-transcripts'
const leer = (id: string) => readFileSync(`${DIR}/${id}.txt`, 'utf8')

// Una de cada tipo, elegidas del corpus por el propio detector para que la
// prueba no dependa de un id concreto.
const ficheros = readdirSync(DIR)
  .filter((f) => f.endsWith('.txt'))
  .map((f) => f.slice(0, -4))
const AUDIO = ficheros.find((id) => {
  const t = leer(id)
  return transcriptKind(t) === 'audio' && assessTranscript(t).ok
})!
const ACTA = ficheros.find((id) => transcriptKind(leer(id)) === 'acta')!

const repetida = (() => {
  const lineas = leer(AUDIO).split('\n').filter(Boolean).slice(0, 40)
  return Array.from({ length: 30 }, () => lineas.slice(0, 4))
    .flat()
    .concat(lineas)
    .join('\n')
})()

const c = (id: string, texto: string, fecha: string | null): Candidata => ({ id, texto, fecha })

describe('colaDeExtraccion', () => {
  it('el corpus trae una de audio apta y una de acta (si no, lo de abajo no prueba nada)', () => {
    expect(AUDIO).toBeTruthy()
    expect(ACTA).toBeTruthy()
    expect(assessTranscript(repetida).ok).toBe(false)
  })

  it('deja fuera la de acta, la no apta, la ya extraída y la extraída vacía, cada una con su motivo', () => {
    const cola = colaDeExtraccion(
      [
        c('audio', leer(AUDIO), '2026-01-01'),
        c('acta', leer(ACTA), '2026-02-01'),
        c('repetida', repetida, '2026-03-01'),
        c('hecha', leer(AUDIO), '2026-04-01'),
        c('vacia', leer(AUDIO), '2026-05-01'),
        c('sin-marcas', 'texto sin ninguna marca de tiempo\n', '2026-06-01'),
      ],
      new Set(['hecha']),
      new Set(['vacia']),
    )
    expect(cola.pendientes).toEqual(['audio'])
    expect(Object.fromEntries(cola.fuera.map((f) => [f.id, f.motivo]))).toEqual({
      acta: 'acta',
      repetida: 'no-apta',
      hecha: 'ya-extraida',
      vacia: 'extraida-vacia',
      'sin-marcas': 'sin-marcas',
    })
  })

  it('la más reciente primero; sin fecha, al final', () => {
    const t = leer(AUDIO)
    const cola = colaDeExtraccion(
      [
        c('b', t, '2025-07-28'),
        c('sin', t, null),
        c('a', t, '2026-11-02'),
        c('c', t, '2024-09-09'),
      ],
      new Set(),
      new Set(),
    )
    expect(cola.pendientes).toEqual(['a', 'b', 'c', 'sin'])
  })
})
