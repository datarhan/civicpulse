import { describe, it, expect } from 'vitest'
import { parteBarrido } from '../scripts/buscar-bop-historico'

/**
 * El barrido histórico salía 0 con «0 coincidencias» tras leer boletines de
 * los que no había sabido extraer NINGÚN anuncio (28/04/2015: 306 páginas,
 * 0 anuncios, control RAGA GADEA presente en el PDF). Un cero sobre nada
 * leído no mide nada — regla 2 de DATA_INTEGRITY: distinguir «no miré»,
 * «no supe leer» y «no encontré».
 */
describe('parteBarrido', () => {
  const base = {
    diasPedidos: 3,
    diasConBoletin: 2,
    anunciosVistos: 40,
    hallazgos: 0,
    lineas: 0,
    fallos: 0,
  }

  it('sin ningún boletín leído sale 1: no comprobó nada', () => {
    const p = parteBarrido({ ...base, diasConBoletin: 0, anunciosVistos: 0 })
    expect(p.exitCode).toBe(1)
    expect(p.mensaje).toMatch(/ni un boletín/)
  })

  it('con boletines leídos y cero anuncios extraídos sale 1: no supo leer el formato', () => {
    const p = parteBarrido({ ...base, anunciosVistos: 0 })
    expect(p.exitCode).toBe(1)
    expect(p.mensaje).toMatch(/no supo extraer ning[uú]n anuncio/)
    expect(p.mensaje).toMatch(/0 coincidencias.*no mide nada/)
  })

  it('con anuncios leídos y cero coincidencias sale 0: eso sí es un vacío', () => {
    const p = parteBarrido(base)
    expect(p.exitCode).toBe(0)
    expect(p.mensaje).toBe('')
  })

  it('la búsqueda a texto completo cuenta aparte: cero anuncios pero líneas coincidentes no es rojo', () => {
    const p = parteBarrido({ ...base, anunciosVistos: 0, lineas: 2 })
    expect(p.exitCode).toBe(0)
  })
})
