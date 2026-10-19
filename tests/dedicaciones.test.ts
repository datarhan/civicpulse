import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  validateDedicacionesSnapshot,
  dedicacionForSlug,
  DedicacionesValidationError,
  importeEnNotacionEs,
  textoContieneImporte,
  NOTA_SOLO_ASISTENCIAS,
  type DedicacionesSnapshot,
} from '../src/scraper/dedicaciones'

const SNAP = JSON.parse(
  readFileSync(join(__dirname, '..', 'public', 'data', 'dedicaciones.json'), 'utf8'),
) as DedicacionesSnapshot
const clone = (): DedicacionesSnapshot => JSON.parse(JSON.stringify(SNAP))

/** Importes distintos que el fichero publica, en brackets y byOfficial. */
const importesPublicados = (snap: DedicacionesSnapshot) => [
  ...new Set([...snap.brackets, ...snap.byOfficial].map((r) => r.amountEuros)),
]

/** Una copia del fichero publicado cuya cita SÍ escribe cada importe. */
const citado = (): DedicacionesSnapshot => {
  const c = clone()
  c.source.quote =
    'Cuadro del acuerdo: ' +
    importesPublicados(c)
      .map((n) => `${importeEnNotacionEs(n)[0]} €`)
      .join(' · ')
  c.note = 'Nota de prueba sin afirmación sobre el régimen de quienes no tienen dedicación.'
  return c
}

describe('scraper/dedicaciones — validateDedicacionesSnapshot', () => {
  // ROJA hasta que el curador edite el fichero: el validador exige ya que cada
  // importe esté en la cita y que la nota no diga «solo asistencias». El
  // bloque del final dice qué falla, una prueba por defecto.
  it('accepts the committed curated snapshot', () => {
    expect(() => validateDedicacionesSnapshot(SNAP)).not.toThrow()
  })

  it('maps the 7 dedicación officials (mayor + 6), 14 sin dedicación', () => {
    expect(SNAP.byOfficial.length).toBe(7)
    expect(SNAP.sinDedicacionCount).toBe(14)
    expect(7 + 14).toBe(21)
  })

  it('every per-official amount matches a published bracket', () => {
    const brackets = new Set(SNAP.brackets.map((b) => b.amountEuros))
    for (const o of SNAP.byOfficial) expect(brackets.has(o.amountEuros)).toBe(true)
  })

  it('attributes the alcalde figure and the two pay tiers', () => {
    expect(dedicacionForSlug(SNAP, 'robert-raga-gadea')?.amountEuros).toBe(59195.48)
    const tiers = SNAP.byOfficial
      .filter((o) => o.slug !== 'robert-raga-gadea')
      .map((o) => o.amountEuros)
    expect(tiers.filter((a) => a === 47978.79).length).toBe(2)
    expect(tiers.filter((a) => a === 43327.07).length).toBe(4)
  })

  it('carries a verbatim citation to the acuerdo', () => {
    expect(SNAP.source.quote.length).toBeGreaterThanOrEqual(20)
    expect(SNAP.source.url).toMatch(/\.pdf$/i)
    expect(SNAP.source.date).toBe('2026-03-16')
  })

  it('rejects an out-of-band amount on a named official (libel guard)', () => {
    const bad = citado()
    bad.byOfficial.push({ slug: 'x', amountEuros: 99999, dedicacion: 'exclusiva', role: 'x' })
    expect(() => validateDedicacionesSnapshot(bad)).toThrow(/not one of the published brackets/)
  })

  it('rejects a source without a verbatim quote', () => {
    const bad = citado()
    bad.source.quote = 'short'
    expect(() => validateDedicacionesSnapshot(bad)).toThrow(DedicacionesValidationError)
  })
})

// ---------------------------------------------------------------------------
// Guardas de cita (contrato del validador, sobre ficheros sintéticos).
// ---------------------------------------------------------------------------

describe('scraper/dedicaciones — cada importe publicado está en la cita', () => {
  it('acepta un fichero cuya cita escribe cada importe', () => {
    expect(() => validateDedicacionesSnapshot(citado())).not.toThrow()
  })

  it('rechaza un importe que la cita no escribe', () => {
    const bad = citado()
    const [primero] = importesPublicados(bad)
    bad.source.quote = bad.source.quote.replace(importeEnNotacionEs(primero)[0], '—')
    expect(() => validateDedicacionesSnapshot(bad)).toThrow(/not written in source\.quote/)
  })

  it('acepta el importe en un pasaje aparte del mismo documento (amountQuotes)', () => {
    const c = citado()
    const [primero] = importesPublicados(c)
    const escrito = importeEnNotacionEs(primero)[0]
    c.source.quote = c.source.quote.replace(escrito, '—')
    c.source.amountQuotes = [`Pasaje copiado del acta con la cifra ${escrito} €`]
    expect(() => validateDedicacionesSnapshot(c)).not.toThrow()
  })

  it('rechaza un pasaje de amountQuotes demasiado corto para ser una cita', () => {
    const c = citado()
    c.source.amountQuotes = ['1,00 €']
    expect(() => validateDedicacionesSnapshot(c)).toThrow(/amountQuotes/)
  })

  it('la cifra tiene que estar entera: ni dentro de otra ni con más decimales', () => {
    expect(textoContieneImporte('total 47.978,79 €', 47978.79)).toBe(true)
    expect(textoContieneImporte('total 47978,79 €', 47978.79)).toBe(true)
    expect(textoContieneImporte('total 147.978,79 €', 47978.79)).toBe(false)
    expect(textoContieneImporte('total 47.978,795 €', 47978.79)).toBe(false)
    expect(textoContieneImporte('total 47.978,99 €', 47978.79)).toBe(false)
  })
})

