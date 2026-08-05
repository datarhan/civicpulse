#!/usr/bin/env tsx
/**
 * One-shot migration: give every published vote a citation PER CLAIM.
 *
 *   npx tsx scripts/migrate-vote-provenance.ts [--dry-run]
 *
 * Why. Until now each row in `pleno-votes.json` carried a single `sourceUrl`,
 * and — measured, all 17 of 17 — it pointed at regmeet. regmeet publishes the
 * orden del día and the outcome. It publishes no per-bloc breakdown at all.
 * The tallies were read off a Whisper transcript that the row never cited. So
 * every row asserted two facts under one citation that supports one of them,
 * and `check:citations` could not see it: the URL resolves perfectly, it just
 * does not contain half of what was attributed to it.
 *
 * What this writes, and what it deliberately does NOT.
 *
 *   outcome   → the regmeet URL the row already cites. Nothing moves; the
 *               claim and its source were always matched here.
 *   breakdown → the session transcript this site publishes at
 *               /data/pleno-transcripts/<plenoId>.txt, marked `sin-verificar`.
 *
 * `sin-verificar` is the honest value and the point of the exercise. Nobody has
 * cotejado these tallies against the acta. Three that WERE checked turned out
 * wrong and were retracted on 2026-08-05 — 2 whole records, 1 breakdown — which
 * is why this runs after those retractions and not before: relabelling a
 * withdrawn row would have dressed it as reviewed. Nothing in `retractions[]`
 * is read, written or re-annotated here, and the array is asserted byte-
 * identical before the write.
 *
 * No `locator` is invented either. Pointing at the minute and second of each
 * tally inside a two-hour transcript is work nobody has done; a plausible
 * timestamp would be exactly the fabricated verification this split exists to
 * prevent. The field stays absent until a curator fills it.
 *
 * `retrievedAt` on the breakdown ref is the transcript's own publication date,
 * taken from `git log` on the file — a fact that can be re-derived, not the
 * date this script happened to run.
 *
 * Fails closed, per row: an outcome URL that is not regmeet, or a transcript
 * that is not in the build, is REFUSED and reported rather than guessed at. A
 * citation nobody can follow is the defect, not the fix.
 *
 * Idempotent: rows that already carry `provenance` are counted as such and left
 * untouched, and they are counted SEPARATELY from rows this run migrated —
 * folding "already done" into "done" is how a pass reports work it never did
 * (docs/DATA_INTEGRITY.md rule 2).
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

import {
  transcriptRefUrl,
  TRANSCRIPT_SOURCE_PUBLISHER,
  validateSnapshot,
  voteSourceKindForUrl,
  type PlenoVote,
  type VoteSourceRef,
} from '../src/scraper/pleno-votes'

const DATA_PATH = resolve('public/data/pleno-votes.json')
const TRANSCRIPT_DIR = 'public/data/pleno-transcripts'

const transcriptFile = (plenoId: string) => resolve(TRANSCRIPT_DIR, `${plenoId}.txt`)

/**
 * The snapshot's own `source` block carried the same false claim the rows did:
 * «transcribed verbatim from published pleno actas … Each record cites the
 * source acta URL». No row was ever read off an acta. It is a published field
 * (Vercel serves this file), so it is corrected here rather than left as the
 * one place the old story survives.
 */
const SOURCE = {
  description:
    'Curated voting records for the Ayuntamiento de Riba-roja de Túria. Each record ' +
    'cites its two halves separately in `provenance`: the OUTCOME comes from the ' +
    "council's session portal (regmeet.com), which publishes the orden del día and " +
    'the result but no per-bloc tally; the BREAKDOWN comes from the automatic ' +
    'transcript of the session audio published at /data/pleno-transcripts/. ' +
    'A breakdown stays `verification: "sin-verificar"` until a curator cotejes it ' +
    'against the acta and signs for it.',
  contract:
    'Human-edited, schema-validated. Mutations only via npm run pleno-vote / ' +
    'promote-vote / retract-vote. A breakdown attributed to a source that does not ' +
    'publish one is refused at write time.',
}

/**
 * The day this transcript version was published, from git. Returns null when
 * the file is untracked — an untracked transcript is not in the deploy, so a
 * row citing it would cite a 404.
 */
function transcriptPublishedAt(plenoId: string): string | null {
  try {
    const out = execFileSync(
      'git',
      ['log', '-1', '--format=%cs', '--', `${TRANSCRIPT_DIR}/${plenoId}.txt`],
      { encoding: 'utf8' },
    ).trim()
    return /^\d{4}-\d{2}-\d{2}$/.test(out) ? out : null
  } catch {
    return null
  }
}

interface Outcome {
  migrated: string[]
  alreadyMigrated: string[]
  refused: Array<{ id: string; why: string }>
}

