import { describe, it, expect } from 'vitest'
import sharp from 'sharp'
import {
  ANON_DEFAULTS,
  chooseVisionBackend,
  extractGeminiText,
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
  it('sin clave de Gemini no hay análisis: la foto se retiene, nunca va a OpenAI', () => {
    // El aviso legal nombra un solo servicio que recibe la imagen, la API Gemini
    // de Google, y la regla del proyecto no manda nada a OpenAI: con sólo su
    // clave, no hay backend.
    expect(chooseVisionBackend({ OPENAI_API_KEY: 'o' })).toBeNull()
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
})

describe('detectSensitiveRegions — fail closed', () => {
  it('throws when no vision backend is configured (so the caller holds the photo)', async () => {
    const buf = await twoToneImage()
    await expect(detectSensitiveRegions(buf, { env: {} })).rejects.toThrow()
  })

  it('con sólo la clave de OpenAI también se retiene, sin llamar a nadie', async () => {
    const buf = await twoToneImage()
    let llamadas = 0
    const fetchImpl = async () => {
      llamadas++
      return { ok: true, status: 200, json: async () => ({}) } as unknown as Response
    }
    await expect(
      detectSensitiveRegions(buf, { env: { OPENAI_API_KEY: 'o' }, fetchImpl }),
    ).rejects.toThrow(/GEMINI_API_KEY/)
    expect(llamadas, 'la imagen no puede salir hacia ningún servicio').toBe(0)
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

/**
 * La clave de Gemini viaja en la cabecera `x-goog-api-key`, nunca en la URL.
 *
 * Una URL acaba en sitios que una cabecera no: en el mensaje de un error de red, en el
 * registro de un proxy, en el argv de un proceso. El 1-sep-2026 la clave entró en git
 * justo así, dentro del mensaje de un curl fallido que llevaba `?key=…` (ver
 * src/scraper/redact-secrets.ts en la raíz). Desde el 17-09 esta llamada corre cada hora
 * en el servidor del bot y lo que falle acaba en su log.
 */
describe('detectSensitiveRegions — la clave va en la cabecera', () => {
  const CLAVE = 'clave-de-gemini-de-prueba-0123456789'
  const respuestaVacia = {
    ok: true,
    status: 200,
    json: async () => ({ candidates: [{ content: { parts: [{ text: '[]' }] } }] }),
  } as unknown as Response

  it('manda la clave en x-goog-api-key y deja la URL sin ella', async () => {
    const buf = await twoToneImage()
    const llamadas: Array<{ url: string; init: RequestInit }> = []
    const fetchImpl = async (url: string | URL | Request, init?: RequestInit) => {
      llamadas.push({ url: String(url), init: init ?? {} })
      return respuestaVacia
    }
    await detectSensitiveRegions(buf, {
      env: { GEMINI_API_KEY: CLAVE },
      fetchImpl: fetchImpl as typeof fetch,
    })
    expect(llamadas).toHaveLength(1)
    const { url, init } = llamadas[0]
    // El control: es la llamada de verdad, al modelo configurado.
    expect(url).toContain(':generateContent')
    expect(url).not.toContain(CLAVE)
    expect(new URL(url).searchParams.has('key')).toBe(false)
    expect((init.headers as Record<string, string>)['x-goog-api-key']).toBe(CLAVE)
  })

  it('un fallo de red que cita la URL no arrastra la clave al mensaje', async () => {
    const buf = await twoToneImage()
    // Así fallan muchos clientes HTTP: con la URL pedida dentro del mensaje.
    const fetchImpl = async (url: string | URL | Request) => {
      throw new Error(`fetch failed: ${String(url)}`)
    }
    const error = await detectSensitiveRegions(buf, {
      env: { GEMINI_API_KEY: CLAVE },
      fetchImpl: fetchImpl as typeof fetch,
    }).catch((e: unknown) => e)
    // El control: falló, y por la llamada (el mensaje trae la URL).
    expect(error).toBeInstanceOf(Error)
    expect((error as Error).message).toContain('generativelanguage.googleapis.com')
    expect((error as Error).message).not.toContain(CLAVE)
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
