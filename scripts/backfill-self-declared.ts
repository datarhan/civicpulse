#!/usr/bin/env tsx
/**
 * One-shot backfill of `selfDeclared` across the curated journalist reports.
 *
 *   npm run backfill:self-declared -- --dry-run
 *   npm run backfill:self-declared -- --curator "Sergei Lutchenko"
 *
 * journalist-reports.json is curated and guard-protected, so this is the only
 * sanctioned path: it re-validates the WHOLE snapshot before writing and keeps
 * the 21 per-report mirrors in sync — a mirror left behind is a second copy of
 * a claim about a named person, drifting.
 *
 * The classifier returns null when it cannot tell. Those rows are REPORTED and
 * left unset rather than guessed: `undefined` routes to a curator, a wrong
 * `false` would publish self-declaration as independently corroborated.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { validateReportsSnapshot } from '../src/scraper/journalist/validators'

const AGG = resolve('public/data/journalist-reports.json')
const MIRROR_DIR = resolve('public/data/journalist-reports')

/** Documents whose CONTENT is the subject's own account of themselves. */
const SELF = [
  /\bCV\b/i,
  /curr[ií]culum/i,
  /autodeclarad/i,
  /declaraci[oó]n de actividades/i,
  /declaraci[oó]n de bienes/i,
  /declaraci[oó]n estatutaria/i,
  // "PDF SN D. <nombre> - ribarroja.es" is the pre-portal-restructure title/URL
  // for the same self-submitted transparency CV already classified above under
  // "CV autodeclarado (ficha oficial de transparencia)". Confirmed by dry-run:
  // r-jose-luis-ramos-bio-2026-07-31 and r-robert-raga-bio-v4-2026-07-30 each
  // cite BOTH the post-migration URL (files/migrate/864708/filesGroup/PSOE-…)
  // AND this pre-migration one (files/PSOE%20…_0.pdf) for the identical PDF —
  // same document, two URLs from before/after the Aug-2026 portal move.
  /^PDF SN D/i,
]
/** Records produced by someone other than the subject. */
const INDEPENDENT = [
  /\bBOP\b/i,
  /\bBOE\b/i,
  /\bacta\b/i,
  /registro mercantil/i,
  /sentencia/i,
  /resoluci[oó]n/i,
]

export function classifySelfDeclared(title: string): boolean | null {
  const t = String(title ?? '')
  if (!t.trim()) return null
  if (SELF.some((r) => r.test(t))) return true
  if (INDEPENDENT.some((r) => r.test(t))) return false
  return null
}

function arg(name: string): string | null {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? (process.argv[i + 1] ?? null) : null
}

function main() {
  const dryRun = process.argv.includes('--dry-run')
  const curator = arg('curator')
  if (!dryRun && !curator) {
    console.error('--curator es obligatorio: esto toca afirmaciones sobre personas con nombre')
    process.exit(1)
  }

  const snap = JSON.parse(readFileSync(AGG, 'utf8'))
  let set = 0
  let already = 0
  const unclassified: string[] = []

  for (const rep of snap.items ?? []) {
    for (const src of rep.sources ?? []) {
      if (src.selfDeclared !== undefined) {
        already += 1
        continue
      }
      const verdict = classifySelfDeclared(src.title)
      if (verdict === null) {
        unclassified.push(`${rep.id} / ${src.id}  «${String(src.title).slice(0, 70)}»`)
        continue
      }
      src.selfDeclared = verdict
      set += 1
    }
  }

  console.log(
    `[backfill] ${set} marcada(s) · ${already} ya tenía(n) valor · ${unclassified.length} sin clasificar`,
  )
  for (const u of unclassified) console.log(`           ? ${u}`)

  if (dryRun) {
    console.log('[backfill] dry-run — no se escribe nada')
    return
  }

  snap.curatorNotes = [
    snap.curatorNotes,
    `${new Date().toISOString().slice(0, 10)} · ${curator}: marcado \`selfDeclared\` en las fuentes ` +
      `por tipo de documento (CV, currículum y declaraciones = autodeclarado; BOP, BOE y actas = no). ` +
      `${unclassified.length} fuente(s) quedaron sin clasificar a propósito.`,
  ]
    .filter(Boolean)
    .join('\n')

  // validateReportsSnapshot takes a JSON STRING, not an object (validators.ts:521).
  // Serialise once and reuse it, so what we validate is byte-identical to what
  // we write — validating one object and writing another is how a snapshot
  // ships an invariant the validator never saw.
  const serialised = JSON.stringify(snap, null, 2) + '\n'
  validateReportsSnapshot(serialised)
  writeFileSync(AGG, serialised)

  // Mirrors — a stale mirror is a second, drifting copy of the same claim.
  let mirrors = 0
  for (const rep of snap.items ?? []) {
    const path = join(MIRROR_DIR, `${rep.assignmentId}.json`)
    if (!existsSync(path)) continue
    writeFileSync(path, JSON.stringify(rep, null, 2) + '\n')
    mirrors += 1
  }
  console.log(`[backfill] escrito el agregado + ${mirrors} espejo(s)`)
}

if (process.argv[1]?.includes('backfill-self-declared')) main()
