/**
 * Las decisiones de `scrape:pleno-videos-regmeet` que pueden perder un vídeo o
 * inventar un «sin vídeo». Sin red: el módulo es puro.
 */
import { describe, it, expect } from 'vitest'
import {
  VIDEO_NUEVAS_POR_PASADA,
  VIDEO_ROTACION_POR_PASADA,
  VIDEO_SIEMPRE_RECIENTES,
  desenlaceVideo,
  planDePasada,
  puedeEscribirVideos,
  type FilaVideoRegmeet,
} from '../src/scraper/pleno-videos-regmeet-pasada'
import { LECTURAS_VIDEO_REGMEET } from '../src/scraper/regmeet-video'

const HOY = '2026-10-27'
const fila = (o: Partial<FilaVideoRegmeet> = {}): FilaVideoRegmeet => ({
  plenoId: '1237hbp',
  fecha: '2026-07-03',
  lectura: 'con-video',
  ytId: 'L6Cy1hTrpIc',
  url: 'https://www.youtube.com/watch?v=L6Cy1hTrpIc',
  comprobadoEl: '2026-10-20',
  ...o,
})
const lee = (
  lectura: (typeof LECTURAS_VIDEO_REGMEET)[number] | null,
  ytId: string | null = null,
) => ({
  plenoId: '1237hbp',
  fecha: '2026-07-03',
  hoy: HOY,
  lectura,
  ytId,
  url: ytId ? `https://www.youtube.com/watch?v=${ytId}` : null,
})

describe('planDePasada', () => {
  const sesiones = (n: number, leidas: boolean) =>
    Array.from({ length: n }, (_, i) => ({ id: `s${i}`, leida: leidas }))

  it('pide siempre las más recientes y rota el resto: el archivo entero se relee', () => {
    const n = 63
    const vistas = new Set<number>()
    const dias = Math.ceil((n - VIDEO_SIEMPRE_RECIENTES) / VIDEO_ROTACION_POR_PASADA)
    for (let d = 0; d < dias; d++) {
      const plan = planDePasada({ sesiones: sesiones(n, true), dia: 700 + d, completo: false })
      const pedidas = plan.flatMap((p, i) => (p === 'pedir' ? [i] : []))
      expect(pedidas.length).toBe(VIDEO_SIEMPRE_RECIENTES + VIDEO_ROTACION_POR_PASADA)
      for (let i = 0; i < VIDEO_SIEMPRE_RECIENTES; i++) expect(plan[i]).toBe('pedir')
      for (const i of pedidas) vistas.add(i)
    }
    expect(vistas.size).toBe(n)
  })

  it('la primera pasada no pide las 63 de golpe: las nunca leídas entran por cupo', () => {
    const plan = planDePasada({ sesiones: sesiones(63, false), dia: 700, completo: false })
    const pedidas = plan.filter((p) => p === 'pedir').length
    expect(pedidas).toBe(VIDEO_SIEMPRE_RECIENTES + VIDEO_NUEVAS_POR_PASADA)
    expect(plan.filter((p) => p === 'pendiente').length).toBe(63 - pedidas)
    expect(plan).not.toContain('conservar')
  })

  it('--completo las pide todas', () => {
    expect(planDePasada({ sesiones: sesiones(63, false), dia: 700, completo: true })).toEqual(
      Array(63).fill('pedir'),
    )
  })
})

describe('desenlaceVideo', () => {
  it('un vídeo leído se escribe con la fecha de hoy', () => {
    const r = desenlaceVideo({ ...lee('con-video', 'L6Cy1hTrpIc'), anterior: null })
    expect(r.desenlace).toBe('con-video')
    expect(r.fila).toEqual(fila({ comprobadoEl: HOY }))
    expect(r.cambiado).toBe(false)
  })

  it('una sesión sin vídeo es una observación con fecha, no una ausencia', () => {
    const r = desenlaceVideo({ ...lee('sin-video'), anterior: null })
    expect(r.desenlace).toBe('sin-video')
    expect(r.fila).toEqual(fila({ lectura: 'sin-video', ytId: null, url: null, comprobadoEl: HOY }))
  })

  it('una descarga fallida, una página sin marcador o ilegible conservan la fila anterior', () => {
    const anterior = fila()
    for (const lectura of [null, 'sin-marcador', 'ilegible'] as const) {
      const r = desenlaceVideo({ ...lee(lectura), anterior })
      expect(r.desenlace).toBe(lectura ?? 'fallida')
      expect(r.fila).toBe(anterior)
    }
    // Y sin fila anterior no inventan una: la sesión sigue sin leer.
    expect(desenlaceVideo({ ...lee('sin-marcador'), anterior: null }).fila).toBeNull()
  })

  it('un vídeo que estaba y ya no está es un fallo de lectura hasta que una persona diga otra cosa', () => {
    const anterior = fila()
    const r = desenlaceVideo({ ...lee('sin-video'), anterior })
    expect(r.desenlace).toBe('desaparecido')
    expect(r.fila).toBe(anterior)
    expect(r.motivo).toContain('L6Cy1hTrpIc')
  })

  it('un vídeo que cambia se escribe y se dice', () => {
    const r = desenlaceVideo({ ...lee('con-video', 'EKoMiCY-HUk'), anterior: fila() })
    expect(r.desenlace).toBe('con-video')
    expect(r.fila?.ytId).toBe('EKoMiCY-HUk')
    expect(r.cambiado).toBe(true)
    expect(r.motivo).toMatch(/L6Cy1hTrpIc.*EKoMiCY-HUk/)
  })
})

describe('puedeEscribirVideos', () => {
  const base = {
    sesiones: 63,
    tocaban: 11,
    fallidas: 0,
    sinMarcador: 0,
    ilegibles: 0,
    sinIntentar: 0,
  }

  it('escribe una pasada normal', () => {
    expect(puedeEscribirVideos(base)).toEqual({ ok: true, motivo: null })
  })

  it('no escribe con media pasada perdida, cuente como cuente la pérdida', () => {
    expect(puedeEscribirVideos({ ...base, sinIntentar: 11 }).ok).toBe(false)
    expect(puedeEscribirVideos({ ...base, fallidas: 3, sinIntentar: 3 }).ok).toBe(false)
    // Una página de reto servida con 200 no lleva marcador: si es la mitad, no se escribe.
    expect(puedeEscribirVideos({ ...base, sinMarcador: 6 }).ok).toBe(false)
    expect(puedeEscribirVideos({ ...base, ilegibles: 6 }).ok).toBe(false)
    expect(puedeEscribirVideos({ ...base, fallidas: 5 }).ok).toBe(true)
  })

  it('sin sesiones de regmeet no hay nada que escribir', () => {
    expect(puedeEscribirVideos({ ...base, sesiones: 0, tocaban: 0 }).ok).toBe(false)
  })
})
