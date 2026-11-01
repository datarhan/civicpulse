/**
 * /cargos dice una vez por sección lo que cada tarjeta repetía (auditoría de las
 * dos lecturas, §3, punto 2): en «Quién dirige qué», de dónde sale lo que cita
 * el bloque «Encaje declarado», con una marca en cada tarjeta; en «Quién
 * fiscaliza», por qué ese bloque está en blanco, con la etiqueta en cada una.
 *
 * La página se monta con public/data. Qué tarjeta lleva marca y cuál su frase
 * propia se deriva aquí con las mismas funciones; ningún nombre se escribe a
 * mano. El periodo electoral se prueba sirviendo promises.json con un
 * `frozenUntil` futuro, el mismo interruptor que esconde el bloque.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { render, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

import Cargos from '../../src/pages/Cargos'
import { CATALOGUE, LocaleProvider } from '../../src/i18n'
import { invalidateSnapshots, peekSnapshot } from '../../src/lib/snapshot-store'
import { citesNothing, fitRowsForSlug, sharedRespaldo } from '../../src/hooks/useAreaFit'
import { conAreasDelegadas, sinAreasDelegadas } from '../../src/scraper/en-breve-cargos'

const lee = (f) => JSON.parse(readFileSync(`public/data/${f}`, 'utf8'))
const LISTA = lee('officials.json')
const FIT = lee('area-fit.json')
const GOBIERNO = conAreasDelegadas(LISTA.officials)
const OPOSICION = sinAreasDelegadas(LISTA.officials)
const es = CATALOGUE.es
const CON_MARCA = GOBIERNO.filter(
  (o) => sharedRespaldo(fitRowsForSlug(FIT, o.slug)) === 'autodeclarada',
)
const SIN_CITA = GOBIERNO.filter((o) => {
  const filas = fitRowsForSlug(FIT, o.slug)
  return filas.length > 0 && citesNothing(filas)
})

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

async function monta(cambios) {
  localStorage.setItem('cp:lang', 'es')
  sirve(cambios)
  const r = render(
    <MemoryRouter initialEntries={['/cargos']}>
      <LocaleProvider>
        <Cargos />
      </LocaleProvider>
    </MemoryRouter>,
  )
  await waitFor(() => expect(r.container.querySelector('#quien-dirige')).not.toBeNull(), {
    timeout: 15000,
  })
  for (const f of ['/data/promises.json', '/data/area-fit.json'])
    await waitFor(() => expect(peekSnapshot(f)?.status).toBe('ready'), { timeout: 15000 })
  return r.container
}

describe('/cargos · lo que cada tarjeta repetía, una vez por sección', () => {
  it('mide algo: hay tarjetas con marca, tarjetas sin cita y oposición', () => {
    expect(CON_MARCA.length).toBeGreaterThan(0)
    expect(SIN_CITA.length).toBeGreaterThan(0)
    expect(OPOSICION.length).toBeGreaterThan(0)
  })

  it('«Quién dirige qué» dice de dónde sale lo citado una vez, y cada tarjeta lleva su marca', async () => {
    const c = await monta()
    const dirige = c.querySelector('#quien-dirige')
    await waitFor(() =>
      expect(dirige.querySelectorAll('[data-respaldo-marca]')).toHaveLength(CON_MARCA.length),
    )
    const nota = dirige.querySelectorAll('[data-respaldo-seccion]')
    expect(nota).toHaveLength(1)
    expect(nota[0].textContent).toBe(es['encaje.seccion.autodeclarada'])
    // La frase de cada tarjeta, en ninguna; la del «qué se comparó», en las que no citan.
    expect(c.textContent).not.toContain(es['encaje.respaldo.autodeclarada'])
    expect(c.textContent.split(es['encaje.card.sinCita'])).toHaveLength(SIN_CITA.length + 1)
    // Y la nota va antes de las tarjetas.
    const primera = dirige.querySelector('[data-respaldo-marca]')
    expect(nota[0].compareDocumentPosition(primera) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  }, 60000)

  it('«Quién fiscaliza» dice por qué el bloque está en blanco una vez; la etiqueta, en cada tarjeta', async () => {
    const c = await monta()
    const fiscaliza = c.querySelector('#quien-fiscaliza')
    await waitFor(() =>
      expect(fiscaliza.textContent.split(es['encaje.sinDelegacion.label'])).toHaveLength(
        OPOSICION.length + 1,
      ),
    )
    expect(fiscaliza.querySelectorAll('[data-sin-delegacion-seccion]')).toHaveLength(1)
    expect(fiscaliza.textContent.split(es['encaje.sinDelegacion.seccion'])).toHaveLength(2)
    expect(c.textContent).not.toContain(es['encaje.sinDelegacion.note'])
  }, 60000)

  it('en periodo electoral no queda ni la nota, ni la marca, ni la frase de la oposición', async () => {
    const promesas = lee('promises.json')
    const c = await monta({ 'promises.json': { ...promesas, frozenUntil: '2099-01-01' } })
    expect(c.querySelectorAll('[data-respaldo-seccion]')).toHaveLength(0)
    expect(c.querySelectorAll('[data-respaldo-marca]')).toHaveLength(0)
    expect(c.querySelectorAll('[data-sin-delegacion-seccion]')).toHaveLength(0)
    expect(c.textContent).not.toContain(es['encaje.sinDelegacion.label'])
    // Lo demás de la sección sigue: la página no se ha quedado en blanco.
    expect(c.querySelector('#quien-fiscaliza').textContent).toContain(es['cargos.oposicion.nota'])
  }, 60000)
})
