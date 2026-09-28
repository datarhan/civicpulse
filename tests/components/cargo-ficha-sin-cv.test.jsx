import { describe, expect, it } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'

import CargoDetalle from '../../src/pages/CargoDetalle'
import { installFetchMock } from '../setup/mockFetch'
import { CATALOGUE } from '../../src/i18n'
import { INDICE_CV_RETIRADO } from '../../src/lib/indice-cv-retirado'
import { fmtDateLong, rellena } from '../../src/lib/formatters'

/**
 * «El Ayuntamiento no publica su ficha», escaño a escaño.
 *
 * La salvedad decía de todo escaño sin currículo que «no se puede decir si se
 * retiró o nunca estuvo». Para los tres de hoy es falso: el registro propio leyó
 * 67 veces la página vieja y ninguno figuraba. Pero la frase se pinta para
 * cualquiera que se quede sin currículo, y a quien SÍ figuraba no se le puede
 * decir que no estaba. Tres casos, montando la página de verdad:
 *
 *   ausente   — sentado durante las lecturas y en ninguna: se dice, con la ventana.
 *   presente  — figuraba y hoy no tiene (fabricado): se dice que sí estaba.
 *   sin dato  — el registro no lo alcanza: sólo el hecho de hoy, sin historia.
 */
const AUSENTE = INDICE_CV_RETIRADO.ausentes[0]
const PRESENTE = INDICE_CV_RETIRADO.presentes[0]
const NUEVO = 'quien-llegue-despues'

const persona = (slug, name) => ({
  slug,
  name,
  honorific: 'Sr.',
  role: 'concejal',
  party: 'PSOE',
  portfolios: [],
  email: null,
  photoUrl: '',
  partyLogoUrl: '',
  cvUrl: null,
})

const OFICIALES = {
  generatedAt: '2026-09-28T00:00:00Z',
  source: 'ribarroja.es',
  count: 3,
  composition: { PSOE: 3 },
  officials: [
    persona(AUSENTE, 'Persona Ausente Uno'),
    persona(PRESENTE, 'Persona Presente Dos'),
    persona(NUEVO, 'Persona Nueva Tres'),
  ],
  formerOfficials: [],
}

const conVentana = (clave) =>
  rellena(CATALOGUE.es[clave], {
    lecturas: INDICE_CV_RETIRADO.lecturas,
    primera: fmtDateLong(INDICE_CV_RETIRADO.primera),
    ultima: fmtDateLong(INDICE_CV_RETIRADO.ultima),
  })

async function ficha(slug, nombre) {
  installFetchMock({ '/data/officials.json': OFICIALES })
  render(
    <MemoryRouter initialEntries={[`/cargos/${slug}`]}>
      <Routes>
        <Route path="/cargos/:slug" element={<CargoDetalle />} />
      </Routes>
    </MemoryRouter>,
  )
  await waitFor(() => expect(screen.getAllByText(nombre).length).toBeGreaterThan(0))
  const titulo = await screen.findByText(CATALOGUE.es['cargos.detalle.ficha.sin.title'])
  return titulo.parentElement.textContent
}

describe('/cargos/:slug · la ficha que falta, dicha escaño a escaño', () => {
  it('a quien no figuró en ninguna lectura se le dice, con la ventana del registro', async () => {
    const texto = await ficha(AUSENTE, 'Persona Ausente Uno')
    expect(texto).toContain(CATALOGUE.es['cargos.detalle.ficha.sin.body'])
    expect(texto).toContain(conVentana('cargos.detalle.ficha.sin.ausente'))
    expect(texto).not.toMatch(/no se puede decir si se retiró/)
  })

  it('a quien sí figuraba no se le dice que no estaba', async () => {
    const texto = await ficha(PRESENTE, 'Persona Presente Dos')
    expect(texto).toContain(conVentana('cargos.detalle.ficha.sin.presente'))
    expect(texto).not.toContain(conVentana('cargos.detalle.ficha.sin.ausente'))
  })

  it('a quien el registro no alcanza sólo se le dice lo de hoy', async () => {
    const texto = await ficha(NUEVO, 'Persona Nueva Tres')
    // Midió algo: la ficha sin currículo se pintó.
    expect(texto).toContain(CATALOGUE.es['cargos.detalle.ficha.sin.body'])
    expect(texto).not.toContain(conVentana('cargos.detalle.ficha.sin.ausente'))
    expect(texto).not.toContain(conVentana('cargos.detalle.ficha.sin.presente'))
    expect(texto).not.toMatch(/Internet Archive/)
  })
})
