/**
 * Lo que se corrige o se retira en /promesas se ve, y lo retirado no se lee.
 *
 * Desde el 28-09-2026 la cita de una promesa son palabras del partido, y la
 * auditoría dejó tarjetas para recitar y para retirar. Una cita corregida
 * enseña en su ficha lo que decía antes; una tarjeta retirada deja en la página
 * fecha, partido, motivo y huella, pero no su cita: si no era del partido,
 * repetirla sería volver a atribuírsela.
 */
import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { render, cleanup, waitFor } from '@testing-library/react'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { MemoryRouter } from 'react-router-dom'

import Promesas, { PromiseCard } from '../../src/pages/Promesas'
import { withQuoteCorrection, withRetraction } from '../../src/scraper/promise-corrections'
import { invalidateSnapshots } from '../../src/lib/snapshot-store'

const ROOT = join(__dirname, '..', '..')
const RAW = readFileSync(join(ROOT, 'public/data/promises.json'), 'utf8')
const NOW = new Date('2026-09-28T18:00:00.000Z')
const FIRMA = {
  reason: 'La cita era la narración del periodista; la fuente trae las palabras del partido.',
  editor: 'claude-opus-5.5',
}

let servido = RAW
const realFetch = globalThis.fetch
beforeEach(() => {
  globalThis.fetch = async (url) => {
    const ruta = String(url).split('?')[0]
    if (ruta.endsWith('/data/promises.json'))
      return new Response(servido, { status: 200, headers: { 'content-type': 'application/json' } })
    const f = join(ROOT, 'public', ruta)
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

const plano = (c) => c.container.textContent.replace(/\s+/g, ' ')

describe('/promesas enseña sus correcciones y sus retiradas', () => {
  it('una cita corregida lleva su bitácora, con la cita de antes rotulada', () => {
    const p0 = JSON.parse(RAW).items[0]
    const nueva = 'una cita nueva, lo bastante larga para el esquema'
    const p = JSON.parse(withQuoteCorrection(RAW, p0.id, { quote: nueva }, FIRMA, NOW)).items[0]
    const c = render(
      <MemoryRouter>
        <PromiseCard p={p} suggestion={null} llmEvidence={null} frozen={false} />
      </MemoryRouter>,
    )
    const t = plano(c)
    expect(t).toContain('Bitácora de correcciones · 1')
    expect(t).toContain(`cita · 2026-09-28 · ${FIRMA.editor}`)
    expect(t).toContain(`Texto retirado: ${p0.quote}`)
    expect(t).toContain(`Texto vigente: ${nueva}`)
    expect(t).toContain(`Motivo: ${FIRMA.reason}`)
  })

  it('una ficha retirada deja fecha, partido, motivo y huella, y no su cita', async () => {
    const p0 = JSON.parse(RAW).items[0]
    const motivo = 'La fuente no pone en boca del partido ninguna frase con este compromiso.'
    servido = withRetraction(RAW, p0.id, { reason: motivo, editor: FIRMA.editor }, NOW)
    const t0 = JSON.parse(servido).retractions.at(-1)
    const c = render(
      <MemoryRouter>
        <Promesas />
      </MemoryRouter>,
    )
    await waitFor(() => expect(plano(c)).toContain('Promesas retiradas ·'))
    const t = plano(c)
    expect(t).toContain(motivo)
    expect(t).toContain(t0.digest)
    expect(t).toContain(`2026-09-28 · ${p0.party} · ${p0.id}`)
    expect(t).not.toContain(p0.quote)
    servido = RAW
  })
})
