import { afterEach, describe, expect, it } from 'vitest'
import * as XLSX from 'xlsx'

/**
 * SheetJS lee hojas que no son nuestras: no puede cargarse una versión con
 * vulnerabilidades publicadas.
 *
 * Siete analizadores de `src/scraper/` pasan a SheetJS lo que bajan de
 * servidores ajenos —Hacienda (CONPREL, CESEL, deuda viva, PMP), el SEPE, el
 * Consell de Transparència, el CTBG— y `scripts/scrape-ispa.ts` lo que publica
 * Función Pública; todos con la misma llamada, `XLSX.read(buffer, { type:
 * 'buffer' })`. Hasta la 0.19.2, un comentario de celda cuya dirección fuera
 * `__proto__` hacía que `sheet[ref]` devolviese `Object.prototype`, y SheetJS
 * le colgaba la lista de comentarios: desde ese momento todo objeto del proceso
 * tiene `.c` (CVE-2023-30533). Bastaba una hoja manipulada en origen o en
 * tránsito.
 *
 * SheetJS dejó de publicar en npm con la 0.18.5, y ésa sigue siendo el `latest`
 * del registro: un `npm install xlsx` trae de vuelta la versión vulnerable sin
 * avisar. Las corregidas se sirven desde cdn.sheetjs.com y el lockfile fija el
 * tarball con su integridad. Estas pruebas son las que se ponen rojas si alguien
 * lo deshace.
 */

// Un libro de verdad —lo escribe el propio SheetJS— con una nota en A1, y la
// dirección de esa nota reescrita en el XML: así se fabrica la hoja maliciosa.
function libroConNotaEn(ref: string): Buffer {
  const ws = XLSX.utils.aoa_to_sheet([['importe'], [1]])
  ws.A1.c = [{ a: 'CivicPulse', t: 'nota' }]
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Hoja1')
  const zip = XLSX.CFB.read(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }), {
    type: 'buffer',
  })
  const i = zip.FullPaths.findIndex((p: string) => /comments\d*\.xml$/.test(p))
  expect(i, 'el libro escrito no trae la parte de comentarios').toBeGreaterThanOrEqual(0)
  const xml = Buffer.from(zip.FileIndex[i].content).toString('utf8')
  expect(xml.split('ref="A1"'), 'la nota no está en A1').toHaveLength(2)
  zip.FileIndex[i].content = Buffer.from(xml.replace('ref="A1"', `ref="${ref}"`))
  return XLSX.CFB.write(zip, { fileType: 'zip', type: 'buffer' }) as Buffer
}

// Los dos avisos publicados contra SheetJS CE (cdn.sheetjs.com/advisories). El
// ReDoS no se reproduce sin una prueba de tiempos, así que se mira la versión.
const AVISOS = [
  { aviso: 'CVE-2023-30533 · contaminación de prototipo', corregidoEn: '0.19.3' },
  { aviso: 'CVE-2024-22363 · ReDoS', corregidoEn: '0.20.2' },
]

function esAnterior(version: string, a: string): boolean {
  const [v, c] = [version, a].map((s) => s.split('.').map(Number))
  for (let k = 0; k < 3; k++) if (v[k] !== c[k]) return v[k] < c[k]
  return false
}

describe('SheetJS lee hojas ajenas sin vulnerabilidades publicadas', () => {
  // Si una versión vulnerable contaminó el prototipo, se limpia aquí para que
  // el daño no se arrastre a la prueba siguiente.
  afterEach(() => {
    delete (Object.prototype as Record<string, unknown>).c
  })

  it('mide algo: una nota en una dirección válida se lee y llega a su celda', () => {
    const wb = XLSX.read(libroConNotaEn('A1'), { type: 'buffer' })
    expect(wb.Sheets.Hoja1.A1.c?.map((n: { t: string }) => n.t)).toEqual(['nota'])
  })

  it('una nota con dirección «__proto__» no le cuelga «c» a todos los objetos', () => {
    XLSX.read(libroConNotaEn('__proto__'), { type: 'buffer' })
    expect(({} as Record<string, unknown>).c).toBeUndefined()
  })

  it('la versión cargada no cae en ningún rango vulnerable publicado', () => {
    const vulnerable = AVISOS.filter(({ corregidoEn }) => esAnterior(XLSX.version, corregidoEn))
    expect(vulnerable.map(({ aviso }) => aviso)).toEqual([])
  })
})
