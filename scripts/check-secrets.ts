#!/usr/bin/env tsx
/**
 * Refuse to commit a secret.
 *
 * `npm run check:secrets`            → scans every TRACKED file
 * `npm run check:secrets -- --staged` → scans only what is staged (pre-commit)
 *
 * This exists because it already happened. On 2026-09-01 the Gemini API key
 * was committed in `pleno-speaker-map/1sqj7is.json` and `ma87e0.json` and
 * pushed to origin on three branches. Nobody typed it: the speaker-map pass
 * stores the REASON a chunk failed, that reason is `execFileSync`'s message,
 * and that message carries the whole curl argv including `?key=<KEY>`. The
 * repo being private is the only reason it was not worse.
 *
 * `redactSecrets` now closes the hole at the source (`extract-speaker-map.ts`),
 * and this is the second layer: the bar in this project for moving a rule out
 * of a doc and into a gate is "it has already broken in production", and this
 * cleared it.
 *
 * It scans for SHAPES, not for one known key. A gate that only knows the key
 * that leaked last time is a gate that catches nothing next time — the same
 * reason `DATA_INTEGRITY` rule 1 says export the enum instead of restating it.
 */
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

/**
 * Credential shapes. Each needs enough trailing entropy that prose cannot trip
 * it: the cost of a false positive here is a developer learning to pass
 * --no-verify, which would cost more than the leak did.
 */
const PATTERNS: Array<{ name: string; re: RegExp }> = [
  { name: 'Gemini/AI-Studio key (AQ.…)', re: /\bAQ\.[A-Za-z0-9_-]{20,}/g },
  { name: 'OpenAI key (sk-…)', re: /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}/g },
  { name: 'Google API key (AIza…)', re: /\bAIza[A-Za-z0-9_-]{20,}/g },
  { name: 'Anthropic key (sk-ant-…)', re: /\bsk-ant-[A-Za-z0-9_-]{20,}/g },
  { name: 'HuggingFace token (hf_…)', re: /\bhf_[A-Za-z0-9]{20,}/g },
  { name: 'Telegram bot token', re: /\b\d{8,10}:[A-Za-z0-9_-]{30,}/g },
  {
    name: 'secret in a URL query',
    re: /[?&](?:key|api_?key|access_token|token)=(?!REDACTED)[A-Za-z0-9._-]{16,}/gi,
  },
  {
    name: 'Authorization header',
    re: /Authorization:\s*(?:Bearer|Basic)\s+(?!REDACTED)[A-Za-z0-9._-]{16,}/gi,
  },
]

/**
 * Files that legitimately contain credential-shaped strings.
 *
 * `.env` is gitignored and never scanned (it is not tracked). The test and the
 * redactor are here because a redactor has to name the shapes it redacts and a
 * test has to feed it something shaped like a key — both use obviously fake
 * values, and excluding them is what keeps this gate from crying wolf at the
 * very code that closes the hole.
 */
const ALLOW = [
  'scripts/check-secrets.ts',
  'src/scraper/redact-secrets.ts',
  'tests/redact-secrets.test.ts',
]

const BINARY_EXT =
  /\.(png|jpe?g|gif|webp|avif|ico|pdf|zip|gz|tgz|woff2?|ttf|otf|eot|mp[34]|m4a|ogg|opus|wav|mov|mp4|webm)$/i

function trackedFiles(stagedOnly: boolean): string[] {
  const args = stagedOnly ? ['diff', '--cached', '--name-only', '--diff-filter=ACMR'] : ['ls-files']
  const out = execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  return out
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
}

function main() {
  const stagedOnly = process.argv.includes('--staged')
  const files = trackedFiles(stagedOnly)
  // A run must prove it did work: scanned / skipped-with-reason, never folded
  // together. "0 secrets" over 0 files scanned is the all-clear that means
  // nothing, and this repo has printed that one before.
  let scanned = 0
  let skippedBinary = 0
  let skippedAllowed = 0
  let skippedMissing = 0
  const hits: Array<{ file: string; line: number; name: string; sample: string }> = []

  for (const f of files) {
    if (ALLOW.includes(f)) {
      skippedAllowed += 1
      continue
    }
    if (BINARY_EXT.test(f)) {
      skippedBinary += 1
      continue
    }
    let text: string
    try {
      // No size skip. The first draft capped at 8 MB "with room to spare" and
      // then skipped exactly one file — `pleno-claims-verified.json`, 9 MB,
      // the monolith every claim passes through and the likeliest place for a
      // machine-written error string to land. A gate with a hole shaped like
      // the biggest file in the repo is the "green by not running" defect this
      // project keeps paying for. Reading 9 MB costs milliseconds; the cap
      // bought nothing and cost the one file that mattered.
      text = readFileSync(f, 'utf8')
    } catch {
      skippedMissing += 1
      continue
    }
    scanned += 1
    const lines = text.split('\n')
    for (const [i, line] of lines.entries()) {
      for (const { name, re } of PATTERNS) {
        re.lastIndex = 0
        const m = re.exec(line)
        if (!m) continue
        // Never print the secret. Enough to find it, not enough to use it.
        const found = m[0]
        hits.push({
          file: f,
          line: i + 1,
          name,
          sample: `${found.slice(0, 8)}…${found.length} chars`,
        })
        break
      }
    }
  }

  const scope = stagedOnly ? 'staged' : 'tracked'
  if (hits.length === 0) {
    console.log(
      `[check:secrets] ${scanned} ${scope} file(s) scanned · 0 secret(s) · ` +
        `skipped ${skippedBinary} binary, ${skippedAllowed} allow-listed, ` +
        `${skippedMissing} unreadable`,
    )
    if (scanned === 0) {
      // Nothing scanned is not nothing found.
      console.log('[check:secrets] nothing to scan — no clean bill of health implied')
    }
    return
  }

  console.error(`[check:secrets] ${hits.length} possible secret(s) in ${scope} files:\n`)
  for (const h of hits) {
    console.error(`  ${h.file}:${h.line}  ${h.name}  (${h.sample})`)
  }
  console.error(
    `\n[check:secrets] ${scanned} file(s) scanned. A committed credential is not fixed by\n` +
      `deleting the line — git keeps it. ROTATE the key first, then scrub.\n` +
      `If a hit is a false positive, add the path to ALLOW in scripts/check-secrets.ts\n` +
      `with a comment saying why.`,
  )
  process.exit(1)
}

main()
