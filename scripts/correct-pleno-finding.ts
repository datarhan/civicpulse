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
      'Usage: correct-pleno-finding <id> --field <title|summary|severity> ' +
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
  let snap: PlenoFindingsSnapshot
  try {
    snap = validateFindingsSnapshot(raw)
  } catch (err) {
    bail(`existing snapshot fails validation: ${(err as Error).message}`)
  }

  const finding = snap.items.find((f) => f.id === id)
  if (!finding) bail(`no finding with id "${id}"`)

  const original = String((finding as unknown as Record<string, unknown>)[field] ?? '')
  if (original === corrected) {
    bail(`field ${field} is already "${corrected}" — no change to record`)
  }

  const entry: PlenoFindingCorrection = {
    field,
    original,
    corrected,
    reason: reason.trim(),
    editor,
    correctedAt: new Date().toISOString(),
  }
  finding.corrections = [...(finding.corrections ?? []), entry]
  ;(finding as unknown as Record<string, unknown>)[field] = corrected

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
