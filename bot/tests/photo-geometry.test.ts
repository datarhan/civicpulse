import { describe, expect, it } from 'vitest'
import {
  clampRect,
  normToPixelRect,
  expandRect,
  parseVisionBoxes,
  rectParaTapar,
} from '../src/services/photo-geometry'

/**
 * El rectángulo que se tapa de verdad. Una detección diminuta —una cara lejana, o
 * una caja leída en la escala equivocada— se tapaba con un mosaico de uno o dos
 * píxeles, que no tapa nada. Ahora se tapa como mínimo un bloque entero alrededor
 * de la detección; y si no cae sobre ningún píxel, no hay rectángulo (y la foto se
 * retiene, en anonymizeImage).
 */
describe('rectParaTapar', () => {
  it('una detección diminuta se tapa con al menos un bloque, centrado en ella', () => {
    const r = rectParaTapar({ x: 0.5, y: 0.5, w: 0.001, h: 0.001 }, 1000, 1000, 0.12, 16)!
    expect(r.width).toBeGreaterThanOrEqual(16)
    expect(r.height).toBeGreaterThanOrEqual(16)
    // Centrada: el centro de la detección queda dentro.
    expect(r.left).toBeLessThanOrEqual(500)
    expect(r.left + r.width).toBeGreaterThanOrEqual(500)
  })

  it('una detección normal se tapa con su margen, igual que antes (el control)', () => {
    expect(rectParaTapar({ x: 0.1, y: 0.1, w: 0.1, h: 0.1 }, 1000, 1000, 0.1, 16)).toEqual({
      left: 90,
      top: 90,
      width: 120,
      height: 120,
    })
  })

  it('en una esquina, el bloque mínimo se queda dentro de la imagen', () => {
    const r = rectParaTapar({ x: 0.999, y: 0.999, w: 0.0005, h: 0.0005 }, 1000, 1000, 0.12, 16)!
    expect(r.left + r.width).toBeLessThanOrEqual(1000)
    expect(r.top + r.height).toBeLessThanOrEqual(1000)
    expect(r.width).toBeGreaterThanOrEqual(16)
  })

  it('una caja que no cae sobre ningún píxel no da rectángulo', () => {
    expect(rectParaTapar({ x: 0.9999, y: 0.5, w: 0.00001, h: 0.2 }, 120, 120, 0.12, 16)).toBeNull()
  })
})

describe('clampRect', () => {
  it('leaves an in-bounds rect untouched', () => {
    expect(clampRect({ left: 10, top: 10, width: 30, height: 20 }, 100, 100)).toEqual({
      left: 10,
      top: 10,
      width: 30,
      height: 20,
    })
  })

  it('shrinks a rect that spills past the top-left origin', () => {
    expect(clampRect({ left: -10, top: -5, width: 40, height: 30 }, 100, 100)).toEqual({
      left: 0,
      top: 0,
      width: 30,
      height: 25,
    })
  })

  it('shrinks a rect that spills past the right/bottom edge', () => {
    expect(clampRect({ left: 90, top: 80, width: 40, height: 40 }, 100, 100)).toEqual({
      left: 90,
      top: 80,
      width: 10,
      height: 20,
    })
  })

  it('returns null for a rect fully outside the image', () => {
    expect(clampRect({ left: 200, top: 200, width: 10, height: 10 }, 100, 100)).toBeNull()
  })
})

describe('normToPixelRect', () => {
  it('maps a 0..1 normalized box onto pixel space', () => {
    expect(normToPixelRect({ x: 0.1, y: 0.2, w: 0.3, h: 0.4 }, 1000, 500)).toEqual({
      left: 100,
      top: 100,
      width: 300,
      height: 200,
    })
  })

  it('clamps a box that runs off the edge', () => {
    expect(normToPixelRect({ x: 0.9, y: 0.9, w: 0.5, h: 0.5 }, 100, 100)).toEqual({
      left: 90,
      top: 90,
      width: 10,
      height: 10,
    })
  })

  it('returns null for a zero-area box', () => {
    expect(normToPixelRect({ x: 0.1, y: 0.1, w: 0, h: 0.2 }, 100, 100)).toBeNull()
  })
})

describe('expandRect', () => {
  it('grows a rect by a fraction of its own size on every side', () => {
    expect(expandRect({ left: 100, top: 100, width: 100, height: 100 }, 0.1, 1000, 1000)).toEqual({
      left: 90,
      top: 90,
      width: 120,
      height: 120,
    })
  })

  it('clamps the grown rect back inside the image', () => {
    expect(expandRect({ left: 5, top: 5, width: 20, height: 20 }, 0.5, 1000, 1000)).toEqual({
      left: 0,
      top: 0,
      width: 35,
      height: 35,
    })
  })
})

