/**
 * Queja-photo anonymizer.
 *
 * A citizen photo can carry incidental PII — bystander faces, vehicle plates,
 * name plates. Before ANY queja photo is published we:
 *   1. strip all metadata (removes GPS/EXIF),
 *   2. auto-orient + downscale to a sane max width,
 *   3. apply a light global degrade (so small *missed* detail is softened),
 *   4. hard-mosaic every region a vision model flags as a face / plate / id-text.
 *
 * Fail-closed: if the vision call cannot run (no key) or errors (quota, network,
 * garbled output) `detectSensitiveRegions` THROWS, and the orchestrator holds
 * the photo rather than publishing it un-anonymized.
 *
 * This is automated anonymization with no human gate (an explicit product
 * decision). Automated detection can miss; the global degrade + generous
 * per-box margin are the mitigations, and the published caption states the
 * anonymization is automatic.
 */

import sharp, { type OverlayOptions } from 'sharp'
import { expandRect, normToPixelRect, parseVisionBoxes, type NormBox } from './photo-geometry.ts'

export const ANON_DEFAULTS = {
  /** Longest edge after downscale. Normalizes huge phone photos. */
  maxWidth: 1280,
  /** Gaussian sigma for the whole-image safety degrade. 0 disables. */
  globalBlurSigma: 1.4,
  /** Grow each detection box by this fraction of its size before mosaicing. */
  marginFrac: 0.12,
  /** Target mosaic block size in px (smaller regions collapse to fewer blocks). */
  blockPx: 16,
  jpegQuality: 80,
}

export type AnonConfig = typeof ANON_DEFAULTS

/**
 * Píxeles como mucho, comprobados ANTES de decodificar. Una foto de móvil que
 * llega por Telegram o WhatsApp ya viene recomprimida y anda por 2–17 MP; el
 * bot corre en una máquina de 256 MB, y decodificar una imagen enorme —por
 * error o a propósito— lo tumbaría con todo lo demás dentro.
 */
export const MAX_PIXELES = 25_000_000

/** Una imagen que no se puede procesar: no se reintenta como si fuera un fallo del modelo. */
export class ImagenRechazada extends Error {
  constructor(motivo: string) {
    super(motivo)
    this.name = 'ImagenRechazada'
  }
}

/** La imagen como la ven el modelo y el mosaico: la MISMA. */
export interface ImagenNormalizada {
  data: Buffer
  ancho: number
  alto: number
}

/** JPEG, PNG o WebP por sus primeros bytes; lo demás no es una foto. */
export function tipoDeImagen(buf: Buffer): 'jpeg' | 'png' | 'webp' | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpeg'
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])))
    return 'png'
  if (
    buf.length >= 12 &&
    buf.subarray(0, 4).toString('latin1') === 'RIFF' &&
    buf.subarray(8, 12).toString('latin1') === 'WEBP'
  )
    return 'webp'
  return null
}

/**
 * Normaliza la foto UNA vez: la gira según su EXIF, la reduce al ancho máximo y
 * la vuelve JPEG sin metadatos. Ese mismo JPEG va al modelo y al mosaico.
 *
 * Hasta el 2026-09-27 el modelo miraba los bytes crudos y el mosaico se pintaba
 * sobre la imagen ya girada: en una foto de móvil guardada en horizontal con
 * orientación 6, las cajas llegaban en un encuadre y se pintaban en otro, y la
 * cara quedaba al descubierto. Y el tipo se declaraba `image/jpeg` fuera cual
 * fuera.
 */
export async function normalizarImagen(
  buf: Buffer,
  opts: { maxWidth?: number; maxPixeles?: number } = {},
): Promise<ImagenNormalizada> {
  if (!tipoDeImagen(buf)) throw new ImagenRechazada('no es una imagen JPEG, PNG ni WebP')
  try {
    const { data, info } = await sharp(buf, {
      failOn: 'error',
      limitInputPixels: opts.maxPixeles ?? MAX_PIXELES,
    })
      .rotate()
      .resize({ width: opts.maxWidth ?? ANON_DEFAULTS.maxWidth, withoutEnlargement: true })
      .jpeg({ quality: 90 })
      .toBuffer({ resolveWithObject: true })
    return { data, ancho: info.width, alto: info.height }
  } catch (e) {
    throw new ImagenRechazada(
      `no se pudo leer la imagen: ${e instanceof Error ? e.message : String(e)}`,
    )
  }
}

export type VisionBackend = 'gemini'

/**
 * El único servicio que recibe la imagen es la API Gemini de Google, y el aviso
 * legal lo nombra. Había un respaldo en OpenAI cuando sólo existía su clave: la
 * regla del proyecto es no mandar nada a OpenAI, y un segundo destino que depende
 * de qué claves haya en el entorno dejaba el aviso incompleto. Sin clave de Gemini
 * no hay análisis, y la foto se retiene.
 */
export function chooseVisionBackend(env: Record<string, string | undefined>): VisionBackend | null {
  return env.GEMINI_API_KEY ? 'gemini' : null
}

export function extractGeminiText(json: unknown): string {
  const t = (json as any)?.candidates?.[0]?.content?.parts?.[0]?.text
  if (typeof t !== 'string') throw new Error('gemini response missing text part')
  return t
}

