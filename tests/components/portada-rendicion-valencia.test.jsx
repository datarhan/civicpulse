import { afterEach, describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'

import { LocaleProvider } from '../../src/i18n'
import { DepartamentosBlockD } from '../../src/variants/direction-d/blocks/GovernmentBlocks'
import { installFetchMock } from '../setup/mockFetch'
import { detectorDeCastellano, loQueSeLee } from '../setup/castellano'

/**
 * La portada en valencià pintaba «Concejalías», «Con responsable» y «Concejales»
 * en castellano: escritos a mano en `DepartamentosBlockD`, fuera del catálogo, así
 * que ni la caída al castellano los delataba. La clase de #19, en otro bloque.
 */
const { castellanoEn } = detectorDeCastellano([])

function pinta(idioma) {
  localStorage.setItem('cp:lang', idioma)
  installFetchMock({
    '/data/plenos-agendas.json': {
      plenos: [],
      stats: { deptCoverage: 19, plazosVencidosCount: 0 },
    },
    '/data/officials.json': {
      officials: [
        { slug: 'a', name: 'A' },
        { slug: 'b', name: 'B' },
      ],
    },
    '/data/promises.json': { items: [] },
  })
  return render(
    <LocaleProvider>
      <DepartamentosBlockD />
    </LocaleProvider>,
  )
}

afterEach(() => localStorage.clear())

describe('portada · el bloque de rendición de cuentas en valencià', () => {
  // Los tres rótulos («Regidories», «Amb responsable», «Regidors») son ya una
  // frase del catálogo (auditoría «dos lecturas», 25-10-2026).
  it('la frase sale del catálogo', async () => {
    pinta('ca')
    expect(await screen.findByText('28 regidories; en 19 consta qui la porta.')).toBeInTheDocument()
  })

  it('y en el bloque no queda nada en castellano', async () => {
    const { container } = pinta('ca')
    await screen.findByText(/en 19 consta/) // mide algo: el bloque ha leído sus datos
    const texto = loQueSeLee(container).join(' · ')
    expect(texto.length, 'hay poco texto que leer').toBeGreaterThan(60)
    expect(castellanoEn(texto)).toEqual([])
  })

  it('y en castellano, en castellano (el control)', async () => {
    pinta('es')
    expect(
      await screen.findByText('28 concejalías; en 19 consta quién la lleva.'),
    ).toBeInTheDocument()
  })
})
