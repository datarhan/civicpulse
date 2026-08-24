import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  cotejarResumen,
  limpiarPdf,
  resumirParte,
  haCotejadoAlgo,
  debeFallar,
  type Cotejo,
} from '../src/scraper/sindic-verbatim'
import { validateSnapshot } from '../src/scraper/sindic'

/**
 * La guarda que comprueba que nuestras comillas siguen siendo del Síndic.
 *
 * `check:sindic-fichas` necesita red, así que lo que se prueba aquí es su
 * cabeza: el cotejo puro y —sobre todo— que sepa ponerse ROJA. Una guarda que
 * nunca se ha visto fallar no es una guarda, es un adorno; en este repo ya hubo
 * dos suites verdes que no medían nada.
 */

const PDF_REAL = `
Queja 2600533 Materia Procedimientos administrativos
3 Consideraciones a la Administración
AL AYUNTAMIENTO DE RIBA-ROJA DE TÚRIA:
1. RECORDAMOS EL DEBER LEGAL de resolver los procedimientos de responsabilidad
patrimonial en el plazo de 6 meses desde su iniciación, mediante el dictado de
una resolución por el órgano competente, completa, congruente, motivada y con indicación de
CSV STAGN6YLU3VX9S6F
Validar en URL https://seu.elsindic.com
Este documento ha sido firmado electrónicamente el 23/03/2026
C/ Pascual Blasco, 1, 03001 - Alicante/Alacant | 900 210 970 - 965 937 500
consultas@elsindic.com | www.elsindic.com
5
los recursos que, en caso de desacuerdo, puedan interponerse.
Ángel Luna González
`
const CITA_BUENA =
  'RECORDAMOS EL DEBER LEGAL de resolver los procedimientos de responsabilidad ' +
  'patrimonial en el plazo de 6 meses desde su iniciación, mediante el dictado de ' +
  'una resolución por el órgano competente, completa, congruente, motivada y con ' +
  'indicación de los recursos que, en caso de desacuerdo, puedan interponerse.'

describe('limpiarPdf — el pie de página que parte una frase en dos', () => {
  it('mide algo: el fixture LLEVA un pie metido en medio de la cita', () => {
    expect(PDF_REAL).toContain('CSV STAGN6YLU3VX9S6F')
    expect(PDF_REAL).toContain('C/ Pascual Blasco')
  })

  it('quita el sellado, el CSV, la dirección y el número de página', () => {
    const l = limpiarPdf(PDF_REAL)
    for (const ruido of [
      'CSV',
      'Validar en URL',
      'firmado electrónicamente',
      'Pascual Blasco',
      'consultas@elsindic.com',
    ]) {
      expect(l, `sigue el ruido «${ruido}»`).not.toContain(ruido)
    }
  })

  it('y NO se lleva por delante la prosa que hay a los dos lados', () => {
    // Recortar de más sería concederse el aprobado: la comprobación pasaría
    // porque queda poco texto contra el que fallar.
    const l = limpiarPdf(PDF_REAL)
    expect(l).toContain('motivada y con indicación de')
    expect(l).toContain('los recursos que, en caso de desacuerdo')
    expect(l).toContain('Ángel Luna González')
  })
})

describe('cotejarResumen', () => {
  it('una cita que cruza el salto de página SIGUE siendo literal', () => {
    // Dos de las trece fichas reales cruzan uno. Si esto se marcara
    // «no-literal», la guarda se equivocaría 2 de cada 13 veces y acabaría
    // desconectada — que es el defecto que este repo ya conoce.
    const c = cotejarResumen('sindic-x', '202600533', CITA_BUENA, PDF_REAL)
    expect(c.desenlace).toBe('literal')
  })

  it('DETECTA una palabra cambiada, y dice dónde', () => {
    const manipulada = CITA_BUENA.replace('6 meses', 'tres meses')
    const c = cotejarResumen('sindic-x', '202600533', manipulada, PDF_REAL)
    expect(c.desenlace).toBe('no-literal')
    expect(c.detalle).toMatch(/casa hasta/)
    expect(c.detalle).toMatch(/tres meses/)
  })

  it('DETECTA una frase entera inventada', () => {
    const c = cotejarResumen(
      'sindic-x',
      '202600533',
      'El Síndic sanciona al Ayuntamiento.',
      PDF_REAL,
    )
    expect(c.desenlace).toBe('no-literal')
    expect(c.detalle).toMatch(/ni la primera frase/)
  })

  it('un PDF inalcanzable NO es «literal» — son cosas distintas', () => {
    // Doblar «no pude mirar» sobre «coincide» es cómo una puerta imprime su
    // propio visto bueno. Es la regla de `r?.findings ?? []`.
    expect(cotejarResumen('a', 'b', CITA_BUENA, null).desenlace).toBe('pdf-inalcanzable')
  })

  it('un PDF sin texto tampoco pasa por bueno', () => {
    expect(cotejarResumen('a', 'b', CITA_BUENA, '   ').desenlace).toBe('sin-pdf')
  })
})

describe('el parte decide bien cuándo puede dar el visto bueno', () => {
  const mk = (ds: Cotejo['desenlace'][]): Cotejo[] =>
    ds.map((d, i) => ({ id: `i${i}`, expediente: `${i}`, desenlace: d }))

  it('trece PDFs caídos NO son un all-clear', () => {
    const p = resumirParte(mk(Array(13).fill('pdf-inalcanzable')))
    expect(p.noLiterales).toBe(0) // cero discrepancias…
    expect(haCotejadoAlgo(p)).toBe(false) // …pero no se cotejó nada
  })

  it('un fichero vacío tampoco', () => {
    expect(haCotejadoAlgo(resumirParte([]))).toBe(false)
  })

  it('con al menos una cotejada de verdad, el parte vale', () => {
    expect(haCotejadoAlgo(resumirParte(mk(['literal', 'pdf-inalcanzable'])))).toBe(true)
  })

  it('sólo lo NUESTRO hace fallar: un PDF caído no, una cita rota sí', () => {
    expect(debeFallar(resumirParte(mk(['literal', 'pdf-inalcanzable'])))).toBe(false)
    expect(debeFallar(resumirParte(mk(['literal', 'no-literal'])))).toBe(true)
    expect(debeFallar(resumirParte(mk(['sin-pdf'])))).toBe(true)
  })
})

// ─── Y sobre lo que está PUBLICADO ──────────────────────────────────────────

describe('las fichas publicadas', () => {
  const path = resolve('public/data/sindic.json')

  it('validan contra su propio esquema', () => {
    if (!existsSync(path)) return
    expect(() => validateSnapshot(JSON.parse(readFileSync(path, 'utf8')))).not.toThrow()
  })

  it('cada una apunta a un PDF de elsindic.com y trae un resumen con cuerpo', () => {
    if (!existsSync(path)) return
    const snap = validateSnapshot(JSON.parse(readFileSync(path, 'utf8')))
    // Si algún día esto queda en cero, el bucle de abajo no comprueba nada: se
    // dice en voz alta en vez de pasar en silencio.
    expect(snap.items.length, 'no hay fichas que comprobar').toBeGreaterThan(0)
    for (const it of snap.items) {
      expect(it.urlPdf).toMatch(/^https:\/\/(www\.)?elsindic\.com\/.+\.pdf$/)
      expect(it.resumen.length).toBeGreaterThan(50)
      expect(it.id).toContain(it.expediente)
    }
  })
})
