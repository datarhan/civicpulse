/**
 * Deuda viva municipal — lo que el ayuntamiento DEBE.
 *
 * `/presupuesto` enseña el capítulo «Deuda pública» del presupuesto, que es el
 * dinero apartado para pagar deuda ese año. No es lo mismo que el saldo vivo, y
 * «¿cuánto debe mi ayuntamiento?» es de las primeras preguntas que hace un
 * vecino. El Ministerio lo publica una vez al año, un fichero por ejercicio.
 *
 * Dos trampas, las dos dentro del aparejo:
 *
 * 1. NUNCA por nombre. Buscar «Riba-roja» en el libro encuentra ANTES
 *    `Riba-roja d'Ebre` (Tarragona, 43125), que es otro municipio. La clave es
 *    el código INE: provincia 46 + municipio 214. Es la misma lección que dejó
 *    escrita el raspador del ICV — filtrar por `nom_mun` daba cero.
 *
 * 2. La columna viene en MILES de euros. Publicarla tal cual pondría la deuda
 *    de Riba-roja en nueve mil euros.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseDeudaViva, repartoDeuda, urlsDeuda } from '../src/scraper/deuda-viva'

const FIXTURE = join(__dirname, 'fixtures', 'deuda_viva_ayuntamientos_2025_slice.xlsx')
const buffer = readFileSync(FIXTURE)

describe('parseDeudaViva', () => {
  it('encuentra el municipio por su código INE', () => {
    const d = parseDeudaViva(buffer, { ineCode: '46214' })
    expect(d).not.toBeNull()
    expect(d?.municipio).toMatch(/Riba-roja de Túria/)
    expect(d?.provincia).toBe('VALENCIA')
    expect(d?.ejercicio).toBe(2025)
  })

  it('devuelve euros, no miles de euros', () => {
    const d = parseDeudaViva(buffer, { ineCode: '46214' })
    // 8.996,572 miles € = 8.996.572 €. Un techo y un suelo, no una cifra
    // clavada: el Ministerio revisa las entregas.
    expect(d?.deudaEuros).toBeGreaterThan(1_000_000)
    expect(d?.deudaEuros).toBeLessThan(100_000_000)
    expect(d?.deudaEuros).toBe(8_996_572)
  })

  it('NO confunde Riba-roja de Túria con Riba-roja d’Ebre', () => {
    // El homónimo de Tarragona está dentro del aparejo a propósito.
    const ebre = parseDeudaViva(buffer, { ineCode: '43125' })
    expect(ebre?.municipio).toMatch(/Ebre/)
    expect(ebre?.deudaEuros).not.toBe(parseDeudaViva(buffer, { ineCode: '46214' })?.deudaEuros)
  })

  it('devuelve null si el municipio no está, en vez de una cifra de otro', () => {
    expect(parseDeudaViva(buffer, { ineCode: '28079' })).toBeNull()
  })

  it('lee el ejercicio del propio fichero, no del reloj', () => {
    // Una fecha tomada de `new Date()` haría que este dato mintiera cada enero.
    const d = parseDeudaViva(buffer, { ineCode: '46214' })
    expect(d?.ejercicio).toBe(2025)
    expect(d?.fecha).toBe('2025-12-31')
  })
})

describe('urlsDeuda · el ministerio no nombra igual todas las entregas', () => {
  it('ofrece los dos patrones observados', () => {
    // 2022–2025 son `deuda-viva-ayuntamientos-<AAAA>12.xlsx`; 2021 es
    // `-<AAAA>1231.xlsx`. Con un solo patrón el raspador daba 2021 por «no
    // publicado» teniendo el fichero delante — una ausencia inventada, que es
    // justo lo que este repositorio no puede permitirse informar.
    const u = urlsDeuda(2021)
    expect(u.some((x) => x.endsWith('deuda-viva-ayuntamientos-202112.xlsx'))).toBe(true)
    expect(u.some((x) => x.endsWith('deuda-viva-ayuntamientos-20211231.xlsx'))).toBe(true)
  })

  it('codifica los espacios de la ruta', () => {
    // El directorio se llama «sist financiacion y deuda», con espacios.
    expect(urlsDeuda(2025)[0]).toContain('sist%20financiacion%20y%20deuda')
    expect(urlsDeuda(2025)[0]).not.toMatch(/ /)
  })
})

describe('repartoDeuda', () => {
  it('da el percentil del municipio, no sólo la mediana', () => {
    // Medido: 5.243 de 8.134 ayuntamientos declaran CERO deuda, así que la
    // mediana nacional es 0 € y como comparación no dice nada. Lo que sitúa a
    // un municipio es su percentil y cuántos están a cero.
    const r = repartoDeuda([0, 0, 0, 100, 8_996_572])
    expect(r?.n).toBe(5)
    expect(r?.aCero).toBe(3)
    expect(r?.mediana).toBe(0)
  })

  it('devuelve null con la lista vacía, no un cero', () => {
    expect(repartoDeuda([])).toBeNull()
  })
})
