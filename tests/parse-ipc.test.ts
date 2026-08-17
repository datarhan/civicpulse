import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  parseSerieIpc,
  mediasAnuales,
  aEurosConstantes,
  factorDeflactor,
  MESES_POR_ANIO_COMPLETO,
} from '../src/scraper/ipc'

// Payload real de la API JSON (Tempus3) del INE, tabla 24077 «Índice general
// nacional», tal cual lo devolvió el 2026-08-16 con ?nult=200. Sin recortar.
const FIXTURE = join(__dirname, 'fixtures', 'ine_ipc_general_2026-08.json')
const CRUDO = JSON.parse(readFileSync(FIXTURE, 'utf8'))

describe('scraper/ipc', () => {
  it('leyó la serie, no una cáscara vacía', () => {
    const puntos = parseSerieIpc(CRUDO)
    expect(puntos.length).toBeGreaterThan(150)
    // Cada punto es un mes con año e índice; nada de nulos colados.
    for (const p of puntos.slice(0, 20)) {
      expect(Number.isFinite(p.valor)).toBe(true)
      expect(p.anio).toBeGreaterThan(2000)
    }
  })

  it('sólo promedia años con los doce meses', () => {
    const medias = mediasAnuales(parseSerieIpc(CRUDO))
    // El fixture empieza en diciembre de 2009 y acaba a mitad de 2026: ni el
    // primero ni el último están completos, y un año a medias no es una media
    // anual. Publicarlo sería inventarse el índice de un año en curso.
    expect(medias[2009]).toBeUndefined()
    expect(medias[2026]).toBeUndefined()
    expect(medias[2014]).toBeDefined()
    expect(medias[2024]).toBeDefined()
  })

  it('reproduce la base declarada por el INE (2025 = 100)', () => {
    const medias = mediasAnuales(parseSerieIpc(CRUDO))
    expect(medias[2025]).toBeCloseTo(100, 2)
  })

  it('mide la inflación acumulada 2014→2024 que publica el INE', () => {
    const medias = mediasAnuales(parseSerieIpc(CRUDO))
    const acumulada = (medias[2024] / medias[2014] - 1) * 100
    // 22,8 % según la propia serie. El margen es de redondeo, no de criterio:
    // si el INE revisa el índice esta prueba debe romperse y decirlo.
    expect(acumulada).toBeGreaterThan(22)
    expect(acumulada).toBeLessThan(24)
  })

  it('deflacta hacia el año base, y el año base no se mueve', () => {
    const medias = mediasAnuales(parseSerieIpc(CRUDO))
    // Un euro de 2024 sigue siendo un euro de 2024.
    expect(aEurosConstantes(100, 2024, 2024, medias)).toBeCloseTo(100, 6)
    // Un euro de 2014 vale MÁS en euros de 2024, porque los precios subieron.
    expect(aEurosConstantes(100, 2014, 2024, medias)).toBeGreaterThan(100)
    // Y exactamente lo que dice el índice, sin redondeos de conveniencia.
    expect(aEurosConstantes(100, 2014, 2024, medias)).toBeCloseTo(
      100 * (medias[2024] / medias[2014]),
      6,
    )
  })

  it('devuelve null cuando falta el índice de un año, en vez de inventarlo', () => {
    const medias = mediasAnuales(parseSerieIpc(CRUDO))
    // 1998 no está en el fixture. Un deflactor que no existe no es 1.
    expect(factorDeflactor(1998, 2024, medias)).toBeNull()
    expect(aEurosConstantes(100, 1998, 2024, medias)).toBeNull()
    // Y el año base tampoco puede faltar.
    expect(factorDeflactor(2014, 1998, medias)).toBeNull()
  })

  it('el umbral de meses completos es explícito, no un número suelto', () => {
    expect(MESES_POR_ANIO_COMPLETO).toBe(12)
  })
})
