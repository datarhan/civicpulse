/**
 * Curator-only: apply an approved verdict DOWNGRADE to the overlay (P2). This is
 * the ONLY path that mutates a published verdict — downgrade-only, reason-gated,
 * human-driven. Writes a curator-downgrade overlay entry + rebuilds verified.json.
 *
 *   npm run downgrade-verdict -- <claimId> <verificado|parcial|sin-datos> \
 *       --reason "<≥20 chars>" [--editor "<name>"]
 *
 * Validates: the claim exists, the move is a real downgrade vs the CURRENT
 * published verdict, and the reason is ≥20 chars. Never raises a verdict.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { loadOverlay, rebuildVerified, OVERLAY, VERIFIED } from './verified-rebuild'
import { applyOverlayEntries } from '../src/scraper/verified-merge'
import type { ClaimVerdict, ClaimVerification } from '../src/scraper/claim-verifier'

const DOWNGRADE_TARGETS: ClaimVerdict[] = ['verificado', 'parcial', 'sin-datos']

function parse(argv: string[]) {
  const pos: string[] = []
  let reason = ''
  let editor = 'curator'
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--reason') reason = argv[++i]
    else if (argv[i] === '--editor') editor = argv[++i]
    else pos.push(argv[i])
  }
  return { claimId: pos[0], newVerdict: pos[1] as ClaimVerdict, reason, editor }
}

function main() {
  const { claimId, newVerdict, reason, editor } = parse(process.argv.slice(2))
  if (!claimId || !newVerdict) {
    process.stderr.write(
      'usage: npm run downgrade-verdict -- <claimId> <verificado|parcial|sin-datos> --reason "<≥20 chars>" [--editor name]\n',
    )
    process.exit(2)
  }
  if (!DOWNGRADE_TARGETS.includes(newVerdict)) {
    process.stderr.write(`[downgrade] invalid target verdict ${newVerdict}\n`)
    process.exit(2)
  }
  if (!existsSync(VERIFIED)) {
    process.stderr.write(`[downgrade] ${VERIFIED} missing — run verify:pleno-claims first\n`)
    process.exit(1)
  }

  const snap = JSON.parse(readFileSync(VERIFIED, 'utf8')) as {
    items: { claim: { id: string }; verification: ClaimVerification }[]
  }
  const item = snap.items.find((it) => it.claim.id === claimId)
  if (!item) {
    process.stderr.write(`[downgrade] claim ${claimId} not found\n`)
    process.exit(1)
  }
  const current = item.verification.verdict

  // New verification reflects the downgrade. sin-datos = no supporting evidence.
  const verification: ClaimVerification = {
    claimId,
    verdict: newVerdict,
    summary: reason,
    evidence: newVerdict === 'sin-datos' ? [] : item.verification.evidence,
    checkedAgainst: ['curator-downgrade'],
  }

  let overlay = loadOverlay()
  try {
    // isDowngrade is validated against the CURRENT published verdict.
    overlay = applyOverlayEntries(
      overlay,
      [{ claimId, verification, source: 'curator-downgrade', reason, editor }],
      new Date().toISOString(),
      new Map([[claimId, current]]),
    )
  } catch (err) {
    process.stderr.write(`[downgrade] rejected: ${(err as Error).message}\n`)
    process.exit(1)
  }
  writeFileSync(OVERLAY, JSON.stringify(overlay, null, 2) + '\n')

  rebuildVerified()
    .then(() => {
      process.stdout.write(
        `[downgrade] ${claimId}: ${current} → ${newVerdict} (curator: ${editor}) · overlay + verified.json updated\n`,
      )
    })
    .catch((err) => {
      process.stderr.write(
        `[downgrade] overlay written but rebuild FAILED: ${(err as Error).message}\n`,
      )
      process.exit(1)
    })
}

main()
