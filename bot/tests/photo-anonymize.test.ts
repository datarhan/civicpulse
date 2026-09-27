import { describe, it, expect } from 'vitest'
import sharp from 'sharp'
import {
  ANON_DEFAULTS,
  chooseVisionBackend,
  extractGeminiText,
  detectSensitiveRegions,
  anonymizeImage,
  normalizarImagen,
  ImagenRechazada,
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

  // La respuesta se pide en JSON y con esquema: así el modelo no puede contestar en
  // `box_2d`, en píxeles o con prosa alrededor, y el analizador estricto queda
  // como segunda capa.
  it('pide JSON con esquema: una lista de cajas {x,y,w,h} obligatorias', async () => {
    const buf = await twoToneImage()
    let cuerpo: any = null
    const fetchImpl = async (_url: string | URL | Request, init?: RequestInit) => {
      cuerpo = JSON.parse(String(init?.body))
      return respuestaVacia
    }
    await detectSensitiveRegions(buf, {
      env: { GEMINI_API_KEY: CLAVE },
      fetchImpl: fetchImpl as typeof fetch,
    })
    const cfg = cuerpo?.generationConfig
    expect(cfg?.responseMimeType).toBe('application/json')
    expect(cfg?.responseSchema?.type).toBe('ARRAY')
    expect(cfg?.responseSchema?.items?.required).toEqual(
      expect.arrayContaining(['x', 'y', 'w', 'h']),
    )
  })

  it('no manda al modelo lo que no es el JPEG normalizado', async () => {
    const png = await sharp({
      create: { width: 20, height: 20, channels: 3, background: { r: 1, g: 2, b: 3 } },
    })
      .png()
      .toBuffer()
    let llamadas = 0
    const fetchImpl = async () => {
      llamadas++
      return respuestaVacia
    }
    await expect(
      detectSensitiveRegions(png, {
        env: { GEMINI_API_KEY: CLAVE },
        fetchImpl: fetchImpl as typeof fetch,
      }),
    ).rejects.toThrow(/normalizarImagen/)
    expect(llamadas).toBe(0)
  })

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

/**
 * Un solo encuadre para DETECTAR y para TAPAR.
 *
 * Hasta el 27-09-2026 el modelo miraba los bytes crudos y el mosaico se hacía
 * sobre la imagen ya girada según su EXIF (`.rotate()`): en una foto de móvil
 * guardada en horizontal con orientación 6, las cajas llegaban en un encuadre y
 * se pintaban en otro, y la cara quedaba destapada. Y el tipo se declaraba
 * `image/jpeg` fuera cual fuera. Ahora la imagen se normaliza UNA vez y ese
 * mismo JPEG va al modelo y al mosaico.
 */
describe('normalizarImagen', () => {
  const liso = (width: number, height: number) =>
    sharp({ create: { width, height, channels: 3, background: { r: 90, g: 120, b: 150 } } })

  it('un PNG sale como JPEG, con sus dimensiones', async () => {
    const png = await liso(160, 90).png().toBuffer()
    const n = await normalizarImagen(png)
    const meta = await sharp(n.data).metadata()
    expect(meta.format).toBe('jpeg')
    expect([meta.width, meta.height]).toEqual([160, 90])
    expect([n.ancho, n.alto]).toEqual([160, 90])
  })

  it('una foto con orientación EXIF 6 sale ya girada, y sin EXIF', async () => {
    // Guardada 200×100 y marcada «gírala 90°»: se ve 100×200.
    const cruda = await liso(200, 100).jpeg().withMetadata({ orientation: 6 }).toBuffer()
    expect((await sharp(cruda).metadata()).orientation).toBe(6) // el control
    const n = await normalizarImagen(cruda)
    const meta = await sharp(n.data).metadata()
    expect([meta.width, meta.height]).toEqual([100, 200])
    expect(meta.orientation ?? 1).toBe(1)
    expect(meta.exif).toBeUndefined()
  })

  it('reduce al ancho máximo', async () => {
    const grande = await liso(3000, 1500).jpeg().toBuffer()
    const n = await normalizarImagen(grande)
    expect(n.ancho).toBe(ANON_DEFAULTS.maxWidth)
  })

  it('lo que no es una imagen se rechaza con su motivo, no se procesa', async () => {
    await expect(normalizarImagen(Buffer.from('esto no es una foto'))).rejects.toBeInstanceOf(
      ImagenRechazada,
    )
  })

  it('una imagen con demasiados píxeles se rechaza antes de decodificarla', async () => {
    const png = await liso(100, 100).png().toBuffer()
    await expect(normalizarImagen(png, { maxPixeles: 5_000 })).rejects.toBeInstanceOf(
      ImagenRechazada,
    )
    // El control: con el límite de verdad, la misma imagen pasa.
    await expect(normalizarImagen(png)).resolves.toMatchObject({ ancho: 100, alto: 100 })
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

  // Una caja que no cae sobre ningún píxel no tapa nada: la foto se retiene.
  // Hasta el 2026-09-27 se saltaba (`continue`) y la foto se publicaba como si esa
  // región estuviera tapada.
  it('una caja que no cae sobre ningún píxel RETIENE la foto', async () => {
    const img = await twoToneImage(120)
    await expect(
      anonymizeImage(img, [{ x: 1.5, y: 0.5, w: 0.1, h: 0.2, label: 'face' }]),
    ).rejects.toThrow(/se retiene/)
  })
})
