import { describe, it, expect } from 'vitest'
import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import { decideIrreplaceableBash, IRREPLACEABLE } from '../.claude/hooks/irreplaceable-paths.mjs'

const HOOK = resolve(__dirname, '../.claude/hooks/guard-curated-writes.mjs')
const run = (payload) => {
  const out = execFileSync('node', [HOOK], { input: JSON.stringify(payload), encoding: 'utf8' })
  return out.trim() ? JSON.parse(out).hookSpecificOutput : null
}

describe('guard: destroying what git cannot restore', () => {
  // 2026-08-03: three voiceprints (biometric data about named councillors)
  // deleted from a directory git had never tracked, on the strength of a
  // summary that said "unused by any pipeline" — checked against automated
  // wiring only, when voice-id is a documented MANUAL step.
  it('asks before rm on every store git does not track', () => {
    for (const key of Object.keys(IRREPLACEABLE)) {
      const v = decideIrreplaceableBash(`rm -rf ${key}`)
      expect(v?.decision, key).toBe('ask')
      expect(v.reason, key).toContain('NOT tracked by git')
    }
  })

  it('asks before the sanctioned CLI too — being the right tool is not the point', () => {
    const v = decideIrreplaceableBash('npm run delete-voiceprint -- --slug robert-raga-gadea')
    expect(v?.decision).toBe('ask')
    expect(v.reason).toContain('.voiceprints')
  })

  it('carries the question that would have caught the mistake', () => {
    const v = decideIrreplaceableBash('rm -rf .voiceprints')
    expect(v.reason).toMatch(/quién lo usa, incluido a mano/i)
    expect(v.reason).toContain('WHISPER_IDENTIFY=0')
  })

  it('names who uses the store, so "nothing uses it" can be checked not assumed', () => {
    const v = decideIrreplaceableBash('rm .voiceprints/robert-raga-gadea.f32')
    expect(v.reason).toContain('identify-pleno-speakers')
    expect(v.reason).toContain('MANUAL')
  })

  it('catches a file INSIDE the store, not just the directory', () => {
    expect(decideIrreplaceableBash('rm .voiceprints/audio/x.opus')?.decision).toBe('ask')
    expect(decideIrreplaceableBash('rm .run-manifests/extract-2026.json')?.decision).toBe('ask')
  })

  it('catches truncate, shred and find -delete, not only rm', () => {
    expect(decideIrreplaceableBash('truncate -s 0 .review-cache.json')?.decision).toBe('ask')
    expect(decideIrreplaceableBash('shred .voiceprints/a.f32')?.decision).toBe('ask')
    expect(decideIrreplaceableBash('find .llm-cache -name "*.json" -delete')?.decision).toBe('ask')
  })

  it('catches a destructive clause anywhere in a chain', () => {
    // The shape that slips past a naive ^-anchored match.
    expect(decideIrreplaceableBash('npm test && rm -rf .voiceprints')?.decision).toBe('ask')
    expect(decideIrreplaceableBash('cd /tmp; rm -rf .run-manifests')?.decision).toBe('ask')
  })
})

describe('guard: git clean -x is the one that takes them all at once', () => {
  it('asks, and explains that -x targets ignored files specifically', () => {
    const v = decideIrreplaceableBash('git clean -xfd')
    expect(v?.decision).toBe('ask')
    expect(v.reason).toContain('IGNORADOS')
  })

  it('lists every store that would go', () => {
    const v = decideIrreplaceableBash('git clean -xfd')
    for (const key of Object.keys(IRREPLACEABLE)) expect(v.reason).toContain(key)
  })

  it('catches -X (ignored files ONLY) as well as -x', () => {
    expect(decideIrreplaceableBash('git clean -Xfd')?.decision).toBe('ask')
  })

  it('stays quiet on a plain git clean — that only removes what git can see is new', () => {
    expect(decideIrreplaceableBash('git clean -fd')).toBeNull()
  })
})

describe('guard: it must not cry wolf', () => {
  // A hook that fires on ordinary work gets approved reflexively, and then it
  // is not a hook. These are the commands this session actually ran.
  it.each([
    'ls .voiceprints/',
    'cat .voiceprints/index.json',
    'git check-ignore -v .voiceprints',
    'du -sh .voiceprints/audio',
    'npm run enroll-voice -- --slug x --audio .voiceprints/audio/x.16k.wav',
    'npm run identify-pleno-speakers -- 10yl550',
    'rm -rf ./dist',
    'rm /tmp/scratch.json',
    'npm test',
  ])('stays quiet on: %s', (cmd) => {
    expect(decideIrreplaceableBash(cmd)).toBeNull()
  })

  it('does not fire on a path that merely looks similar', () => {
    expect(decideIrreplaceableBash('rm -rf .voiceprints-backup-copy')).toBeNull()
  })

  it('returns null for an empty or missing command', () => {
    expect(decideIrreplaceableBash('')).toBeNull()
    expect(decideIrreplaceableBash(undefined)).toBeNull()
  })
})

describe('guard: end to end through the real hook binary', () => {
  it('emits an ask verdict on stdout for the incident command', () => {
    const out = run({ tool_name: 'Bash', tool_input: { command: 'rm -rf .voiceprints' } })
    expect(out.permissionDecision).toBe('ask')
    expect(out.hookEventName).toBe('PreToolUse')
  })

  it('emits nothing for an ordinary command', () => {
    expect(run({ tool_name: 'Bash', tool_input: { command: 'npm test' } })).toBeNull()
  })

  it('still guards curated writes — the new check did not shadow the old one', () => {
    const out = run({
      tool_name: 'Write',
      tool_input: { file_path: 'public/data/promises.json' },
    })
    expect(out.permissionDecision).toBe('deny')
  })
})
