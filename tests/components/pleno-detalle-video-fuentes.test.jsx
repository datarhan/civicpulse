import { describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'

import PlenoDetalle from '../../src/pages/PlenoDetalle'
import { peekSnapshot } from '../../src/lib/snapshot-store'
import { CATALOGUE } from '../../src/i18n'

/**
 * «Ver vídeo» en /plenos/:id junta dos fuentes: el canal de YouTube y la página de
 * la sesión en regmeet. Cuando discrepan, no se enseña ninguno. La trampa: las dos
 * instantáneas llegan por separado, y mientras la de regmeet no ha llegado «no ha
 * llegado» no es «regmeet no dice nada» (I-2026-10-27-videos-regmeet-cargando). Con
 * ella retenida, `1qi8axv` (canal OGM7-9SLePc, regmeet 5bpHZRUclkk) pintaba el
 * vídeo del canal hasta que llegaba.
 *
 * Datos de las instantáneas publicadas. Para la discrepancia, el canal tal como
 * estaba al medirla (27-10-2026, antes de #448): la instantánea de hoy sin la
 * subida del 23-12-2025 (5bpHZRUclkk), que es la fila que #448 añadió en esa fecha.
 * Con el canal de hoy las dos fuentes coinciden en ella.
 */

const lee = (f) => JSON.parse(readFileSync(`public/data/${f}`, 'utf8'))
const PLENOS = lee('plenos.json')
const VIDEOS = lee('pleno-videos.json')
const VIDEOS_ANTES = {
  ...VIDEOS,
  items: VIDEOS.items.filter((v) => v.ytId !== '5bpHZRUclkk'),
}
const VIDEOS_REGMEET = lee('pleno-videos-regmeet.json')
const VER = CATALOGUE.es['plenoDetail.video']

/** Sirve las instantáneas, y la de regmeet sólo cuando la prueba la suelta. */
function sirve(canal = VIDEOS) {
  let soltar
  const retenida = new Promise((r) => (soltar = r))
  const mapa = {
    '/data/plenos.json': PLENOS,
    '/data/pleno-videos.json': canal,
  }
  globalThis.fetch = vi.fn(async (input) => {
    const path = String(input).replace(/^https?:\/\/[^/]+/, '')
    if (path === '/data/pleno-videos-regmeet.json') {
      await retenida
      return new Response(JSON.stringify(VIDEOS_REGMEET), { status: 200 })
    }
    if (path in mapa) return new Response(JSON.stringify(mapa[path]), { status: 200 })
    return new Response('not found', { status: 404 })
  })
  return () => soltar()
}

function monta(id) {
  render(
    <MemoryRouter initialEntries={[`/plenos/${id}`]}>
      <Routes>
        <Route path="/plenos/:id" element={<PlenoDetalle />} />
      </Routes>
    </MemoryRouter>,
  )
}

const enlaceDeVideo = () =>
  screen.queryAllByRole('link').find((a) => a.textContent.startsWith(VER)) ?? null

describe('/plenos/:id · «Ver vídeo» con dos fuentes', () => {
  it('mide algo: la sesión en discrepancia tiene vídeo en las dos fuentes, y distinto', () => {
    const fecha = PLENOS.items.find((p) => p.id === '1qi8axv').date
    const canal = VIDEOS_ANTES.items.filter((v) => v.plenoDate === fecha).map((v) => v.ytId)
    const regmeet = VIDEOS_REGMEET.items.find((f) => f.plenoId === '1qi8axv')?.ytId
    expect(canal).toEqual(['OGM7-9SLePc'])
    expect(regmeet).toBe('5bpHZRUclkk')
    expect(VIDEOS.items.length - VIDEOS_ANTES.items.length).toBe(1)
  })

  it('con las fuentes en discrepancia, no enseña ninguno: ni antes ni después de llegar regmeet', async () => {
    const soltar = sirve(VIDEOS_ANTES)
    monta('1qi8axv')
    await waitFor(() => expect(peekSnapshot('/data/pleno-videos.json')?.status).toBe('ready'))
    await screen.findByRole('heading', { level: 1 })
    expect(enlaceDeVideo(), 'antes de llegar regmeet').toBeNull()
    soltar()
    await waitFor(() =>
      expect(peekSnapshot('/data/pleno-videos-regmeet.json')?.status).toBe('ready'),
    )
    expect(enlaceDeVideo(), 'después').toBeNull()
  })

  it('con el canal de hoy, 1qi8axv enseña el vídeo en que coinciden las dos fuentes', async () => {
    const soltar = sirve()
    monta('1qi8axv')
    await screen.findByRole('heading', { level: 1 })
    soltar()
    await waitFor(() =>
      expect(enlaceDeVideo()?.getAttribute('href')).toBe(
        'https://www.youtube.com/watch?v=5bpHZRUclkk',
      ),
    )
  })

  it('la sesión que el canal perdía enseña el de regmeet, en cuanto llega', async () => {
    const soltar = sirve()
    monta('1237hbp')
    await screen.findByRole('heading', { level: 1 })
    soltar()
    await waitFor(() =>
      expect(enlaceDeVideo()?.getAttribute('href')).toBe(
        'https://www.youtube.com/watch?v=L6Cy1hTrpIc',
      ),
    )
  })

  it('sin la instantánea de regmeet (404) sigue enseñando el del canal', async () => {
    globalThis.fetch = vi.fn(async (input) => {
      const path = String(input).replace(/^https?:\/\/[^/]+/, '')
      const mapa = { '/data/plenos.json': PLENOS, '/data/pleno-videos.json': VIDEOS }
      return path in mapa
        ? new Response(JSON.stringify(mapa[path]), { status: 200 })
        : new Response('not found', { status: 404 })
    })
    monta('zrbgic')
    await waitFor(() =>
      expect(enlaceDeVideo()?.getAttribute('href')).toBe(
        'https://www.youtube.com/watch?v=C7SSTb7q0ys',
      ),
    )
  })
})
