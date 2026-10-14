/**
 * Las dos decisiones de `scrape:pleno-actas` que pueden borrar un índice bueno.
 * Sin red: `src/scraper/pleno-actas-pasada.ts` es puro.
 */
import { describe, it, expect } from 'vitest'
import { desenlaceSesion, puedeEscribirIndice } from '../src/scraper/pleno-actas-pasada'

const base = {
  documentos: 0,
  hayActa: false,
  algunaFallo: false,
  algunaActaOtraFecha: false,
  teniaActa: false,
}

describe('desenlaceSesion', () => {
  it('una sesión que tenía acta y ahora no enlaza nada es fallida y arrastra (página de reto con 200)', () => {
    const d = desenlaceSesion({ ...base, teniaActa: true })
    expect(d.desenlace).toBe('fallida')
    expect(d.arrastrar).toBe(true)
    expect(d.motivo).toMatch(/tenía acta/)
  })
  it('sin documentos y sin acta previa sigue siendo sinDocumentos', () => {
    expect(desenlaceSesion(base)).toEqual({
      desenlace: 'sinDocumentos',
      arrastrar: false,
      motivo: null,
    })
  })
  it('una descarga fallida es fallida y arrastra; el acta leída gana', () => {
    expect(desenlaceSesion({ ...base, documentos: 1, algunaFallo: true }).desenlace).toBe('fallida')
    expect(
      desenlaceSesion({
        ...base,
        documentos: 2,
        hayActa: true,
        algunaFallo: true,
        teniaActa: true,
      }),
    ).toEqual({ desenlace: 'conActa', arrastrar: false, motivo: null })
  })
  it('acta de otra fecha y sólo otros se distinguen', () => {
    expect(desenlaceSesion({ ...base, documentos: 1, algunaActaOtraFecha: true }).desenlace).toBe(
      'fechaNoCoincide',
    )
    expect(desenlaceSesion({ ...base, documentos: 1 }).desenlace).toBe('soloOtros')
  })
})

describe('puedeEscribirIndice', () => {
  const ok = { sesiones: 63, fallidas: 0, sinIntentar: 0, conActa: 44, previas: 44 }
  it('una pasada normal escribe', () => {
    expect(puedeEscribirIndice(ok).ok).toBe(true)
  })
  it('no escribe con media pasada fallida o sin intentar', () => {
    expect(puedeEscribirIndice({ ...ok, fallidas: 20, sinIntentar: 12 }).ok).toBe(false)
  })
  it('no escribe con menos de la mitad de las actas que había', () => {
    const r = puedeEscribirIndice({ ...ok, conActa: 21 })
    expect(r.ok).toBe(false)
    expect(r.motivo).toMatch(/21 actas leídas frente a 44/)
    expect(puedeEscribirIndice({ ...ok, conActa: 22 }).ok).toBe(true)
  })
  it('el reto servido con 200 a todas las sesiones no vacía el índice', () => {
    // Cada sesión con acta previa pasa a fallida: el cortacircuitos salta.
    expect(puedeEscribirIndice({ ...ok, fallidas: 44, conActa: 0 }).ok).toBe(false)
  })
  it('sin índice previo, la primera pasada escribe; sin sesiones, no', () => {
    expect(puedeEscribirIndice({ ...ok, previas: 0, conActa: 0 }).ok).toBe(true)
    expect(puedeEscribirIndice({ ...ok, sesiones: 0 }).ok).toBe(false)
  })
})
