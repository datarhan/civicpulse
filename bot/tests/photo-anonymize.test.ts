import { describe, it, expect } from 'vitest'
import sharp from 'sharp'
import {
  ANON_DEFAULTS,
  chooseVisionBackend,
  extractGeminiText,
  extractOpenAIText,
  detectSensitiveRegions,
  anonymizeImage,
} from '../src/services/photo-anonymize'

/** A deterministic test image: white with a black square in the middle. */
async function twoToneImage(size = 120): Promise<Buffer> {
  const black = await sharp({
    create: { width: 40, height: 40, channels: 3, background: { r: 0, g: 0, b: 0 } },
  })
    .png()
    .toBuffer()
  return sharp({
    create: { width: size, height: size, channels: 3, background: { r: 255, g: 255, b: 255 } },
  })
    .composite([{ input: black, left: 40, top: 40 }])
    .jpeg()
    .toBuffer()
}

describe('chooseVisionBackend', () => {
  it('prefers gemini (free tier) when both keys are present', () => {
    expect(chooseVisionBackend({ GEMINI_API_KEY: 'g', OPENAI_API_KEY: 'o' })).toBe('gemini')
  })
  it('falls back to openai when only that key is set', () => {
    expect(chooseVisionBackend({ OPENAI_API_KEY: 'o' })).toBe('openai')
  })
  it('returns null when no vision key is configured', () => {
    expect(chooseVisionBackend({})).toBeNull()
  })
})

describe('response extractors', () => {
  it('pulls text out of a gemini generateContent response', () => {
    const json = {
      candidates: [{ content: { parts: [{ text: '[{"x":0.1,"y":0.1,"w":0.1,"h":0.1}]' }] } }],
    }
    expect(extractGeminiText(json)).toContain('0.1')
  })
  it('pulls text out of an openai chat.completions response', () => {
    const json = { choices: [{ message: { content: '[]' } }] }
    expect(extractOpenAIText(json)).toBe('[]')
  })
})

describe('detectSensitiveRegions — fail closed', () => {
  it('throws when no vision backend is configured (so the caller holds the photo)', async () => {
    const buf = await twoToneImage()
    await expect(detectSensitiveRegions(buf, { env: {} })).rejects.toThrow()
  })

  it('returns parsed boxes from a stubbed gemini call', async () => {
    const buf = await twoToneImage()
    const fetchImpl = async () =>
      ({
        ok: true,
        status: 200,
        json: async () => ({
          candidates: [
            {
              content: { parts: [{ text: '[{"x":0.3,"y":0.3,"w":0.2,"h":0.2,"label":"face"}]' }] },
            },
          ],
        }),
      }) as unknown as Response
    const boxes = await detectSensitiveRegions(buf, { env: { GEMINI_API_KEY: 'g' }, fetchImpl })
    expect(boxes).toEqual([{ x: 0.3, y: 0.3, w: 0.2, h: 0.2, label: 'face' }])
  })

  it('throws when the vision HTTP call fails (non-ok) → hold', async () => {
    const buf = await twoToneImage()
    const fetchImpl = async () =>
      ({ ok: false, status: 429, text: async () => 'rate limited' }) as unknown as Response
    await expect(
      detectSensitiveRegions(buf, { env: { GEMINI_API_KEY: 'g' }, fetchImpl }),
    ).rejects.toThrow()
  })
})

describe('anonymizeImage', () => {
  it('downscales to the max width and emits a metadata-stripped jpeg', async () => {
    const big = await sharp({
      create: { width: 2000, height: 1000, channels: 3, background: { r: 120, g: 130, b: 140 } },
    })
      .jpeg()
      .toBuffer()
    const out = await anonymizeImage(big, [])
    const meta = await sharp(out).metadata()
    expect(meta.format).toBe('jpeg')
    expect(meta.width).toBe(ANON_DEFAULTS.maxWidth)
    // metadata (incl. any GPS EXIF) must be stripped
    expect(meta.exif).toBeUndefined()
  })

  it('mosaics a detected region — output differs from the no-box baseline', async () => {
    const img = await twoToneImage(120)
    const baseline = await anonymizeImage(img, [])
    const withBox = await anonymizeImage(img, [{ x: 0.25, y: 0.25, w: 0.5, h: 0.5, label: 'face' }])
    // The box covers the black square; mosaicing it must change the bytes.
    expect(Buffer.compare(baseline, withBox)).not.toBe(0)
  })
})
