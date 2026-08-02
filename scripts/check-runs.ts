/**
 * check:runs — reds the build when a run reported success without doing work.
 *
 * Reads the manifests written by `startRun(...).finish()` and applies
 * `assessManifest`. See src/scraper/run-manifest.ts for why each rule exists;
 * all three of the incidents encoded there shipped as green nights.
 *
 *   npm run check:runs                 # last 36h, exits 1 on any error finding
 *   npm run check:runs -- --since 168  # last week
 *   npm run check:runs -- --soft       # report only, always exit 0
 *   npm run check:runs -- --all
 */
import { readManifests, assessManifest, formatManifest } from '../src/scraper/run-manifest'

interface Args {
  sinceHours: number
  soft: boolean
}

function parseArgs(argv: string[]): Args {
  const out: Args = { sinceHours: 36, soft: false }
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--since') out.sinceHours = Number(argv[++i])
    else if (argv[i] === '--all') out.sinceHours = Infinity
    else if (argv[i] === '--soft') out.soft = true
    else {
      process.stderr.write(`[check-runs] unknown flag ${argv[i]}\n`)
      process.exit(2)
    }
  }
  return out
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  const all = readManifests()
  const cutoff = Number.isFinite(args.sinceHours)
    ? Date.now() - args.sinceHours * 3600_000
    : -Infinity
  const manifests = all.filter((m) => new Date(m.startedAt).getTime() >= cutoff)

  if (manifests.length === 0) {
    // Deliberately not an error. No manifests means no instrumented run
    // happened in the window — which is normal on a day nobody ran a pass, and
    // is reported plainly rather than as either success or failure.
    process.stdout.write(
      `[check-runs] no instrumented runs in the last ${args.sinceHours}h ` +
        `(${all.length} manifest(s) on disk in total)\n`,
    )
    return
  }

  let errors = 0
  let warns = 0
  for (const m of manifests) {
    const findings = assessManifest(m)
    const bad = findings.filter((f) => f.level === 'error').length
    const mark = bad > 0 ? '✗' : findings.length > 0 ? '!' : '✓'
    process.stdout.write(`\n${mark} ${formatManifest(m)}\n`)
    for (const f of findings) {
      if (f.level === 'error') errors++
      else warns++
      process.stdout.write(`    ${f.level.toUpperCase()} [${f.code}] ${f.message}\n`)
    }
  }

  process.stdout.write(
    `\n[check-runs] ${manifests.length} run(s) · ${errors} error(s) · ${warns} warning(s)\n`,
  )
  if (errors > 0 && !args.soft) process.exit(1)
}

main()
