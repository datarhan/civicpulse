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
 *
 * ── `--amend-reason` ────────────────────────────────────────────────────────
 *
 *   npm run correct-pleno-finding -- <id> \
 *     --amend-reason <i> --new "<motivo nuevo>" \
 *     --reason "<por qué se enmienda, ≥20>" --editor "<Nombre Apellido>"
 *
 * Sustituye el MOTIVO de la fila `corrections[<i>]`, que hasta ahora ninguna vía
 * podía tocar. No añade fila: la enmienda queda en la fila enmendada, con la
 * huella del motivo anterior (nunca su texto), el porqué, la firma y la fecha;
 * la fila conserva el editor y la fecha de su corrección. `--editor` tiene que
 * nombrar a una persona —ni una cuenta de rol ni un proceso ni el marcador de
 * una orden preparada—, y lo exige también el validador. Antes de escribir, se
 * niega si `--new` o `--reason` reproducen un tramo de una cita que la puerta
 * editorial retiene en esa ficha. El porqué de todo, en el bloque ENMIENDA DEL
 * MOTIVO de src/scraper/pleno-finding.ts.
 *
 * ── `--editor` ──────────────────────────────────────────────────────────────
 *
 * Cualquier vía rechaza, antes de leer nada, el hueco de una orden preparada
 * sin rellenar (`<nombre y apellidos>`, `<tu nombre>`, `…`): con el motivo
 * relleno, lo publicaría como firmante. Sólo el hueco, porque `--field`,
 * `--redact` y `--remove` las firma el operador con la cuenta de rol;
 * `--amend-reason`, además, pide una persona. `rechazoDeMarcador`, en
 * src/scraper/firma-de-persona.ts.
 *
 * ── `--dry-run` ─────────────────────────────────────────────────────────────
 *
 * Cualquier vía: valida el snapshot entero como si fuera a escribir, enseña la
 * fila que escribiría y no escribe nada. Para leer una orden preparada antes de
 * firmarla.
 */
import { readFile, writeFile } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

