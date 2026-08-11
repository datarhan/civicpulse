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
import {
  classifyBacklogState,
  isUsableReference,
  type BacklogState,
} from '../src/scraper/speaker-map'
import { parseDiarizedTranscript } from '../src/scraper/voice-id'

const TRANSCRIPTS = 'public/data/pleno-transcripts'
const MAPS = 'pleno-speaker-map'
const PLENOS = 'public/data/plenos.json'

export interface BacklogEntry {
  plenoId: string
  date: string
  /**
   * `absent` = never started. `partial` = started and unfinished.
   * `blocked` = cannot be started: the file under `pleno-transcripts` is acta
   * text, not diarized audio, so there is nothing for the coverage gate to
   * score against. Those need transcribing first.
   */
  state: BacklogState
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
    let map: unknown = null
    if (existsSync(mapPath)) {
      try {
        map = JSON.parse(readFileSync(mapPath, 'utf8'))
      } catch {
        map = null
      }
    }
    // Parse the transcript, do not just check the path exists — the acta-text
    // files sit in the same directory under the same extension and parse to
    // zero segments.
    const referenceUsable = isUsableReference(
      parseDiarizedTranscript(readFileSync(resolve(TRANSCRIPTS, f), 'utf8')),
    )
    const state = classifyBacklogState({ referenceUsable, map })
    if (state === null) continue
    const s = (map as { stats?: { chunksTranscribed?: number; chunksExpected?: number } })?.stats
    out.push({
      plenoId,
      date: dates.get(plenoId) ?? '',
      state,
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
    // The plain list is a WORK QUEUE — `hallazgos-pipeline.sh` feeds it
    // straight to `extract:speaker-map`, which now refuses a session whose
    // transcript the coverage gate cannot score against. Listing a blocked
    // session there would hand the pipeline a job that can only fail.
    if (!why && e.state === 'blocked') continue
    process.stdout.write(
      why
        ? `${e.plenoId}\t${e.date || '(sin fecha)'}\t${
            e.state === 'blocked'
              ? 'BLOQUEADA · sin transcripción diarizada (solo texto de acta)'
              : e.state === 'absent'
                ? 'sin empezar'
                : `parcial ${e.done}/${e.total} trozos`
          }\n`
        : `${e.plenoId}\n`,
    )
  }
  if (why) {
    const n = (s: BacklogState) => backlog.filter((e) => e.state === s).length
    process.stderr.write(
      `\n${backlog.length} sesión(es) en el backlog · ${n('absent')} sin empezar · ` +
        `${n('partial')} parcial(es) · ${n('blocked')} BLOQUEADA(S) hasta transcribirlas\n`,
    )
  }
}

if (import.meta.url === `file://${process.argv[1]}`) main()
