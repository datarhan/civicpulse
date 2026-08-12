#!/usr/bin/env tsx
/**
 * Retirar una ficha de /eficiencia.
 *
 *   npm run retract-indicador -- <findingId> --editor "<nombre>" --reason "<motivo ≥20>"
 *
 * Deja lápida y no deja el texto. El registro tiene que ser COMPROBABLE, no
 * legible: quien tenga una instantánea anterior de este repositorio —que es
 * público— recalcula el digesto y demuestra exactamente qué ficha se fue y que
 * no se fue ninguna otra. Quien no la tenga no aprende de aquí lo que decía.
 *
 * No hay «des-retirar». Volver a publicar es promocionar de nuevo, con su
 * candidato, su comprobación y su firma.
 *
 * Retirar sólo puede quitar o debilitar lo publicado, así que por la escalera
 * de automatización es Tier A y no necesita más evidencia que el motivo. Aun
 * así lo corre una persona: quien firmó es quien retira.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  validateEficienciaFindingsSnapshot,
  digestFinding,
} from '../src/scraper/eficiencia-finding'

const PUBLICADOS = resolve('public/data/eficiencia-findings.json')
const argv = process.argv.slice(2)
const VALUE_FLAGS = new Set(['--editor', '--reason'])

const flag = (f: string) => {
  const i = argv.indexOf(f)
  return i >= 0 ? argv[i + 1] : undefined
}
const positionals = () => {
  const out: string[] = []
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i].startsWith('--')) {
      if (VALUE_FLAGS.has(argv[i])) i += 1
      continue
    }
    out.push(argv[i])
  }
  return out
}

function fail(msg: string, code = 1): never {
  process.stderr.write(`[retract-indicador] ${msg}\n`)
  process.exit(code)
}

function main(): void {
  const [findingId] = positionals()
  const editor = flag('--editor')?.trim()
  const reason = flag('--reason')?.trim()
  if (!findingId || !editor || !reason) {
    fail('usage: retract-indicador <findingId> --editor "<nombre>" --reason "<motivo ≥20>"', 2)
  }
  if (reason.length < 20) fail('--reason debe explicar la retirada (≥20 caracteres)', 2)
  if (!existsSync(PUBLICADOS)) fail(`falta ${PUBLICADOS}`)

  const snap = validateEficienciaFindingsSnapshot(readFileSync(PUBLICADOS, 'utf8'))
  const ficha = snap.items.find((f) => f.id === findingId)
  if (!ficha) {
    const ya = (snap.retractions ?? []).some((r) => r.findingId === findingId)
    fail(
      ya
        ? `«${findingId}» ya estaba retirada — no hay des-retirada; volver a publicar es promocionar de nuevo`
        : `«${findingId}» no está publicada. Vivas: ${snap.items.map((f) => f.id).join(', ') || '(ninguna)'}`,
    )
  }

  const siguiente = {
    ...snap,
    generatedAt: new Date().toISOString(),
    items: snap.items.filter((f) => f.id !== findingId),
    retractions: [
      ...(snap.retractions ?? []),
      {
        findingId,
        // El digesto se calcula sobre la ficha TAL Y COMO la serializa el
        // validador, para que sea reproducible desde el commit anterior.
        digest: digestFinding(ficha!),
        reason,
        editor,
        retractedAt: new Date().toISOString().slice(0, 10),
      },
    ],
  }
  const validado = validateEficienciaFindingsSnapshot(JSON.stringify(siguiente))
  writeFileSync(PUBLICADOS, JSON.stringify(validado, null, 2) + '\n')
  process.stdout.write(
    `[retract-indicador] retirada «${findingId}» · ${validado.items.length} viva(s) · ` +
      `${(validado.retractions ?? []).length} en la lápida\n`,
  )
}

main()
