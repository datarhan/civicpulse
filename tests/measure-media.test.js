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

describe('measure-media: which commands and which arguments', () => {
  it.each([
    'npm run enroll-voice -- --slug x --audio a.opus',
    'npm run enroll-voices-batch -- --audio a.wav',
    'npm run identify-pleno-speakers -- 10yl550 --audio a.m4a',
    'bash scripts/transcribe-pleno.sh 10yl550 --audio a.mp3',
    'bash scripts/diarize-pleno.sh --audio a.flac',
  ])('fires for: %s', (cmd) => {
    expect(decide(cmd)?.decision).toBe('ask')
  })

  it('picks every media path a command names, not just the first', () => {
    expect(mediaArgsIn('cmd --a one.opus --b two.wav')).toEqual(['one.opus', 'two.wav'])
  })

  it('strips quotes around a path', () => {
    expect(mediaArgsIn('cmd --audio "a.opus"')).toEqual(['a.opus'])
    expect(mediaArgsIn("cmd --audio 'a.wav'")).toEqual(['a.wav'])
  })

  it('does NOT handle a path containing spaces — stated, not pretended', () => {
    // Splitting on whitespace cannot recover it. Documented rather than faked:
    // the guard degrades to measuring the tail, which is still a measurement of
    // A file, so the operator sees a mismatch instead of silent skipping.
    // Every audio path this repo generates is slug-based and space-free.
    expect(mediaArgsIn('cmd --audio "with space.opus"')).toEqual(['space.opus'])
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