import { rechazoDeFirma, rechazoDeMarcador } from '../src/scraper/firma-de-persona'
import { tramosRetenidosEn, type ProcedenciaLike } from '../src/scraper/literales-retenidos'
import {
  applyFindingCorrection,
  applyFindingRedaction,
  applyFindingRemoval,
  applyReasonAmendment,
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
const PROVENANCE_PATH = join(PROJECT_ROOT, 'public/data/finding-quote-provenance.json')

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
  const amendReason = getFlag('--amend-reason')
  const corrected = getFlag('--new')
  const reason = getFlag('--reason')
  const editor = getFlag('--editor')
  const dryRun = process.argv.includes('--dry-run')

  const usage =
    'Usage: correct-pleno-finding <id> ' +
    '(--field <title|summary|severity|sourceClaimIds|quote.<i>.text|quote.<i>.sourceClaimId|' +
    'quote.<i>.speakerGroup> --new "<text>" | --remove <quote.<i>|crossChecked.<i>> | ' +
    `--redact <${Object.keys(REDACTION_LABELS).join('|')}> --new "<text>" | ` +
    '--amend-reason <i> --new "<motivo nuevo>") ' +
    '--reason "<≥20 chars>" --editor "<name>" [--dry-run]'

  const modes = [field, removePath, redactField, amendReason].filter((x) => x != null)
  if (!id || !reason || !editor) bail(usage)
  if (modes.length > 1) {
    bail('--field, --remove, --redact and --amend-reason are mutually exclusive')
  }
  if (modes.length === 0) bail(usage)
  if ((field || redactField || amendReason) && corrected == null) bail(usage)
  if (removePath && corrected != null) {
    bail('--remove takes no --new: a removal has no replacement value')
  }
  if (amendReason != null && !/^\d+$/.test(amendReason)) {
    bail('--amend-reason lleva el índice de una fila de la bitácora de la ficha (0, 1, …)')
  }
  // Antes de leer nada, en cualquier vía: una orden preparada llega con
  // `--editor "<nombre y apellidos>"`, y con el motivo relleno el hueco firmaría
  // una corrección publicada. Sólo el hueco: estas vías las firma el operador
  // con la cuenta de rol, y esa convención es suya.
  const hueco = rechazoDeMarcador(editor)
  if (hueco) bail(`--editor: ${hueco}`)
  if (amendReason != null) {
    // Una enmienda de motivo, además, la firma una persona con su nombre.
    const rechazo = rechazoDeFirma(editor)
    if (rechazo)
      bail(`--editor: una enmienda de motivo la firma una persona, con su nombre: ${rechazo}`)
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

  let entry: PlenoFindingCorrection | null = null
  let amended: { index: number; previous: string; row: PlenoFindingCorrection } | null = null
  const base = { reason: reason.trim(), editor, correctedAt: new Date().toISOString() }

  if (amendReason != null) {
    // El motivo nuevo y el porqué se publican en /hallazgos, y la copia servida
    // no toca prosa: si traen el literal de una cita que la puerta retiene, lo
    // devuelven a la página. Es casi siempre la razón de enmendar, así que se
    // pregunta antes de escribir, con la misma criba que la prueba de los datos.
    let procedencia: ProcedenciaLike
    try {
      procedencia = JSON.parse(await readFile(PROVENANCE_PATH, 'utf8')) as ProcedenciaLike
    } catch (err) {
      bail(
        `no puedo leer ${PROVENANCE_PATH} (${(err as Error).message}): sin las puertas no sé ` +
          'qué literales están retenidos, y no escribo un motivo sin saberlo',
      )
    }
    let tramos: Array<{ campo: string; cita: number }>
    try {
      tramos = tramosRetenidosEn(
        { '--new': corrected as string, '--reason': base.reason },
        finding,
        procedencia,
      )
    } catch (err) {
      bail((err as Error).message)
    }
    if (tramos.length > 0) {
      bail(
        tramos
          .map(
            (t) =>
              `${t.campo} reproduce un tramo de la cita ${t.cita}, que la puerta editorial retiene`,
          )
          .join('; ') +
          '. El motivo se publica en /hallazgos: describe el criterio, no el material.',
      )
    }
    try {
      const index = Number(amendReason)
      const { previous, row } = applyReasonAmendment(finding, index, corrected as string, {
        reason: base.reason,
        editor,
        amendedAt: base.correctedAt,
      })
      amended = { index, previous, row }
    } catch (err) {
      bail((err as Error).message)
    }
  } else if (removePath) {
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
  // Una enmienda de motivo no añade fila: queda dentro de la que enmienda.
  if (entry) finding.corrections = [...(finding.corrections ?? []), entry]

  const updated: PlenoFindingsSnapshot = {
    ...snap,
    generatedAt: new Date().toISOString(),
  }

  const serialized = JSON.stringify(updated, null, 2) + '\n'
  validateFindingsSnapshot(serialized)

  if (dryRun) {
    console.log(JSON.stringify(amended ? amended.row : entry, null, 2))
    console.log(
      `[correct-pleno-finding] --dry-run: el snapshot entero valida y ${id} quedaría así ` +
        `(${amended ? `corrections[${amended.index}]` : 'fila nueva'}). No se ha escrito nada.`,
    )
    return
  }

  await writeFile(FINDINGS_PATH, serialized)
  if (amended) {
    console.log(
      `[correct-pleno-finding] amended reason of ${id} · corrections[${amended.index}] ` +
        `(${amended.row.field}, ${amended.row.correctedAt.slice(0, 10)}) · editor=${editor} · ` +
        `motivo anterior ${amended.previous}`,
    )
    return
  }
  const row = entry as PlenoFindingCorrection
  const verb = removePath ? 'removed' : redactField ? 'redacted' : 'applied correction to'
  console.log(
    `[correct-pleno-finding] ${verb} ${id} · ` +
      `field=${row.field} · editor=${editor}${removePath || redactField ? ` · ${row.original}` : ''}`,
  )
}

main().catch((err) => {
  bail(`failed: ${(err as Error).message}`, 1)
})
