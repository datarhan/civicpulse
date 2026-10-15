/**
 * /metodologia no puede decir a la vez que el acta está en regmeet y que no se
 * puede descargar. Hasta el 15-10-2026 lo decía: el punto «Hoy no hay ningún
 * desglose cotejado» (escrito el 09-08, 61558ae6) sobrevivió a #326/#327, que
 * encontraron las actas en la pestaña «Documentos» de regmeet. Una revisión
 * externa lo citó como hecho: «0 de 45 desgloses».
 *
 * Se lee el texto RENDERIZADO, no el JSX: los comentarios «Decía …» guardan a
 * propósito la redacción vieja. El montaje es el de
 * metodologia-citas-contraste.test.jsx: mismo fetch simulado, mismo almacén de
 * instantáneas vaciado antes y después.
 */
import { describe, expect, it, beforeAll, afterAll } from 'vitest'
import { render, cleanup, waitFor } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import Metodologia from '../src/pages/Metodologia'
import { invalidateSnapshots, peekSnapshot } from '../src/lib/snapshot-store'

const ROOT = join(__dirname, '..')
const PROVENANCE = readFileSync(join(ROOT, 'public/data/finding-quote-provenance.json'), 'utf8')

const realFetch = globalThis.fetch
let texto = ''

beforeAll(async () => {
  globalThis.fetch = async (url) =>
    String(url).endsWith('/data/finding-quote-provenance.json')
      ? new Response(PROVENANCE, { status: 200, headers: { 'content-type': 'application/json' } })
      : new Response('not found', { status: 404 })
  invalidateSnapshots()
  const { container } = render(<Metodologia />)
  await waitFor(() => {
    expect(peekSnapshot('/data/finding-quote-provenance.json')?.status).toBe('ready')
  })
  texto = container.textContent.replace(/\s+/g, ' ')
})

afterAll(() => {
  globalThis.fetch = realFetch
  invalidateSnapshots()
  cleanup()
})

describe('/metodologia y las actas', () => {
  it('mide la página entera (si no, las demás pasarían sin mirar nada)', () => {
    expect(texto).toContain('El plazo debe venir del acta.')
    expect(texto).toContain('El grupo también debe venir de la fuente.')
  })

  it('ya no dice que el acta no se pueda descargar', () => {
    expect(texto).toContain('pestaña «Documentos»')
    expect(texto).not.toMatch(/no se puede descargar|no puede descargarla/)
    expect(texto).not.toMatch(/reorganizó dos veces/)
    expect(texto).toContain('El acta ya se puede leer, y es contra lo que se coteja.')
  })

  it('no fija a mano cuántas transcripciones hay', () => {
    expect(texto).not.toMatch(/\b\d+ transcripciones que hay en disco/)
  })
})
