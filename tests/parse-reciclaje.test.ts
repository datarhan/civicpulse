import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseTasasResiduos, tasaSelectiva } from '../src/scraper/reciclaje'

/**
 * Rebanada REAL del WFS del ICV (capa 0503_Residuos,
 * ms:TasasGeneracion.Municipios_wfs, descargada el 17-08-2026): cabecera y
 * cuatro municipios con la geometría recortada a un stub — el parser la
 * descarta y 1,4 MB de multipolígono no son contrato de nada. Los números van
 * con PUNTO decimal (en-US), no es-ES: 610.025 kg/hab son seiscientos diez,
 * comprobado contra rum_tn·1000/habitantes.
 *
 * La edición no la declara la capa (abstracts genéricos): se estableció
 * MIDIENDO — los habitantes del fichero para Riba-roja (23.050) coinciden
 * exactamente con el padrón INE de 2022 de la serie de criminalidad.
 */
const CSV = readFileSync(join(__dirname, 'fixtures/residuos_icv_2022_slice.csv'), 'utf8')

describe('parseTasasResiduos', () => {
  const filas = parseTasasResiduos(CSV)

  it('lee las filas y descarta la geometría', () => {
    expect(filas.length).toBe(4)
    for (const f of filas) expect(JSON.stringify(f)).not.toContain('MULTIPOLYGON')
  })

  it('Riba-roja trae las cinco fracciones tal cual publica el ICV', () => {
    const rr = filas.find((f) => f.ine === '46214')!
    expect(rr.nombre).toBe('Riba-roja de Túria')
    expect(rr.habitantes).toBe(23050)
    expect(rr.consorcio).toBe('V3')
    expect(rr.rumTn).toBeCloseTo(10539, 5)
    expect(rr.forsTn).toBeCloseTo(27, 5)
    expect(rr.vidrioTn).toBeCloseTo(293.2, 5)
    expect(rr.eellTn).toBeCloseTo(212, 5)
    expect(rr.pycTn).toBeCloseTo(223.5, 5)
  })

  it('el punto es decimal, no millar: kg/hab ≈ tn·1000/habitantes', () => {
    // La comprobación que fija la lectura en-US: si 610.025 se leyera como
    // seiscientos diez mil, esta identidad se rompe por tres órdenes.
    const alfas = filas.find((f) => f.ine === '03011')!
    expect((alfas.rumTn * 1000) / alfas.habitantes).toBeCloseTo(610.025, 1)
  })

  it('una fracción vacía es null, no cero', () => {
    // Alfàs no declara FORS (campo vacío): decir 0 afirmaría «recogió cero
    // orgánica», que es una medición que la fuente no hace.
    const alfas = filas.find((f) => f.ine === '03011')!
    expect(alfas.forsTn).toBeNull()
  })
})

describe('tasaSelectiva', () => {
  const filas = parseTasasResiduos(CSV)

  it('la parte selectiva sobre el total, con las fracciones ausentes fuera de la suma', () => {
    const rr = filas.find((f) => f.ine === '46214')!
    const t = tasaSelectiva(rr)!
    // (27 + 293,2 + 212 + 223,5) / (esa suma + 10.539) ≈ 6,69 %
    expect(t.selectivaTn).toBeCloseTo(755.7, 1)
    expect(t.totalTn).toBeCloseTo(11294.7, 1)
    expect(t.pct).toBeCloseTo(6.69, 1)
  })

  it('sin RUM no hay tasa: null, nunca un porcentaje inventado', () => {
    const sinRum = { ...filas[0], rumTn: null }
    expect(tasaSelectiva(sinRum)).toBeNull()
  })
})
