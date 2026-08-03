#!/usr/bin/env node
/**
 * PreToolUse guard for the two rules that are too costly to leave as prose.
 *
 * CLAUDE.md states both, but CLAUDE.md is guidance competing for attention with
 * everything else in it. These two have already been broken in production:
 *
 *   1. Curated files are never written by automation. Each one is fronted by a
 *      CLI that re-validates the WHOLE snapshot before writing, so an invariant
 *      (verbatim quote ≥20 chars, evidence on a `critical` finding, a `dueBy`
 *      backed by a clause from the acta) cannot slip. A direct Write/Edit skips
 *      the validator AND the audit trail, on files that make claims about named
 *      elected officials.
 *
 *   2. Anything under public/ is published. Vercel serves the whole directory,
 *      so a file there is fetchable by URL whether or not a page links to it.
 *      24 unreviewed drafts about named councillors sat there for weeks in 2026
 *      because "nothing renders it" was mistaken for "nobody can read it".
 *
 * Rule 1 denies. Rule 2 asks — new snapshots under public/data/ are routine,
 * it is specifically the draft/suggestion shape that needs a human to think.
 *
 * The denial names the replacement CLI, because a rule that only forbids leaves
 * the next step to guesswork.
 */
import { readFileSync } from 'node:fs'
import { existsSync } from 'node:fs'
import { basename } from 'node:path'

/**
 * basename → the CLI that owns it. Kept in sync with docs/DATA_SOURCES.md by
 * tests/guard-curated-writes.test.js, which fails if that doc lists a curated
 * file this table does not guard.
 */
export const CURATED = {
  'promises.json': 'npm run reply / freeze:set / freeze:clear',
  'pleno-votes.json': 'npm run pleno-vote (or promote-vote)',
  'pleno-findings.json': 'npm run promote-claim / finding-reply / correct-pleno-finding',
  'press-findings.json': 'npm run correct-press-finding',
  'journalist-reports.json':
    'npm run promote-report / correct-journalist-report / journalist-reply',
  'quejas-responses.json': 'npm run queja-reply',
  'sindic.json': 'npm run sindic:add',
  'dedicaciones.json': 'curated + cited — hand-edit via PR, never programmatically',
  'plantilla.json': 'curated + cited — hand-edit via PR, never programmatically',
  'place-overrides.json': 'npm run promote-place',
  'entity-overrides.json': 'npm run entity-alias',
  'gazetteer-supplement.json': 'curated — each row needs OSM-id/URL provenance',
}

const DRAFTY = /(suggestion|draft|borrador|propuesta)/i

export const decide = (path, exists = existsSync) => {
  if (!path) return null
  const name = basename(path)

  if (CURATED[name] && path.includes('public/data/')) {
    return {
      decision: 'deny',
      reason:
        `${name} is curated: schema-validated, human-edited, and never written by ` +
        `automation. A direct write skips the validator and the audit trail on a ` +
        `file that makes claims about named elected officials.\n\n` +
        `Use instead:  ${CURATED[name]}\n\n` +
        `The CLI re-validates the whole snapshot before writing, so an invariant ` +
        `cannot silently slip. See docs/DATA_SOURCES.md.`,
    }
  }

  if (path.includes('public/') && DRAFTY.test(name) && !exists(path)) {
    return {
      decision: 'ask',
      reason:
        `Creating ${name} under public/ — everything there is served by Vercel and ` +
        `fetchable by URL, linked or not. If these rows are unreviewed machine ` +
        `output about a named living person, they belong in editorial/ ` +
        `(gitignored) instead. That distinction is why 24 journalist drafts were ` +
        `publicly readable for weeks in 2026. Confirm this is safe to publish.`,
    }
  }

  return null
}

/** Executed as a hook (not imported by the test) — read stdin, emit a verdict. */
function main() {
  let payload = {}
  try {
    payload = JSON.parse(readFileSync(0, 'utf8') || '{}')
  } catch {
    return // Never let a malformed payload block real work.
  }

  if (!['Write', 'Edit', 'NotebookEdit'].includes(payload.tool_name)) return

  const verdict = decide(payload.tool_input?.file_path)
  if (!verdict) return

  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: verdict.decision,
        permissionDecisionReason: verdict.reason,
      },
    }),
  )
}

// process.argv[1] is unset when imported, set when run. Keeps the module
// importable by the test without it hanging on an empty stdin.
if (process.argv[1] && process.argv[1].endsWith('guard-curated-writes.mjs')) main()
