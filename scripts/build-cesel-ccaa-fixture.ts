#!/usr/bin/env tsx
/**
 * Recorta un informe CESEL por comunidad autónoma a los servicios y municipios
 * que pida una prueba, con las filas tal cual.
 *
 * Es la generalización de scripts/build-cesel-agua-fixture.ts, que hacía lo
 * mismo con tres servicios fijos de 2024. Las pruebas del 2026-10-19 necesitaban
 * otros: las cifras de relleno (0,01 y 1 €) que declaran Puçol, Calp, Borriana,
 * Aldaia y Benetússer en 2024, la de Riba-roja en limpieza viaria y biblioteca
 * en 2014 y 2015, y las filas de parques y jardines de Quart de Poblet, Moncada
 * y Cullera, que traen dos modos de gestión para el mismo servicio. Una fixture
 * escrita a mano sólo probaría que el motor le da la razón a quien la escribió.
 *
 * Igual que el recorte del agua: se conservan las filas de cabecera del informe
 * y los nombres de hoja, y sólo se quitan filas. Sin `--entes`, la banda
 * `cv-15k-40k` entera (el mismo censo CONPREL que usa el adaptador).
 *
 * Entradas (gitignoradas, en .cache/cesel): el informe que pide
 * `npm run fetch:cesel-ccaa` y el censo CONPREL.
 *
 * Usage:
 *   npx tsx scripts/build-cesel-ccaa-fixture.ts --anio 2024 \
 *     --programas a171/170P,b341/340P --out tests/fixtures/<nombre>.xlsx [--entes 46214]
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as XLSX from 'xlsx'
import { parseConprelRoster } from '../src/scraper/budget'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')

const POP_MIN = 15_000
const POP_MAX = 40_000
const RIBA_ROJA = '46214'

function arg(nombre: string): string | undefined {
  const i = process.argv.indexOf(`--${nombre}`)
  return i >= 0 ? process.argv[i + 1] : undefined
}

const anio = Number(arg('anio'))
const programas = (arg('programas') ?? '').split(',').filter(Boolean)
const out = arg('out')
if (!Number.isInteger(anio) || !programas.length || !out) {
  console.error('[cesel-ccaa-fixture] uso: --anio AAAA --programas a171/170P,… --out <xlsx>')
  process.exit(1)
}

const SRC = join(ROOT, `.cache/cesel/ccaa/cesel-ccaa17-${anio}.xlsx`)
const CONPREL = join(ROOT, '.cache/cesel/conprel-cv.xls')
for (const p of [SRC, CONPREL]) {
  if (!existsSync(p)) {
    console.error(`[cesel-ccaa-fixture] falta ${p} — ver el encabezado de este fichero`)
    process.exit(1)
  }
}

let entes: Set<string>
const pedidos = arg('entes')
if (pedidos) {
  entes = new Set(pedidos.split(','))
} else {
  const roster = parseConprelRoster(readFileSync(CONPREL))
  entes = new Set(
    roster.filter((m) => m.poblacion >= POP_MIN && m.poblacion <= POP_MAX).map((m) => m.ine),
  )
  entes.add(RIBA_ROJA)
}

// El prefijo del programa ES el sufijo de la hoja: `b341/340P` vive en
// «CE1b y CE2b» y «CE3b» como `341/340P` (ver parseCeselInforme).
const porSufijo = new Map<string, Set<string>>()
for (const p of programas) {
  const sufijo = p[0]
  if (sufijo !== 'a' && sufijo !== 'b') throw new Error(`programa sin prefijo a/b: ${p}`)
  porSufijo.set(sufijo, (porSufijo.get(sufijo) ?? new Set()).add(p.slice(1)))
}

const ENTE_RE = /^\d{2}-(\d{2})-(\d{3})-AA-\d{3}$/
const src = XLSX.read(readFileSync(SRC), { type: 'buffer' })
const libro = XLSX.utils.book_new()

for (const [sufijo, codigos] of porSufijo) {
  for (const nombre of [`CE1${sufijo} y CE2${sufijo}`, `CE3${sufijo}`]) {
    const filas: unknown[][] = XLSX.utils.sheet_to_json(src.Sheets[nombre], {
      header: 1,
      raw: true,
      defval: null,
    })
    const i = filas.findIndex((r) =>
      (r ?? []).some((c) => /^Grupo de programa/i.test(String(c ?? '').trim())),
    )
    if (i < 0) throw new Error(`[cesel-ccaa-fixture] ${nombre}: sin cabecera`)
    const head = filas[i].map((h) => String(h ?? '').trim())
    const iEnte = head.findIndex((h) => /^C[oó]digo Ente$/i.test(h))
    const iProg = head.findIndex((h) => /^Grupo de programa/i.test(h))
    const datos = filas.slice(i + 1).filter((r) => {
      const m = ENTE_RE.exec(String(r?.[iEnte] ?? '').trim())
      return m !== null && entes.has(m[1] + m[2]) && codigos.has(String(r?.[iProg] ?? '').trim())
    })
    XLSX.utils.book_append_sheet(
      libro,
      XLSX.utils.aoa_to_sheet([...filas.slice(0, i + 1), ...datos]),
      nombre,
    )
    console.log(`[cesel-ccaa-fixture] ${nombre}: ${filas.length - i - 1} → ${datos.length} filas`)
  }
}

writeFileSync(
  join(ROOT, out),
  XLSX.write(libro, { type: 'buffer', bookType: 'xlsx', compression: true }),
)
console.log(`[cesel-ccaa-fixture] ${anio} · ${entes.size} municipios → ${out}`)
