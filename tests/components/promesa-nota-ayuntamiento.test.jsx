/**
 * Una nota del Ayuntamiento bajo la pastilla de un partido dice por qué.
 *
 * La regla de /promesas toma el texto de una nota municipal por palabras del
 * gobierno, que es el partido de la alcaldía. La ficha no lo decía, y junto a
 * la bitácora («sin palabras del partido», de la cita ANTERIOR) se leía como
 * que la vigente tampoco era del partido (revisión lectora, 18-10-2026). La
 * frase es derivada: sale sólo en las fichas cuya fuente es del Ayuntamiento,
 * y el partido lo pone el listado de la corporación, no este fichero.
 */
import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { render, cleanup, waitFor } from '@testing-library/react'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { MemoryRouter } from 'react-router-dom'

import Promesas, { PromiseCard } from '../../src/pages/Promesas'
import { isAyuntamientoUrl, notaDelAyuntamiento } from '../../src/scraper/promise-grounding'
import { partyOfAlcaldia } from '../../src/scraper/corporation-seats'
import { invalidateSnapshots } from '../../src/lib/snapshot-store'

const ROOT = join(__dirname, '..', '..')
const SNAP = JSON.parse(readFileSync(join(ROOT, 'public/data/promises.json'), 'utf8'))
const OFFICIALS = JSON.parse(readFileSync(join(ROOT, 'public/data/officials.json'), 'utf8'))

const realFetch = globalThis.fetch
beforeEach(() => {
  globalThis.fetch = async (url) => {
    const f = join(ROOT, 'public', String(url).split('?')[0])
    return existsSync(f)
      ? new Response(readFileSync(f, 'utf8'), { status: 200 })
      : new Response('not found', { status: 404 })
  }
  invalidateSnapshots()
})
afterAll(() => {
  globalThis.fetch = realFetch
  invalidateSnapshots()
  cleanup()
})

describe('/promesas: la nota del Ayuntamiento y el partido de la alcaldía', () => {
  it('la premisa medida: hoy hay fichas con fuente municipal, y ninguna bajo otro partido', () => {
    const delAyuntamiento = SNAP.items.filter((p) => isAyuntamientoUrl(p.source.url))
    // Sin esto, la prueba de abajo pasaría en verde sin pintar ninguna frase.
    expect(delAyuntamiento.length).toBeGreaterThan(0)
    // Una nota municipal bajo un partido que no tiene la alcaldía es un error
    // de atribución, no una salvedad que pintar: lo frena la puerta
    // (`partyOwnsCouncilText`) y aquí se ve si alguno ya está publicado.
    const otra = delAyuntamiento.filter(
      (p) => notaDelAyuntamiento(p, OFFICIALS)?.atribucion === 'otra',
    )
    expect(otra.map((p) => p.id)).toEqual([])
  })

  it('cada ficha con fuente del Ayuntamiento lo dice, con el partido del listado; las demás no', async () => {
    const c = render(
      <MemoryRouter>
        <Promesas />
      </MemoryRouter>,
    )
    const esperadas = SNAP.items.filter((p) => isAyuntamientoUrl(p.source.url)).length
    await waitFor(() =>
      expect(c.container.querySelectorAll('[data-nota-ayuntamiento]').length).toBe(esperadas),
    )
    const alcaldia = partyOfAlcaldia(OFFICIALS)
    for (const nota of c.container.querySelectorAll('[data-nota-ayuntamiento]')) {
      const t = nota.textContent
      expect(t).toContain('es el texto del gobierno municipal, no un comunicado del partido')
      if (nota.dataset.notaAyuntamiento === 'coincide')
        expect(t).toContain(`Se atribuye al ${alcaldia} porque es el partido de la alcaldía.`)
    }
    // Una ficha de prensa no lleva la frase.
    const prensa = SNAP.items.find((p) => !isAyuntamientoUrl(p.source.url))
    if (prensa) {
      const tarjeta = [...c.container.querySelectorAll('blockquote')].find((b) =>
        b.textContent.includes(prensa.quote),
      ).parentElement
      expect(tarjeta.querySelector('[data-nota-ayuntamiento]')).toBeNull()
    }
  })

  it('sin listado de la corporación no nombra partido; mientras carga, no pinta nada', () => {
    const p = SNAP.items.find((it) => isAyuntamientoUrl(it.source.url))
    const tarjeta = (officials) =>
      render(
        <MemoryRouter>
          <PromiseCard
            p={p}
            suggestion={null}
            llmEvidence={null}
            frozen={false}
            officials={officials}
          />
        </MemoryRouter>,
      ).container
    const sinListado = tarjeta(null).querySelector('[data-nota-ayuntamiento]')
    expect(sinListado.dataset.notaAyuntamiento).toBe('sin-alcaldia')
    expect(sinListado.textContent).not.toContain('Se atribuye')
    expect(sinListado.textContent).not.toContain('alcaldía')
    cleanup()
    expect(tarjeta(undefined).querySelector('[data-nota-ayuntamiento]')).toBeNull()
  })
})
