import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { decide, CURATED } from '../.claude/hooks/guard-curated-writes.mjs'

// The PreToolUse guard is the only rule in this repo that is enforced rather
// than merely documented, so it needs the same discipline as an adapter: if it
// silently stops matching, nothing else notices.

const never = () => false // pretend the path does not exist yet
const always = () => true

describe('guard: curated files', () => {
  it('denies a direct write to every curated snapshot, naming its CLI', () => {
    for (const name of Object.keys(CURATED)) {
      const v = decide(`public/data/${name}`, never)
      expect(v?.decision, name).toBe('deny')
      expect(v.reason, name).toContain(CURATED[name])
    }
  })

  it('only fires inside public/data — a same-named fixture is fair game', () => {
    expect(decide('tests/fixtures/promises.json', never)).toBeNull()
    expect(decide('editorial/promises.json', never)).toBeNull()
  })

  // The guard's allow-list is a hand-kept copy of a fact that lives elsewhere,
  // which is the exact pattern DATA_INTEGRITY.md rule 1 is about. It cannot
  // import the doc, so it asserts against it instead: a curated file added to
  // docs/DATA_SOURCES.md without being added here would leave the new file
  // unguarded, and nothing would have failed.
  it('covers every curated file listed in docs/DATA_SOURCES.md', () => {
    const doc = readFileSync(resolve(__dirname, '../docs/DATA_SOURCES.md'), 'utf8')
    const section = doc.split('### Curated')[1].split('###')[0]
    const listed = [...section.matchAll(/`([a-z-]+\.json)`/g)].map((m) => m[1])
    expect(listed.length).toBeGreaterThan(8)
    expect(listed.filter((f) => !CURATED[f])).toEqual([])
  })
})

describe('guard: published surface', () => {
  it('asks before creating a NEW draft/suggestion file under public/', () => {
    const v = decide('public/data/journalist-reports-suggestions.json', never)
    expect(v?.decision).toBe('ask')
    expect(v.reason).toMatch(/editorial\//)
  })

  it('stays silent on suggestion files that already exist', () => {
    // Scrapers rewrite these nightly. A guard that nags on every routine
    // rewrite is a guard that gets switched off.
    expect(decide('public/data/promise-suggestions.json', always)).toBeNull()
  })

  it('leaves drafts in editorial/ alone — that is where they belong', () => {
    expect(decide('editorial/journalist-drafts/a-x-bio.draft.json', never)).toBeNull()
  })

  it('ignores ordinary source files and snapshots', () => {
    expect(decide('src/App.jsx', never)).toBeNull()
    expect(decide('public/data/tenders.json', never)).toBeNull()
    expect(decide(undefined, never)).toBeNull()
  })

  it('the real suggestion snapshots on disk are all already present', () => {
    // Guards against the ask-branch turning into permanent noise: if one of
    // these were missing, every nightly rewrite would prompt.
    for (const f of ['promise-suggestions.json', 'place-suggestions.json']) {
      expect(existsSync(resolve(__dirname, `../public/data/${f}`)), f).toBe(true)
    }
  })
})
