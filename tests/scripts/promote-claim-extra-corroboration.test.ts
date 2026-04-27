/**
 * Tests for promote-claim's --extra-corroboration flag, exercised via
 * subprocess. The CLI calls `process.exit()` on validation failures,
 * so testing in-process would terminate the test runner. Subprocess
 * gives us exit-code semantics without that risk.
 */
import { describe, expect, it } from 'vitest'
import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'

const SCRIPT = resolve('scripts/promote-claim.ts')

function run(args: string[]): { code: number; out: string; err: string } {
  const r = spawnSync('npx', ['tsx', SCRIPT, ...args], {
    encoding: 'utf8',
    timeout: 15_000,
    env: { ...process.env, NODE_ENV: 'test' },
  })
  return {
    code: r.status ?? 1,
    out: r.stdout ?? '',
    err: r.stderr ?? '',
  }
}

describe('promote-claim --extra-corroboration', () => {
  // Use a known-bad claim id so the CLI fails fast AFTER the flag has
  // parsed — that way we can read the parser-stage error from stderr
  // without worrying about the CLI mutating the snapshot.
  const STUB_ARGS = [
    '__nonexistent-claim__',
    '--title',
    'Some safe title that is at least ten characters',
    '--summary',
    'And a safe summary that is at least forty characters long for sure.',
  ]

  it('rejects invalid JSON', () => {
    const r = run([...STUB_ARGS, '--extra-corroboration', 'not json'])
    expect(r.code).not.toBe(0)
    expect(r.err).toMatch(/--extra-corroboration: invalid JSON/)
  })

  it('rejects non-array JSON', () => {
    const r = run([...STUB_ARGS, '--extra-corroboration', '{"kind":"press"}'])
    expect(r.code).not.toBe(0)
    expect(r.err).toMatch(/must be a JSON array/)
  })

  it('rejects verifier-only kinds (tender)', () => {
    const r = run([
      ...STUB_ARGS,
      '--extra-corroboration',
      JSON.stringify([{ kind: 'tender', ref: 'https://x', snippet: 's' }]),
    ])
    expect(r.code).not.toBe(0)
    expect(r.err).toMatch(/kind.*press\|document\|transcript/)
  })

  it('rejects empty ref', () => {
    const r = run([
      ...STUB_ARGS,
      '--extra-corroboration',
      JSON.stringify([{ kind: 'press', ref: '', snippet: 's' }]),
    ])
    expect(r.code).not.toBe(0)
    expect(r.err).toMatch(/ref: 1-2000 chars/)
  })

  it('caps array length at 10', () => {
    const ev = Array.from({ length: 11 }, () => ({
      kind: 'press',
      ref: 'https://x',
      snippet: 's',
    }))
    const r = run([...STUB_ARGS, '--extra-corroboration', JSON.stringify(ev)])
    expect(r.code).not.toBe(0)
    expect(r.err).toMatch(/max 10 entries/)
  })

  it('passes parser stage with valid input (then fails on the stub claimId)', () => {
    // The flag parses; the CLI then bails because __nonexistent-claim__
    // isn't in pleno-claims-verified.json. That's the exit path that
    // confirms the flag is plumbed correctly without writing anything.
    const r = run([
      ...STUB_ARGS,
      '--extra-corroboration',
      JSON.stringify([
        { kind: 'press', ref: 'https://example.com/article', snippet: 'a citation' },
      ]),
    ])
    expect(r.code).not.toBe(0)
    // The error must come from the claim-lookup stage, not the flag parser.
    expect(r.err).not.toMatch(/--extra-corroboration/)
    // It should specifically complain about the missing claim.
    expect(r.err).toMatch(/__nonexistent-claim__|not found/)
  })
})