function planProvenance(items: PlenoVote[]): {
  next: PlenoVote[]
  outcome: Outcome
} {
  const outcome: Outcome = { migrated: [], alreadyMigrated: [], refused: [] }
  const next = items.map((item) => {
    if (item.provenance != null) {
      outcome.alreadyMigrated.push(item.id)
      return item
    }

    const kind = voteSourceKindForUrl(item.sourceUrl)
    if (kind == null) {
      outcome.refused.push({
        id: item.id,
        why: `sourceUrl host is not a known source kind: ${item.sourceUrl}`,
      })
      return item
    }

    const outcomeRef: VoteSourceRef = {
      kind,
      url: item.sourceUrl,
      publisher: item.sourcePublisher,
      retrievedAt: item.retrievedAt,
      verification: 'sin-verificar',
    }

    // No tally published (a withdrawn breakdown): there is nothing to cite, and
    // a leftover citation would point at a tally the page does not show.
    if (item.votes.length === 0) {
      outcome.migrated.push(item.id)
      return { ...item, provenance: { outcome: outcomeRef, breakdown: null } }
    }

    if (!existsSync(transcriptFile(item.plenoId))) {
      outcome.refused.push({
        id: item.id,
        why: `no transcript at ${TRANSCRIPT_DIR}/${item.plenoId}.txt — refusing to cite a file that is not in the build`,
      })
      return item
    }
    const publishedAt = transcriptPublishedAt(item.plenoId)
    if (publishedAt == null) {
      outcome.refused.push({
        id: item.id,
        why: `transcript ${item.plenoId}.txt is untracked by git — it would not be deployed`,
      })
      return item
    }

    outcome.migrated.push(item.id)
    return {
      ...item,
      provenance: {
        outcome: outcomeRef,
        breakdown: {
          kind: 'transcripcion' as const,
          url: transcriptRefUrl(item.plenoId),
          publisher: TRANSCRIPT_SOURCE_PUBLISHER,
          retrievedAt: publishedAt,
          // Deliberately no `locator` and no `quote`: see the header.
          verification: 'sin-verificar' as const,
        },
      },
    }
  })
  return { next, outcome }
}

function main() {
  const dryRun = process.argv.includes('--dry-run')
  if (!existsSync(DATA_PATH)) {
    process.stderr.write(`[migrate-vote-provenance] ${DATA_PATH} not found\n`)
    process.exit(2)
  }

  // Parsed raw, NOT through validateSnapshot: the pre-migration file no longer
  // satisfies the schema this migration exists to satisfy. The validator runs
  // on the way out, over the whole snapshot, where it is a gate rather than a
  // chicken-and-egg problem.
  const raw = JSON.parse(readFileSync(DATA_PATH, 'utf8')) as {
    source?: unknown
    items: PlenoVote[]
    retractions?: unknown[]
  }
  const beforeItems = raw.items.length
  const beforeRetractions = JSON.stringify(raw.retractions ?? [])
  const beforeTallies = raw.items.map((i) => `${i.id}:${JSON.stringify(i.votes)}`).join('|')

  const { next, outcome } = planProvenance(raw.items)

  // Structural invariants. This migration adds a field and changes nothing
  // else; anything below failing means it did something it does not claim to.
  const sourceWasStale = JSON.stringify(raw.source) !== JSON.stringify(SOURCE)
  const after = { ...raw, source: SOURCE, items: next, generatedAt: new Date().toISOString() }
  const problems: string[] = []
  if (next.length !== beforeItems) problems.push(`item count ${beforeItems} → ${next.length}`)
  if (JSON.stringify(after.retractions ?? []) !== beforeRetractions) {
    problems.push('retractions[] was modified')
  }
  if (next.map((i) => `${i.id}:${JSON.stringify(i.votes)}`).join('|') !== beforeTallies) {
    problems.push('a per-bloc tally or id changed')
  }
  if (problems.length > 0) {
    process.stderr.write(`[migrate-vote-provenance] refusing: ${problems.join('; ')}\n`)
    process.exit(1)
  }

  // Report the four outcomes separately — "attempted", "done", "already done"
  // and "refused with a reason" are different facts.
  const out = (s: string) => process.stdout.write(`${s}\n`)
  out(`[migrate-vote-provenance] attempted ${beforeItems} published vote(s)`)
  out(`  migrated now:      ${outcome.migrated.length}`)
  out(`  already migrated:  ${outcome.alreadyMigrated.length}`)
  out(`  refused:           ${outcome.refused.length}`)
  for (const r of outcome.refused) out(`    · ${r.id}: ${r.why}`)
  const withBreakdown = next.filter((i) => i.provenance?.breakdown != null)
  out(
    `  breakdown citations: ${withBreakdown.length} ` +
      `(${withBreakdown.filter((i) => i.provenance?.breakdown?.verification === 'sin-verificar').length} sin verificar)`,
  )
  out(`  source block:      ${sourceWasStale ? 'corrected' : 'already correct'}`)
  out(`  retractions[]:     ${(raw.retractions ?? []).length} entries, untouched`)

  if (outcome.refused.length > 0) {
    process.stderr.write(
      `[migrate-vote-provenance] ${outcome.refused.length} row(s) refused — nothing written\n`,
    )
    process.exit(1)
  }

  let validated
  try {
    validated = validateSnapshot(after)
  } catch (err) {
    process.stderr.write(
      `[migrate-vote-provenance] refusing to write — snapshot would be invalid: ${(err as Error).message}\n`,
    )
    process.exit(1)
  }

  if (dryRun) {
    out('[migrate-vote-provenance] --dry-run: nothing written')
    return
  }
  writeFileSync(DATA_PATH, JSON.stringify(validated, null, 2) + '\n', 'utf8')
  out(`[migrate-vote-provenance] wrote ${DATA_PATH}`)
}

main()
