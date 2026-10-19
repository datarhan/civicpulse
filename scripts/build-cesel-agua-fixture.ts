#!/usr/bin/env tsx
/**
 * Recorta el informe CESEL de la Comunitat Valenciana de 2024 a TRES servicios
 * —agua (161), alcantarillado (160) y recogida de residuos (1621)— para toda la
 * banda `cv-15k-40k`, y lo escribe en tests/fixtures/cesel_ccaa17_2024_agua.xlsx.
 *
 * Existe porque el grupo de comparación de las dos fichas del agua no se puede
 * probar con una banda recortada a once municipios: lo que se publica es
 * cuántas concesiones de la banda ENTERA quedan fuera y por qué, y en 2024 la
 * única que declara coste sin red (Paiporta, 1 € y 0 m) y la única sociedad de
 * economía mixta (Calp) están fuera del recorte de cesel_ccaa17_2024_slice.xlsx.
 * El 1621 va porque es el servicio en el que Sant Joan d'Alacant declara un
 * concierto con cifra: la única fila real con la que probar que la frase del
 * concesionario no se le aplica a lo que no es una concesión.
 *
 * Igual que scripts/build-cesel-fixture.ts: los valores se copian tal cual, las
 * filas de cabecera del informe se conservan y sólo se quitan filas. Una
 * fixture escrita a mano sólo probaría que el parser le da la razón a quien la
 * escribió.
 *
 * Entradas (gitignoradas, en .cache/cesel): el informe de comunidad que pide
 * `npm run fetch:cesel-ccaa` y el censo CONPREL que define la banda, el mismo
 * que usa scripts/scrape-coste-efectivo.ts.
 *
 * Usage: npx tsx scripts/build-cesel-agua-fixture.ts
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as XLSX from 'xlsx'
import { parseConprelRoster } from '../src/scraper/budget'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const SRC = join(ROOT, '.cache/cesel/ccaa/cesel-ccaa17-2024.xlsx')
const CONPREL = join(ROOT, '.cache/cesel/conprel-cv.xls')
const OUT = join(ROOT, 'tests/fixtures/cesel_ccaa17_2024_agua.xlsx')

const POP_MIN = 15_000
const POP_MAX = 40_000
const RIBA_ROJA = '46214'
const PROGRAMAS = new Set(['160', '161', '1621'])
const HOJAS = ['CE1a y CE2a', 'CE3a']

for (const p of [SRC, CONPREL]) {
  if (!existsSync(p)) {
    console.error(`[cesel-agua-fixture] falta ${p} — ver el encabezado de este fichero`)
    process.exit(1)
  }
}

const roster = parseConprelRoster(readFileSync(CONPREL))
const banda = new Set(
  roster.filter((m) => m.poblacion >= POP_MIN && m.poblacion <= POP_MAX).map((m) => m.ine),
)
banda.add(RIBA_ROJA)

const ENTE_RE = /^\d{2}-(\d{2})-(\d{3})-AA-\d{3}$/

const src = XLSX.read(readFileSync(SRC), { type: 'buffer' })
const out = XLSX.utils.book_new()

for (const nombre of HOJAS) {
  const filas: unknown[][] = XLSX.utils.sheet_to_json(src.Sheets[nombre], {
    header: 1,
    raw: true,
    defval: null,
  })
  const i = filas.findIndex((r) =>
    (r ?? []).some((c) => /^Grupo de programa/i.test(String(c ?? '').trim())),
  )
  if (i < 0) throw new Error(`[cesel-agua-fixture] ${nombre}: sin cabecera`)
  const head = filas[i].map((h) => String(h ?? '').trim())
  const iEnte = head.findIndex((h) => /^C[oó]digo Ente$/i.test(h))
  const iProg = head.findIndex((h) => /^Grupo de programa/i.test(h))
  const datos = filas.slice(i + 1).filter((r) => {
    const m = ENTE_RE.exec(String(r?.[iEnte] ?? '').trim())
    return m !== null && banda.has(m[1] + m[2]) && PROGRAMAS.has(String(r?.[iProg] ?? '').trim())
  })
  XLSX.utils.book_append_sheet(
    out,
    XLSX.utils.aoa_to_sheet([...filas.slice(0, i + 1), ...datos]),
    nombre,
  )
  console.log(`[cesel-agua-fixture] ${nombre}: ${filas.length - i - 1} → ${datos.length} filas`)
}

writeFileSync(OUT, XLSX.write(out, { type: 'buffer', bookType: 'xlsx', compression: true }))
console.log(`[cesel-agua-fixture] banda ${POP_MIN}-${POP_MAX}: ${banda.size} municipios → ${OUT}`)
