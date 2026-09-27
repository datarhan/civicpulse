import { describe, it, expect } from 'vitest'
import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import { decideMeasureMedia, mediaArgsIn } from '../.claude/hooks/measure-media.mjs'

// Injected so the tests never shell out to ffprobe or touch the real audio.
const exists = () => true
const probeOf = (seconds) => () => ({
  seconds,
  sampleRate: '16000',
  channels: '1',
  codec: 'pcm_s16le',
})
const decide = (cmd, seconds = 143.89) => decideMeasureMedia(cmd, probeOf(seconds), exists)

const ENROLL =
  'npm run enroll-voice -- --slug robert-raga-gadea --audio .voiceprints/audio/robert-raga-gadea.16k.wav'

describe('measure-media: it measures instead of asking you to', () => {
  // The incident: `<slug>.16k.wav` was chosen because the name matched, then
  // "confirmed" by dividing bytes by bitrate. Both wrong, both agreeing. 3.6s.
  it('puts the real duration in the prompt', () => {
    const v = decide(ENROLL, 143.89)
    expect(v?.decision).toBe('ask')
    expect(v.reason).toContain('2m 24s')
    expect(v.reason).toContain('16000 Hz')
  })

  it('shouts when the audio is too short to enrol a voice on', () => {
    const v = decide(ENROLL, 3.6)
    expect(v.reason).toContain('MENOS DE 10 SEGUNDOS')
    expect(v.reason).toContain('3,6 s')
  })

  it('does NOT shout when the audio is a sensible length', () => {
    expect(decide(ENROLL, 143.89).reason).not.toContain('MENOS DE 10 SEGUNDOS')
  })

  it('says so when ffprobe cannot read the file, rather than staying quiet', () => {
    const v = decideMeasureMedia(ENROLL, () => null, exists)
    expect(v.reason).toContain('ffprobe no pudo leerlo')
  })

  it('carries the incident, so the reason is not just a number', () => {
    expect(decide(ENROLL).reason).toContain('4,6 MB ÷ 32 KB/s')
  })
})

/**
 * Las interfaces DE VERDAD, no unas inventadas.
 *
 * Esta lista traía cinco herramientas con un `--audio` que cuatro no tienen:
 * `identify-pleno-speakers`, `transcribe-pleno.sh` y `diarize-pleno.sh` reciben
 * el id de una sesión, y `enroll-voices-batch` un manifiesto (`--file`). La
 * prueba pasaba con órdenes que nadie puede escribir, y el gancho no podía
 * dispararse nunca para ellas — reproducido sobre los transcritos, sus dos
 * únicas preguntas en todo el historial fueron un heredoc y un grep. La única
 * que recibe un fichero de audio, y donde la duración cambia en silencio la
 * calidad del resultado, es `enroll-voice --audio`: la del incidente.
 */
describe('measure-media: which commands and which arguments', () => {
  it.each([
    'npm run enroll-voice -- --slug x --audio a.opus',
    'npx tsx scripts/enroll-voice.ts --slug x --audio a.wav',
    'set -a; . ./.env; set +a; npm run enroll-voice -- --slug x --audio a.m4a --force',
  ])('fires for: %s', (cmd) => {
    expect(decide(cmd)?.decision).toBe('ask')
  })

  it.each([
    'npm run identify-pleno-speakers -- 10yl550 --apply',
    'bash scripts/transcribe-pleno.sh 10yl550',
    'bash scripts/diarize-pleno.sh 10yl550',
    'npm run enroll-voices-batch -- --file enrollments.json',
  ])('does not pretend to measure a tool that takes no media file: %s', (cmd) => {
    expect(decide(cmd)).toBeNull()
  })

  it('el TEXTO que nombra la herramienta y un .wav no es una ejecución', () => {
    for (const cmd of [
      "cat > rama.sh <<'EOF'\nnpm run enroll-voice -- --audio x.wav\nEOF",
      'grep -n "enroll-voice\\|\\.wav" scripts/transcribe-pleno.sh',
    ]) {
      expect(decide(cmd), cmd).toBeNull()
    }
  })

  it('le da la medida al MODELO, que la razón de un ask sólo la ve quien aprueba', () => {
    // El 03-08-2026 fue el modelo quien eligió el fichero y aseguró que era exacto.
    const v = decide(ENROLL, 3.6)
    expect(v.context).toContain('3.6')
    expect(v.context).toMatch(/seconds/)
  })

  it('picks every media path a command names, not just the first', () => {
    expect(mediaArgsIn('cmd --a one.opus --b two.wav')).toEqual(['one.opus', 'two.wav'])
  })

  it('strips quotes around a path', () => {
    expect(mediaArgsIn('cmd --audio "a.opus"')).toEqual(['a.opus'])
    expect(mediaArgsIn("cmd --audio 'a.wav'")).toEqual(['a.wav'])
  })

  it('keeps a quoted path with spaces whole', () => {
    // Splitting on whitespace used to leave «space.opus»; the shared tokenizer
    // keeps a quoted word as one word.
    expect(mediaArgsIn('cmd --audio "with space.opus"')).toEqual(['with space.opus'])
  })

  it('ignores a media file that is not on disk', () => {
    expect(decideMeasureMedia(ENROLL, probeOf(10), () => false)).toBeNull()
  })
})

describe('measure-media: it must not cry wolf', () => {
  // Fires on the handful of commands where audio LENGTH changes the result.
  // Everything else — playback, conversion, listing, unrelated tools — is noise.
  it.each([
    'ffprobe -v error -show_entries format=duration -of csv=p=0 a.opus',
    'ls .voiceprints/audio/',
    'du -sh .voiceprints/audio',
    'ffmpeg -i a.opus -ar 16000 out.wav',
    'npm run enroll-voice -- --help',
    'npm test',
    'npm run check:guards',
  ])('stays quiet on: %s', (cmd) => {
    expect(decide(cmd)).toBeNull()
  })

  it('stays quiet when the tool matches but no media file is named', () => {
    expect(decide('npm run identify-pleno-speakers -- 10yl550')).toBeNull()
  })

  it('returns null for an empty command', () => {
    expect(decide('')).toBeNull()
    expect(decideMeasureMedia(undefined)).toBeNull()
  })
})

describe('measure-media: through the real hook binary', () => {
  const HOOK = resolve(__dirname, '../.claude/hooks/guard-curated-writes.mjs')
  const run = (command) => {
    const out = execFileSync('node', [HOOK], {
      input: JSON.stringify({ tool_name: 'Bash', tool_input: { command } }),
      encoding: 'utf8',
    })
    return out.trim() ? JSON.parse(out).hookSpecificOutput : null
  }

  it('is wired into the runner alongside the other two guards', () => {
    // Real ffprobe, real file — the one this session actually got wrong.
    const out = run(
      'npm run enroll-voice -- --slug robert-raga-gadea --audio .voiceprints/audio/robert-raga-gadea.16k.wav',
    )
    // Skips cleanly on a machine with no ffprobe or no local voiceprints.
    if (out) expect(out.permissionDecision).toBe('ask')
  })

  it('does not shadow the irreplaceable-path guard', () => {
    expect(run('rm -rf .voiceprints').permissionDecision).toBe('ask')
  })

  it('leaves ordinary commands alone', () => {
    expect(run('npm test')).toBeNull()
  })
})
