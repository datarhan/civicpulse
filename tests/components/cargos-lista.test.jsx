/**
 * La lista de los 21 en la lectura vecinal de /cargos (auditoría de las dos
 * lecturas, §3, punto 4): cara, nombre, partido y lo que lleva cada uno, con la
 * oposición rotulada una vez.
 *
 * La página se monta con public/data. Quién va en cada grupo y en qué orden se
 * deriva aquí con las mismas funciones que usa la página; ningún nombre ni área
 * se escribe a mano.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { render, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

import Cargos from '../../src/pages/Cargos'
import { CATALOGUE, LocaleProvider } from '../../src/i18n'
import { rellena } from '../../src/lib/formatters'
import { invalidateSnapshots } from '../../src/lib/snapshot-store'
import { conAreasDelegadas, sinAreasDelegadas } from '../../src/scraper/en-breve-cargos'

const LISTA = JSON.parse(readFileSync('public/data/officials.json', 'utf8'))
const GOBIERNO = conAreasDelegadas(LISTA.officials)
const OPOSICION = sinAreasDelegadas(LISTA.officials)
const es = CATALOGUE.es

function sirve() {
  globalThis.fetch = vi.fn(async (input) => {
    const url = typeof input === 'string' ? input : input.toString()
    const fichero = url
      .replace(/^https?:\/\/[^/]+/, '')
      .split('?')[0]
      .replace(/^\/data\//, '')
    if (!existsSync(`public/data/${fichero}`)) return new Response('not found', { status: 404 })
    return new Response(readFileSync(`public/data/${fichero}`, 'utf8'), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  })
}

afterEach(() => {
  localStorage.clear()
  invalidateSnapshots()
})

async function monta(idioma = 'es') {
  localStorage.setItem('cp:lang', idioma)
  sirve()
  const r = render(
    <MemoryRouter initialEntries={['/cargos']}>
      <LocaleProvider>
        <Cargos />
      </LocaleProvider>
    </MemoryRouter>,
  )
  await waitFor(() => expect(r.container.querySelector('[data-lista-cargos]')).not.toBeNull(), {
    timeout: 15000,
  })
  return r.container.querySelector('[data-lista-cargos]')
}

const caras = (lista, grupo) =>
  [...lista.querySelectorAll(`[data-grupo="${grupo}"] [data-cargo]`)].map((li) => ({
    slug: li.getAttribute('data-cargo'),
    li,
  }))

describe('/cargos · la lista de los 21', () => {
  it('mide algo: hay quien gobierna y quien no, y suman los escaños', () => {
    expect(GOBIERNO.length).toBeGreaterThan(0)
    expect(OPOSICION.length).toBeGreaterThan(0)
    expect(GOBIERNO.length + OPOSICION.length).toBe(LISTA.count)
  })

  it('una cara por cargo, en el orden de las tarjetas, con su nombre enlazado a su ficha', async () => {
    const lista = await monta()
    const gob = caras(lista, 'gobierno')
    const opo = caras(lista, 'oposicion')
    expect(gob.map((c) => c.slug)).toEqual(GOBIERNO.map((o) => o.slug))
    expect(opo.map((c) => c.slug)).toEqual(OPOSICION.map((o) => o.slug))
    for (const o of LISTA.officials) {
      const enlace = lista.querySelector(`[data-cargo="${o.slug}"] a[href="/cargos/${o.slug}"]`)
      expect(enlace?.textContent, o.slug).toBe(o.name)
      expect(lista.querySelector(`[data-cargo="${o.slug}"]`).textContent).toContain(o.party)
    }
  }, 60000)

  it('quien gobierna lleva TODAS sus áreas, tal cual las publica el Ayuntamiento', async () => {
    const lista = await monta()
    for (const o of GOBIERNO) {
      const lleva = lista.querySelector(`[data-cargo="${o.slug}"] [data-lleva]`)
      expect(lleva?.textContent, o.slug).toBe(
        rellena(es['cargos.lista.lleva'], { areas: o.portfolios.join(' · ') }),
      )
    }
    // El alcalde, delante y dicho.
    const primera = caras(lista, 'gobierno')[0].li
    expect(primera.textContent).toContain(es['cargos.card.alcalde'])
  }, 60000)

  it('la oposición, en la misma lista y rotulada una vez: sin «Lleva» en cada cara', async () => {
    const lista = await monta()
    expect(lista.querySelectorAll('[data-grupo="oposicion"] [data-lleva]')).toHaveLength(0)
    const rotulo = rellena(es['cargos.lista.noGobiernan'], { n: OPOSICION.length })
    expect(lista.querySelector('[data-grupo="oposicion"] h3').textContent).toBe(rotulo)
    expect(lista.textContent.split('sin áreas delegadas')).toHaveLength(2)
  }, 60000)

  it('va en la lectura vecinal: antes del divisor y de las tarjetas completas', async () => {
    const lista = await monta()
    const divisor = document.querySelector('.cp-divisor-lecturas')
    expect(divisor).not.toBeNull()
    expect(lista.compareDocumentPosition(divisor) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(lista.querySelector('a[href="#quien-dirige"]')).not.toBeNull()
    expect(document.getElementById('quien-dirige')).not.toBeNull()
  }, 60000)

  it('en valenciano, las palabras de la lista; las áreas, en su lengua', async () => {
    const lista = await monta('ca')
    const ca = CATALOGUE.ca
    expect(lista.querySelector('h2').textContent).toBe(
      rellena(ca['cargos.lista.titulo'], { n: LISTA.count }),
    )
    const o = GOBIERNO[0]
    expect(lista.querySelector(`[data-cargo="${o.slug}"] [data-lleva]`).textContent).toBe(
      rellena(ca['cargos.lista.lleva'], { areas: o.portfolios.join(' · ') }),
    )
  }, 60000)
})
