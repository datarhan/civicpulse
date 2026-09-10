#!/usr/bin/env tsx
/**
 * Curator CLI: WITHDRAW a published pleno vote, or just its per-bloc tally.
 *
 * The counterpart to `npm run pleno-vote` / `npm run promote-vote`, which can
 * only add and amend. Every operation here is a weakening — it removes a claim
 * from what readers see and never adds or alters one.
 *
 *   npm run retract-vote -- <voteId> --reason "<≥20 chars>" --editor "<name>"
 *       Withdraw the WHOLE vote. It leaves items[] (so it stops counting on
 *       /plenos, /departamentos and in the «plazos vencidos» flag) and its full
 *       content is tombstoned into retractions[].
 *
 *   npm run retract-vote -- <voteId> --breakdown --reason "…" --editor "…"
 *       Withdraw ONLY the per-bloc tally. Item number, title, outcome, plazo
 *       and source stay published. Use this when the outcome is sourced but the
 *       breakdown is not — regmeet publishes the former and never the latter.
 *
 *   npm run retract-vote -- <voteId> --plazo --reason "…" --editor "…"
 *       Withdraw ONLY the deadline (dueBy + dueBySource). Item, outcome and
 *       tally stay published; the date stops driving «plazos vencidos». Use it
 *       when the date is not stated verbatim by an acta.
 *
 *   npm run retract-vote -- <voteId> --unretract [--breakdown | --plazo] \
 *       --reason "…" --editor "…"
 *       Return an id to publication. The ledger entry is stamped, never
 *       removed. This is the ONLY way a withdrawn vote can come back, and it
 *       is signed and dated — which is what makes a silent reappearance
 *       impossible rather than merely unlikely.
 *
 *   --dry-run   print the effect, write nothing.
 *
 * read → validateSnapshot → pure mutate → re-validate WHOLE snapshot → write.
 * Nothing is deleted without a record; the retraction ledger IS the record.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

import {
  validateSnapshot,
  retractVoteRecord,
  retractVoteBreakdown,
  retractVoteDueBy,
  revokeRetraction,
  findLiveRetraction,
  RETRACTION_REASON_MIN,
  type PlenoVotesSnapshot,
  type VoteRetractionScope,
} from '../src/scraper/pleno-votes'

const DATA_PATH = resolve('public/data/pleno-votes.json')

function getFlag(name: string): string | null {
  const i = process.argv.indexOf(name)
  if (i < 0) return null
  return process.argv[i + 1] ?? null
}

const hasFlag = (name: string) => process.argv.includes(name)

function bail(msg: string, code = 2): never {
  process.stderr.write(`[retract-vote] ${msg}\n`)
  process.exit(code)
}

function usage(): never {
  process.stderr.write(
    'Usage:\n' +
      '  npm run retract-vote -- <voteId> --reason "<≥20 chars>" --editor "<name>"\n' +
      '  npm run retract-vote -- <voteId> --breakdown --reason "…" --editor "…"\n' +
      '  npm run retract-vote -- <voteId> --plazo --reason "…" --editor "…"\n' +
      '  npm run retract-vote -- <voteId> --unretract [--breakdown | --plazo] --reason "…" --editor "…"\n' +
      '  (add --dry-run to preview)\n\n' +
      '  --breakdown  withdraw only the per-bloc tally; item + outcome stay published\n' +
      '  --plazo      withdraw only the deadline (dueBy + dueBySource); item + outcome stay\n' +
      '  --unretract  lift a retraction so a corrected record can be published again\n',
  )
  process.exit(1)
}

function summarise(snap: PlenoVotesSnapshot, voteId: string) {
  const item = snap.items.find((v) => v.id === voteId)
  return {
    published: item != null,
    outcome: item?.outcome ?? null,
    tuples: item?.votes.length ?? 0,
    plazo: item?.dueBy ?? null,
    items: snap.items.length,
    retracted: snap.stats.retracted,
  }
}

function main() {
  const voteId = process.argv[2]
  if (!voteId || voteId.startsWith('--')) usage()

  const reason = getFlag('--reason')
  const editor = getFlag('--editor')
  if (hasFlag('--breakdown') && hasFlag('--plazo')) {
    bail('--breakdown and --plazo are separate retractions: run them one at a time')
  }
  const scope: VoteRetractionScope = hasFlag('--breakdown')
    ? 'breakdown'
    : hasFlag('--plazo')
      ? 'plazo'
      : 'record'
  const unretract = hasFlag('--unretract')
  const dryRun = hasFlag('--dry-run')

  if (!reason || !editor) usage()
  if (reason.trim().length < RETRACTION_REASON_MIN) {
    bail(
      `--reason must be ≥${RETRACTION_REASON_MIN} chars (got ${reason.trim().length}). ` +
        `This is a public correction about how named political groups voted.`,
    )
  }

  if (!existsSync(DATA_PATH)) bail(`${DATA_PATH} not found`)

  let snap: PlenoVotesSnapshot
  try {
    // Never write on top of a broken snapshot.
    snap = validateSnapshot(JSON.parse(readFileSync(DATA_PATH, 'utf8')))
  } catch (err) {
    bail(`existing snapshot fails validation: ${(err as Error).message}`)
  }

  const before = summarise(snap, voteId)
  const sig = { reason, editor, at: new Date().toISOString() }

  let next: PlenoVotesSnapshot
  let verb: string
  try {
    if (unretract) {
      next = revokeRetraction(snap, voteId, scope, sig)
      verb = `revoked ${scope} retraction of`
    } else if (scope === 'breakdown') {
      if (findLiveRetraction(snap, voteId, 'breakdown')) {
        bail(`vote "${voteId}" already has a live breakdown retraction`)
      }
      next = retractVoteBreakdown(snap, voteId, sig)
      verb = 'withdrew the per-bloc breakdown of'
    } else if (scope === 'plazo') {
      if (findLiveRetraction(snap, voteId, 'plazo')) {
        bail(`vote "${voteId}" already has a live plazo retraction`)
      }
      next = retractVoteDueBy(snap, voteId, sig)
      verb = 'withdrew the plazo of'
    } else {
      if (findLiveRetraction(snap, voteId, 'record')) {
        bail(`vote "${voteId}" is already retracted`)
      }
      next = retractVoteRecord(snap, voteId, sig)
      verb = 'withdrew'
    }
  } catch (err) {
    bail((err as Error).message)
  }

  // Re-validate the WHOLE snapshot, not just the row that changed: this is
  // where the reappearance invariant and the votes/votesRetracted pairing are
  // enforced, and a single broken record must refuse the write.
  let validated: PlenoVotesSnapshot
  try {
    validated = validateSnapshot({ ...next, generatedAt: new Date().toISOString() })
  } catch (err) {
    bail(`refusing to write — snapshot would be invalid: ${(err as Error).message}`, 1)
  }

  const after = summarise(validated, voteId)
  process.stdout.write(
    `[retract-vote] ${verb} ${voteId}\n` +
      `  published in items[]: ${before.published} → ${after.published}\n` +
      `  outcome:              ${before.outcome ?? '—'} → ${after.outcome ?? '—'}\n` +
      `  per-bloc tuples:      ${before.tuples} → ${after.tuples}\n` +
      `  plazo:                ${before.plazo ?? '—'} → ${after.plazo ?? '—'}\n` +
      `  items total:          ${before.items} → ${after.items}\n` +
      `  live retractions:     ${(Object.keys(after.retracted) as VoteRetractionScope[])
        .map((s) => `${s} ${before.retracted[s]}→${after.retracted[s]}`)
        .join(' · ')}\n` +
      `  editor:               ${editor}\n`,
  )

  if (dryRun) {
    process.stdout.write('[retract-vote] --dry-run: nothing written\n')
    return
  }

  writeFileSync(DATA_PATH, JSON.stringify(validated, null, 2) + '\n', 'utf8')
  process.stdout.write(`[retract-vote] wrote ${DATA_PATH}\n`)
}

main()
