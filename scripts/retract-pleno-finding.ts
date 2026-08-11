#!/usr/bin/env tsx
/**
 * Curator CLI: WITHDRAW a published pleno finding.
 *
 *   npm run retract-finding -- <findingId> --reason "<≥20 chars>" --editor "<name>"
 *   npm run retract-finding -- <findingId> --reason "…" --editor "…" --dry-run
 *
 * The counterpart to `correct-pleno-finding`, which can only amend. This is a
 * weakening and only a weakening: it takes a finding off `/hallazgos` and out
 * of every count, and adds nothing.
 *
 * Reach for it when the finding cannot be stated at all — which in practice
 * means the editorial gate withholds every quote it rests on, so whatever the
 * summary says is unsourced by construction. `applyFindingRedaction` refuses to
 * redact a summary to a stub and names this as the remedy; until now the remedy
 * did not exist.
 *
 * **There is no `--unretract`.** The ledger stores a digest, not the prose, so
 * there is nothing to put back — see `finding-retraction.ts` for why the vote
 * ledger can afford verbatim tombstones and this one cannot. Republishing means
 * publishing a new finding, with a new id and its own evidence.
 *
 * read → validateSnapshot → pure retract → re-validate WHOLE snapshot → write.
 */
import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import { validateFindingsSnapshot, type PlenoFindingsSnapshot } from '../src/scraper/pleno-finding'
import {
  RETRACTION_REASON_MIN,
  findingTombstone,
  retractFinding,
} from '../src/scraper/finding-retraction'

const FINDINGS_PATH = resolve('public/data/pleno-findings.json')

function getFlag(name: string): string | null {
  const i = process.argv.indexOf(name)
  if (i === -1) return null
  return process.argv[i + 1] ?? null
}

function bail(msg: string, code = 2): never {
  console.error(`[retract-finding] ${msg}`)
  process.exit(code)
}

async function main() {
  const id = process.argv[2]
  const reason = getFlag('--reason')
  const editor = getFlag('--editor')
  const dryRun = process.argv.includes('--dry-run')

  if (!id || id.startsWith('--') || !reason || !editor) {
    bail('Usage: retract-finding <findingId> --reason "<≥20 chars>" --editor "<name>" [--dry-run]')
  }
  if (reason.trim().length < RETRACTION_REASON_MIN) {
    bail(`--reason must be ≥${RETRACTION_REASON_MIN} chars — it is published beside the tombstone`)
  }

  const raw = await readFile(FINDINGS_PATH, 'utf8')
  let snap: PlenoFindingsSnapshot
  try {
    snap = validateFindingsSnapshot(raw)
  } catch (err) {
    bail(`existing snapshot fails validation: ${(err as Error).message}`)
  }

  const finding = snap.items.find((f) => f.id === id)
  if (!finding) {
    const already = (snap.retractions ?? []).find((r) => r.findingId === id)
    bail(
      already
        ? `"${id}" was already retracted on ${already.retractedAt.slice(0, 10)} by ${already.editor}. ` +
            'A retraction is not reversible; republishing means a new finding with a new id.'
        : `no published finding with id "${id}"`,
    )
  }

  // Printed before the write so a --dry-run says exactly what disappears.
  console.log(
    `[retract-finding] ${id} · ${finding.severity} · pleno ${finding.plenoDate} · ` +
      `${finding.quotes.length} cita(s) · ${finding.crossChecked.length} documento(s) cotejado(s)`,
  )
  console.log(`[retract-finding] tombstone ${findingTombstone(finding)}`)

  let updated: PlenoFindingsSnapshot
  try {
    updated = retractFinding(snap, {
      findingId: id,
      reason: reason.trim(),
      editor,
      retractedAt: new Date().toISOString(),
    })
  } catch (err) {
    bail((err as Error).message)
  }
  updated = { ...updated, generatedAt: new Date().toISOString() }

  const serialized = JSON.stringify(updated, null, 2) + '\n'
  try {
    validateFindingsSnapshot(serialized)
  } catch (err) {
    bail(`refusing to write: result fails validation — ${(err as Error).message}`, 1)
  }

  if (dryRun) {
    console.log(
      `[retract-finding] --dry-run: nothing written. ` +
        `${snap.items.length} → ${updated.items.length} hallazgo(s) publicado(s).`,
    )
    return
  }

  await writeFile(FINDINGS_PATH, serialized)
  console.log(
    `[retract-finding] withdrawn by ${editor} · ` +
      `${snap.items.length} → ${updated.items.length} hallazgo(s) publicado(s) · ` +
      `${(updated.retractions ?? []).length} en el registro de retiradas`,
  )
  console.log(
    '[retract-finding] recuerda: los snapshots derivados (provenance, cola de excepciones)\n' +
      '                  se regeneran con `npm run refresh`.',
  )
}

main().catch((err) => {
  bail(`failed: ${(err as Error).message}`, 1)
})
