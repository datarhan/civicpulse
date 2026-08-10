#!/usr/bin/env tsx
/**
 * reconcile:attribution — compare every published attribution against the
 * speaker map for its session, and retract the ones the map contradicts.
 *
 *   npm run reconcile:attribution              # report, write nothing
 *   npm run reconcile:attribution -- --apply   # retract the contradicted rows
 *   npm run reconcile:attribution -- --pleno 10yl550
 *
 * Writes `editorial/attribution-queue.json`. **editorial/, never public/**:
 * Vercel serves the whole of `public/`, so a file there is fetchable by URL
 * whether or not a page links to it, and this queue pairs transcript passages
 * with group attributions about named councillors. That assumption left 24
 * unreviewed drafts about concejales web-fetchable for weeks.
 *
 * ## Only ever weakening
 *
 * `--apply` acts on `contradicted` rows and nothing else. Retracting says "we
 * no longer claim to know who said this", which takes an assertion about a
 * named person off the site and needs no new evidence to justify. Filling in a
 * missing attribution — `additive` — says "it was them", which is an
 * assertion, and `decideAutomation` puts anything naming an individual in
 * Tier C before it reads a single measurement. The asymmetry lives in
 * `attribution-reconcile.ts`, which marks only `contradicted` as
 * `retractable`; this CLI must not re-decide it.
 *
 * ## Why it shells out
 *
 * Retraction goes through `npm run correct-pleno-finding` rather than importing
 * `applyFindingCorrection`. The CLI carries the snapshot validator, the
 * ≥20-character reason guard and the single git-visible writer — routing
 * algorithmic output through the curator CLI is what CLAUDE.md asks, so the
 * validator and git history stay authoritative.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  reconcileAttributions,
  retractionFor,
  type PublishedQuote,
  type ReconcileRow,
} from '../src/scraper/attribution-reconcile'
import { alignSpeakerMap, blocResolverFor } from '../src/scraper/speaker-map-align'
import { parseDiarizedTranscript } from '../src/scraper/voice-id'
import type { SpeakerMap } from '../src/scraper/speaker-map'

const FINDINGS = 'public/data/pleno-findings.json'
const TRANSCRIPTS = 'public/data/pleno-transcripts'
const MAPS = 'pleno-speaker-map'
const OUT = 'editorial/attribution-queue.json'

/**
 * Published on `/hallazgos` beside the retraction, so it must not read as a
 * person's signature. A machine correction that looks hand-signed is a small
 * lie in the corrections trail, which is the one place this project cannot
 * afford them.
 */
const EDITOR = 'reconcile-attribution (automático)'

interface Finding {
  id: string
  plenoId: string
  quotes: Array<{ text: string; speakerGroup: string | null; sourceClaimId: string }>
}

interface SessionResult {
  plenoId: string
  /** Distinguishes "no map for this session" from "map vouched for nothing". */
  status: 'reconciled' | 'no-map' | 'no-transcript'
  rows: ReconcileRow[]
}

function loadMap(plenoId: string): SpeakerMap | null {
  const path = resolve(MAPS, `${plenoId}.json`)
  if (!existsSync(path)) return null
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as SpeakerMap
  } catch {
    return null
  }
}

function reconcileSession(plenoId: string, findings: Finding[]): SessionResult {
  const map = loadMap(plenoId)
  if (!map) return { plenoId, status: 'no-map', rows: [] }

  const tPath = resolve(TRANSCRIPTS, `${plenoId}.txt`)
  if (!existsSync(tPath)) return { plenoId, status: 'no-transcript', rows: [] }

  const published = parseDiarizedTranscript(readFileSync(tPath, 'utf8'))
  const alignment = alignSpeakerMap({ published, map })
  const resolveBloc = blocResolverFor(published, alignment)

  const quotes: PublishedQuote[] = []
  for (const f of findings) {
    f.quotes.forEach((q, i) => {
      quotes.push({
        findingId: f.id,
        quoteIndex: i,
        text: q.text,
        speakerGroup: q.speakerGroup,
      })
    })
  }
  return {
    plenoId,
    status: 'reconciled',
    rows: reconcileAttributions({ quotes, resolveBloc, map }).rows,
  }
}