describe('scraper/dedicaciones — la nota no dice «solo asistencias»', () => {
  // El acuerdo de 07/07/2023 (pleno-transcripts/16ujrlm.txt, TERCERO y CUARTO)
  // paga además cada boda celebrada, la asistencia a otros órganos y dietas.
  it('rechaza «solo asistencias» y sus variantes', () => {
    for (const nota of [
      'Los otros 14 concejales no tienen dedicación y perciben solo asistencias por sesión.',
      'perciben sólo las asistencias',
      'y únicamente asistencias',
    ]) {
      const bad = citado()
      bad.note = nota
      expect(NOTA_SOLO_ASISTENCIAS.test(nota)).toBe(true)
      expect(() => validateDedicacionesSnapshot(bad)).toThrow(/ONLY session attendance/)
    }
  })

  it('acepta una nota que describe el régimen sin «solo»', () => {
    const c = citado()
    c.note =
      'Quienes no tienen dedicación perciben, según el acuerdo, asistencias por sesión, una cantidad por boda celebrada y dietas.'
    expect(() => validateDedicacionesSnapshot(c)).not.toThrow()
  })
})

// ---------------------------------------------------------------------------
// ROJAS A PROPÓSITO hasta que el curador edite public/data/dedicaciones.json
// (fichero curado: lo edita una persona a mano en el PR, nunca un script).
// Cada una nombra el defecto publicado que la pone roja.
// ---------------------------------------------------------------------------

const ACUERDO_2023 = readFileSync(
  join(__dirname, '..', 'public', 'data', 'pleno-transcripts', '16ujrlm.txt'),
  'utf8',
)

/** El PRIMERO del acuerdo de 07/07/2023, sin marcas de tiempo ni números de página. */
function primeroDelAcuerdo2023(): string {
  const lineas = ACUERDO_2023.split('\n').map((l) => l.replace(/^\[[^\]]*\]\s?/, ''))
  const ini = lineas.findIndex((l) => l.startsWith('PRIMERO.- Fijar el siguiente régimen'))
  const fin = lineas.findIndex((l, i) => i > ini && l.startsWith('SEGUNDO.-'))
  expect(ini).toBeGreaterThan(-1)
  expect(fin).toBeGreaterThan(ini)
  return lineas
    .slice(ini, fin)
    .filter((l) => !/^\d+$/.test(l.trim()))
    .join(' ')
    .replace(/\s+/g, ' ')
}

describe('public/data/dedicaciones.json — ROJO hasta la edición del curador', () => {
  it('cada importe publicado está escrito en la cita de la fuente', () => {
    const pasajes = [SNAP.source.quote, ...(SNAP.source.amountQuotes ?? [])]
    const sinCita = importesPublicados(SNAP).filter(
      (n) => !pasajes.some((q) => textoContieneImporte(q, n)),
    )
    expect(importesPublicados(SNAP).length).toBeGreaterThan(0)
    expect(sinCita.map((n) => importeEnNotacionEs(n)[0])).toEqual([])
  })

  it('la nota no dice que quienes no tienen dedicación cobran «solo asistencias»', () => {
    expect(SNAP.note ?? '').not.toMatch(NOTA_SOLO_ASISTENCIAS)
  })

  it('la nota no apoya la atribución en las áreas de officials.json', () => {
    // Las áreas que el acuerdo da a la 1ª Tenencia («Territorio, Agenda
    // Urbana y Servicios Públicos») no comparten ninguna con las carteras que
    // officials.json da a quien la ocupa; la atribución es correcta por la
    // Res. 2512/2023, no por las áreas.
    expect(SNAP.note ?? '').not.toMatch(/officials\.json/)
  })

  it('cada puesto se nombra con las palabras del acuerdo', () => {
    const primero = primeroDelAcuerdo2023()
    expect(primero.length).toBeGreaterThan(200)
    const noLiterales = SNAP.byOfficial
      .map((o) => o.role.replace(/\s+/g, ' ').trim())
      .filter((role) => !primero.includes(role))
    expect(noLiterales).toEqual([])
  })
})
