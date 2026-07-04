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

export type VisionBackend = 'gemini' | 'openai'

/** Prefer gemini (free tier) over the metered OpenAI fallback. */
export function chooseVisionBackend(env: Record<string, string | undefined>): VisionBackend | null {
  if (env.GEMINI_API_KEY) return 'gemini'
  if (env.OPENAI_API_KEY) return 'openai'
  return null
}

export function extractGeminiText(json: unknown): string {
  const t = (json as any)?.candidates?.[0]?.content?.parts?.[0]?.text
  if (typeof t !== 'string') throw new Error('gemini response missing text part')
  return t
}

export function extractOpenAIText(json: unknown): string {
  const t = (json as any)?.choices?.[0]?.message?.content
  if (typeof t !== 'string') throw new Error('openai response missing content')
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
  openaiModel?: string
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
 */
export async function detectSensitiveRegions(
  buf: Buffer,
  opts: DetectOptions = {},
): Promise<NormBox[]> {
  const env = opts.env ?? process.env
  const fetchImpl = opts.fetchImpl ?? fetch
  const backend = chooseVisionBackend(env)
  if (!backend) {
    throw new Error(
      'no vision backend configured (set GEMINI_API_KEY or OPENAI_API_KEY) — holding photo',
    )
  }
  const b64 = buf.toString('base64')
  const prompt = buildVisionPrompt()

  if (backend === 'gemini') {
    const model = opts.geminiModel ?? env.GEMINI_VISION_MODEL ?? 'gemini-2.5-flash'
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${env.GEMINI_API_KEY}`
    const res = await fetchImpl(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
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

  // openai fallback
  const model = opts.openaiModel ?? env.OPENAI_VISION_MODEL ?? 'gpt-4o-mini'
  const res = await fetchImpl('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${env.OPENAI_API_KEY}` },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${b64}` } },
          ],
        },
      ],
    }),
  })
  if (!res.ok) throw new Error(`openai vision HTTP ${res.status}: ${await safeText(res)}`)
  return parseVisionBoxes(extractOpenAIText(await res.json()))
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
