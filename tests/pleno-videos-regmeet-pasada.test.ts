/**
 * Las decisiones de `scrape:pleno-videos-regmeet` que pueden perder un vídeo o
 * inventar un «sin vídeo». Sin red: el módulo es puro.
 */
import { describe, it, expect } from 'vitest'
import {
  desenlaceVideo,
  puedeEscribirVideos,
  selloDePaginas,
  type FilaVideoRegmeet,
} from '../src/scraper/pleno-videos-regmeet-pasada'
import { LECTURAS_VIDEO_REGMEET } from '../src/scraper/regmeet-video'

const DIA = '2026-10-27'
const fila = (o: Partial<FilaVideoRegmeet> = {}): FilaVideoRegmeet => ({
  plenoId: '1237hbp',
  fecha: '2026-07-03',
  lectura: 'con-video',
  ytId: 'L6Cy1hTrpIc',
  url: 'https://www.youtube.com/watch?v=L6Cy1hTrpIc',
  comprobadoEl: '2026-10-20',
  ...o,
})
const lee = (lectura: (typeof LECTURAS_VIDEO_REGMEET)[number], ytId: string | null = null) => ({
  plenoId: '1237hbp',
  fecha: '2026-07-03',
  descargadaEl: DIA,
  lectura,
  ytId,
  url: ytId ? `https://www.youtube.com/watch?v=${ytId}` : null,
})

describe('desenlaceVideo', () => {
  it('un vídeo leído se escribe con el día en que se descargó la página', () => {
    const r = desenlaceVideo({ ...lee('con-video', 'L6Cy1hTrpIc'), anterior: null })
    expect(r.desenlace).toBe('con-video')
    expect(r.fila).toEqual(fila({ comprobadoEl: DIA }))
    expect(r.cambiado).toBe(false)
  })

  it('una sesión sin vídeo es una observación con fecha, no una ausencia', () => {
    const r = desenlaceVideo({ ...lee('sin-video'), anterior: null })
    expect(r.desenlace).toBe('sin-video')
    expect(r.fila).toEqual(fila({ lectura: 'sin-video', ytId: null, url: null, comprobadoEl: DIA }))
  })

  it('una página sin marcador o ilegible conserva la fila anterior, y sin ella no inventa una', () => {
    const anterior = fila()
    for (const lectura of ['sin-marcador', 'ilegible'] as const) {
      const r = desenlaceVideo({ ...lee(lectura), anterior })
      expect(r.desenlace).toBe(lectura)
      expect(r.fila).toBe(anterior)
      expect(desenlaceVideo({ ...lee(lectura), anterior: null }).fila).toBeNull()
    }
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
  const base = { sesiones: 63, leidas: 20, sinMarcador: 0, ilegibles: 0 }

  it('escribe una pasada normal', () => {
    expect(puedeEscribirVideos(base)).toEqual({ ok: true, motivo: null })
  })

  it('sin una sola página en la caché no escribe: no ha comprobado nada', () => {
    const r = puedeEscribirVideos({ ...base, leidas: 0 })
    expect(r.ok).toBe(false)
    expect(r.motivo).toMatch(/scrape:pleno-actas/)
  })

  it('con la mitad de lo leído sin marcador o ilegible no escribe', () => {
    // Una página de reto servida con 200 no lleva marcador.
    expect(puedeEscribirVideos({ ...base, sinMarcador: 10 }).ok).toBe(false)
    expect(puedeEscribirVideos({ ...base, sinMarcador: 5, ilegibles: 5 }).ok).toBe(false)
    expect(puedeEscribirVideos({ ...base, sinMarcador: 9 }).ok).toBe(true)
  })

  it('sin sesiones de regmeet no hay nada que escribir', () => {
    expect(puedeEscribirVideos({ ...base, sesiones: 0 }).ok).toBe(false)
  })
})

describe('selloDePaginas', () => {
  it('el fichero lleva la fecha de su página más reciente, no la de la pasada', () => {
    // Si la pasada de actas deja de bajar páginas, el sello envejece con ellas.
    expect(
      selloDePaginas([
        '2026-10-20T05:46:02.000Z',
        '2026-10-27T07:25:13.000Z',
        '2026-10-19T05:45:58.000Z',
      ]),
    ).toBe('2026-10-27T07:25:13.000Z')
  })

  it('sin páginas no hay sello que poner', () => {
    expect(selloDePaginas([])).toBeNull()
  })
})
