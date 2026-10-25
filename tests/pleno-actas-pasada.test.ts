/**
 * Las dos decisiones de `scrape:pleno-actas` que pueden borrar un índice bueno.
 * Sin red: `src/scraper/pleno-actas-pasada.ts` es puro.
 */
import { describe, it, expect } from 'vitest'
import {
  ROTACION_POR_PASADA,
  SIEMPRE_RECIENTES,
  desenlaceSesion,
  puedeEscribirIndice,
  tocaPedir,
} from '../src/scraper/pleno-actas-pasada'

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

describe('tocaPedir — una pasada diaria no relee las 63 sesiones', () => {
  // Desde el 16-10-2026 regmeet rechaza la conexión (ECONNREFUSED) a mitad de la
  // pasada completa diaria: ~63 páginas, cada una con su 302. Releer cada día
  // sesiones cuya acta firmada ya está indexada no aporta nada y agota el cupo.
  const n = 63
  const pedidas = (dia: number, extra: Partial<Parameters<typeof tocaPedir>[0]> = {}) =>
    Array.from({ length: n }, (_, indice) => indice).filter((indice) =>
      tocaPedir({ indice, sesiones: n, dia, completo: false, faltaTexto: false, ...extra }),
    )

  it('pide las más recientes y una ventana de las demás, no todas', () => {
    const hoy = pedidas(100)
    for (let i = 0; i < SIEMPRE_RECIENTES; i++) expect(hoy).toContain(i)
    expect(hoy).toHaveLength(SIEMPRE_RECIENTES + ROTACION_POR_PASADA)
  })

  it('la rotación recorre todo el archivo en pocos días', () => {
    const resto = n - SIEMPRE_RECIENTES
    const dias = Math.ceil(resto / ROTACION_POR_PASADA)
    expect(dias).toBeLessThanOrEqual(14)
    const vistas = new Set<number>()
    for (let d = 0; d < dias; d++) for (const i of pedidas(500 + d)) vistas.add(i)
    expect(vistas.size).toBe(n)
  })

  it('--completo pide todas; falta de texto en caché obliga a pedirla', () => {
    expect(pedidas(100, { completo: true })).toHaveLength(n)
    expect(pedidas(100, { faltaTexto: true })).toHaveLength(n)
  })

  it('con pocas sesiones no se queda ninguna sin pedir', () => {
    const pocas = Array.from({ length: 4 }, (_, indice) =>
      tocaPedir({ indice, sesiones: 4, dia: 7, completo: false, faltaTexto: false }),
    )
    expect(pocas.every(Boolean)).toBe(true)
  })
})

describe('puedeEscribirIndice — pasada incremental', () => {
  const inc = {
    sesiones: 63,
    tocaban: 12,
    fallidas: 0,
    sinIntentar: 0,
    conActa: 8,
    conservadasConActa: 36,
    previas: 44,
  }
  it('una pasada incremental sana escribe: lo conservado cuenta como acta', () => {
    expect(puedeEscribirIndice(inc).ok).toBe(true)
  })
  it('la mitad se mide sobre lo que tocaba HOY, no sobre las 63', () => {
    const r = puedeEscribirIndice({ ...inc, fallidas: 3, sinIntentar: 3, conActa: 2 })
    expect(r.ok).toBe(false)
    expect(r.motivo).toMatch(/6 de 12/)
  })
  it('el reto con 200 sigue sin vaciar el índice', () => {
    expect(
      puedeEscribirIndice({ ...inc, fallidas: 12, conActa: 0, conservadasConActa: 0 }).ok,
    ).toBe(false)
  })
})
