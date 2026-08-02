/**
 * check:finding-entities — companies named in a published finding's prose that
 * appear nowhere in the data we publish.
 *
 * Catches the defect where a spoken allegation is written up as documentary
 * fact. See src/scraper/finding-entities.ts for the case that motivated it
 * (a finding asserted "según el registro municipal ... la empresa FCC"; FCC
 * appears in zero of 1,231 contract rows).
 *
 * Reports only names not already in the committed baseline, because naming an
 * absent company is often correct — one finding accurately reports a councillor
 * ASKING whether FCC was working.
 *
 *   npm run check:finding-entities
 *   npm run check:finding-entities -- --update-baseline   # after reviewing
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { findUnbackedOrgNames, type FindingLike } from '../src/scraper/finding-entities'

const BASELINE = '.finding-entity-baseline.json'

function loadJson(p: string): any {
  const abs = resolve(p)
  return existsSync(abs) ? JSON.parse(readFileSync(abs, 'utf8')) : null
}

function main() {
  const update = process.argv.includes('--update-baseline')
  const findings = loadJson('public/data/pleno-findings.json')
  if (!findings) {
    process.stdout.write('[check-finding-entities] no findings snapshot — nothing to check\n')
    return
  }
  const tenders = loadJson('public/data/tenders.json') ?? {}
  const bdns = loadJson('public/data/bdns.json') ?? {}
  const entities = loadJson('public/data/entities.json') ?? {}

  const haystack = [
    ...[...(tenders.contracts ?? []), ...(tenders.tenders ?? [])].map(
      (c: any) => `${c.title ?? ''} ${c.assignee ?? ''} ${c.contractor ?? ''}`,
    ),
    ...(bdns.items ?? bdns.convocatorias ?? []).map(
      (b: any) => `${b.title ?? b.descripcion ?? ''} ${b.organo ?? ''}`,
    ),
    // The canonical entity registry carries razón-social variants the raw
    // contract rows may spell differently.
    ...(entities.items ?? entities.entities ?? []).map(
      (e: any) => `${e.name ?? e.canonical ?? ''} ${(e.aliases ?? []).join(' ')}`,
    ),
  ].join(' ')

  const base = loadJson(BASELINE)
  const reviewed: string[] = base?.reviewed ?? []
  const flags = findUnbackedOrgNames(findings.items as FindingLike[], haystack, reviewed)

  process.stdout.write(
    `[check-finding-entities] ${findings.items.length} finding(s) · ` +
      `${reviewed.length} name(s) already reviewed · ${flags.length} new\n`,
  )

  if (flags.length === 0) return

  for (const f of flags) {
    const finding = findings.items.find((x: any) => x.id === f.findingId)
    process.stdout.write(
      `\n  "${f.name}" (${f.via}) — named in ${f.findingId} but absent from every published record\n` +
        `    ${(finding?.title ?? '').slice(0, 96)}\n`,
    )
  }

  if (update) {
    const merged = [...new Set([...reviewed, ...flags.map((f) => f.name)])].sort()
    writeFileSync(
      resolve(BASELINE),
      JSON.stringify(
        {
          _comment:
            'Organisation names asserted in published finding prose that do not appear in our ' +
            'data, and that a human has REVIEWED and accepted. Committed on purpose: a gitignored ' +
            'baseline would regenerate empty and the check would flag the same rows forever. ' +
            'Add a name here only after confirming the finding is accurate — usually because it ' +
            'reports someone asking about or alleging something, rather than asserting it as record.',
          updatedAt: new Date().toISOString(),
          reviewed: merged,
        },
        null,
        2,
      ) + '\n',
    )
    process.stdout.write(`\n[check-finding-entities] baseline updated (${merged.length} names)\n`)
    return
  }

  process.stdout.write(
    `\n[check-finding-entities] Review each. If the finding is accurate (it reports an ` +
      `allegation or a question rather than asserting a record), re-run with ` +
      `--update-baseline. If it asserts documentary corroboration that does not exist, ` +
      `correct it with \`npm run correct-pleno-finding\`.\n`,
  )
  process.exitCode = 1
}

main()
