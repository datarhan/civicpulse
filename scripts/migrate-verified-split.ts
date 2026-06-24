/**
 * One-shot: split the current pleno-claims-verified.json into the deterministic
 * base + the second-pass overlay (P2 file split). Idempotent — no-op if the base
 * exists unless --force.
 *
 *   npm run migrate:verified-split [-- --force]
 *
 * base = verified.json verbatim (transitional — the FIRST `verify:pleno-claims`
 * run recomputes it to deterministic-only). overlay = every claim whose verdict
 * was produced by a second pass (checkedAgainst includes `llm-second-pass` or
 * `nli-grounding`) — so when the base is later recomputed to deterministic-only,
 * the overlay RESTORES those verdicts (this is the R4/B5 fix). base ⊕ overlay
 * reproduces the current verified.json byte-for-byte (overlay entries match the
 * base copy), so the migration changes nothing now. base is gitignored; the
 * overlay is committed.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { BASE, OVERLAY, VERIFIED } from './verified-rebuild'
import { validateOverlay, type Overlay, type OverlayEntry } from '../src/scraper/verified-merge'
import type { ClaimVerification } from '../src/scraper/claim-verifier'

const force = process.argv.includes('--force')

if (!existsSync(VERIFIED)) {
  process.stderr.write(`[migrate] ${VERIFIED} missing — run verify:pleno-claims first\n`)
  process.exit(1)
}
if (existsSync(BASE) && !force) {
  process.stdout.write('[migrate] base already exists — pass --force to reseed. No-op.\n')
  process.exit(0)
}

const raw = readFileSync(VERIFIED, 'utf8')
writeFileSync(BASE, raw) // verbatim copy → byte-identical round-trip

const snap = JSON.parse(raw) as {
  generatedAt?: string
  items: { claim: { id: string }; verification: ClaimVerification }[]
}
const generatedAt = snap.generatedAt ?? ''

const entries: Record<string, OverlayEntry> = {}
for (const it of snap.items) {
  const checked = it.verification.checkedAgainst ?? []
  const isNli = checked.includes('nli-grounding')
  const isLlm = checked.includes('llm-second-pass')
  if (isNli || isLlm) {
    entries[it.claim.id] = {
      verification: it.verification,
      source: isNli ? 'nli' : 'llm',
      appliedAt: generatedAt,
    }
  }
}
const overlay: Overlay = { version: 1, generatedAt, entries }
validateOverlay(overlay)

if (!existsSync(OVERLAY) || force) {
  writeFileSync(OVERLAY, JSON.stringify(overlay, null, 2) + '\n')
}

process.stdout.write(
  `[migrate] seeded base + overlay (${Object.keys(entries).length} second-pass entries captured)\n`,
)
