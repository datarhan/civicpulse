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
import { decideIrreplaceableBash } from './irreplaceable-paths.mjs'
import { arbolesReales, decideLiveTreeBash } from './live-tree-paths.mjs'
import { decideMeasureMedia } from './measure-media.mjs'
import { decideCurlBash } from './curl-hosts.mjs'

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

// Curated-write first: it names the CLI that owns the file, which is the more
// actionable answer when both could fire.
const verdict =
  tool === 'Bash'
    ? (decideBash(input.command) ??
      decideIrreplaceableBash(input.command) ??
      decideLiveTreeBash(input.command, undefined, () =>
        arbolesReales(payload.cwd || process.cwd()),
      ) ??
      decideMeasureMedia(input.command) ??
      // El último de la cadena: los otros cuatro dicen algo más accionable
      // cuando ambos podrían saltar, y éste sólo habla de a dónde sale.
      decideCurlBash(input.command))
    : ['Write', 'Edit', 'NotebookEdit', 'MultiEdit'].includes(tool)
      ? decide(input.file_path ?? input.notebook_path)
      : null

if (!verdict) process.exit(0)

// The reason of an `ask` is shown to the person approving and never to the
// model; a `deny` reason reaches the model. So an `ask` that the model must
// also know about carries `context`, sent as `additionalContext`, which lands
// next to the tool result either way.
process.stdout.write(
  JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: verdict.decision,
      permissionDecisionReason: verdict.reason,
      ...(verdict.context ? { additionalContext: verdict.context } : {}),
    },
  }),
)