export function buildVisionPrompt(): string {
  return [
    'You are an image privacy filter. Return ONLY a JSON array (no prose, no code fences).',
    'Each element marks a rectangular region of THIS photo that must be anonymized',
    'before public publication, as {"x":<0..1>,"y":<0..1>,"w":<0..1>,"h":<0..1>,"label":"face|plate|id_text"}',
    'where x,y is the top-left corner and w,h the width/height, all as fractions of',
    'the image dimensions. Include EVERY: human face (any size or angle), vehicle',
    'licence plate, and any text revealing a person’s identity (name badges, ID',
    'documents, doorbell name plates). Be generous — when unsure, include it.',
    'If there is nothing to anonymize, return exactly [].',
  ].join(' ')
}

export interface DetectOptions {
  env?: Record<string, string | undefined>
  fetchImpl?: typeof fetch
  geminiModel?: string
}

async function safeText(res: { text?: () => Promise<string> }): Promise<string> {
  try {
    return res.text ? await res.text() : ''
  } catch {
    return ''
  }
}

/**
 * Ask the configured vision model for regions to anonymize. Throws (fail-closed)
 * when no backend is configured or the call/response fails.
 *
 * `buf` is the JPEG from `normalizarImagen`: the boxes come back in ITS frame,
 * and the mosaic is painted on that same image.
 */
export async function detectSensitiveRegions(
  buf: Buffer,
  opts: DetectOptions = {},
): Promise<NormBox[]> {
  const env = opts.env ?? process.env
  const fetchImpl = opts.fetchImpl ?? fetch
  if (!chooseVisionBackend(env)) {
    throw new Error('no vision backend configured (set GEMINI_API_KEY) — holding photo')
  }
  // Se declara `image/jpeg` abajo: tiene que serlo de verdad.
  if (tipoDeImagen(buf) !== 'jpeg') {
    throw new Error('detectSensitiveRegions expects the JPEG from normalizarImagen — holding photo')
  }
  const b64 = buf.toString('base64')
  const prompt = buildVisionPrompt()
  const model = opts.geminiModel ?? env.GEMINI_VISION_MODEL ?? 'gemini-2.5-flash'
  // La clave va en la cabecera y no en la URL: una URL acaba en el mensaje de un error de
  // red, en el registro de un proxy o en el argv de un proceso, y esta llamada corre cada
  // hora en el servidor del bot. Así entró la clave en git el 1-sep-2026, dentro del
  // mensaje de un curl fallido que llevaba `?key=…`.
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`
  const res = await fetchImpl(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY! },
    body: JSON.stringify({
      contents: [
        { parts: [{ text: prompt }, { inline_data: { mime_type: 'image/jpeg', data: b64 } }] },
      ],
      generationConfig: { temperature: 0 },
    }),
  })
  if (!res.ok) throw new Error(`gemini vision HTTP ${res.status}: ${await safeText(res)}`)
  return parseVisionBoxes(extractGeminiText(await res.json()))
}

/**
 * Produce the anonymized JPEG: metadata stripped, downscaled, globally degraded,
 * with each detected region hard-mosaiced. Pure image transform — no network.
 */
export async function anonymizeImage(
  buf: Buffer,
  boxes: NormBox[],
  opts: Partial<AnonConfig> = {},
): Promise<Buffer> {
  const cfg = { ...ANON_DEFAULTS, ...opts }

  // Auto-orient + optional downscale + global degrade, rendered to a concrete
  // buffer so we know the exact working dimensions for compositing. sharp drops
  // all metadata by default (no withMetadata()), so EXIF/GPS is stripped here.
  let pipeline = sharp(buf, { failOn: 'none' }).rotate()
  const meta = await pipeline.metadata()
  if (meta.width && meta.width > cfg.maxWidth) pipeline = pipeline.resize({ width: cfg.maxWidth })
  if (cfg.globalBlurSigma > 0) pipeline = pipeline.blur(cfg.globalBlurSigma)
  const degraded = await pipeline
    .jpeg({ quality: cfg.jpegQuality })
    .toBuffer({ resolveWithObject: true })
  const W = degraded.info.width
  const H = degraded.info.height

  const composites: OverlayOptions[] = []
  for (const box of boxes) {
    const base = normToPixelRect(box, W, H)
    if (!base) continue
    const rect = expandRect(base, cfg.marginFrac, W, H) ?? base
    const bw = Math.max(1, Math.round(rect.width / cfg.blockPx))
    const bh = Math.max(1, Math.round(rect.height / cfg.blockPx))
    // Downsample the region to a few blocks then scale back up nearest-neighbour
    // → irreversible blocky mosaic over the sensitive region.
    const tiny = await sharp(degraded.data)
      .extract({ left: rect.left, top: rect.top, width: rect.width, height: rect.height })
      .resize(bw, bh, { kernel: 'nearest' })
      .toBuffer()
    const mosaic = await sharp(tiny)
      .resize(rect.width, rect.height, { kernel: 'nearest' })
      .png()
      .toBuffer()
    composites.push({ input: mosaic, left: rect.left, top: rect.top })
  }

  if (composites.length === 0) return degraded.data
  return sharp(degraded.data).composite(composites).jpeg({ quality: cfg.jpegQuality }).toBuffer()
}
