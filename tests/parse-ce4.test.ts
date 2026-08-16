import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseCe4, programaCe4CasaCon } from '../src/scraper/coste-efectivo'

// Rebanada real del libro CCAA-17 de 2024: preámbulo y cabecera verbatim, las
// cuatro filas que sirven a Riba-roja (todas en CE4b) y seis de otros
// municipios por hoja, para que el filtrado tenga algo que filtrar.
const FIXTURE = join(__dirname, 'fixtures', 'cesel_ce4_2024_slice.xlsx')
const filas = parseCe4(readFileSync(FIXTURE), { anio: 2024 })

describe('scraper/coste-efectivo · CE4 (servicios supramunicipales)', () => {
  it('leyó las dos hojas, no una cáscara', () => {
    expect(filas.length).toBeGreaterThanOrEqual(10)
    for (const f of filas.slice(0, 5)) {
      expect(f.anio).toBe(2024)
      expect(f.entePrincipal.length).toBeGreaterThan(3)
      expect(f.programa.length).toBeGreaterThan(2)
      // «Sax» existe: tres letras de municipio real. El listón va en 2.
      expect(f.municipioServido.length).toBeGreaterThan(2)
    }
  })

  it('encuentra las cuatro filas que sirven a Riba-roja, con su ente y su programa', () => {
    const rr = filas.filter((f) => /riba-?roja/i.test(f.municipioServido))
    expect(rr).toHaveLength(4)
    for (const f of rr) expect(f.entePrincipal).toMatch(/Camp de Turia/i)
    expect(rr.map((f) => f.programa).sort()).toEqual([
      '337/330P',
      '341/340P',
      '4311/430P',
      '432/430P',
    ])
    const deporte = rr.find((f) => f.programa === '341/340P')!
    expect(deporte.descripcion).toMatch(/promoci[oó]n del deporte/i)
  })

  it('los programas de CE4 casan con las claves del registro pese al prefijo a/b', () => {
    // CE4 publica «341/340P» y el registro indexa «b341/340P»: sin esta
    // traducción la salvedad de la tarjeta de deporte no se dispararía nunca,
    // en silencio.
    expect(programaCe4CasaCon('341/340P', 'b341/340P')).toBe(true)
    expect(programaCe4CasaCon('432/430P', 'b432/430P')).toBe(true)
    expect(programaCe4CasaCon('341/340P', 'a342/340P')).toBe(false)
    // Y nunca al revés de más: un programa distinto no casa por parecerse.
    expect(programaCe4CasaCon('4311/430P', 'b432/430P')).toBe(false)
  })

  it('no inventa filas: un libro sin hojas CE4 devuelve vacío, no lanza', () => {
    // El fixture de informes por ente no trae CE4; el parser tiene que decir
    // «nada» y no romper la pasada entera.
    const sinCe4 = join(__dirname, 'fixtures', 'cesel_informe_46214_2024.xlsx')
    expect(parseCe4(readFileSync(sinCe4), { anio: 2024 })).toEqual([])
  })
})
