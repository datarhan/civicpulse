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
 *
 * ── `--redact` ──────────────────────────────────────────────────────────────
 *
 *   npm run correct-pleno-finding -- <id> \
 *     --redact summary --new "<rewritten text>" \
 *     --reason "<why ≥20 chars>" --editor "<your name>"
 *
 * `--field summary` for the case where the PRIOR TEXT is itself the harm. It
 * applies the new text exactly as `--field` does, but records `original` as a
 * digest and digests the finding's earlier log rows on that same field, which
 * are copies of the same prose. Use it only when a struck-through original
 * would republish what the edit exists to remove; everything else keeps the
 * ordinary correction, where showing the withdrawn sentence is the point. The
 * full reasoning is in the REDACTION block in src/scraper/pleno-finding.ts.
 */
import { readFile, writeFile } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  applyFindingCorrection,
  applyFindingRedaction,
  applyFindingRemoval,
  findingRedactionTarget,
  findingRemovalTarget,
  reasonEchoesRemoved,
  CORRECTION_QUOTE_FIELD_RE,
  ATTRIBUTION_RETRACTED_LABEL,
  isSpeakerGroupField,
  CORRECTION_REMOVAL_FIELD_RE,
  REDACTION_LABELS,
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
  const redactField = getFlag('--redact')
  const corrected = getFlag('--new')
  const reason = getFlag('--reason')
  const editor = getFlag('--editor')

  const usage =
    'Usage: correct-pleno-finding <id> ' +
    '(--field <title|summary|severity|sourceClaimIds|quote.<i>.text|quote.<i>.sourceClaimId> ' +
    '--new "<text>" | --remove <quote.<i>|crossChecked.<i>> | ' +
    `--redact <${Object.keys(REDACTION_LABELS).join('|')}> --new "<text>") ` +
    '--reason "<≥20 chars>" --editor "<name>"'

  const modes = [field, removePath, redactField].filter((x) => x != null)
  if (!id || !reason || !editor) bail(usage)
  if (modes.length > 1) bail('--field, --remove and --redact are mutually exclusive')
  if (modes.length === 0) bail(usage)
  if ((field || redactField) && corrected == null) bail(usage)
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
  if (redactField && !(redactField in REDACTION_LABELS)) {
    bail(
      `--redact must be one of ${Object.keys(REDACTION_LABELS).join(', ')} — only these two ` +
        'publish the kind of prose a digest exists to protect.',
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
  } else if (redactField) {
    // Same order as the removal path, for the same reason: the guard needs the
    // prose while it is still there. A redaction takes more off the page than
    // a removal — the field AND every earlier log copy of it — so the reason is
    // checked against all of it at once.
    const target = findingRedactionTarget(finding, redactField)
    if (!target) bail(`${redactField} addresses nothing in "${id}"`)
    const echo = reasonEchoesRemoved(base.reason, target)
    if (echo) {
      bail(
        `--reason names "${echo}", which is part of what this redaction takes off the page. ` +
          'The reason is published on /hallazgos beside the entry, so a reason that quotes ' +
          'the redacted text puts it back. Describe the criterion ("el sumario reproducía el ' +
          'nombre de un particular junto a una imputación que no consta comprobada"), not ' +
          'the material.',
      )
    }
    try {
      const { original, swept } = applyFindingRedaction(finding, redactField, corrected as string)
      entry = {
        field: redactField as PlenoFindingCorrection['field'],
        original,
        corrected: corrected as string,
        ...base,
      }
      if (swept > 0) {
        console.log(
          `[correct-pleno-finding] swept ${swept} earlier ${redactField} row(s) in the log ` +
            'to digests: they published copies of the same prose.',
        )
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
    // Retracting an attribution stores `null`, but the log's `corrected` side
    // is a required non-empty string and an empty cell beside a struck-through
    // «PSOE» reads as a broken page. Log the words, store the null.
    const loggedCorrected =
      isSpeakerGroupField(field as string) && (corrected as string).trim() === ''
        ? ATTRIBUTION_RETRACTED_LABEL
        : (corrected as string)
    entry = {
      field: field as PlenoFindingCorrection['field'],
      original,
      corrected: loggedCorrected,
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

  const verb = removePath ? 'removed' : redactField ? 'redacted' : 'applied correction to'
  await writeFile(FINDINGS_PATH, serialized)
  console.log(
    `[correct-pleno-finding] ${verb} ${id} · ` +
      `field=${entry.field} · editor=${editor}${removePath || redactField ? ` · ${entry.original}` : ''}`,
  )
}

main().catch((err) => {
  bail(`failed: ${(err as Error).message}`, 1)
})