function applyRetraction(row: ReconcileRow, map: SpeakerMap): { ok: boolean; detail: string } {
  const fix = retractionFor(row, map)
  // Belt and braces: `retractionFor` returns null for anything not
  // contradicted, and the caller already filters. If both were wrong, the
  // correction would be an addition, so refuse rather than proceed.
  if (!fix) return { ok: false, detail: 'not retractable — refusing to touch it' }
  if (fix.corrected !== '') return { ok: false, detail: 'retraction produced a non-empty bloc' }
  try {
    execFileSync(
      'npm',
      [
        'run',
        '--silent',
        'correct-pleno-finding',
        '--',
        row.findingId,
        '--field',
        fix.field,
        '--new',
        fix.corrected,
        '--reason',
        fix.reason,
        '--editor',
        EDITOR,
      ],
      { stdio: 'pipe', encoding: 'utf8' },
    )
    return { ok: true, detail: fix.field }
  } catch (err) {
    const e = err as { stderr?: string; stdout?: string; message?: string }
    return { ok: false, detail: (e.stderr || e.stdout || e.message || '').trim().slice(0, 200) }
  }
}

function main() {
  const argv = process.argv.slice(2)
  const apply = argv.includes('--apply')
  const only = argv.includes('--pleno') ? argv[argv.indexOf('--pleno') + 1] : null

  const snap = JSON.parse(readFileSync(resolve(FINDINGS), 'utf8')) as { items: Finding[] }
  const bySession = new Map<string, Finding[]>()
  for (const f of snap.items) {
    if (only && f.plenoId !== only) continue
    bySession.set(f.plenoId, [...(bySession.get(f.plenoId) ?? []), f])
  }

  const results = [...bySession.entries()].map(([id, fs]) => reconcileSession(id, fs))
  const all = results.flatMap((r) => r.rows)
  const contradicted = all.filter((r) => r.verdict === 'contradicted')
  const tally = {
    agrees: all.filter((r) => r.verdict === 'agrees').length,
    contradicted: contradicted.length,
    additive: all.filter((r) => r.verdict === 'additive').length,
    unknown: all.filter((r) => r.verdict === 'unknown').length,
  }
  const noMap = results.filter((r) => r.status === 'no-map')

  mkdirSync(resolve('editorial'), { recursive: true })
  writeFileSync(
    resolve(OUT),
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        note:
          'Cola de reconciliación de atribuciones. Sólo las filas `contradicted` son ' +
          'accionables automáticamente, y sólo retirando. Nunca bajo public/.',
        sessions: results.map((r) => ({
          plenoId: r.plenoId,
          status: r.status,
          rows: r.rows.length,
        })),
        tally,
        rows: all,
      },
      null,
      2,
    ) + '\n',
  )

  const quotesSeen = snap.items
    .filter((f) => !only || f.plenoId === only)
    .reduce((n, f) => n + f.quotes.length, 0)

  process.stdout.write(
    `[reconcile] ${bySession.size} session(s) · ${quotesSeen} published quote(s)\n` +
      `  agrees        ${tally.agrees}\n` +
      `  contradicted  ${tally.contradicted}   ← the only rows --apply touches\n` +
      `  additive      ${tally.additive}   the map knows, the finding does not. CURATOR, never automatic.\n` +
      `  unknown       ${tally.unknown}   the map does not vouch for this quote\n`,
  )

  // "No map" and "map vouched for nothing" are different facts and the whole
  // point of this pipeline is not to confuse them.
  if (noMap.length > 0) {
    process.stdout.write(
      `\n  ${noMap.length} session(s) have NO speaker map, so nothing was compared for them:\n` +
        `    ${noMap.map((r) => r.plenoId).join(', ')}\n` +
        `  Build one with: npm run extract:speaker-map -- <plenoId>\n`,
    )
  }
  process.stdout.write(`\n[reconcile] queue → ${OUT} (gitignored, never under public/)\n`)

  if (!apply) {
    process.stdout.write(
      '[reconcile] report only. Pass --apply to retract the contradicted rows.\n',
    )
    return
  }
  if (contradicted.length === 0) {
    process.stdout.write('[reconcile] --apply: nothing contradicted, nothing to retract.\n')
    return
  }

  let done = 0
  let failed = 0
  for (const row of contradicted) {
    const map = loadMap(results.find((r) => r.rows.includes(row))?.plenoId ?? '')
    if (!map) {
      process.stdout.write(`  ✗ ${row.findingId} quote.${row.quoteIndex}: map vanished mid-run\n`)
      failed += 1
      continue
    }
    const r = applyRetraction(row, map)
    if (r.ok) {
      done += 1
      process.stdout.write(`  ✓ ${row.findingId} quote.${row.quoteIndex} ${row.published} → null\n`)
    } else {
      failed += 1
      process.stdout.write(`  ✗ ${row.findingId} quote.${row.quoteIndex}: ${r.detail}\n`)
    }
  }
  process.stdout.write(
    `\n[reconcile] retracted ${done} · failed ${failed} · added 0 (by construction)\n`,
  )
  if (failed > 0) process.exitCode = 1
}

if (import.meta.url === `file://${process.argv[1]}`) main()

export { reconcileSession, applyRetraction, EDITOR }
