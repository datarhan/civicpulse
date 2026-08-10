#!/usr/bin/env tsx
/**
 * Which sessions still need speaker-map work, newest first.
 *
 *   npm run speaker-map:backlog            # one plenoId per line
 *   npm run speaker-map:backlog -- --why   # with the reason, for a human
 *
 * Exists as a script rather than inline `node -e` inside the pipeline because
 * the predicate decides whether a long session is ever finished, and a
 * predicate embedded in a bash heredoc cannot be tested. `isMapComplete` lives
 * in `speaker-map.ts` and is imported by both this and its test, so the backlog
 * and the definition of "done" cannot drift apart.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { isMapComplete } from '../src/scraper/speaker-map'

const TRANSCRIPTS = 'public/data/pleno-transcripts'
const MAPS = 'pleno-speaker-map'
const PLENOS = 'public/data/plenos.json'

export interface BacklogEntry {
  plenoId: string
  date: string
  /** `absent` = never started. `partial` = started and unfinished. */
  state: 'absent' | 'partial'
  done: number
  total: number
}

export function speakerMapBacklog(): BacklogEntry[] {
  if (!existsSync(resolve(TRANSCRIPTS))) return []
  const dates = new Map<string, string>()
  if (existsSync(resolve(PLENOS))) {
    const items = (JSON.parse(readFileSync(resolve(PLENOS), 'utf8')).items ?? []) as Array<{
      id: string
      date?: string
    }>
    for (const p of items) dates.set(p.id, p.date ?? '')
  }

  const out: BacklogEntry[] = []
  for (const f of readdirSync(resolve(TRANSCRIPTS))) {
    if (!f.endsWith('.txt')) continue
    const plenoId = f.replace(/\.txt$/, '')
    const mapPath = resolve(MAPS, `${plenoId}.json`)
    if (!existsSync(mapPath)) {
      out.push({ plenoId, date: dates.get(plenoId) ?? '', state: 'absent', done: 0, total: 0 })
      continue
    }
    let map: unknown = null
    try {
      map = JSON.parse(readFileSync(mapPath, 'utf8'))
    } catch {
      map = null
    }
    if (isMapComplete(map)) continue
    const s = (map as { stats?: { chunksTranscribed?: number; chunksExpected?: number } })?.stats
    out.push({
      plenoId,
      date: dates.get(plenoId) ?? '',
      state: 'partial',
      done: s?.chunksTranscribed ?? 0,
      total: s?.chunksExpected ?? 0,
    })
  }
  // Newest session first: the most recent pleno is the one readers are looking
  // at, and an old backlog entry losing a day costs nothing.
  return out.sort((a, b) => b.date.localeCompare(a.date))
}

function main() {
  // This is designed to be piped — `| head`, `| grep -c` — and a reader that
  // closes early makes node throw EPIPE and exit non-zero, which in the
  // pipeline reads as "the backlog query failed" rather than "grep had what it
  // needed". Exit quietly instead.
  process.stdout.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EPIPE') process.exit(0)
    throw err
  })

  const why = process.argv.includes('--why')
  const backlog = speakerMapBacklog()
  for (const e of backlog) {
    process.stdout.write(
      why
        ? `${e.plenoId}\t${e.date || '(sin fecha)'}\t${
            e.state === 'absent' ? 'sin empezar' : `parcial ${e.done}/${e.total} trozos`
          }\n`
        : `${e.plenoId}\n`,
    )
  }
}

if (import.meta.url === `file://${process.argv[1]}`) main()
