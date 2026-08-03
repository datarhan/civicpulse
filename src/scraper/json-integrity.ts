/**
 * Are these bytes a document?
 *
 * The one invariant under every other check in this repo, and the last one
 * anybody wrote. `pleno-votes-suggestions.json` sat in `main` for a day holding
 * literal `<<<<<<< Updated upstream` markers from an unresolved `git stash pop`
 * (ffab006): invalid JSON, every reader of it would throw, and nothing noticed —
 * the file is read only by curator tooling, so nothing exercised it.
 *
 * The elaborate checks here all validate SEMANTICS: do the ids resolve, do the
 * quotes trace, has the vocabulary drifted. Not one asked whether the file
 * parses. A conflict marker in a snapshot the SPA loads breaks the site, not
 * one CLI.
 *
 * Pure: the walking and the `git grep` live in `scripts/check-json.ts`.
 */

/**
 * Conflict markers as git actually writes them, for JSON.
 *
 * `^={7}$` — the separator — is safe to look for inside JSON specifically,
 * because a real newline cannot occur inside a JSON string (it must be escaped
 * as `\n`). So a line that is exactly seven `=` characters cannot be data; it
 * can only be a marker. That is NOT true of prose, which is why the source
 * pattern below deliberately omits it.
 */
export const CONFLICT_MARKERS_JSON = /^<{7} |^={7}$|^>{7} /m

/**
 * The same thing for tracked source and prose — WITHOUT the `=======` arm.
 *
 * A Markdown setext heading underlines with equals signs, so including it would
 * fire on ordinary documentation. Losing that arm costs nothing: git never
 * writes a separator without also writing the `<<<<<<<` that opens it.
 */
export const CONFLICT_MARKERS_SOURCE = '^<{7} |^>{7} '

export type FileVerdict = { ok: true } | { ok: false; reason: string }

/** Why this file is not a document, or that it is. Order matters: a conflicted
 * file is also unparseable, and "merge conflict" is the useful diagnosis. */
export function inspectJsonText(text: string): FileVerdict {
  if (CONFLICT_MARKERS_JSON.test(text)) {
    return { ok: false, reason: 'contains merge-conflict markers' }
  }
  try {
    JSON.parse(text)
    return { ok: true }
  } catch (err) {
    return { ok: false, reason: (err as Error).message.slice(0, 80) }
  }
}
