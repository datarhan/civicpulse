import { afterAll, describe, expect, it } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { FichaTecnica } from '../../src/components/FichaTecnica'
import { DatosTecnicos } from '../../src/components/Quejas/DatosTecnicos'
import ServicioDetalle from '../../src/pages/ServicioDetalle'
import { PromiseCard } from '../../src/pages/Promesas'
import { leerIndicador } from '../../src/scraper/indicador-lectura'
import { installFetchMock } from '../setup/mockFetch'
import { invalidateSnapshots } from '../../src/lib/snapshot-store'

/**
 * `FichaTecnica`: el pliegue de lo que sirve para volver a comprobar una cifra
 * —hojas, filas, columnas, entregas anteriores— y no para leerla.
 *
 * Lo que NO se pliega es la regla de la casa: la salvedad va junto a la cifra,
 * y la vía de réplica está a la vista, porque /aviso-legal promete publicar la
 * respuesta «íntegra junto a la ficha». Estas pruebas miran las dos mitades.
 */
afterAll(() => {
  invalidateSnapshots()
  cleanup()
})

const publicado = JSON.parse(readFileSync(resolve('public/data/indicadores.json'), 'utf8'))
const PROMESAS = JSON.parse(readFileSync(resolve('public/data/promises.json'), 'utf8'))

/** Las fichas con cifra, la que más salvedades trae primero. */
const CON_CIFRA = publicado.indicadores
  .filter((i) => i.valor !== null && i.citas?.length)
  .sort((a, b) => (b.caveats?.length ?? 0) - (a.caveats?.length ?? 0))

function pintaFicha(id) {
  installFetchMock({ '/data/indicadores.json': publicado })
  return render(
    <MemoryRouter initialEntries={[`/eficiencia/${id}`]}>
      <Routes>
        <Route path="/eficiencia/:id" element={<ServicioDetalle />} />
      </Routes>
    </MemoryRouter>,
  )
}

const dentroDeUnPliegue = (el) => Boolean(el.closest('details'))

describe('FichaTecnica', () => {
  it('sale plegada, con su rótulo, y se despliega al imprimir', () => {
    const { container } = render(
      <FichaTecnica rotulo="Datos técnicos">
        <p>celda</p>
      </FichaTecnica>,
    )
    const d = container.querySelector('details[data-ficha-tecnica]')
    expect(d).not.toBeNull()
    expect(d.open).toBe(false)
    expect(d.querySelector('summary').textContent).toBe('Datos técnicos')
    act(() => {
      window.dispatchEvent(new Event('beforeprint'))
    })
    expect(d.open).toBe(true)
    act(() => {
      window.dispatchEvent(new Event('afterprint'))
    })
    expect(d.open, 'tras imprimir vuelve como estaba').toBe(false)
  })

  it('lo que el lector abrió sigue abierto después de imprimir', () => {
    const { container } = render(
      <FichaTecnica rotulo="Datos técnicos">
        <p>celda</p>
      </FichaTecnica>,
    )
    const d = container.querySelector('details[data-ficha-tecnica]')
    d.open = true
    act(() => {
      window.dispatchEvent(new Event('beforeprint'))
      window.dispatchEvent(new Event('afterprint'))
    })
    expect(d.open).toBe(true)
  })

  it('dos avisos de imprimir seguidos no le cambian el estado al lector', () => {
    const { container } = render(
      <FichaTecnica rotulo="Datos técnicos">
        <p>celda</p>
      </FichaTecnica>,
    )
    const d = container.querySelector('details[data-ficha-tecnica]')
    act(() => {
      window.dispatchEvent(new Event('beforeprint'))
      window.dispatchEvent(new Event('beforeprint'))
      window.dispatchEvent(new Event('afterprint'))
    })
    expect(d.open).toBe(false)
  })

  it('/quejas usa la misma pieza', () => {
    const { container } = render(
      <MemoryRouter>
        <DatosTecnicos data={{ generatedAt: '2026-11-01T00:00:00Z' }} />
      </MemoryRouter>,
    )
    expect(container.querySelector('details[data-ficha-tecnica]')).not.toBeNull()
  })
})

