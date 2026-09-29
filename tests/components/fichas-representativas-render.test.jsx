import { describe, it, expect, vi } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { relative, resolve } from 'node:path'
import { act, fireEvent, render, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

import { LocaleProvider } from '../../src/i18n'
import { peekSnapshot } from '../../src/lib/snapshot-store'
import { construirGrafoRutas } from '../../scripts/lib/route-graph'
import { fichaDe, leerDeDisco } from '../../scripts/lib/fichas-representativas'
import { leerPestanas, rutaBase, textoTrasLaBarra } from '../../src/scraper/reader-review'

/**
 * Lo que el lector va a pedir tiene que ser una página, y lo que no lo es tiene
 * que notarse.
 *
 * Una ficha de detalle que no existe NO redirige: se pinta en la misma URL con
 * un «no encontrado». El control de NO MONTADA compara la ruta a la que se
 * llegó con la pedida, así que no la ve, y el lector leía la página de error y
 * decía «nada que señalar». Aquí se montan las ocho plantillas de verdad, con
 * los datos PUBLICADOS —no un fixture: lo que tiene que casar es lo que elige el
 * elector con lo que resuelve la página—.
 */

const RAIZ = resolve(__dirname, '..', '..')
const grafo = construirGrafoRutas(resolve(RAIZ, 'src'))
const publicados = leerDeDisco(resolve(RAIZ, 'public', 'data'))
const patrones = grafo.rutas.filter((r) => r.includes(':'))

/** Sirve cualquier `/data/*` desde `public/`: la página recibe lo que se publica. */
function sirveLoPublicado() {
  const pedidas = []
  globalThis.fetch = vi.fn(async (input) => {
    const url = typeof input === 'string' ? input : input.toString()
    const ruta = url.replace(/^https?:\/\/[^/]+/, '').split('?')[0]
    pedidas.push(ruta)
    const fichero = resolve(RAIZ, 'public', `.${ruta}`)
    if (!ruta.startsWith('/data/') || !existsSync(fichero)) {
      return new Response('no encontrado', { status: 404 })
    }
    return new Response(readFileSync(fichero, 'utf8'), {
      status: 200,
      headers: {
        'Content-Type': ruta.endsWith('.json') ? 'application/json' : 'text/plain',
      },
    })
  })
  return pedidas
}

/** Hasta que no quede dato por llegar y el texto deje de moverse. */
async function quieta(container, pedidas) {
  let previo = null
  await waitFor(
    () => {
      const pendientes = pedidas.filter((p) => peekSnapshot(p)?.status === 'loading')
      expect(pendientes).toEqual([])
      const ahora = container.textContent ?? ''
      const quieto = previo !== null && ahora === previo
      previo = ahora
      expect(quieto).toBe(true)
    },
    { timeout: 20_000, interval: 150 },
  )
}

async function monta(patron, url) {
  const pedidas = sirveLoPublicado()
  const modulo = relative(__dirname, grafo.paginaPorRuta.get(patron))
  const { default: Pagina } = await import(/* @vite-ignore */ modulo)
  const vista = render(
    <MemoryRouter initialEntries={[url]}>
      <LocaleProvider>
        <Routes>
          <Route path={patron} element={<Pagina />} />
        </Routes>
      </LocaleProvider>
    </MemoryRouter>,
  )
  await quieta(vista.container, pedidas)
  return { ...vista, pedidas }
}

describe('cada ficha elegida existe en su página, y una que no existe se nota', () => {
  it('mide algo: hay plantillas que montar', () => {
    expect(patrones.length).toBeGreaterThanOrEqual(8)
  })

  for (const patron of patrones) {
    const ficha = fichaDe(patron, publicados)

    it.skipIf(!ficha.id)(
      `${patron}: la ficha elegida pinta su contenido, no un «no encontrado»`,
      async () => {
        const { container } = await monta(patron, rutaBase(ficha.clave))
        expect(container.querySelector('[data-no-resuelta]'), ficha.clave).toBeNull()
        expect((container.textContent ?? '').length, ficha.clave).toBeGreaterThan(300)
      },
      30_000,
    )

    it(`${patron}: una ficha que no existe lleva la marca que el lector busca`, async () => {
      const url = patron.replace(/:\w+/, 'no-existe-en-ningun-snapshot')
      const { container } = await monta(patron, url)
      expect(container.querySelector('[data-no-resuelta]'), url).not.toBeNull()
    }, 30_000)
  }
})

describe('/plenos/:id: el lector abre las pestañas que la carga no abre', () => {
  it('lee la tabla de declaraciones y no abre la transcripción', async () => {
    const ficha = fichaDe('/plenos/:id', publicados)
    expect(ficha.id).not.toBeNull()
    const { container, pedidas } = await monta('/plenos/:id', rutaBase(ficha.clave))

    const r = await leerPestanas({
      claves: async () =>
        [...container.querySelectorAll('[data-pestana]')].map((b) =>
          b.getAttribute('data-pestana'),
        ),
      pulsa: async (k) => {
        await act(async () => {
          fireEvent.click(container.querySelector(`[data-pestana="${k}"]`))
        })
        await quieta(container, pedidas)
      },
      region: async () => textoTrasLaBarra(),
    })

    expect(r.leidas).toContain('declaraciones')
    expect(r.leidas).toContain('votos')
    // Literal de ClaimLedger con `showSummary`: sólo existe con la tabla pintada.
    expect(r.textos.join('\n')).toMatch(/sin contraste en los datos/)
    // La transcripción es el acta hablada, no prosa nuestra, y pesa lo que la
    // sesión entera: ni se pulsa ni se pide.
    expect(r.leidas).not.toContain('transcripcion')
    expect(r.sinCambio).not.toContain('transcripcion')
    expect(pedidas.filter((p) => p.endsWith('.txt'))).toEqual([])
  }, 60_000)
})
