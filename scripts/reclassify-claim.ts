/**
 * Curator-only: correct the TYPE of a machine-extracted claim via the curated
 * sidecar (`pleno-claim-reclassifications.json`) + rebuild of verified.json.
 * The sibling of `downgrade-verdict`: that one owns verdicts, this one owns the
 * one claim field whose misassignment publishes a false speech act — an
 * extractor that shoehorns debate speech into `acusacion_publica` puts an
 * accusation in a councillor bloc's mouth. Direction is wired shut: a
 * reclassification only moves AWAY from `acusacion_publica`, never toward it
 * (the mirror of downgrade-only).
 *
 *   npm run reclassify-claim -- <claimId> <tipo> --reason "<≥20 chars>" \
 *       [--editor "<name>"]
 *
 * Validates: the claim exists, its PUBLISHED type is acusacion_publica, the
 * target is a real non-accusation ClaimType, and the reason is ≥20 chars.
 * The rebuild re-applies the sidecar after every future base regeneration, so
 * the correction survives nightly verify runs the same way overlay verdicts do.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import {
  loadReclassifications,
  rebuildVerified,
  RECLASSIFICATIONS,
  VERIFIED,
} from './verified-rebuild'
import { applyReclassificationEntries } from '../src/scraper/verified-merge'
import type { ClaimType } from '../src/scraper/pleno-claim'

function parse(argv: string[]) {
  const pos: string[] = []
  let reason = ''
  let editor = 'curator'
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--reason') reason = argv[++i]
    else if (argv[i] === '--editor') editor = argv[++i]
    else pos.push(argv[i])
  }
  return { claimId: pos[0], newType: pos[1] as ClaimType, reason, editor }
}

function main() {
  const { claimId, newType, reason, editor } = parse(process.argv.slice(2))
  if (!claimId || !newType) {
    process.stderr.write(
      'usage: npm run reclassify-claim -- <claimId> <tipo> --reason "<≥20 chars>" [--editor name]\n',
    )
    process.exit(2)
  }
  if (!existsSync(VERIFIED)) {
    process.stderr.write(`[reclas] ${VERIFIED} missing — run verify:pleno-claims first\n`)
    process.exit(1)
  }

  const snap = JSON.parse(readFileSync(VERIFIED, 'utf8')) as {
    items: { claim: { id: string; type: ClaimType } }[]
  }
  const item = snap.items.find((it) => it.claim.id === claimId)
  if (!item) {
    process.stderr.write(`[reclas] claim ${claimId} not found\n`)
    process.exit(1)
  }
  const current = item.claim.type

  let reclas = loadReclassifications()
  try {
    // The away-from-accusation gate is validated against the CURRENT published
    // type, like downgrade-verdict validates against the published verdict.
    reclas = applyReclassificationEntries(
      reclas,
      [{ claimId, type: newType, reason, editor }],
      new Date().toISOString(),
      new Map([[claimId, current]]),
    )
  } catch (err) {
    process.stderr.write(`[reclas] rejected: ${(err as Error).message}\n`)
    process.exit(1)
  }
  writeFileSync(RECLASSIFICATIONS, JSON.stringify(reclas, null, 2) + '\n')

  rebuildVerified()
    .then((r) => {
      process.stdout.write(
        `[reclas] ${claimId}: ${current} → ${newType} (curator: ${editor}) · ` +
          `${r.reclassApplied} reclasificación(es) aplicadas · sidecar + verified.json + chunks updated\n`,
      )
    })
    .catch((err) => {
      process.stderr.write(
        `[reclas] sidecar written but rebuild FAILED: ${(err as Error).message}\n`,
      )
      process.exit(1)
    })
}

main()
