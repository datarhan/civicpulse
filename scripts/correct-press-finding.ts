#!/usr/bin/env tsx
/**
 * Curator CLI: issue a public correction to an already-published
 * press finding. Appends a {original, corrected, reason ≥20 chars,
 * editor, correctedAt} row to the finding's `corrections` log AND
 * applies the change to the top-level field. The whole snapshot is
 * re-validated through `validatePressFindingsSnapshot` before being
 * written — invariants like ≥10-char title / ≥40-char summary stay
 * intact.
 *
 * IFCN signatory requirement: every published correction must leave
 * a public, dated trail. We bake that into the schema rather than a
 * separate log file so the trail can never silently drift from the
 * canonical record.
 *
 * Usage:
 *   npm run correct-press-finding -- <id> \
 *     --field summary \
 *     --new "<corrected text>" \
 *     --reason "<why ≥20 chars>" \
 *     --editor "<your name>"
 *
 *   # severity correction
 *   npm run correct-press-finding -- F-123 \
 *     --field severity --new notable \
 *     --reason "auto-curate misclassified; data trail showed partial match" \
 *     --editor "Curador A"
 */
import { readFile, writeFile } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  validatePressFindingsSnapshot,
  type PressFindingCorrection,
  type PressFindingsSnapshot,
} from '../src/scraper/press-finding'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const PROJECT_ROOT = join(__dirname, '..')
const FINDINGS_PATH = join(PROJECT_ROOT, 'public/data/press-findings.json')

function getFlag(name: string): string | null {
  const i = process.argv.indexOf(name)
  if (i < 0) return null
  return process.argv[i + 1] ?? null
}

function bail(msg: string, code = 2): never {
  console.error(`[correct-press-finding] ${msg}`)
  process.exit(code)
}

const ALLOWED_FIELDS = ['title', 'summary', 'severity'] as const
type AllowedField = (typeof ALLOWED_FIELDS)[number]

async function main() {
  const id = process.argv[2]
  const field = getFlag('--field') as AllowedField | null
  const corrected = getFlag('--new')
  const reason = getFlag('--reason')
  const editor = getFlag('--editor')

  if (!id || !field || corrected == null || !reason || !editor) {
    bail(
      'Usage: correct-press-finding <id> --field <title|summary|severity> ' +
        '--new "<text>" --reason "<≥20 chars>" --editor "<name>"',
    )
  }
  if (!(ALLOWED_FIELDS as readonly string[]).includes(field)) {
    bail(`--field must be one of ${ALLOWED_FIELDS.join(', ')}`)
  }
  if (reason.trim().length < 20) {
    bail('--reason must be ≥20 chars (IFCN corrections trail)')
  }

  const raw = await readFile(FINDINGS_PATH, 'utf8')
  let snap: PressFindingsSnapshot
  try {
    snap = validatePressFindingsSnapshot(raw)
  } catch (err) {
    bail(`existing snapshot fails validation: ${(err as Error).message}`)
  }

  const finding = snap.items.find((f) => f.id === id)
  if (!finding) bail(`no finding with id "${id}"`)

  const original = String((finding as unknown as Record<string, unknown>)[field] ?? '')
  if (original === corrected) {
    bail(`field ${field} is already "${corrected}" — no change to record`)
  }

  const entry: PressFindingCorrection = {
    field,
    original,
    corrected,
    reason: reason.trim(),
    editor,
    correctedAt: new Date().toISOString(),
  }
  finding.corrections = [...(finding.corrections ?? []), entry]
  ;(finding as unknown as Record<string, unknown>)[field] = corrected

  // Bump generatedAt so downstream consumers know the file moved.
  const updated: PressFindingsSnapshot = {
    ...snap,
    generatedAt: new Date().toISOString(),
  }

  // Re-validate by round-tripping through the serializer — the
  // validator only accepts the same shapes we just wrote, so any
  // invariant violation (≥10 char title, ≥40 char summary, etc.)
  // fails loudly here instead of silently shipping.
  const serialized = JSON.stringify(updated, null, 2) + '\n'
  validatePressFindingsSnapshot(serialized)

  await writeFile(FINDINGS_PATH, serialized)
  console.log(
    `[correct-press-finding] applied correction to ${id} · field=${field} · editor=${editor}`,
  )
}

main().catch((err) => {
  bail(`failed: ${(err as Error).message}`, 1)
})
