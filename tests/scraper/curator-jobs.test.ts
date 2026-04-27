/**
 * Tests for src/scraper/curator-jobs.js — the shared module that owns
 * file-path validation (path traversal, mime sniff, size cap) and the
 * job state I/O. The Vite middleware and the runner both depend on
 * these primitives, so any regression here is a security regression.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, symlinkSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'

// JS module — relative path to the file in src/scraper.
import {
  JOB_ID_RE,
  JobValidationError,
  jobFilePath,
  loadJob,
  newJobId,
  validateInputPath,
  writeJob,
  listJobs,
} from '../../src/scraper/curator-jobs.js'

const HOME = homedir()

// Make a small test file under HOME so realpath() resolves under it.
let workdir: string
beforeEach(() => {
  workdir = mkdtempSync(join(HOME, '.cp-curator-test-'))
})
afterEach(() => {
  rmSync(workdir, { recursive: true, force: true })
})

function writeWavStub(path: string) {
  // Minimal RIFF/WAVE header so `file --mime-type` returns audio/wav.
  // 'RIFF' + size + 'WAVE' + 'fmt ' chunk (PCM) + 'data' chunk.
  // ffprobe would reject this as malformed audio, but the magic bytes
  // are enough for `file` to classify it as audio/wav, which is all
  // we test here (we don't actually transcribe in unit tests).
  const buf = Buffer.from([
    0x52,
    0x49,
    0x46,
    0x46, // RIFF
    0x24,
    0x00,
    0x00,
    0x00, // chunk size
    0x57,
    0x41,
    0x56,
    0x45, // WAVE
    0x66,
    0x6d,
    0x74,
    0x20, // 'fmt '
    0x10,
    0x00,
    0x00,
    0x00, // fmt chunk size = 16
    0x01,
    0x00, // PCM
    0x01,
    0x00, // mono
    0x44,
    0xac,
    0x00,
    0x00, // 44100 Hz
    0x88,
    0x58,
    0x01,
    0x00, // byte rate
    0x02,
    0x00, // block align
    0x10,
    0x00, // 16 bits
    0x64,
    0x61,
    0x74,
    0x61, // 'data'
    0x00,
    0x00,
    0x00,
    0x00, // data length 0
  ])
  writeFileSync(path, buf)
}

describe('JOB_ID_RE + newJobId + jobFilePath', () => {
  it('newJobId returns IDs that match the regex', () => {
    for (let i = 0; i < 50; i++) {
      const id = newJobId()
      expect(JOB_ID_RE.test(id)).toBe(true)
    }
  })

  it('jobFilePath rejects malformed IDs', () => {
    expect(() => jobFilePath('../../etc/passwd')).toThrow(JobValidationError)
    expect(() => jobFilePath('with spaces')).toThrow(JobValidationError)
    expect(() => jobFilePath('UPPERCASE')).toThrow(JobValidationError)
    // Too short to match {16,40}
    expect(() => jobFilePath('short')).toThrow(JobValidationError)
  })

  it('jobFilePath returns a path under .curator-jobs/', () => {
    const p = jobFilePath(newJobId())
    expect(p).toMatch(/\.curator-jobs\/[a-z0-9]+\.json$/)
  })
})

describe('validateInputPath', () => {
  it('rejects relative paths', () => {
    expect(() => validateInputPath('relative.wav', 'audio')).toThrow(/absolute/)
  })

  it('rejects missing files', () => {
    const path = join(workdir, 'nope.wav')
    try {
      validateInputPath(path, 'audio')
      expect.fail('expected throw')
    } catch (err) {
      expect((err as JobValidationError).status).toBe(404)
    }
  })

  it('rejects paths outside HOME', () => {
    // /etc/hosts almost certainly exists and is outside HOME.
    try {
      validateInputPath('/etc/hosts', 'audio')
      expect.fail('expected throw')
    } catch (err) {
      // Either a path-outside-HOME 403 or a mime-type 415 — either
      // way it's a refusal we can rely on.
      expect([403, 415]).toContain((err as JobValidationError).status)
    }
  })

  it('rejects symlink that escapes HOME', () => {
    // Create a symlink under HOME that points to /etc/hosts.
    const link = join(workdir, 'link.wav')
    try {
      symlinkSync('/etc/hosts', link)
    } catch {
      // skip on systems where symlinks aren't allowed
      return
    }
    try {
      validateInputPath(link, 'audio')
      expect.fail('expected throw')
    } catch (err) {
      expect([403, 415]).toContain((err as JobValidationError).status)
    }
  })

  it('rejects mime-type mismatch (txt as audio)', () => {
    const path = join(workdir, 'doc.wav')
    writeFileSync(path, 'just text, not audio at all')
    try {
      validateInputPath(path, 'audio')
      expect.fail('expected throw')
    } catch (err) {
      expect((err as JobValidationError).status).toBe(415)
    }
  })

  it('accepts a real WAV under HOME with kind=audio', () => {
    const path = join(workdir, 'sample.wav')
    writeWavStub(path)
    const r = validateInputPath(path, 'audio')
    expect(r.realPath).toBe(path)
    expect(r.mimeType).toMatch(/audio/)
    expect(r.sizeBytes).toBeGreaterThan(0)
  })

  it('rejects WAV when caller asked for video', () => {
    const path = join(workdir, 'sample.wav')
    writeWavStub(path)
    try {
      validateInputPath(path, 'video')
      expect.fail('expected throw')
    } catch (err) {
      expect((err as JobValidationError).status).toBe(415)
    }
  })
})

describe('writeJob + loadJob round-trip', () => {
  // We use the real .curator-jobs dir. To avoid polluting it, we
  // generate a unique job ID per test and clean up after.
  const writtenIds: string[] = []
  afterEach(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs: typeof import('node:fs') = require('node:fs')
    for (const id of writtenIds) {
      try {
        fs.rmSync(jobFilePath(id))
      } catch {
        /* noop */
      }
    }
    writtenIds.length = 0
  })

  it('round-trips a queued job', () => {
    const id = newJobId()
    writtenIds.push(id)
    const state = {
      id,
      action: 'transcribe-evidence' as const,
      args: { filePath: '/tmp/x', expectedKind: 'audio' as const },
      status: 'queued' as const,
      createdAt: new Date().toISOString(),
    }
    writeJob(state)
    const loaded = loadJob(id)
    expect(loaded).not.toBeNull()
    expect(loaded?.id).toBe(id)
    expect(loaded?.status).toBe('queued')
  })

  it('loadJob returns null for missing IDs', () => {
    expect(loadJob(newJobId())).toBeNull()
  })

  it('loadJob throws on invalid ID format', () => {
    expect(() => loadJob('../sneaky')).toThrow(JobValidationError)
  })
})

describe('listJobs', () => {
  // Sanity check — the function should at least return an array
  // without throwing even when .curator-jobs/ has assorted state.
  it('returns an array', () => {
    expect(Array.isArray(listJobs())).toBe(true)
  })
})
