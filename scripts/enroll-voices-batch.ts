#!/usr/bin/env tsx
/**
 * Batch-enroll multiple councillors from a JSON manifest.
 *
 *   npm run enroll-voices-batch -- --file enrollments.json [--force]
 *
 * Manifest format (a JSON file the curator hand-edits, ignored by git
 * unless explicitly committed):
 *
 *   {
 *     "enrollments": [
 *       { "slug": "robert-raga-gadea",
 *         "url":  "https://www.instagram.com/reel/DXMxH6FjJEr/" },
 *       { "slug": "carlos-cabanes-pareja",
 *         "url":  "https://youtube.com/watch?v=…" },
 *       …
 *     ]
 *   }
 *
 * Pipeline (per row):
 *   1. Validate slug exists in officials.json (skip with warning if not).
 *   2. If already enrolled in .voiceprints/index.json, skip unless
 *      --force is passed (explicit re-enroll).
 *   3. Spawn `npm run enroll-voice -- --slug … --url …` and capture
 *      stdout. Yt-dlp + ffmpeg + speechbrain run inside the child.
 *   4. Continue past failures — one bad URL doesn't stop the batch.
 *
 * Exits 0 if every row succeeded (or was skipped), 1 if any row
 * failed. Telemetry: writes a per-run audit log to
 * `scripts/logs/enroll-voices-batch-<ts>.log`.
 */
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

interface CliArgs {
  file: string
  force: boolean
}

function parseArgs(argv: string[]): CliArgs {
  const out: Partial<CliArgs> = { force: false }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--file') out.file = argv[++i]
    else if (a === '--force') out.force = true
    else {
      process.stderr.write(`[batch-enroll] unknown flag: ${a}\n`)
      process.exit(2)
    }
  }
  if (!out.file) {
    process.stderr.write('usage: enroll-voices-batch.ts --file <manifest.json> [--force]\n')
    process.exit(2)
  }
  return out as CliArgs
}

interface ManifestRow {
  slug: string
  url: string
}

function loadManifest(path: string): ManifestRow[] {
  if (!existsSync(path)) {
    process.stderr.write(`[batch-enroll] manifest missing: ${path}\n`)
    process.exit(1)
  }
  let raw: unknown
  try {
    raw = JSON.parse(readFileSync(path, 'utf8'))
  } catch (err) {
    process.stderr.write(`[batch-enroll] manifest unreadable: ${(err as Error).message}\n`)
    process.exit(1)
  }
  const enrollments = (raw as { enrollments?: unknown }).enrollments
  if (!Array.isArray(enrollments)) {
    process.stderr.write('[batch-enroll] manifest must contain { enrollments: [...] }\n')
    process.exit(1)
  }
  const out: ManifestRow[] = []
  for (let i = 0; i < enrollments.length; i++) {
    const e = enrollments[i] as Record<string, unknown>
    if (typeof e?.slug !== 'string' || !/^[a-z0-9-]{3,80}$/.test(e.slug)) {
      process.stderr.write(`[batch-enroll] row ${i}: invalid slug\n`)
      process.exit(1)
    }
    if (typeof e.url !== 'string' || !/^https?:\/\//.test(e.url)) {
      process.stderr.write(`[batch-enroll] row ${i} (${e.slug}): invalid url\n`)
      process.exit(1)
    }
    out.push({ slug: e.slug, url: e.url })
  }
  if (out.length === 0) {
    process.stderr.write('[batch-enroll] manifest has 0 enrollments — nothing to do\n')
    process.exit(0)
  }
  return out
}

function loadOfficialsSlugs(): Set<string> {
  const path = resolve('public/data/officials.json')
  if (!existsSync(path)) {
    process.stderr.write('[batch-enroll] officials.json missing — run scrape:officials\n')
    process.exit(1)
  }
  const raw = JSON.parse(readFileSync(path, 'utf8')) as {
    officials?: Array<{ slug: string }>
  }
  return new Set((raw.officials ?? []).map((o) => o.slug))
}

function loadEnrolledSlugs(): Set<string> {
  const path = resolve('.voiceprints/index.json')
  if (!existsSync(path)) return new Set()
  try {
    const raw = JSON.parse(readFileSync(path, 'utf8')) as {
      entries?: Array<{ slug: string }>
    }
    return new Set((raw.entries ?? []).map((e) => e.slug))
  } catch {
    return new Set()
  }
}

interface RowResult {
  slug: string
  url: string
  status: 'enrolled' | 'skipped' | 'failed'
  reason?: string
}

function enrollOne(row: ManifestRow): RowResult {
  const args = [
    'run',
    '--silent',
    'enroll-voice',
    '--',
    '--slug',
    row.slug,
    '--url',
    row.url,
    '--force',
  ]
  const r = spawnSync('npm', args, {
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  if (r.status === 0) return { slug: row.slug, url: row.url, status: 'enrolled' }
  return {
    slug: row.slug,
    url: row.url,
    status: 'failed',
    reason: (r.stderr || r.stdout || `exit ${r.status}`).slice(-500),
  }
}

function main(): void {
  const opts = parseArgs(process.argv.slice(2))
  const manifest = loadManifest(opts.file)
  const knownSlugs = loadOfficialsSlugs()
  const enrolled = loadEnrolledSlugs()

  process.stderr.write(`[batch-enroll] manifest: ${manifest.length} row(s)\n`)
  const results: RowResult[] = []
  for (let i = 0; i < manifest.length; i++) {
    const row = manifest[i]
    process.stderr.write(`[batch-enroll] [${i + 1}/${manifest.length}] ${row.slug}\n`)
    if (!knownSlugs.has(row.slug)) {
      process.stderr.write(`[batch-enroll]   SKIP — slug not in officials.json\n`)
      results.push({ slug: row.slug, url: row.url, status: 'skipped', reason: 'unknown slug' })
      continue
    }
    if (enrolled.has(row.slug) && !opts.force) {
      process.stderr.write(`[batch-enroll]   SKIP — already enrolled (pass --force to overwrite)\n`)
      results.push({ slug: row.slug, url: row.url, status: 'skipped', reason: 'already enrolled' })
      continue
    }
    const result = enrollOne(row)
    if (result.status === 'enrolled') {
      process.stderr.write(`[batch-enroll]   OK\n`)
    } else {
      process.stderr.write(
        `[batch-enroll]   FAIL — ${result.reason?.split('\n').slice(-3).join(' ')}\n`,
      )
    }
    results.push(result)
  }

  // Audit log
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const logPath = resolve(`scripts/logs/enroll-voices-batch-${ts}.log`)
  mkdirSync(dirname(logPath), { recursive: true })
  writeFileSync(
    logPath,
    JSON.stringify(
      {
        ranAt: new Date().toISOString(),
        manifestPath: opts.file,
        force: opts.force,
        results,
      },
      null,
      2,
    ),
  )

  // Summary
  const ok = results.filter((r) => r.status === 'enrolled').length
  const skipped = results.filter((r) => r.status === 'skipped').length
  const failed = results.filter((r) => r.status === 'failed').length
  process.stderr.write(
    `\n[batch-enroll] done — ${ok} enrolled · ${skipped} skipped · ${failed} failed\n`,
  )
  process.stderr.write(`[batch-enroll] audit log: ${logPath}\n`)

  process.stdout.write(JSON.stringify({ enrolled: ok, skipped, failed, results }) + '\n')
  process.exit(failed > 0 ? 1 : 0)
}

main()
