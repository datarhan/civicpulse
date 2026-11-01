/**
 * /cargos, la lectura vecinal (auditoría de las dos lecturas, §3): «¿Cuánto
 * cobran?» y «¿Quién vigila al gobierno?» encima del divisor, con su ancla en
 * la sección que lo demuestra; y el sello de la lista sin «padrón» —que para
 * cualquier vecino es el censo—, sin «Officials» y sin plurales «(es)».
 *
 * La página se monta con los datos publicados: el fetch sirve public/data tal
 * cual, y un fichero que no exista contesta 404, como en producción.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { render, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

import Cargos from '../../src/pages/Cargos'
import { CATALOGUE, LocaleProvider } from '../../src/i18n'
import { entero, fmtDateLong, rellena } from '../../src/lib/formatters'
import { invalidateSnapshots } from '../../src/lib/snapshot-store'
import { quienFiscaliza, sueldosEnBreve } from '../../src/scraper/en-breve-cargos'

const lee = (f) => JSON.parse(readFileSync(`public/data/${f}`, 'utf8'))
const LISTA = lee('officials.json')
const DEDIC = lee('dedicaciones.json')

function sirvePublicData({ falla = [] } = {}) {
  globalThis.fetch = vi.fn(async (input) => {
    const url = typeof input === 'string' ? input : input.toString()
    const ruta = url.replace(/^https?:\/\/[^/]+/, '').split('?')[0]
    const fichero = ruta.replace(/^\/data\//, '')
    if (
      !ruta.startsWith('/data/') ||
      falla.includes(fichero) ||
      !existsSync(`public/data/${fichero}`)
    )
      return new Response('not found', { status: 404 })
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

async function pinta(idioma, opciones) {
  localStorage.setItem('cp:lang', idioma)
  sirvePublicData(opciones)
  const r = render(
    <MemoryRouter initialEntries={['/cargos']}>
      <LocaleProvider>
        <Cargos />
      </LocaleProvider>
    </MemoryRouter>,
  )
  return r
}

const listo = (container) =>
  waitFor(
    () => {
      expect(container.querySelector('[data-en-breve="sueldos"]')).not.toBeNull()
      expect(container.querySelector('[data-en-breve="fiscalizan"]')).not.toBeNull()
      expect(container.querySelector('#retribuciones')).not.toBeNull()
    },
    { timeout: 15000 },
  )

describe('/cargos · en breve', () => {
  it('mide algo: los datos publicados dan las dos respuestas', () => {
    expect(sueldosEnBreve(DEDIC, LISTA.count)).not.toBeNull()
    expect(quienFiscaliza(LISTA.officials)).not.toBeNull()
  })

  it('¿cuánto cobran?: el tramo del acuerdo, los que no tienen sueldo y la fecha', async () => {
    const { container } = await pinta('es')
    await listo(container)
    const s = sueldosEnBreve(DEDIC, LISTA.count)
    const tarjeta = container.querySelector('[data-en-breve="sueldos"]')
    const es = CATALOGUE.es
    expect(tarjeta.textContent).toContain(
      rellena(es['cargos.enBreve.sueldos.frase'], {
        minimo: entero(Math.round(s.minimo)),
        maximo: entero(Math.round(s.maximo)),
        sin: s.sinSueldo,
      }),
    )
    expect(tarjeta.textContent).toContain(
      rellena(es['cargos.enBreve.sueldos.nota'], {
        anio: s.fecha.slice(0, 4),
        fecha: fmtDateLong(s.fecha),
      }),
    )
    // 59.195 € no es el sueldo del cargo entero: lleva la antigüedad personal
    // dentro, como dice el cuadro de retribuciones de abajo.
    expect(tarjeta.textContent).toContain(
      rellena(es['cargos.enBreve.sueldos.antiguedad'], {
        antiguedad: entero(Math.round(s.antiguedadDelMaximo)),
      }),
    )
    const ancla = tarjeta.querySelector('a').getAttribute('href')
    expect(ancla).toBe('#retribuciones')
    expect(container.querySelector(ancla)).not.toBeNull()
  }, 60000)

  it('¿quién vigila al gobierno?: cuántos, de qué partidos, y su sección', async () => {
    const { container } = await pinta('es')
    await listo(container)
    const q = quienFiscaliza(LISTA.officials)
    const tarjeta = container.querySelector('[data-en-breve="fiscalizan"]')
    for (const p of q.partidos) expect(tarjeta.textContent).toContain(`${p.partido} (${p.escanos})`)
    expect(tarjeta.textContent).toContain(
      rellena(CATALOGUE.es['cargos.enBreve.fiscalizan.cifra'], { n: q.n, total: LISTA.count }),
    )
    const ancla = tarjeta.querySelector('a').getAttribute('href')
    expect(ancla).toBe('#quien-fiscaliza')
    expect(container.querySelector(ancla)).not.toBeNull()
  }, 60000)

  it('el divisor va entre la lectura vecinal y el resto', async () => {
    const { container } = await pinta('es')
    await listo(container)
    const bloque = container.querySelector('[data-en-breve-bloque]')
    const divisor = container.querySelector('[data-divisor-lecturas]')
    const retri = container.querySelector('#retribuciones')
    expect(divisor).not.toBeNull()
    expect(bloque.compareDocumentPosition(divisor) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(divisor.compareDocumentPosition(retri) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  }, 60000)

  it('el sello: «lista de cargos», sin «padrón», sin «Officials» y sin plurales «(es)»', async () => {
    const { container } = await pinta('es')
    await listo(container)
    const texto = container.textContent
    expect(texto).not.toMatch(/padr[oó]n/i)
    expect(texto).not.toContain('Officials')
    expect(texto).not.toMatch(/\((es|s)\)/)
    const corr = LISTA.corrections
    expect(corr && corr.bajas + corr.altas, 'hay correcciones que contar').toBeGreaterThan(0)
    const n = corr.bajas + corr.altas
    const clave =
      n === 1 ? 'cargos.corporacion.correcciones.una' : 'cargos.corporacion.correcciones'
    const [antes] = CATALOGUE.es[clave].split('{')
    expect(texto).toContain(antes)
  }, 60000)

  it('en valencià, las dos preguntas y el divisor también', async () => {
    const { container } = await pinta('ca')
    await listo(container)
    const ca = CATALOGUE.ca
    expect(container.querySelector('[data-en-breve="sueldos"] h3').textContent).toBe(
      ca['cargos.enBreve.sueldos.pregunta'],
    )
    expect(container.querySelector('[data-en-breve="fiscalizan"] h3').textContent).toBe(
      ca['cargos.enBreve.fiscalizan.pregunta'],
    )
    expect(container.textContent).not.toMatch(/padr[oó]n?/i)
  }, 60000)

  it('si la lista no carga, lo dice sin mandar al lector a ejecutar nada', async () => {
    const { container } = await pinta('es', { falla: ['officials.json'] })
    await waitFor(() => expect(container.textContent).toContain(CATALOGUE.es['cargos.error']), {
      timeout: 15000,
    })
    expect(container.textContent).not.toMatch(/npm|scrape/)
  }, 60000)
})
