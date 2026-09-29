/**
 * Un informe del agente que cita una promesa retirada dice que se retiró.
 *
 * Las biografías de /laboratorio/agentes guardan los ids de las promesas que
 * consultaron («Promesas referenciadas»). Cuando el 28-09-2026 se retiraron las
 * fichas cuya cita no eran palabras del partido, esos ids dejaron de resolver y
 * el tablero pintaba el id pelado, enlazado a una tarjeta que ya no existe —lo
 * mismo que llevaba pasando desde agosto con la del alumbrado LED—. Ahora dice
 * que se retiró, cuándo y por qué, sin repetir la cita retirada.
 */
import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { render, cleanup, waitFor } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { MemoryRouter } from 'react-router-dom'

import { PromiseMiniBoard } from '../../src/components/journalist/Sections'
import { invalidateSnapshots } from '../../src/lib/snapshot-store'

const RAW = readFileSync(join(__dirname, '..', '..', 'public/data/promises.json'), 'utf8')
const SNAP = JSON.parse(RAW)

const realFetch = globalThis.fetch
beforeEach(() => {
  globalThis.fetch = async (url) =>
    String(url).endsWith('/data/promises.json')
      ? new Response(RAW, { status: 200, headers: { 'content-type': 'application/json' } })
      : new Response('not found', { status: 404 })
  invalidateSnapshots()
})
afterAll(() => {
  globalThis.fetch = realFetch
  invalidateSnapshots()
  cleanup()
})

describe('el tablero de promesas de un informe', () => {
  it('mide algo: el fichero publicado trae retiradas y promesas vivas', () => {
    expect(SNAP.retractions?.length).toBeGreaterThan(0)
    expect(SNAP.items.length).toBeGreaterThan(0)
  })

  it('una promesa retirada dice cuándo y por qué, y no enseña el id pelado', async () => {
    const t = SNAP.retractions[0]
    const viva = SNAP.items[0]
    const c = render(
      <MemoryRouter>
        <PromiseMiniBoard payload={{ promiseIds: [t.promiseId, viva.id] }} />
      </MemoryRouter>,
    )
    await waitFor(() => expect(c.container.textContent).toContain('Promesa retirada el'))
    const texto = c.container.textContent
    expect(texto).toContain(`Promesa retirada el ${t.retractedAt.slice(0, 10)}: ${t.reason}`)
    expect(texto).not.toContain(`${t.promiseId} →`)
    // La viva sigue resolviéndose a su cita.
    expect(texto).toContain(viva.quote.slice(0, 40))
  })
})