describe('parseVisionBoxes', () => {
  it('parses a plain JSON array of normalized boxes', () => {
    expect(parseVisionBoxes('[{"x":0.1,"y":0.2,"w":0.3,"h":0.1,"label":"face"}]')).toEqual([
      { x: 0.1, y: 0.2, w: 0.3, h: 0.1, label: 'face' },
    ])
  })

  it('tolerates a ```json fenced code block', () => {
    const raw = '```json\n[{"x":0.1,"y":0.2,"w":0.3,"h":0.1}]\n```'
    expect(parseVisionBoxes(raw)).toEqual([{ x: 0.1, y: 0.2, w: 0.3, h: 0.1, label: undefined }])
  })

  // Hasta el 2026-09-27 la prosa alrededor se toleraba, y con ella una negativa
  // del modelo terminada en `[]` —«no puedo analizar personas en esta imagen. []»—
  // se leía como «nada que tapar» y la foto salía sin mosaico. Ahora la llamada
  // pide JSON (responseMimeType) y lo que no sea la lista sola retiene.
  it('RETIENE si hay prosa alrededor de la lista: una negativa con «[]» no es «nada que tapar»', () => {
    expect(() => parseVisionBoxes('I cannot analyze people in this image. []')).toThrow()
    expect(() =>
      parseVisionBoxes('Here are the regions:\n[{"x":0.5,"y":0.5,"w":0.2,"h":0.2}]\nDone.'),
    ).toThrow()
  })

  it('returns an empty array when the model reports nothing found ("[]")', () => {
    // A *successful* empty detection means "no faces/plates" → publish with the
    // global degrade only. This is distinct from a malformed response.
    expect(parseVisionBoxes('[]')).toEqual([])
  })

  // LA FUGA que esta prueba fijaba al revés hasta el 27-09-2026: cada elemento
  // que no se entendía se TIRABA y el resto seguía. Si el modelo contesta en su
  // formato nativo (`box_2d`, de 0 a 1000) o en píxeles, TODOS se tiran, sale
  // `[]` —que es «no hay nada que tapar»— y la foto se publica sin mosaico.
  // Un elemento que no se sabe leer es una cara que no se sabe dónde está.
  it('RETIENE la foto si un solo elemento no se puede interpretar', () => {
    const raw = '[{"x":0.1,"y":0.1,"w":0.1,"h":0.1},{"x":2,"y":0,"w":0.1,"h":0.1},{"foo":1}]'
    expect(() => parseVisionBoxes(raw)).toThrow()
    expect(() => parseVisionBoxes('[{"x":0.1,"y":0.1,"w":0.1,"h":0.1},{"foo":1}]')).toThrow()
    expect(() => parseVisionBoxes('[{"x":0.1,"y":0.1,"w":0.1,"h":0.1},7]')).toThrow()
  })

  it('una caja en píxeles (fuera de 0..1) no se toma por una fracción: retiene', () => {
    expect(() => parseVisionBoxes('[{"x":120,"y":80,"w":40,"h":40}]')).toThrow()
  })

  it('entiende el formato nativo de Gemini: box_2d = [ymin, xmin, ymax, xmax] en 0..1000', () => {
    expect(parseVisionBoxes('[{"box_2d":[100,200,300,400],"label":"face"}]')).toEqual([
      { x: 0.2, y: 0.1, w: 0.2, h: 0.2, label: 'face' },
    ])
  })

  // Un box_2d con todos sus valores ≤ 1 viene en fracciones, no en milésimas:
  // leído como 0..1000, una cara que ocupa media foto se convierte en un píxel en
  // la esquina y se publica destapada.
  it('un box_2d en fracciones (todo ≤ 1) es otra escala: retiene', () => {
    expect(() => parseVisionBoxes('[{"box_2d":[0.1,0.2,0.5,0.6]}]')).toThrow()
  })

  // Una caja de área cero o que empieza justo en el borde no tapa nada: retiene,
  // no se descarta en silencio.
  it('una caja de área cero, o que empieza en el borde, retiene', () => {
    expect(() => parseVisionBoxes('[{"x":0.1,"y":0.1,"w":0,"h":0.2}]')).toThrow()
    expect(() => parseVisionBoxes('[{"x":1,"y":0.1,"w":0.1,"h":0.2}]')).toThrow()
  })

  it('un box_2d invertido o fuera de 0..1000 retiene', () => {
    expect(() => parseVisionBoxes('[{"box_2d":[300,400,100,200]}]')).toThrow()
    expect(() => parseVisionBoxes('[{"box_2d":[0,0,1200,500]}]')).toThrow()
    expect(() => parseVisionBoxes('[{"box_2d":[0,0,500]}]')).toThrow()
  })

  // Una caja que se sale un poco por el borde sigue siendo una cara: se recorta,
  // no se tira.
  it('una caja que se sale por el borde se recorta, no se descarta', () => {
    const [b] = parseVisionBoxes('[{"x":0.9,"y":0.8,"w":0.3,"h":0.5}]')
    expect(b.x).toBeCloseTo(0.9)
    expect(b.y).toBeCloseTo(0.8)
    expect(b.w).toBeCloseTo(0.1)
    expect(b.h).toBeCloseTo(0.2)
  })

  it('THROWS on an unparseable response so the caller fails closed (holds the photo)', () => {
    // No JSON array at all → we must NOT treat this as "nothing found". A refusal
    // or garbled response has to hold the photo, never publish it un-anonymized.
    expect(() => parseVisionBoxes('Sorry, I cannot help with that.')).toThrow()
  })
})
