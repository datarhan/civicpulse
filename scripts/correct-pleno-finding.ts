#!/usr/bin/env tsx
/**
 * Curator CLI: issue a public correction to an already-published
 * pleno finding. Mirrors `correct-press-finding` so both publishing
 * surfaces have the same IFCN-required correction trail.
 *
 * Appends a {field, original, corrected, reason ≥20 chars, editor,
 * correctedAt} row to the finding's `corrections` log AND applies
 * the change to the top-level field. Re-validates the whole snapshot
 * through `validateFindingsSnapshot` before writing.
 *
 * Usage:
 *   npm run correct-pleno-finding -- <id> \
 *     --field summary \
 *     --new "<corrected text>" \
 *     --reason "<why ≥20 chars>" \
 *     --editor "<your name>"
 */
import { readFile, writeFile } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  applyFindingCorrection,
  CORRECTION_QUOTE_FIELD_RE,
  validateFindingsSnapshot,
  type PlenoFindingCorrection,
  type PlenoFindingsSnapshot,
} from '../src/scraper/pleno-finding'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const PROJECT_ROOT = join(__dirname, '..')
const FINDINGS_PATH = join(PROJECT_ROOT, 'public/data/pleno-findings.json')

function getFlag(name: string): string | null {
  const i = process.argv.indexOf(name)
  if (i < 0) return null
  return process.argv[i + 1] ?? null
}

function bail(msg: string, code = 2): never {
  console.error(`[correct-pleno-finding] ${msg}`)
  process.exit(code)
}

const ALLOWED_FIELDS = ['title', 'summary', 'severity', 'sourceClaimIds'] as const

async function main() {
  const id = process.argv[2]
  const field = getFlag('--field')
  const corrected = getFlag('--new')
  const reason = getFlag('--reason')
  const editor = getFlag('--editor')

  if (!id || !field || corrected == null || !reason || !editor) {
    bail(
      'Usage: correct-pleno-finding <id> ' +
        '--field <title|summary|severity|sourceClaimIds|quote.<i>.text|quote.<i>.sourceClaimId> ' +
        '--new "<text>" --reason "<≥20 chars>" --editor "<name>"',
    )
  }
  if (
    !(ALLOWED_FIELDS as readonly string[]).includes(field) &&
    !CORRECTION_QUOTE_FIELD_RE.test(field)
  ) {
    bail(
      `--field must be one of ${ALLOWED_FIELDS.join(', ')} or quote.<i>.text / quote.<i>.sourceClaimId`,
    )
  }
  if (reason.trim().length < 20) {
    bail('--reason must be ≥20 chars (IFCN corrections trail)')
  }

  const raw = await readFile(FINDINGS_PATH, 'utf8')
  let snap: PlenoFindingsSnapshot
  try {
    snap = validateFindingsSnapshot(raw)
  } catch (err) {
    bail(`existing snapshot fails validation: ${(err as Error).message}`)
  }

  const finding = snap.items.find((f) => f.id === id)
  if (!finding) bail(`no finding with id "${id}"`)

  let original: string
  try {
    original = applyFindingCorrection(finding, field, corrected)
  } catch (err) {
    bail((err as Error).message)
  }
  if (original === corrected) {
    bail(`field ${field} is already "${corrected}" — no change to record`)
  }

  const entry: PlenoFindingCorrection = {
    field: field as PlenoFindingCorrection['field'],
    original,
    corrected,
    reason: reason.trim(),
    editor,
    correctedAt: new Date().toISOString(),
  }
  finding.corrections = [...(finding.corrections ?? []), entry]

  const updated: PlenoFindingsSnapshot = {
    ...snap,
    generatedAt: new Date().toISOString(),
  }

  const serialized = JSON.stringify(updated, null, 2) + '\n'
  validateFindingsSnapshot(serialized)

  await writeFile(FINDINGS_PATH, serialized)
  console.log(
    `[correct-pleno-finding] applied correction to ${id} · field=${field} · editor=${editor}`,
  )
}

main().catch((err) => {
  bail(`failed: ${(err as Error).message}`, 1)
})
