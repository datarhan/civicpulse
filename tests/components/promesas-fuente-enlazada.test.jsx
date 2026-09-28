/**
 * /promesas no llama «primarias» a unas fuentes que pueden ser prensa.
 *
 * La revisión lectora del pre-push (28-09-2026) leyó al pie de /promesas
 * «compromisos públicos atribuidos a partidos y cargos mediante fuentes
 * primarias enlazadas», encima de fichas que citaban Levante-EMV, Las
 * Provincias o El Periódico de Aquí. Para un lector, «primaria» es el documento
 * original —el programa, el acta, la nota del Ayuntamiento—, no la noticia que lo
 * cuenta. La entradilla de la página decía lo mismo («cada uno enlazado a su
 * fuente primaria») y la portada también («con cita verbatim y fuente
 * primaria»).
 *
 * El aviso lo guarda el validador (`FUENTE_PRIMARIA` en
 * `src/scraper/promises.ts`); esto mira lo que el lector recibe: la página
 * entera, pintada con el fichero publicado, y el texto de la portada en las dos
 * lenguas del catálogo. La regla es la exportada, no una copia.
 */
import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { render, cleanup, waitFor } from '@testing-library/react'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { MemoryRouter } from 'react-router-dom'

import Promesas from '../../src/pages/Promesas'
import { FUENTE_PRIMARIA } from '../../src/scraper/promises'
import { CATALOGUE, LOCALES } from '../../src/i18n'
import { invalidateSnapshots } from '../../src/lib/snapshot-store'

const ROOT = join(__dirname, '..', '..')
const PROMESAS = JSON.parse(readFileSync(join(ROOT, 'public/data/promises.json'), 'utf8'))

const realFetch = globalThis.fetch
beforeEach(() => {
  // Se sirve lo publicado de verdad —promesas, sugerencias, salud de las
  // citas—: la página se pinta como la ve el lector, no con un apaño.
  globalThis.fetch = async (url) => {
    const ruta = join(ROOT, 'public', String(url).split('?')[0])
    return existsSync(ruta)
      ? new Response(readFileSync(ruta, 'utf8'), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      : new Response('not found', { status: 404 })
  }
  invalidateSnapshots()
})
afterAll(() => {
  globalThis.fetch = realFetch
  invalidateSnapshots()
  cleanup()
})

const plano = (c) => c.container.textContent.replace(/\s+/g, ' ')

describe('/promesas dice qué es cada fuente, sin llamarla primaria', () => {
  it('la página entera, aviso incluido, no llama primarias a sus fuentes', async () => {
    const c = render(
      <MemoryRouter>
        <Promesas />
      </MemoryRouter>,
    )
    // Mide algo: el aviso publicado y la primera ficha están pintados. Sin esto
    // la prueba pasaría sobre «Cargando seguimiento de promesas…».
    await waitFor(() => expect(plano(c)).toContain(PROMESAS.legalNotice.replace(/\s+/g, ' ')))
    expect(plano(c)).toContain(PROMESAS.items[0].quote)
    expect(plano(c)).not.toMatch(FUENTE_PRIMARIA)
  })

  it('el texto de la portada tampoco, en ninguna de las dos lenguas', () => {
    expect(LOCALES.length).toBeGreaterThan(1)
    for (const locale of LOCALES) {
      const blurb = CATALOGUE[locale]['landing.promesas.blurb']
      expect(blurb, locale).toBeTruthy()
      expect(blurb, locale).not.toMatch(FUENTE_PRIMARIA)
    }
  })
})
