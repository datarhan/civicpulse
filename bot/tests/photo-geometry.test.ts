import { describe, expect, it } from 'vitest'
import {
  clampRect,
  normToPixelRect,
  expandRect,
  parseVisionBoxes,
} from '../src/services/photo-geometry'

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

  it('tolerates surrounding prose', () => {
    const raw = 'Here are the regions:\n[{"x":0.5,"y":0.5,"w":0.2,"h":0.2}]\nDone.'
    expect(parseVisionBoxes(raw)).toHaveLength(1)
  })

  it('returns an empty array when the model reports nothing found ("[]")', () => {
    // A *successful* empty detection means "no faces/plates" → publish with the
    // global degrade only. This is distinct from a malformed response.
    expect(parseVisionBoxes('[]')).toEqual([])
  })

  it('drops individual malformed / out-of-range entries but keeps valid ones', () => {
    const raw = '[{"x":0.1,"y":0.1,"w":0.1,"h":0.1},{"x":2,"y":0,"w":0.1,"h":0.1},{"foo":1}]'
    expect(parseVisionBoxes(raw)).toEqual([{ x: 0.1, y: 0.1, w: 0.1, h: 0.1, label: undefined }])
  })

  it('THROWS on an unparseable response so the caller fails closed (holds the photo)', () => {
    // No JSON array at all → we must NOT treat this as "nothing found". A refusal
    // or garbled response has to hold the photo, never publish it un-anonymized.
    expect(() => parseVisionBoxes('Sorry, I cannot help with that.')).toThrow()
  })
})
