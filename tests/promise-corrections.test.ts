/**
 * Corregir o retirar una promesa publicada deja rastro, y sólo el que se pide.
 *
 * El 28-09-2026 la regla pasó a ser que la cita de una promesa son palabras del
 * partido, y la auditoría de /promesas dejó la mayoría de las tarjetas para
 * retirar o recitar. Estas pruebas trabajan sobre el fichero publicado: lo que
 * se mide es lo que el CLI escribirá encima de él.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  promiseDigest,
  reasonEchoes,
  withQuoteCorrection,
  withRetraction,
} from '../src/scraper/promise-corrections'
import { PROMISE_DIGEST_RE, validatePromisesSnapshot } from '../src/scraper/promises'

const RAW = readFileSync(join(__dirname, '..', 'public', 'data', 'promises.json'), 'utf8')
const SNAP = JSON.parse(RAW)
const NOW = new Date('2026-09-28T18:00:00.000Z')
const FIRMA = {
  reason: 'La cita era la narración del periodista; la fuente sí trae las palabras del partido.',
  editor: 'claude-opus-5.5',
}
const primera = SNAP.items[0]

/** Las líneas que cambian entre dos versiones del fichero, fuera del sello. */
const cambiadas = (a: string, b: string) => {
  const sin = (s: string) => JSON.parse(s, (k, v) => (k === 'generatedAt' ? undefined : v))
  return { antes: sin(a), despues: sin(b) }
}

describe('promiseDigest', () => {
  it('fixes a card by its quote and its source, and reads as neither', () => {
    const d = promiseDigest(primera)
    expect(d).toMatch(PROMISE_DIGEST_RE)
    expect(promiseDigest({ ...primera })).toBe(d)
    expect(promiseDigest({ ...primera, source: { url: 'https://otra.example/x' } })).not.toBe(d)
    expect(d).not.toContain(primera.quote.slice(0, 12))
  })
})

describe('reasonEchoes', () => {
  it('catches six words of the withdrawn quote in the reason, and nothing shorter', () => {
    const cita = 'El servicio municipal de Limpieza prometió 48 horas y muchas cosas más'
    expect(
      reasonEchoes('Retirada: «servicio municipal de limpieza prometió 48 horas» no está.', cita),
    ).toBe('servicio municipal de limpieza prometio 48')
    expect(reasonEchoes('La cita no aparece en la página que se enlaza.', cita)).toBeNull()
  })
})

describe('withQuoteCorrection', () => {
  const cita = 'una cita nueva, lo bastante larga para el esquema'

  it('changes the quote with the old one beside it, and nothing else but the stamp', () => {
    const out = withQuoteCorrection(RAW, primera.id, { quote: cita }, FIRMA, NOW)
    const despues = JSON.parse(out)
    const fila = despues.items[0]
    expect(fila.quote).toBe(cita)
    expect(fila.corrections).toEqual([
      {
        field: 'quote',
        original: primera.quote,
        corrected: cita,
        reason: FIRMA.reason,
        editor: FIRMA.editor,
        correctedAt: '2026-09-28',
      },
    ])
    expect(despues.generatedAt).toBe(NOW.toISOString())
    const { antes, despues: resto } = cambiadas(RAW, out)
    resto.items[0] = antes.items[0]
    expect(resto).toEqual(antes)
    expect(() => validatePromisesSnapshot(out)).not.toThrow()
  })

  it('records a new source and publisher as corrections too', () => {
    const out = withQuoteCorrection(
      RAW,
      primera.id,
      {
        quote: cita,
        sourceUrl: 'https://www.ribarroja.es/es/noticia/x',
        publisher: 'Ayuntamiento',
      },
      FIRMA,
      NOW,
    )
    const campos = JSON.parse(out).items[0].corrections.map((c: { field: string }) => c.field)
    expect(campos).toEqual(['quote', 'source.url', 'source.publisher'])
  })

  it('refuses a correction that corrects nothing, an unknown id and an unsigned change', () => {
    expect(() =>
      withQuoteCorrection(RAW, primera.id, { quote: primera.quote }, FIRMA, NOW),
    ).toThrow(/nada que corregir/)
    expect(() => withQuoteCorrection(RAW, 'no-existe', { quote: cita }, FIRMA, NOW)).toThrow(
      /no-existe/,
    )
    expect(() =>
      withQuoteCorrection(RAW, primera.id, { quote: cita }, { ...FIRMA, reason: 'corto' }, NOW),
    ).toThrow(/motivo/)
  })
})

describe('withRetraction', () => {
  const MOTIVO = {
    reason: 'La fuente no pone en boca del partido ninguna frase con este compromiso.',
    editor: 'claude-opus-5.5',
  }

  it('takes the card out and leaves its digest, not its words', () => {
    const out = withRetraction(RAW, primera.id, MOTIVO, NOW)
    const despues = JSON.parse(out)
    expect(despues.items.map((p: { id: string }) => p.id)).not.toContain(primera.id)
    expect(despues.items).toHaveLength(SNAP.items.length - 1)
    const t = despues.retractions.at(-1)
    expect(t).toEqual({
      promiseId: primera.id,
      party: primera.party,
      digest: promiseDigest(primera),
      reason: MOTIVO.reason,
      editor: MOTIVO.editor,
      retractedAt: NOW.toISOString(),
    })
    expect(out).not.toContain(primera.quote)
  })

  it('refuses a reason that republishes the withdrawn quote', () => {
    const cita = primera.quote.split(' ').slice(0, 8).join(' ')
    expect(() =>
      withRetraction(RAW, primera.id, { ...MOTIVO, reason: `No es del partido: «${cita}».` }, NOW),
    ).toThrow(/repite la cita/)
  })

  it('a withdrawn id cannot come back under the same id', () => {
    const out = JSON.parse(withRetraction(RAW, primera.id, MOTIVO, NOW))
    out.items.push(primera)
    expect(() => validatePromisesSnapshot(JSON.stringify(out))).toThrow(/still published/)
  })
})
