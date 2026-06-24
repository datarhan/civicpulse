/**
 * Apply the reviewed-gold DOWNGRADES to the overlay (P2.5 / step 2).
 *
 *   npm run apply-gold-downgrades [-- --dry-run]
 *
 * For every reviewed gold row whose label is a DOWNGRADE of the current published
 * verdict, writes a curator-downgrade overlay entry (editor: ai-gold-review,
 * reason: the per-claim review note) and rebuilds verified.json. Downgrade-only
 * by construction — it can only retract an over-claim, never raise a verdict, so
 * the libel direction is always safe. Each change is individually reviewed (these
 * are the 50 gold claims), reversible (overlay), and auditable.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { loadOverlay, rebuildVerified, OVERLAY } from './verified-rebuild'
import { applyOverlayEntries, isDowngrade, type ApplyEntry } from '../src/scraper/verified-merge'
import type { ClaimVerdict, ClaimVerification } from '../src/scraper/claim-verifier'
import type { GoldRow } from '../src/scraper/verifier-eval'

const dryRun = process.argv.includes('--dry-run')

const gold = (
  JSON.parse(readFileSync(resolve('tests/fixtures/verifier-gold.json'), 'utf8')).rows as GoldRow[]
).filter((g) => g.reviewed)
const ver = JSON.parse(readFileSync(resolve('public/data/pleno-claims-verified.json'), 'utf8')) as {
  items: { claim: { id: string }; verification: ClaimVerification }[]
}
const byId = new Map(ver.items.map((it) => [it.claim.id, it.verification]))

const baseVerdict = new Map<string, ClaimVerdict>()
const entries: ApplyEntry[] = []
const skipped: string[] = []

for (const g of gold) {
  const cur = byId.get(g.claimId)
  if (!cur) {
    skipped.push(`${g.claimId} (not in snapshot)`)
    continue
  }
  if (!isDowngrade(cur.verdict, g.goldVerdict)) continue // not a downgrade → leave it
  baseVerdict.set(g.claimId, cur.verdict)
  // reason must be ≥20 chars; prefix so even short notes pass + are attributable.
  const reason = `Gold review (ai): ${g.notes ?? 'reviewed verdict downgrade'}`
  entries.push({
    claimId: g.claimId,
    verification: {
      claimId: g.claimId,
      verdict: g.goldVerdict,
      summary: reason,
      evidence: g.goldVerdict === 'sin-datos' ? [] : cur.evidence,
      checkedAgainst: ['curator-downgrade'],
    },
    source: 'curator-downgrade',
    reason,
    editor: 'ai-gold-review',
  })
}

const byMove: Record<string, number> = {}
for (const g of gold) {
  const cur = byId.get(g.claimId)
  if (cur && isDowngrade(cur.verdict, g.goldVerdict)) {
    const k = `${cur.verdict}→${g.goldVerdict}`
    byMove[k] = (byMove[k] ?? 0) + 1
  }
}
process.stdout.write(
  `[gold-downgrades] ${entries.length} downgrades to apply: ${JSON.stringify(byMove)}\n`,
)
if (skipped.length) process.stderr.write(`[gold-downgrades] skipped: ${skipped.join(', ')}\n`)

if (dryRun) {
  process.stdout.write('[gold-downgrades] --dry-run: nothing written\n')
  process.exit(0)
}

let overlay = loadOverlay()
overlay = applyOverlayEntries(overlay, entries, new Date().toISOString(), baseVerdict)
writeFileSync(OVERLAY, JSON.stringify(overlay, null, 2) + '\n')

rebuildVerified()
  .then((r) => {
    process.stdout.write(
      `[gold-downgrades] applied. verified.json verdicts: ${JSON.stringify(r.byVerdict)} (overlay applied: ${r.overlayApplied})\n`,
    )
  })
  .catch((err) => {
    process.stderr.write(`[gold-downgrades] rebuild FAILED: ${(err as Error).message}\n`)
    process.exit(1)
  })
