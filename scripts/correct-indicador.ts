#!/usr/bin/env tsx
/**
 * Corregir una ficha ya publicada de /eficiencia, dejando constancia.
 *
 *   npm run correct-indicador -- <findingId> --field titulo|cuerpo|medicion \
 *     --new "<texto>" --reason "<motivo ≥20>" --editor "<nombre>"
 *   npm run correct-indicador -- <findingId> --field medicion --refrescar \
 *     --reason "…" --editor "…"
 *
 * ## Los dos casos, y por qué el segundo existe
 *
 * `titulo` y `cuerpo` son la corrección normal: el texto decía algo que no
 * tocaba y el registro publica las dos versiones, la vieja tachada y la nueva.
 *
 * `medicion` es el caso propio de esta familia. La cita de un pleno se queda
 * quieta para siempre; una cifra no. El ministerio revisa una entrega y la
 * ficha pasa a afirmar un número que su propia fuente ya no dice —eso lo caza
 * `check:eficiencia-findings` con estado `contradice`—. `--refrescar` vuelve a
 * leer el panel vivo y congela el valor de ahora, dejando en el registro cuál
 * era antes.
 *
 * Lo que NO hace `--refrescar`: tocar el texto. Si la cifra cambió lo bastante
 * como para que el titular deje de ser cierto, eso es una corrección de
 * `titulo` —o una retirada—, y decidirlo es de quien firma.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  validateEficienciaFindingsSnapshot,
  cotejarMedicion,
} from '../src/scraper/eficiencia-finding'

const PUBLICADOS = resolve('public/data/eficiencia-findings.json')
const PANEL = resolve('public/data/indicadores.json')
const argv = process.argv.slice(2)
const VALUE_FLAGS = new Set(['--field', '--new', '--reason', '--editor'])

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
  process.stderr.write(`[correct-indicador] ${msg}\n`)
  process.exit(code)
}

function main(): void {
  const [findingId] = positionals()
  const field = flag('--field')
  const reason = flag('--reason')?.trim()
  const editor = flag('--editor')?.trim()
  const refrescar = argv.includes('--refrescar')
  const nuevo = flag('--new')

  if (!findingId || !field || !reason || !editor) {
    fail(
      'usage: correct-indicador <findingId> --field titulo|cuerpo|medicion ' +
        '(--new "<texto>" | --refrescar) --reason "<motivo ≥20>" --editor "<nombre>"',
      2,
    )
  }
  if (!['titulo', 'cuerpo', 'medicion'].includes(field)) {
    fail(`--field debe ser titulo, cuerpo o medicion (recibido «${field}»)`, 2)
  }
  if (reason.length < 20) fail('--reason debe explicar la corrección (≥20 caracteres)', 2)
  if (field === 'medicion' && !refrescar) {
    fail(
      '--field medicion sólo se corrige con --refrescar: la medición se copia del panel, ' +
        'no se teclea. Si lo que hay que cambiar es lo que dice la ficha, corrige titulo o cuerpo.',
      2,
    )
  }
  if (field !== 'medicion' && !nuevo) fail('--new "<texto>" es obligatorio', 2)
  if (!existsSync(PUBLICADOS)) fail(`falta ${PUBLICADOS}`)

  const snap = validateEficienciaFindingsSnapshot(readFileSync(PUBLICADOS, 'utf8'))
  const ficha = snap.items.find((f) => f.id === findingId)
  if (!ficha) {
    fail(
      `«${findingId}» no está publicada. Vivas: ${snap.items.map((f) => f.id).join(', ') || '(ninguna)'}`,
    )
  }

  let original: string
  let corregido: string
  if (field === 'medicion') {
    const panel = JSON.parse(readFileSync(PANEL, 'utf8'))
    const cotejo = cotejarMedicion(ficha!, panel)
    if (cotejo.actual === null) {
      fail(
        `el panel ya no publica ${ficha!.medicion.indicadorId} (${cotejo.detalle}). ` +
          `Una ficha sin cifra que la respalde se retira, no se refresca.`,
      )
    }
    if (cotejo.estado === 'coincide') {
      fail('la medición ya coincide con el panel — una corrección que no corrige nada es ruido')
    }
    original = `${ficha!.medicion.valor} ${ficha!.medicion.unidad} (${ficha!.medicion.periodo})`
    corregido = `${cotejo.actual} ${ficha!.medicion.unidad} (${cotejo.periodoActual ?? ficha!.medicion.periodo})`
    ficha!.medicion = {
      ...ficha!.medicion,
      valor: cotejo.actual,
      periodo: cotejo.periodoActual ?? ficha!.medicion.periodo,
    }
    process.stdout.write(
      `[correct-indicador] el texto NO se ha tocado. Si el titular deja de ser cierto con ` +
        `${corregido}, corrígelo aparte o retira la ficha.\n`,
    )
  } else {
    const key = field as 'titulo' | 'cuerpo'
    original = ficha![key]
    corregido = nuevo!
    if (original === corregido) fail('el texto nuevo es idéntico al publicado — no hay corrección')
    ficha![key] = corregido
  }

  ficha!.corrections = [
    ...(ficha!.corrections ?? []),
    {
      field: field as 'titulo' | 'cuerpo' | 'medicion',
      original,
      corrected: corregido,
      reason,
      editor,
      correctedAt: new Date().toISOString().slice(0, 10),
    },
  ]

  const validado = validateEficienciaFindingsSnapshot(
    JSON.stringify({ ...snap, generatedAt: new Date().toISOString() }),
  )
  writeFileSync(PUBLICADOS, JSON.stringify(validado, null, 2) + '\n')
  process.stdout.write(
    `[correct-indicador] «${findingId}» · ${field} corregido · ` +
      `${validado.items.find((f) => f.id === findingId)!.corrections!.length} corrección(es) en el registro\n`,
  )
}

main()
