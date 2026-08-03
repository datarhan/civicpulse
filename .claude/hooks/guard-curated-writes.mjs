#!/usr/bin/env node
/**
 * PreToolUse runner. All decision logic lives in ./curated-paths.mjs; this file
 * only reads the payload and prints the verdict.
 *
 * It runs unconditionally. The previous version gated main() on
 * `process.argv[1].endsWith('guard-curated-writes.mjs')`, so a symlink or a
 * renamed copy silently allowed everything while emitting nothing — which reads
 * exactly like a pass.
 */
import { readFileSync } from 'node:fs'
import { decide, decideBash } from './curated-paths.mjs'

let payload = {}
try {
  payload = JSON.parse(readFileSync(0, 'utf8') || '{}')
} catch {
  // A payload we cannot parse carries no path to judge. Allowing is the only
  // option that does not block every write in the session on a transport bug;
  // it is announced on stderr so the failure is visible rather than silent.
  process.stderr.write('[guard-curated-writes] unparseable hook payload — not evaluated\n')
  process.exit(0)
}

const tool = payload.tool_name
const input = payload.tool_input || {}

const verdict =
  tool === 'Bash'
    ? decideBash(input.command)
    : ['Write', 'Edit', 'NotebookEdit', 'MultiEdit'].includes(tool)
      ? decide(input.file_path ?? input.notebook_path)
      : null

if (!verdict) process.exit(0)

process.stdout.write(
  JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: verdict.decision,
      permissionDecisionReason: verdict.reason,
    },
  }),
)
