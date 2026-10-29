/**
 * La plantilla municipal se muda de /cargos a /empleo-publico (auditoría de las
 * dos lecturas, §3, punto 5, y §21): allí, con la frase que dice qué cuenta
 * cada cifra y por qué no se restan; en /cargos, una línea que apunta a ella.
 *
 * Las dos páginas se montan con public/data. La frase se reconstruye aquí con
 * `puenteDePlantilla` y el catálogo; ninguna cifra se escribe a mano.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { render, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

import Cargos from '../../src/pages/Cargos'
import EmpleoPublico from '../../src/pages/EmpleoPublico'
import { CATALOGUE, LocaleProvider } from '../../src/i18n'
import { rellena } from '../../src/lib/formatters'
import { invalidateSnapshots } from '../../src/lib/snapshot-store'
import { puenteDePlantilla } from '../../src/scraper/plantilla-en-breve'

const PLANTILLA = JSON.parse(readFileSync('public/data/plantilla.json', 'utf8'))

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

function monta(Pagina, ruta, idioma = 'es') {
  localStorage.setItem('cp:lang', idioma)
  sirve()
  return render(
    <MemoryRouter initialEntries={[ruta]}>
      <LocaleProvider>
        <Pagina />
      </LocaleProvider>
    </MemoryRouter>,
  ).container
}

/** La frase que la página tiene que decir, desde el fichero y el catálogo. */
function frase(cat) {
  const p = puenteDePlantilla(PLANTILLA)
  return [
    rellena(cat['empleoPublico.plantilla.personasFrase'], {
      n: p.personas.n,
      anio: p.personas.anio,
    }),
    rellena(cat['empleoPublico.plantilla.plazasFrase'], {
      n: p.plazas.aprox
        ? rellena(cat['empleoPublico.plantilla.unas'], { n: p.plazas.n })
        : p.plazas.n,
      anio: p.plazas.anio,
    }),
    cat['empleoPublico.plantilla.noSeRestan'],
  ].join(' ')
}

describe('la plantilla municipal, en /empleo-publico', () => {
  it('mide algo: el fichero trae las dos cifras que la frase tiene que cuadrar', () => {
    const p = puenteDePlantilla(PLANTILLA)
    expect(p.personas).not.toBeNull()
    expect(p.plazas).not.toBeNull()
  })

  it('dice qué cuenta cada cifra y por qué no se restan, y debajo las cifras con sus fuentes', async () => {
    const c = monta(EmpleoPublico, '/empleo-publico')
    await waitFor(() => expect(c.querySelector('#plantilla')).not.toBeNull(), { timeout: 15000 })
    const seccion = c.querySelector('#plantilla')
    expect(seccion.querySelector('h2').textContent).toBe(
      CATALOGUE.es['empleoPublico.plantilla.pregunta'],
    )
    expect(seccion.querySelector('[data-puente-plantilla]').textContent).toBe(frase(CATALOGUE.es))
    expect(seccion.textContent).toContain(String(PLANTILLA.total))
    expect(seccion.textContent).toContain(`≈${PLANTILLA.authorized.plazas}`)
    expect(seccion.querySelector(`a[href="${PLANTILLA.source.url}"]`)).not.toBeNull()
    expect(seccion.querySelector(`a[href="${PLANTILLA.authorized.source.url}"]`)).not.toBeNull()
  }, 60000)

  it('en valenciano, la misma frase con las palabras del catálogo', async () => {
    const c = monta(EmpleoPublico, '/empleo-publico', 'ca')
    await waitFor(() => expect(c.querySelector('[data-puente-plantilla]')).not.toBeNull(), {
      timeout: 15000,
    })
    expect(c.querySelector('[data-puente-plantilla]').textContent).toBe(frase(CATALOGUE.ca))
  }, 60000)
})

describe('/cargos ya no la pinta: deja una línea que apunta a ella', () => {
  it('sin el bloque, con el enlace a /empleo-publico#plantilla', async () => {
    const c = monta(Cargos, '/cargos')
    await waitFor(() => expect(c.querySelector('[data-puntero-plantilla]')).not.toBeNull(), {
      timeout: 15000,
    })
    const puntero = c.querySelector('[data-puntero-plantilla]')
    expect(puntero.textContent).toContain(CATALOGUE.es['cargos.plantilla.puntero'])
    expect(puntero.querySelector('a').getAttribute('href')).toBe('/empleo-publico#plantilla')
    expect(c.textContent).not.toContain(CATALOGUE.es['empleoPublico.plantilla.title'])
    expect(c.textContent).not.toContain(PLANTILLA.note)
  }, 60000)
})
