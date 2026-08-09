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
 *
 *   npm run correct-pleno-finding -- <id> \
 *     --remove quote.0 \
 *     --reason "<why ≥20 chars>" \
 *     --editor "<your name>"
 *
 * ── `--remove` ──────────────────────────────────────────────────────────────
 *
 * Retracts one `quotes[i]` or one `crossChecked[i]`. It is a separate flag
 * rather than `--field quote.0 --new ""` on purpose: a removal has no
 * replacement value, an empty `--new` would be indistinguishable from a
 * mistake, and the schema refuses a blank `corrected` anyway. Making the
 * destructive operation say its own name at the call site is the point.
 *
 * The ledger row it writes carries a digest of the removed content, never the
 * content — `original` is published on the page, struck through, so the
 * obvious encoding would republish exactly what was retracted. The full
 * reasoning, and how an auditor verifies a removal from the digest, is in the
 * REMOVAL block in src/scraper/pleno-finding.ts.
 *
 * Removals on one finding are issued HIGHEST INDEX FIRST: each one renumbers
 * the rows after it, and the CLI bounds-checks against the file as it stands
 * now, so a stale index is refused rather than applied to its new occupant.
 */
import { readFile, writeFile } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  applyFindingCorrection,
  applyFindingRemoval,
  findingRemovalTarget,
  reasonEchoesRemoved,
  CORRECTION_QUOTE_FIELD_RE,
  CORRECTION_REMOVAL_FIELD_RE,
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
  const removePath = getFlag('--remove')
  const corrected = getFlag('--new')
  const reason = getFlag('--reason')
  const editor = getFlag('--editor')

  const usage =
    'Usage: correct-pleno-finding <id> ' +
    '(--field <title|summary|severity|sourceClaimIds|quote.<i>.text|quote.<i>.sourceClaimId> ' +
    '--new "<text>" | --remove <quote.<i>|crossChecked.<i>>) ' +
    '--reason "<≥20 chars>" --editor "<name>"'

  if (!id || !reason || !editor) bail(usage)
  if (field && removePath) bail('--field and --remove are mutually exclusive')
  if (!field && !removePath) bail(usage)
  if (field && corrected == null) bail(usage)
  if (removePath && corrected != null) {
    bail('--remove takes no --new: a removal has no replacement value')
  }
  if (
    field &&
    !(ALLOWED_FIELDS as readonly string[]).includes(field) &&
    !CORRECTION_QUOTE_FIELD_RE.test(field)
  ) {
    bail(
      `--field must be one of ${ALLOWED_FIELDS.join(', ')} or quote.<i>.text / quote.<i>.sourceClaimId`,
    )
  }
  if (removePath && !CORRECTION_REMOVAL_FIELD_RE.test(removePath)) {
    bail('--remove must be quote.<i> or crossChecked.<i>')
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

  let entry: PlenoFindingCorrection
  const base = { reason: reason.trim(), editor, correctedAt: new Date().toISOString() }

  if (removePath) {
    // Read the row BEFORE removing it: the reason guard needs the text it is
    // checking the reason against, and after the splice there is nothing left
    // to check. `revisar-borrador` Paso 2 — the note describes the criterion,
    // never the material.
    const target = findingRemovalTarget(finding, removePath)
    if (!target) bail(`${removePath} addresses nothing in "${id}"`)
    const echo = reasonEchoesRemoved(base.reason, target)
    if (echo) {
      bail(
        `--reason names "${echo}", which is part of what this removal takes out. ` +
          'The reason is published on /hallazgos beside the entry, so a reason that ' +
          'quotes the removed row puts it back on the page. Describe the criterion ' +
          '("una cita sin atribución de grupo que el resumen no utiliza"), not the material.',
      )
    }
    try {
      const { original, corrected: correctedLabel } = applyFindingRemoval(finding, removePath)
      entry = {
        field: removePath as PlenoFindingCorrection['field'],
        original,
        ...base,
        corrected: correctedLabel,
      }
    } catch (err) {
      bail((err as Error).message)
    }
  } else {
    let original: string
    try {
      original = applyFindingCorrection(finding, field as string, corrected as string)
    } catch (err) {
      bail((err as Error).message)
    }
    if (original === corrected) {
      bail(`field ${field} is already "${corrected}" — no change to record`)
    }
    entry = {
      field: field as PlenoFindingCorrection['field'],
      original,
      corrected: corrected as string,
      ...base,
    }
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
    `[correct-pleno-finding] ${removePath ? 'removed' : 'applied correction to'} ${id} · ` +
      `field=${entry.field} · editor=${editor}${removePath ? ` · ${entry.original}` : ''}`,
  )
}

main().catch((err) => {
  bail(`failed: ${(err as Error).message}`, 1)
})