describe('/eficiencia/:id — qué se pliega y qué no', () => {
  it('mide algo: hay fichas con cifra y con salvedades propias', () => {
    expect(CON_CIFRA.length).toBeGreaterThan(0)
    expect(CON_CIFRA[0].caveats?.length ?? 0).toBeGreaterThan(0)
  })

  it.each(CON_CIFRA.map((i) => [i.id, i]))(
    '%s: las celdas se pliegan; cada documento, su enlace y la réplica, no',
    async (_id, i) => {
      const { unmount } = pintaFicha(i.id)
      const rotulo = await screen.findByRole('heading', { level: 2, name: 'Fuente y réplica' })
      const tarjeta = rotulo.closest('[data-tarjeta]')
      const pliegue = tarjeta.querySelector('details[data-ficha-tecnica]')
      expect(pliegue, 'la tarjeta de la fuente no tiene pliegue').not.toBeNull()
      expect(pliegue.open).toBe(false)
      // La hoja, la fila y la columna van dentro.
      expect(pliegue.textContent).toMatch(/Coste:/)
      // Cada documento distinto —el de la cifra y los de la serie— se enlaza
      // a la vista: una cita no se pliega.
      const urls = new Set([i.citas[0].url, ...(i.procedencia ?? []).map((g) => g.url)])
      expect(urls.size).toBeGreaterThan(0)
      for (const url of urls) {
        const enlace = [...tarjeta.querySelectorAll('a')].find(
          (a) => a.getAttribute('href') === url && !dentroDeUnPliegue(a),
        )
        expect(enlace, `plegado o ausente: ${url}`).toBeDefined()
      }
      const replica = tarjeta.querySelector('a[href="/aviso-legal"]')
      expect(replica).not.toBeNull()
      expect(dentroDeUnPliegue(replica)).toBe(false)
      unmount()
    },
  )

  it.each(CON_CIFRA.map((i) => [i.id, i]))(
    '%s: cada salvedad está en su tarjeta, sin plegar, y la frase del escalón también',
    async (_id, i) => {
      const { container, unmount } = pintaFicha(i.id)
      const rotulo = await screen.findByRole('heading', { level: 2, name: /Salvedades/ })
      const tarjeta = rotulo.closest('[data-tarjeta]')
      const lectura = leerIndicador(i)
      const salvedades = [...(lectura.avisos ?? []), ...(i.caveats ?? [])]
      expect(salvedades.length).toBeGreaterThan(0)
      const lis = [...tarjeta.querySelectorAll('li')]
      expect(lis).toHaveLength(salvedades.length)
      for (const s of salvedades) {
        const li = lis.find((l) => l.textContent.trim() === s)
        expect(li, `no está en la tarjeta: ${s.slice(0, 50)}`).toBeDefined()
        expect(dentroDeUnPliegue(li), `plegada: ${s.slice(0, 50)}`).toBe(false)
      }
      const como = [...container.querySelectorAll('p')].find((p) => p.textContent === lectura.como)
      expect(como, 'la frase del escalón no se pinta').toBeDefined()
      expect(dentroDeUnPliegue(como)).toBe(false)
      unmount()
    },
  )

  /**
   * La tarjeta decía «Cada una está dicha arriba, junto a la cifra que
   * corrige». Medido sobre el build del 23-11-2026: 42 de las 67 salvedades de
   * las quince fichas sólo se dicen en esa lista. La frase no puede volver.
   */
  it('no dice que cada salvedad está dicha arriba', async () => {
    const { container } = pintaFicha(CON_CIFRA[0].id)
    await screen.findByRole('heading', { level: 2, name: /Salvedades/ })
    expect(container.textContent).not.toMatch(/Cada una está dicha arriba/)
  })

  it('las secciones de la columna son <h2>', async () => {
    pintaFicha(CON_CIFRA[0].id)
    await screen.findByRole('heading', { level: 2, name: 'Fuente y réplica' })
    const nombres = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)
    expect(nombres).toEqual(expect.arrayContaining(['Fuente y réplica']))
    expect(nombres.some((n) => n.startsWith('Salvedades'))).toBe(true)
    expect(nombres.some((n) => n.startsWith('La década'))).toBe(true)
  })
})

describe('/promesas — cada tarjeta tiene su encabezado', () => {
  it('el título de la promesa es un <h2>', () => {
    const p = PROMESAS.items[0]
    expect(p).toBeDefined()
    installFetchMock({})
    render(
      <MemoryRouter>
        <PromiseCard p={p} suggestion={null} llmEvidence={null} frozen={false} />
      </MemoryRouter>,
    )
    expect(screen.getByRole('heading', { level: 2, name: p.title })).toBeDefined()
  })
})
