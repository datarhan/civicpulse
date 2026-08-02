#!/usr/bin/env tsx
/**
 * repoint-finding-claims — re-attach a published finding to the claim ids of a
 * freshly re-extracted pleno.
 *
 * Claim ids are content-addressed, so re-extracting a pleno from an improved
 * transcript necessarily changes them and orphans any finding citing the old
 * ones. `check:relations` catches that; this repairs it.
 *
 * What it does NOT do is rewrite the finding. Title, summary and severity are
 * published prose and only move through `correct-pleno-finding`, which leaves a
 * public correction row. This only fixes PROVENANCE — which claim record backs
 * a quote the finding already published — and it refuses to do even that unless
 * the quote is still present in the new extraction. A quote that no longer
 * appears is reported for a human, never silently re-pointed at whatever
 * happened to score highest.
 *
 *   npm run repoint-finding-claims -- <findingId> [--apply]
 *
 * Dry by default: prints the proposed mapping and its match quality.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { validateFindingsSnapshot } from '../src/scraper/pleno-finding'
import { quoteCoverage } from './check-finding-quotes'

const FINDINGS = resolve('public/data/pleno-findings.json')
const CLAIMS = resolve('public/data/pleno-claims-suggestions.json')

/** A quote must be essentially present in the candidate claim, not merely similar. */
const MIN_COVERAGE = 0.9

interface Claim {
  id: string
  plenoId: string
  verbatim: string
  speakerGroup?: string | null
}

function main() {
  const findingId = process.argv[2]
  const apply = process.argv.includes('--apply')
  if (!findingId || findingId.startsWith('--')) {
    process.stderr.write('usage: repoint-finding-claims <findingId> [--apply]\n')
    process.exit(2)
  }

  const snap = JSON.parse(readFileSync(FINDINGS, 'utf8')) as {
    items: Array<Record<string, unknown>>
  }
  const finding = snap.items.find((f) => f.id === findingId)
  if (!finding) {
    process.stderr.write(`[repoint] no finding ${findingId}\n`)
    process.exit(1)
  }
  const claims = (JSON.parse(readFileSync(CLAIMS, 'utf8')).items ?? []) as Claim[]
  const plenoId = String(finding.plenoId)
  const pool = claims.filter((c) => c.plenoId === plenoId)
  process.stdout.write(
    `[repoint] ${findingId} · pleno ${plenoId} · ${pool.length} claim(s) available\n\n`,
  )
  if (pool.length === 0) {
    process.stderr.write('[repoint] that pleno has no claims — re-extract it first\n')
    process.exit(1)
  }

  const quotes = (finding.quotes ?? []) as Array<Record<string, unknown>>
  const mapping: { quote: string; newId: string | null; coverage: number; group?: string }[] = []

  for (const q of quotes) {
    const text = String(q.text ?? '')
    let best: { id: string; cov: number } | null = null
    for (const c of pool) {
      // Same-bloc only: re-pointing a PP quote at a PSOE claim would silently
      // change who is on record as having said it.
      if (q.speakerGroup && c.speakerGroup && q.speakerGroup !== c.speakerGroup) continue
      const cov = quoteCoverage(text, c.verbatim)
      if (!best || cov > best.cov) best = { id: c.id, cov }
    }
    mapping.push({
      quote: text,
      newId: best && best.cov >= MIN_COVERAGE ? best.id : null,
      coverage: best?.cov ?? 0,
      group: q.speakerGroup ? String(q.speakerGroup) : undefined,
    })
  }

  for (const m of mapping) {
    const mark = m.newId ? '✓' : '✗'
    process.stdout.write(
      `  ${mark} [${m.group ?? '—'}] cov=${m.coverage.toFixed(2)} ${m.newId ?? 'NO MATCH'}\n` +
        `      «${m.quote.slice(0, 90)}»\n`,
    )
  }

  const unmatched = mapping.filter((m) => !m.newId)
  if (unmatched.length > 0) {
    process.stdout.write(
      `\n[repoint] ${unmatched.length} of ${mapping.length} quote(s) are NOT present in the new\n` +
        `[repoint] extraction at ≥${MIN_COVERAGE} coverage. Refusing to re-point.\n` +
        `[repoint] Either the re-transcription changed those words, or the finding needs\n` +
        `[repoint] revisiting through \`correct-pleno-finding\`. A human decides which.\n`,
    )
    process.exitCode = 1
    return
  }

  if (!apply) {
    process.stdout.write(`\n[repoint] DRY RUN — re-run with --apply to persist.\n`)
    return
  }

  finding.sourceClaimIds = mapping.map((m) => m.newId as string)
  finding.quotes = quotes.map((q, i) => ({ ...q, sourceClaimId: mapping[i].newId }))
  const note = String(finding.curatorNotes ?? '')
  const stamp =
    `Referencias de claim reapuntadas el ${new Date().toISOString().slice(0, 10)} tras re-extraer ` +
    `${plenoId} de una transcripción mejorada. El texto publicado no cambia; sólo la procedencia.`
  finding.curatorNotes = note ? `${note} · ${stamp}` : stamp

  try {
    validateFindingsSnapshot(JSON.stringify(snap))
  } catch (err) {
    process.stderr.write(
      `[repoint] FATAL: el snapshot resultante no valida: ${err instanceof Error ? err.message : String(err)}\n`,
    )
    process.exit(1)
  }
  writeFileSync(FINDINGS, JSON.stringify(snap, null, 2) + '\n')
  process.stdout.write(`\n[repoint] ✅ ${findingId} re-apuntado a ${mapping.length} claim(s).\n`)
}

main()
