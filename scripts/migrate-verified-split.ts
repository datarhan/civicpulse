/**
 * One-shot: seed the deterministic base + an empty overlay from the current
 * pleno-claims-verified.json (P2 file split). Idempotent — no-op if the base
 * already exists unless --force.
 *
 *   npm run migrate:verified-split [-- --force]
 *
 * The base is a verbatim copy of verified.json, so a subsequent rebuildVerified()
 * round-trips to a byte-identical verified.json (empty git diff). The base is
 * gitignored (reproducible via verify:pleno-claims); the overlay is committed.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { BASE, OVERLAY, VERIFIED } from './verified-rebuild'

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

if (!existsSync(OVERLAY) || force) {
  let generatedAt = ''
  try {
    generatedAt = JSON.parse(raw).generatedAt ?? ''
  } catch {
    /* leave empty */
  }
  writeFileSync(OVERLAY, JSON.stringify({ version: 1, generatedAt, entries: {} }, null, 2) + '\n')
}

process.stdout.write(
  '[migrate] seeded pleno-claims-verified-base.json + empty pleno-claims-overlay.json\n',
)
