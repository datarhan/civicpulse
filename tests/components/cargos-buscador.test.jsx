/**
 * «¿A quién le pregunto por…?» en /cargos (decisión D3), como lo usa un vecino:
 * escribe una palabra y lee a quién se pregunta.
 *
 * La página se monta con public/data. Quién responde se deriva aquí con las
 * mismas funciones y la lista de cargos publicada; ningún nombre se escribe a
 * mano. El periodo electoral se prueba sirviendo promises.json con un
 * `frozenUntil` futuro, el mismo interruptor que usa /eficiencia.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { fireEvent, render, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

import Cargos from '../../src/pages/Cargos'
import { CATALOGUE, LocaleProvider } from '../../src/i18n'
import { rellena } from '../../src/lib/formatters'
import { invalidateSnapshots, peekSnapshot } from '../../src/lib/snapshot-store'
import { buscaTema, respuestaDeTema } from '../../src/scraper/temas-cargos'

const lee = (f) => JSON.parse(readFileSync(`public/data/${f}`, 'utf8'))
const LISTA = lee('officials.json')
const VOCAB = lee('temas-cargos.json')
const es = CATALOGUE.es

function sirve(cambios = {}) {
  globalThis.fetch = vi.fn(async (input) => {
    const url = typeof input === 'string' ? input : input.toString()
    const fichero = url
      .replace(/^https?:\/\/[^/]+/, '')
      .split('?')[0]
      .replace(/^\/data\//, '')
    if (fichero in cambios)
      return new Response(JSON.stringify(cambios[fichero]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
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

async function monta(idioma = 'es', cambios) {
  localStorage.setItem('cp:lang', idioma)
  sirve(cambios)
  const r = render(
    <MemoryRouter initialEntries={['/cargos']}>
      <LocaleProvider>
        <Cargos />
      </LocaleProvider>
    </MemoryRouter>,
  )
  await waitFor(
    () => expect(r.container.querySelector('[data-en-breve="buscador"] input')).not.toBeNull(),
    { timeout: 15000 },
  )
  // El periodo electoral se lee de promises.json: que haya llegado antes de escribir.
  await waitFor(() => expect(peekSnapshot('/data/promises.json')?.status).toBe('ready'), {
    timeout: 15000,
  })
  return r
}

const escribe = async (container, valor) => {
  fireEvent.change(container.querySelector('[data-en-breve="buscador"] input'), {
    target: { value: valor },
  })
  return container.querySelector('[data-respuesta-tema]')
}

const tema = (q) => {
  const r = buscaTema(VOCAB, q)
  if (r.tipo !== 'uno') throw new Error(`«${q}» no da un asunto en el vocabulario publicado`)
  return r.entrada
}

describe('/cargos · ¿A quién le pregunto por…?', () => {
  it('mide algo: «basura» lleva a un área con titular, y es una atribución nuestra', () => {
    const r = respuestaDeTema(tema('basura'), LISTA.officials)
    expect(r.tipo).toBe('cargo')
    expect(r.tipo === 'cargo' && r.titulares.length).toBeGreaterThan(0)
    expect(r.tipo === 'cargo' && r.confianza).toBe('editorial')
  })

  it('«basura»: quién tiene el área, en cuál, por qué lo decimos y la salvedad', async () => {
    const { container } = await monta()
    const caja = await escribe(container, 'basura')
    const r = respuestaDeTema(tema('basura'), LISTA.officials)
    await waitFor(() => expect(caja.getAttribute('data-respuesta-tema')).toBe('uno'))
    const quien = caja.querySelector('[data-quien]')
    for (const o of r.titulares) {
      expect(quien.textContent).toContain(`${o.name} (${o.party})`)
      expect(quien.querySelector(`a[href="/cargos/${o.slug}"]`)).not.toBeNull()
    }
    expect(quien.textContent).toContain(`«${r.cargo}»`)
    expect(caja.textContent).toContain(
      rellena(es['cargos.enBreve.buscador.razon'], { razon: r.razon }),
    )
    expect(caja.textContent).toContain(es['cargos.enBreve.buscador.competencia'])
    expect(caja.querySelector(`[data-correo-de="${r.titulares[0].slug}"]`)).not.toBeNull()
  }, 60000)

  it('en valenciano también: «escombraries» es «basura»', async () => {
    const { container } = await monta('ca')
    const caja = await escribe(container, 'Escombraries')
    const r = respuestaDeTema(tema('escombraries'), LISTA.officials)
    await waitFor(() => expect(caja.querySelector('[data-quien]')).not.toBeNull())
    expect(caja.querySelector('[data-quien]').textContent).toContain(r.titulares[0].name)
    expect(caja.textContent).toContain(CATALOGUE.ca['cargos.enBreve.buscador.competencia'])
  }, 60000)

  it('un asunto que ninguna área nombra: el registro general, con el motivo', async () => {
    const { container } = await monta()
    const caja = await escribe(container, 'empadronarse')
    await waitFor(() =>
      expect(caja.textContent).toContain(es['cargos.enBreve.buscador.sinAsignar']),
    )
    expect(caja.textContent).toContain(VOCAB.sinAsignar[0].motivo)
    expect(caja.querySelector('[data-quien]')).toBeNull()
  }, 60000)

  it('un trozo que está en varios asuntos los ofrece, y elegir uno lo contesta', async () => {
    const q = ['serv', 'publ', 'social', 'agua', 'para'].find(
      (x) => buscaTema(VOCAB, x).tipo === 'varios',
    )
    expect(q, 'algún trozo de prueba tiene que dar varios asuntos').toBeDefined()
    const opciones = buscaTema(VOCAB, q).entradas
    const { container } = await monta()
    const caja = await escribe(container, q)
    const botones = [...caja.querySelectorAll('button')]
    expect(botones.map((b) => b.textContent)).toEqual(opciones.map((e) => e.tema))
    fireEvent.click(botones[0])
    await waitFor(() => expect(caja.getAttribute('data-respuesta-tema')).toBe('uno'))
  }, 60000)

  it('lo que no está en el vocabulario lo dice, y no adivina', async () => {
    const { container } = await monta()
    const caja = await escribe(container, 'helicóptero')
    expect(caja.textContent).toBe(es['cargos.enBreve.buscador.ninguno'])
  }, 60000)

  it('en periodo electoral dice el área y no el nombre', async () => {
    const promesas = lee('promises.json')
    const { container } = await monta('es', {
      'promises.json': { ...promesas, frozenUntil: '2099-01-01' },
    })
    const r = respuestaDeTema(tema('basura'), LISTA.officials)
    const caja = await escribe(container, 'basura')
    await waitFor(() =>
      expect(caja.textContent).toBe(
        rellena(es['cargos.enBreve.buscador.congelado'], { cargo: r.cargo }),
      ),
    )
    for (const o of r.titulares) expect(caja.textContent).not.toContain(o.name)
  }, 60000)
})
