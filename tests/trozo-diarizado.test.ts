import { describe, it, expect } from 'vitest'
import { lineasDeTrozoOpenAI } from '../src/scraper/trozo-diarizado'

/**
 * La rama de OpenAI escribía lo que viniera en un 200, también nada: un trozo
 * con `segments: []` dejaba un hueco de veinte minutos en la transcripción, y la
 * comprobación de cobertura sólo mira la última marca de tiempo. La rama de
 * Gemini ya se negaba (regla 2: «no recibí nada» no es «no había nada»).
 */

describe('lineasDeTrozoOpenAI', () => {
  const datos = {
    segments: [
      { start: 0.5, end: 4.25, speaker: 'A', text: ' Bon dia a tothom. ' },
      { start: 5, end: 9, speaker: 'B', text: 'Gracias, presidente.' },
      { start: 40, end: 44, speaker: 'A', text: 'Passem al següent punt.' },
    ],
  }

  it('escribe cada segmento con el desplazamiento y la etiqueta del trozo', () => {
    const r = lineasDeTrozoOpenAI(datos, { desplazamiento: 1210.5, indice: 1 })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.lineas).toEqual([
      '[1211.0 → 1214.8] (SPEAKER_20) Bon dia a tothom.',
      '[1215.5 → 1219.5] (SPEAKER_21) Gracias, presidente.',
      '[1250.5 → 1254.5] (SPEAKER_20) Passem al següent punt.',
    ])
    expect(r.resumen).toMatchObject({ segmentos: 3, oradores: 2, mayorHueco: 31 })
  })

  it('se niega a un segmento sin marcas de tiempo, en vez de ponerlo en el segundo 0', () => {
    const r = lineasDeTrozoOpenAI(
      {
        segments: [
          { start: 3, end: 4, speaker: 'A', text: 'hola' },
          { speaker: 'A', text: 'adiós' },
        ],
      },
      { desplazamiento: 1200, indice: 1 },
    )
    expect(r.ok).toBe(false)
  })

  it('sin orador, UNKNOWN', () => {
    const r = lineasDeTrozoOpenAI(
      { segments: [{ start: 0, end: 1, text: 'hola' }] },
      { desplazamiento: 0, indice: 0 },
    )
    expect(r.ok && r.lineas[0]).toBe('[0.0 → 1.0] (UNKNOWN) hola')
  })

  it('se niega a un 200 sin segmentos', () => {
    const r = lineasDeTrozoOpenAI({ segments: [] }, { desplazamiento: 0, indice: 3 })
    expect(r.ok).toBe(false)
  })

  it('se niega a un 200 sin el campo', () => {
    expect(lineasDeTrozoOpenAI({}, { desplazamiento: 0, indice: 0 }).ok).toBe(false)
  })

  it('se niega a segmentos que no dicen nada', () => {
    const r = lineasDeTrozoOpenAI(
      { segments: [{ start: 0, end: 3, speaker: 'A', text: '   ' }] },
      { desplazamiento: 0, indice: 0 },
    )
    expect(r.ok).toBe(false)
  })
})
