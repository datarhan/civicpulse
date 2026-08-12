/**
 * Decision logic for the PreToolUse guard. Kept in its own module so the hook
 * runner can be unconditional — an earlier version only ran when argv[1] ended
 * in the script's own filename, so invoking it through a symlink or a renamed
 * copy silently allowed everything, and emitted nothing, which looks exactly
 * like a pass. A control that cannot be told apart from its own absence is not
 * a control.
 *
 * Two rules, both already broken in production once:
 *
 *   1. Curated files are never written by automation. Each is fronted by a CLI
 *      that re-validates the WHOLE snapshot before writing, so an invariant
 *      (verbatim quote ≥20 chars, evidence on a `critical` finding, a `dueBy`
 *      backed by a clause from the acta) cannot slip. A direct write skips the
 *      validator AND the audit trail, on files that make claims about named
 *      elected officials.
 *
 *   2. Anything under public/ is published. Vercel serves the whole directory,
 *      so a file there is fetchable by URL whether or not a page links to it.
 *      24 unreviewed drafts about named councillors sat there for weeks because
 *      "nothing renders it" was mistaken for "nobody can read it".
 *
 * Deterministic checks deny; heuristic ones ask. That is this repo's existing
 * split — the pre-commit `check:json` blocks, the probabilistic pre-push page
 * review never does. Matching a normalized file path is exact, so it denies.
 * Scanning a shell command is inference, so it asks.
 */
import { existsSync } from 'node:fs'
import { basename, normalize } from 'node:path'

/**
 * basename → the CLI that owns it. Kept in sync with docs/DATA_SOURCES.md by
 * tests/guard-curated-writes.test.js, which fails if that doc lists a curated
 * file this table does not guard.
 */
export const CURATED = {
  'promises.json': 'npm run reply / freeze:set / freeze:clear',
  'pleno-votes.json': 'npm run pleno-vote / promote-vote / retract-vote',
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
  'area-fit.json': 'npm run promote-area-fit',
  'requisitos-cargo.json': 'curated + cited — hand-edit via PR, never programmatically',
  'eficiencia-findings.json':
    'npm run promote-indicador / correct-indicador / retract-indicador',
}

const DRAFTY = /(suggestion|draft|borrador|propuesta)/i

/**
 * `public/./data/x.json` and `public//data/x.json` name the same file as
 * `public/data/x.json`, and both slipped past a raw `includes()`. Collapse the
 * path first so one spelling cannot mean two things.
 */
export const canonical = (p) =>
  normalize(String(p))
    .replace(/\/{2,}/g, '/')
    .replace(/^\.\//, '')

const denyCurated = (name) => ({
  decision: 'deny',
  reason:
    `${name} is curated: schema-validated, human-edited, and never written by ` +
    `automation. A direct write skips the validator and the audit trail on a ` +
    `file that makes claims about named elected officials.\n\n` +
    `Use instead:  ${CURATED[name]}\n\n` +
    `The CLI re-validates the whole snapshot before writing, so an invariant ` +
    `cannot silently slip. Shelling out to achieve the same edit is the same ` +
    `bypass with extra steps. See docs/DATA_SOURCES.md.`,
})

/** Write / Edit / NotebookEdit — exact path match, so it denies. */
export const decide = (path, exists = existsSync) => {
  if (!path) return null
  const p = canonical(path)
  const name = basename(p)

  if (CURATED[name] && p.includes('public/data/')) return denyCurated(name)

  if (p.includes('public/') && DRAFTY.test(name) && !exists(path)) {
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

/**
 * Shell redirection, in-place edit, or copy onto a curated file. Denying Write
 * while leaving `echo … > promises.json` open would only teach the next session
 * to reach for Bash.
 *
 * Reading is fine (`jq . promises.json`, `git diff`, `cat`), and so are the
 * sanctioned CLIs (`npm run reply -- …`) — none carry a write token. This is
 * inference over an unparsed string, so it asks rather than denies.
 */
const REDIRECT = /(>>?|\b(?:tee|dd)\b|\b(?:sed|perl|ruby)\b[^|;]*\s-i\b|\btruncate\b)/
/** `cp`/`mv`/`install` write only their LAST argument. */
const COPYLIKE = /^\s*(?:sudo\s+)?(?:cp|mv|install|rsync)\b/

const writesTo = (clause, name) => {
  if (COPYLIKE.test(clause)) {
    // `cp promises.json /tmp/backup.json` is a read. Only the destination —
    // the final argument — is written.
    const args = clause
      .trim()
      .split(/\s+/)
      .filter((a) => !a.startsWith('-'))
    return basename(canonical(args[args.length - 1] || '')) === name
  }
  return REDIRECT.test(clause)
}

export const decideBash = (command) => {
  if (!command) return null
  const cmd = String(command)
  const hit = Object.keys(CURATED).find((name) =>
    // Only care when the mention sits in a clause that also writes it.
    cmd.split(/[;&|\n]+/).some((clause) => clause.includes(name) && writesTo(clause, name)),
  )
  if (!hit) return null

  return {
    decision: 'ask',
    reason:
      `This command looks like it writes ${hit} directly. That file is curated: ` +
      `the CLI that owns it re-validates the whole snapshot before writing, and ` +
      `a raw shell write skips both the validator and the audit trail.\n\n` +
      `Use instead:  ${CURATED[hit]}\n\n` +
      `If this is a read, a diff, or the sanctioned CLI itself, approve and ` +
      `carry on. See docs/DATA_SOURCES.md.`,
  }
}
