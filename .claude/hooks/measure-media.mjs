/**
 * Measure the file before you claim anything about it.
 *
 * ## The incident this encodes (2026-08-03, twice in ten minutes)
 *
 * Restoring three deleted voiceprints, I picked `.voiceprints/audio/<slug>.16k.wav`
 * as the enrollment source because the name matched the slug, and told the
 * operator the restore would be exact. Then I "confirmed" it by computing
 * duration from the file size — 4.6 MB ÷ 32 KB/s ≈ 143 s, which matched the
 * duration recorded in the index. Both steps were wrong and they agreed with
 * each other, which is what made it convincing.
 *
 * `ffprobe` says those files are **3.6 seconds**. The enrollment source was the
 * `.opus` sitting beside them. The prints I restored were built from 3.6 s of
 * audio instead of 143 s — they existed, they loaded, and they were quietly
 * much weaker. The tell was a raw L2 norm of 352.365 where the original index
 * recorded 224.5683, and nothing else would have surfaced it.
 *
 * A filename is a claim someone else made. A byte count is a claim about
 * encoding. Neither is a measurement, and here they were both wrong about the
 * same file in the same direction.
 *
 * ## What this does
 *
 * Anything that feeds a media file to voice enrollment, speaker identification
 * or transcription gets probed FIRST, and the real numbers go in the prompt.
 * It does not say "you should measure" — it measures, and shows the answer, so
 * a 3.6 s file cannot be mistaken for a 143 s one at the moment it matters.
 *
 * `ask`, never `deny`. The numbers are the point, not the friction.
 */
import { spawnSync } from 'node:child_process'
import { existsSync, statSync } from 'node:fs'
import { resolve } from 'node:path'

/** Tools where the LENGTH of the audio changes the quality of the result. */
const MEDIA_CONSUMERS =
  /\b(?:enroll-voice|enroll-voices-batch|identify-pleno-speakers|transcribe-pleno|diarize-pleno)\b/

const MEDIA_EXT = /\.(?:wav|opus|mp3|m4a|ogg|oga|flac|aac|mp4|webm|mkv|mov)$/i

/** Ground truth, or null if it cannot be had. */
function probe(path) {
  const r = spawnSync(
    'ffprobe',
    [
      '-v',
      'error',
      '-show_entries',
      'format=duration:stream=sample_rate,channels,codec_name',
      '-of',
      'default=noprint_wrappers=1',
      path,
    ],
    { encoding: 'utf8', timeout: 10_000 },
  )
  if (r.error || r.status !== 0) return null
  const get = (k) => (new RegExp(`^${k}=(.*)$`, 'm').exec(r.stdout) ?? [])[1]
  const dur = Number(get('duration'))
  return {
    seconds: Number.isFinite(dur) ? dur : null,
    sampleRate: get('sample_rate'),
    channels: get('channels'),
    codec: get('codec_name'),
  }
}

const human = (s) =>
  s == null ? '¿?' : s < 60 ? `${s.toFixed(1)}s` : `${Math.floor(s / 60)}m ${(s % 60).toFixed(0)}s`

/** Media paths a command actually names. */
export function mediaArgsIn(command) {
  return String(command ?? '')
    .split(/\s+/)
    .map((a) => a.replace(/^['"]|['"]$/g, ''))
    .filter((a) => MEDIA_EXT.test(a))
}

export const decideMeasureMedia = (command, probeFn = probe, exists = existsSync) => {
  if (!command) return null
  const cmd = String(command)
  if (!MEDIA_CONSUMERS.test(cmd)) return null

  const paths = mediaArgsIn(cmd).filter((p) => exists(resolve(p)))
  if (paths.length === 0) return null

  const rows = paths.map((p) => {
    const m = probeFn(resolve(p))
    let bytes = null
    try {
      bytes = statSync(resolve(p)).size
    } catch {
      /* size is a nicety, not the measurement */
    }
    return { path: p, m, bytes }
  })

  const lines = rows.map(({ path, m, bytes }) => {
    const size = bytes == null ? '' : ` · ${(bytes / 1e6).toFixed(1)} MB en disco`
    if (!m) return `  ${path}\n      ffprobe no pudo leerlo — MÍDELO antes de fiarte${size}`
    return (
      `  ${path}\n` +
      `      ${human(m.seconds)} · ${m.sampleRate ?? '?'} Hz · ${m.channels ?? '?'} canal(es)` +
      ` · ${m.codec ?? '?'}${size}`
    )
  })

  // The specific trap in this repo, surfaced only when it is actually present.
  const shortOnes = rows.filter((r) => r.m?.seconds != null && r.m.seconds < 10)
  const warn = shortOnes.length
    ? `\n⚠ ${shortOnes.length === 1 ? 'Uno de estos dura' : 'Varios de éstos duran'} MENOS DE 10 SEGUNDOS. ` +
      `Para enrolar una voz eso da\n  una huella mucho más débil que un minuto largo, y no falla: ` +
      `funciona peor y en\n  silencio. Los ficheros \`.16k.wav\` de este repo duran 3,6 s pese a ` +
      `pesar megas.\n`
    : ''

  return {
    decision: 'ask',
    reason:
      `Medido con ffprobe, no deducido del nombre ni del tamaño:\n\n` +
      lines.join('\n') +
      `\n${warn}\n` +
      `El 03-08-2026 elegí \`<slug>.16k.wav\` como fuente de enrolamiento porque el\n` +
      `nombre encajaba, y lo "confirmé" calculando la duración a partir del tamaño:\n` +
      `4,6 MB ÷ 32 KB/s ≈ 143 s, que además cuadraba con el índice. Los dos pasos\n` +
      `estaban mal y coincidían entre sí. Duraba 3,6 s.\n\n` +
      `Si estos números son los que esperabas, adelante.`,
  }
}
