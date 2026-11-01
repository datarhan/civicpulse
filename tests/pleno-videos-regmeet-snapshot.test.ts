/**
 * La instantánea publicada de `scrape:pleno-videos-regmeet`: que cada fila sea de
 * una sesión que existe, que sólo observe lo que dice observar, y que sus
 * recuentos cuadren — una pasada que no cuadra es una pasada que no hizo lo que
 * dice (DATA_INTEGRITY, regla 2).
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { LECTURAS_VIDEO_REGMEET } from '../src/scraper/regmeet-video'
import { discrepanciasDeVideo } from '../src/scraper/pleno-video-fuentes'
import { indexVideosByPleno } from '../src/hooks/usePlenoVideos'

const lee = (f: string) => JSON.parse(readFileSync(`public/data/${f}`, 'utf8'))
const SNAP = lee('pleno-videos-regmeet.json')
const PLENOS = lee('plenos.json')
const VIDEOS = lee('pleno-videos.json')
const sesiones = new Map<string, { id: string; date: string }>(
  PLENOS.items.map((p: { id: string; date: string }) => [p.id, p]),
)

describe('pleno-videos-regmeet.json', () => {
  it('mide algo: hay sesiones leídas y alguna con vídeo', () => {
    expect(SNAP.items.length).toBeGreaterThan(0)
    expect(SNAP.items.some((f: { lectura: string }) => f.lectura === 'con-video')).toBe(true)
  })

  it('cada fila es de una sesión de plenos.json, con su fecha, una vez', () => {
    const ids = SNAP.items.map((f: { plenoId: string }) => f.plenoId)
    expect(new Set(ids).size).toBe(ids.length)
    for (const f of SNAP.items) {
      expect(sesiones.get(f.plenoId)?.date, f.plenoId).toBe(f.fecha)
    }
  })

  it('una fila sólo observa: con vídeo, o sin él, con el día en que se leyó', () => {
    const observan = LECTURAS_VIDEO_REGMEET.filter((l) => l === 'con-video' || l === 'sin-video')
    for (const f of SNAP.items) {
      expect(observan, f.plenoId).toContain(f.lectura)
      expect(f.comprobadoEl, f.plenoId).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      if (f.lectura === 'con-video') {
        expect(f.ytId, f.plenoId).toMatch(/^[-\w]{11}$/)
        expect(f.url, f.plenoId).toBe(`https://www.youtube.com/watch?v=${f.ytId}`)
      } else {
        expect(f.ytId, f.plenoId).toBeNull()
        expect(f.url, f.plenoId).toBeNull()
      }
    }
  })

  it('los recuentos de la pasada cuadran: cada sesión, en una casilla', () => {
    const s = SNAP.stats
    expect(s.conVideo + s.sinVideo + s.sinMarcador + s.ilegibles + s.desaparecidos).toBe(s.leidas)
    expect(s.leidas + s.sinPagina).toBe(s.sesiones)
    expect(s.conservadas + s.pendientes).toBe(s.sinPagina)
    // Las filas: una por sesión leída alguna vez que observó algo.
    expect(SNAP.items.length).toBeLessThanOrEqual(s.sesiones - s.pendientes)
  })

  it('ningún vídeo de regmeet se pierde en silencio: o /plenos/:id lo enseña, o la sesión discrepa', () => {
    const idx = indexVideosByPleno(VIDEOS, PLENOS, SNAP)
    const enDuda = new Set(
      discrepanciasDeVideo(PLENOS.items, VIDEOS.items, SNAP.items).map((d) => d.plenoId),
    )
    for (const f of SNAP.items) {
      if (f.lectura !== 'con-video') continue
      if (enDuda.has(f.plenoId)) expect(idx.has(f.plenoId), f.plenoId).toBe(false)
      else expect(idx.get(f.plenoId)?.ytId, f.plenoId).toBe(f.ytId)
    }
  })
})
