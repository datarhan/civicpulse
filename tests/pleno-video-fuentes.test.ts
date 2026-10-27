/**
 * El vídeo de cada sesión, de dos fuentes: el canal de YouTube del Ayuntamiento
 * (por la fecha del título) y la página de la sesión en regmeet (por la sesión).
 * Lo que se prueba: cuando las dos hablan y no dicen lo mismo, nadie elige.
 *
 * Filas reales: el canal y las sesiones salen de public/data; las lecturas de
 * regmeet tienen la forma que escribe `parseRegmeetVideo`.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  ESTADOS_VIDEO_SESION,
  FUENTES_VIDEO,
  TIPOS_DISCREPANCIA,
  discrepanciasDeVideo,
  videoDeSesion,
  type FilaRegmeet,
} from '../src/scraper/pleno-video-fuentes'
import { resolveVideoForPleno } from '../src/scraper/pleno-video-match'
import { indexVideosByPleno } from '../src/hooks/usePlenoVideos'

const lee = (f: string) => JSON.parse(readFileSync(`public/data/${f}`, 'utf8'))
const PLENOS = lee('plenos.json')
const VIDEOS = lee('pleno-videos.json')
const sesion = (id: string) => PLENOS.items.find((p: { id: string }) => p.id === id)
const CANAL = VIDEOS.items

// zrbgic (05-10-2026): el canal y regmeet incrustan C7SSTb7q0ys (medido el 26-10-2026).
// 1237hbp (03-07-2026): regmeet incrusta L6Cy1hTrpIc; el canal ya no lo lista.
const ZRBGIC = sesion('zrbgic')
const H1237 = sesion('1237hbp')
const fila = (plenoId: string, ytId: string | null, lectura = 'con-video'): FilaRegmeet => ({
  plenoId,
  fecha: sesion(plenoId).date,
  lectura: lectura as FilaRegmeet['lectura'],
  ytId,
  url: ytId ? `https://www.youtube.com/watch?v=${ytId}` : null,
})

describe('mide algo', () => {
  it('las filas que el test usa están donde dice', () => {
    expect(ZRBGIC?.date).toBe('2026-10-05')
    expect(H1237?.date).toBe('2026-07-03')
    expect(CANAL.some((v: { ytId: string }) => v.ytId === 'C7SSTb7q0ys')).toBe(true)
    expect(CANAL.some((v: { ytId: string }) => v.ytId === 'L6Cy1hTrpIc')).toBe(false)
    expect(CANAL.some((v: { plenoDate: string }) => v.plenoDate === H1237.date)).toBe(false)
  })
})

describe('videoDeSesion', () => {
  it('coinciden: el vídeo del canal, con su título, y las dos fuentes', () => {
    const r = videoDeSesion(ZRBGIC, CANAL, [fila('zrbgic', 'C7SSTb7q0ys')])
    expect(r.estado).toBe('coinciden')
    expect(r.video).toMatchObject({
      ytId: 'C7SSTb7q0ys',
      url: 'https://www.youtube.com/watch?v=C7SSTb7q0ys',
      fuentes: ['canal', 'regmeet'],
    })
    expect(r.video?.title).toMatch(/^Ple Ordinari 5 d/)
    expect(r.discrepancias).toEqual([])
  })

  it('sólo regmeet: la sesión que el canal ya no lista recupera su vídeo, sin título', () => {
    const r = videoDeSesion(H1237, CANAL, [fila('1237hbp', 'L6Cy1hTrpIc')])
    expect(r).toEqual({
      estado: 'solo-regmeet',
      video: {
        ytId: 'L6Cy1hTrpIc',
        url: 'https://www.youtube.com/watch?v=L6Cy1hTrpIc',
        title: null,
        fuentes: ['regmeet'],
      },
      discrepancias: [],
    })
  })

  it('sólo el canal: sin fila de regmeet, o con una que no trae vídeo', () => {
    for (const regmeet of [
      [],
      [fila('zrbgic', null, 'sin-video')],
      [fila('zrbgic', null, 'sin-marcador')],
    ]) {
      const r = videoDeSesion(ZRBGIC, CANAL, regmeet)
      expect(r.estado).toBe('solo-canal')
      expect(r.video).toMatchObject({ ytId: 'C7SSTb7q0ys', fuentes: ['canal'] })
    }
  })

  it('sin vídeo: ninguna de las dos', () => {
    const r = videoDeSesion(H1237, CANAL, [fila('1237hbp', null, 'sin-video')])
    expect(r).toEqual({ estado: 'sin-video', video: null, discrepancias: [] })
  })

  it('otro vídeo: el canal tiene uno para la fecha y regmeet incrusta otro → ninguno', () => {
    const r = videoDeSesion(ZRBGIC, CANAL, [fila('zrbgic', 'L6Cy1hTrpIc')])
    expect(r.estado).toBe('discrepan')
    expect(r.video).toBeNull()
    expect(r.discrepancias).toEqual([
      expect.objectContaining({
        plenoId: 'zrbgic',
        fecha: '2026-10-05',
        tipo: 'otro-video',
        canal: ['C7SSTb7q0ys'],
        regmeet: 'L6Cy1hTrpIc',
      }),
    ])
  })

  it('otra fecha: regmeet incrusta un vídeo que el canal titula con otra sesión → ninguno', () => {
    // EKoMiCY-HUk es, en el canal, «Ple ordinari 23 de gener de 2023».
    const r = videoDeSesion(H1237, CANAL, [fila('1237hbp', 'EKoMiCY-HUk')])
    expect(r.estado).toBe('discrepan')
    expect(r.video).toBeNull()
    expect(r.discrepancias.map((d) => d.tipo)).toEqual(['otra-fecha'])
    expect(r.discrepancias[0].detalle).toContain('2023-01-23')
  })

  it('otra sesión: el mismo vídeo en la página de dos sesiones → ninguna de las dos', () => {
    const regmeet = [fila('1237hbp', 'L6Cy1hTrpIc'), fila('zrbgic', 'L6Cy1hTrpIc')]
    const r = videoDeSesion(H1237, CANAL, regmeet)
    expect(r.estado).toBe('discrepan')
    expect(r.discrepancias.map((d) => d.tipo)).toContain('otra-sesion')
  })

  it('el vídeo del canal para esta fecha que otra sesión de regmeet reclama no se enseña aquí', () => {
    // regmeet pone el vídeo del 05-10-2026 en la página del 03-07-2026: el del 05-10 queda en duda.
    const regmeet = [fila('1237hbp', 'C7SSTb7q0ys')]
    const r = videoDeSesion(ZRBGIC, CANAL, regmeet)
    expect(r.estado).toBe('discrepan')
    expect(r.video).toBeNull()
    expect(r.discrepancias.map((d) => d.tipo)).toEqual(['otra-sesion'])
  })

  it('dos sesiones el mismo día, cada una con su vídeo: ninguna discrepa por el de la otra', () => {
    // Hoy no hay dos sesiones con la misma fecha en plenos.json; la forma es la de
    // dos filas reales del canal y de regmeet con la fecha compartida.
    const dia = '2026-12-01'
    const canal = [
      { ytId: 'C7SSTb7q0ys', url: 'https://www.youtube.com/watch?v=C7SSTb7q0ys', plenoDate: dia },
      { ytId: 'L6Cy1hTrpIc', url: 'https://www.youtube.com/watch?v=L6Cy1hTrpIc', plenoDate: dia },
    ]
    const regmeet: FilaRegmeet[] = [
      { plenoId: 'ord', fecha: dia, lectura: 'con-video', ytId: 'C7SSTb7q0ys', url: canal[0].url },
      { plenoId: 'ext', fecha: dia, lectura: 'con-video', ytId: 'L6Cy1hTrpIc', url: canal[1].url },
    ]
    const ord = videoDeSesion({ id: 'ord', date: dia }, canal, regmeet)
    const ext = videoDeSesion({ id: 'ext', date: dia }, canal, regmeet)
    expect([ord.estado, ord.video?.ytId]).toEqual(['coinciden', 'C7SSTb7q0ys'])
    expect([ext.estado, ext.video?.ytId]).toEqual(['coinciden', 'L6Cy1hTrpIc'])
  })

  it('todo estado, fuente y tipo cae en el vocabulario exportado', () => {
    const casos = [
      videoDeSesion(ZRBGIC, CANAL, [fila('zrbgic', 'C7SSTb7q0ys')]),
      videoDeSesion(H1237, CANAL, [fila('1237hbp', 'L6Cy1hTrpIc')]),
      videoDeSesion(ZRBGIC, CANAL, []),
      videoDeSesion(H1237, CANAL, []),
      videoDeSesion(ZRBGIC, CANAL, [fila('zrbgic', 'L6Cy1hTrpIc')]),
    ]
    for (const c of casos) {
      expect(ESTADOS_VIDEO_SESION).toContain(c.estado)
      for (const f of c.video?.fuentes ?? []) expect(FUENTES_VIDEO).toContain(f)
      for (const d of c.discrepancias) expect(TIPOS_DISCREPANCIA).toContain(d.tipo)
    }
    expect(new Set(casos.map((c) => c.estado)).size).toBe(ESTADOS_VIDEO_SESION.length)
  })
})

describe('discrepanciasDeVideo', () => {
  it('recorre todas las sesiones y devuelve cada discrepancia una vez por sesión y tipo', () => {
    const regmeet = [fila('zrbgic', 'L6Cy1hTrpIc'), fila('1237hbp', 'L6Cy1hTrpIc')]
    const ds = discrepanciasDeVideo(PLENOS.items, CANAL, regmeet)
    const claves = ds.map((d) => `${d.plenoId}:${d.tipo}`)
    expect(new Set(claves).size).toBe(claves.length)
    expect(claves).toEqual(
      expect.arrayContaining(['zrbgic:otro-video', 'zrbgic:otra-sesion', '1237hbp:otra-sesion']),
    )
  })

  it('sin regmeet no hay discrepancias que inventar', () => {
    expect(discrepanciasDeVideo(PLENOS.items, CANAL, [])).toEqual([])
  })
})

describe('indexVideosByPleno (lo que pinta /plenos/:id)', () => {
  it('sin la instantánea de regmeet, es el índice de siempre: un vídeo del canal por fecha', () => {
    const idx = indexVideosByPleno(VIDEOS, PLENOS)
    const fechas = new Set(CANAL.map((v: { plenoDate: string }) => v.plenoDate))
    const conVideo = PLENOS.items.filter((p: { date: string }) => fechas.has(p.date))
    expect(conVideo.length).toBeGreaterThan(0)
    expect(idx.size).toBe(conVideo.length)
    for (const p of conVideo) {
      expect(idx.get(p.id)?.url).toMatch(/^https:\/\/www\.youtube\.com\/watch\?v=[-\w]{11}$/)
      expect(idx.get(p.id)?.fuentes).toEqual(['canal'])
    }
    expect(idx.get('zrbgic')?.url).toBe('https://www.youtube.com/watch?v=C7SSTb7q0ys')
  })

  it('con regmeet añade la sesión que el canal perdió y calla la que discrepa', () => {
    const regmeet = { items: [fila('1237hbp', 'L6Cy1hTrpIc'), fila('zrbgic', 'EKoMiCY-HUk')] }
    const idx = indexVideosByPleno(VIDEOS, PLENOS, regmeet)
    expect(idx.get('1237hbp')?.url).toBe('https://www.youtube.com/watch?v=L6Cy1hTrpIc')
    expect(idx.has('zrbgic')).toBe(false)
    // EKoMiCY-HUk es el del 23-01-2023 en el canal: esa sesión también queda en duda.
    expect(idx.has('1r6yy0')).toBe(false)
  })
})

describe('resolveVideoForPleno (lo que descarga el transcriptor)', () => {
  it('se niega a transcribir una sesión en la que las dos fuentes discrepan', () => {
    expect(() =>
      resolveVideoForPleno('zrbgic', PLENOS.items, CANAL, [fila('zrbgic', 'L6Cy1hTrpIc')]),
    ).toThrow(/discrepan/)
  })

  it('con las dos de acuerdo, o sin regmeet, sigue resolviendo por el canal', () => {
    for (const regmeet of [undefined, [], [fila('zrbgic', 'C7SSTb7q0ys')]]) {
      expect(resolveVideoForPleno('zrbgic', PLENOS.items, CANAL, regmeet).url).toBe(
        'https://www.youtube.com/watch?v=C7SSTb7q0ys',
      )
    }
  })

  it('con dos grabaciones del canal para la fecha, que regmeet confirme una no desempata', () => {
    // 23-12-2025: el directo (OGM7-9SLePc) y una subida (5bpHZRUclkk), las dos del
    // canal. La transcripción y el mapa de hablantes de 1qi8axv salieron del directo;
    // elegir la que incrusta regmeet bajaría otra grabación, con otros tiempos.
    const sesion = PLENOS.items.find((p: { id: string }) => p.id === '1qi8axv')
    const directo = CANAL.find((v: { ytId: string }) => v.ytId === 'OGM7-9SLePc')
    expect(directo?.plenoDate).toBe(sesion.date)
    const subida = {
      ...directo,
      ytId: '5bpHZRUclkk',
      url: 'https://www.youtube.com/watch?v=5bpHZRUclkk',
      title: 'Pleno extrordinario y urgente 23 de diciembre de 2025',
    }
    expect(() =>
      resolveVideoForPleno(
        '1qi8axv',
        PLENOS.items,
        [directo, subida],
        [fila('1qi8axv', '5bpHZRUclkk')],
      ),
    ).toThrow(/ambiguo/)
  })

  it('un vídeo que sólo da regmeet no entra en la cola de transcripción', () => {
    expect(() =>
      resolveVideoForPleno('1237hbp', PLENOS.items, CANAL, [fila('1237hbp', 'L6Cy1hTrpIc')]),
    ).toThrow(/no video matched/)
  })
})
