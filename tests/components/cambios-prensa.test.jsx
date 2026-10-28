/**
 * La prensa de /cambios (auditoría de las dos lecturas, §2): una fila por
 * noticia, con todos los sitios que la publicaron enlazados debajo, y sin los
 * anuncios de un portal inmobiliario, que no son prensa.
 *
 * La prensa es la de los catorce días que acaban el 28-10-2026
 * (`press_2026-10-28.json`), con el anuncio de Fotocasa del 17-10 dentro.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

import Cambios from '../../src/pages/Cambios'
import { CATALOGUE, LocaleProvider } from '../../src/i18n'
import { rellena } from '../../src/lib/formatters'
import { installFetchMock } from '../setup/mockFetch'

const lee = (f) => JSON.parse(readFileSync(f, 'utf8'))
const PRESS = lee('tests/fixtures/press_2026-10-28.json')
const datos = (f) => lee(`public/data/${f}`)
const HOY = Date.parse('2026-10-28T12:00:00Z')

const pieza = (host, trozo) =>
  PRESS.items.find((i) => i.sourceHost === host && i.title.includes(trozo))
const VPLAZA = pieza('valenciaplaza.com', 'proyecta 30 kilómetros')
const INFOTURIA = pieza('infoturia.com', 'projecta 30 quilòmetres')
const FOTOCASA = PRESS.items.find((i) => i.sourceHost === 'fotocasa.es')

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(HOY)
})
afterEach(() => {
  vi.useRealTimers()
  localStorage.clear()
})

async function pinta(idioma) {
  localStorage.setItem('cp:lang', idioma)
  const tenders = datos('tenders.json')
  installFetchMock({
    '/data/tenders.json': { ...tenders, contracts: [] },
    '/data/quejas.json': datos('quejas.json'),
    '/data/plenos.json': datos('plenos.json'),
    '/data/press.json': PRESS,
    '/data/bdns.json': datos('bdns.json'),
    '/data/participa.json': datos('participa.json'),
    '/data/geo.json': datos('geo.json'),
  })
  const { container, unmount } = render(
    <MemoryRouter>
      <LocaleProvider>
        <Cambios />
      </LocaleProvider>
    </MemoryRouter>,
  )
  const catorce = rellena(CATALOGUE[idioma]['cambios.ventana'], { n: 14 })
  fireEvent.click(await screen.findByRole('button', { name: catorce }, { timeout: 15000 }))
  await waitFor(
    () =>
      expect(container.querySelectorAll('[data-clase="prensa"] [data-noticia]').length).toBe(10),
    { timeout: 15000 },
  )
  return { container, unmount }
}

describe('/cambios · la prensa, una fila por noticia', () => {
  it('mide algo: el fixture trae la noticia en dos lenguas y el anuncio', () => {
    expect(VPLAZA).toBeDefined()
    expect(INFOTURIA).toBeDefined()
    expect(FOTOCASA).toBeDefined()
  })

  it('la misma noticia en dos medios es una fila, con los dos enlazados', async () => {
    const { container } = await pinta('es')
    const tarjeta = container.querySelector('[data-clase="prensa"]')
    const filas = [...tarjeta.querySelectorAll('[data-noticia]')]
    const conElTitular = filas.filter((f) => f.textContent.includes(VPLAZA.title))
    expect(conElTitular).toHaveLength(1)
    // El titular en valenciano no es otra fila: va en el enlace a su medio.
    expect(tarjeta.textContent).not.toContain(INFOTURIA.title)
    const fila = conElTitular[0]
    expect(fila.getAttribute('data-piezas')).toBe('2')
    const linea = fila.querySelector('[data-publicada-en]')
    expect(linea.textContent).toBe(
      `${CATALOGUE.es['cambios.prensa.publicadaEn']} Valencia Plaza · Periòdic del Camp de Túria`,
    )
    const enlaces = [...linea.querySelectorAll('a')]
    expect(enlaces.map((a) => a.getAttribute('href'))).toEqual([VPLAZA.link, INFOTURIA.link])
    expect(enlaces[1].getAttribute('title')).toBe(INFOTURIA.title)
  }, 60000)

  it('un anuncio de Fotocasa no es prensa: ni fila ni cuenta', async () => {
    const { container } = await pinta('es')
    expect(container.textContent).not.toContain(FOTOCASA.title)
    // 26 piezas en el fixture, 25 sin el anuncio.
    expect(container.textContent).toContain(
      rellena(CATALOGUE.es['cambios.frase.prensa'], { n: 25 }),
    )
    const tarjeta = container.querySelector('[data-clase="prensa"]')
    expect(tarjeta.textContent).toContain(rellena(CATALOGUE.es['cambios.n'], { n: 25 }))
  }, 60000)

  it('las cuentas cuadran: las piezas de las filas más «y N más» son las de la cabecera', async () => {
    const { container } = await pinta('es')
    const tarjeta = container.querySelector('[data-clase="prensa"]')
    const pintadas = [...tarjeta.querySelectorAll('[data-noticia]')].reduce(
      (s, f) => s + Number(f.getAttribute('data-piezas')),
      0,
    )
    const resto = 25 - pintadas
    expect(resto).toBeGreaterThan(0)
    expect(tarjeta.textContent).toContain(rellena(CATALOGUE.es['cambios.mas'], { n: resto }))
  }, 60000)

  it('en valencià, la línea también', async () => {
    const { container } = await pinta('ca')
    const linea = container.querySelector('[data-clase="prensa"] [data-publicada-en]')
    expect(linea.textContent.startsWith(CATALOGUE.ca['cambios.prensa.publicadaEn'])).toBe(true)
  }, 60000)
})
