import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  ZONA_PRINCIPAL,
  definicionesAnexo,
  filasRibaRoja,
  formatoAnexo,
  normalizarZona,
  serieZona,
  type FilaRecuento,
} from '../src/scraper/informe-agua'

/**
 * Rebanadas REALES del Anexo I («Listado de zonas de abastecimiento») del
 * informe anual «Calidad del agua de consumo humano en España» del Ministerio
 * de Sanidad, años 2021–2024, sacadas con `pdftotext -layout` el 22-10-2026:
 * la cabecera de la tabla, las definiciones de esa página y las filas de
 * Riba-roja, más la de RIBA-ROJA D'EBRE (Tarragona) como señuelo.
 *
 * Lo que el contrato fija:
 *  - El formato cambió en 2023: hasta 2022, recuentos (apto / no apto / sin
 *    calificar / total); desde 2023, sólo «% Aptos». No se convierte uno en
 *    otro: un 99,1 % no dice cuántos fueron «no apto» y cuántos «sin calificar».
 *  - Las definiciones cambian de un año a otro («Aptos… y Aptos con no
 *    conformidad» en 2021, «Aptos para el consumo» en 2022) y viajan tal cual.
 *  - Una fila sin cifras es null, no ceros; y apto + no apto + sin calificar
 *    tiene que dar el total, o la lectura de columnas está mal.
 */
const fx = (y: number) =>
  readFileSync(join(__dirname, 'fixtures', `sanidad-anexo-zonas_${y}.txt`), 'utf8')

describe('formatoAnexo y definiciones', () => {
  it('recuento hasta 2022, porcentaje desde 2023', () => {
    expect(formatoAnexo(fx(2021))).toBe('recuento')
    expect(formatoAnexo(fx(2022))).toBe('recuento')
    expect(formatoAnexo(fx(2023))).toBe('porcentaje')
    expect(formatoAnexo(fx(2024))).toBe('porcentaje')
    expect(() => formatoAnexo('una tabla cualquiera')).toThrow()
  })

  it('las definiciones de cada año, tal cual', () => {
    expect(definicionesAnexo(fx(2021))).toEqual({
      apto: 'Boletines Aptos para el consumo y Aptos con no conformidad',
      noApto: 'Boletines No Aptos para el consumo y No Aptos con riesgos para la salud',
    })
    expect(definicionesAnexo(fx(2022)).apto).toBe('Boletines Aptos para el consumo')
  })
})

describe('filasRibaRoja', () => {
  it('2021: las cinco zonas, con población y recuentos; el señuelo de Tarragona fuera', () => {
    const f = filasRibaRoja(fx(2021))
    expect(f).toHaveLength(5)
    const principal = f.find((x) => x.zonaNormalizada === ZONA_PRINCIPAL)!
    expect(principal).toMatchObject({
      zona: 'RIBA - ROJA DE TURIA 1',
      poblacion: 20465,
      apto: 430,
      noApto: 55,
      sinCalificar: 0,
      total: 485,
    })
    expect(f.find((x) => x.zona.includes('OLIVERAL'))).toMatchObject({ noApto: 55, total: 456 })
  })

  it('2022: la zona principal aparece dos veces, con y sin población; la fila vacía es null', () => {
    const f = filasRibaRoja(fx(2022))
    expect(f.some((x) => x.zona.includes("D'EBRE"))).toBe(false)
    const principales = f.filter(
      (x): x is FilaRecuento => x.formato === 'recuento' && x.zonaNormalizada === ZONA_PRINCIPAL,
    )
    expect(principales.map((x) => [x.poblacion, x.total])).toEqual([
      [null, 173],
      [21584, 558],
    ])
    const vacia = f.find((x) => x.zona.includes('ENTRE NARANJOS'))!
    expect(vacia).toMatchObject({ apto: null, noApto: null, total: null })
  })

  it('2023 y 2024: boletines, % de aptos y población; «-» es null', () => {
    const p23 = filasRibaRoja(fx(2023)).find((x) => x.zonaNormalizada === ZONA_PRINCIPAL)!
    expect(p23).toMatchObject({ boletines: 830, pctAptos: 99.1, poblacion: 21787 })
    const f24 = filasRibaRoja(fx(2024))
    expect(f24.find((x) => x.zonaNormalizada === ZONA_PRINCIPAL)).toMatchObject({
      boletines: 1037,
      pctAptos: 99.2,
    })
    expect(f24.find((x) => x.zona.includes('COLEGIO'))).toMatchObject({
      boletines: null,
      pctAptos: null,
      poblacion: null,
    })
    expect(f24.find((x) => x.zona.includes('ENTRE NARANJOS'))).toMatchObject({
      boletines: 11,
      pctAptos: 88.9,
      poblacion: null,
    })
  })

  it('si las columnas no cuadran, lanza en vez de publicar', () => {
    const roto = fx(2021).replace(
      '430        55               0         485',
      '430        55               0         999',
    )
    expect(() => filasRibaRoja(roto)).toThrow(/no suma/)
  })
})

describe('normalizarZona y serieZona', () => {
  it('«RIBA - ROJA DE TURIA 1» y «RIBA-ROJA DE TURIA 1» son la misma zona', () => {
    expect(normalizarZona('RIBA - ROJA DE TURIA 1')).toBe(ZONA_PRINCIPAL)
    expect(normalizarZona('RIBA-ROJA DE TURIA 1')).toBe(ZONA_PRINCIPAL)
  })

  it('un año por fila; las filas repetidas de un año de recuento se suman y se dice', () => {
    const anios = [2021, 2022, 2023, 2024].map((anio) => ({
      anio,
      formato: formatoAnexo(fx(anio)),
      filas: filasRibaRoja(fx(anio)),
    }))
    const s = serieZona(anios, ZONA_PRINCIPAL)
    expect(s).toEqual([
      { anio: 2021, formato: 'recuento', noApto: 55, total: 485, sinCalificar: 0, filas: 1 },
      { anio: 2022, formato: 'recuento', noApto: 0, total: 731, sinCalificar: 19, filas: 2 },
      { anio: 2023, formato: 'porcentaje', boletines: 830, pctAptos: 99.1, filas: 1 },
      { anio: 2024, formato: 'porcentaje', boletines: 1037, pctAptos: 99.2, filas: 1 },
    ])
  })
})
