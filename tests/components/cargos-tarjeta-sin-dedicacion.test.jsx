import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

import { RetribucionBadge } from '../../src/pages/Cargos'
import { LocaleProvider } from '../../src/i18n'
import { installFetchMock } from '../setup/mockFetch'
import dedicacionesPublicadas from '../../public/data/dedicaciones.json'
import officialsPublicados from '../../public/data/officials.json'

/**
 * La tarjeta de un concejal sin dedicación decía «asistencias por sesión · sin
 * dedicación; el ISPA no publica el nombre». La revisión lectora lo leyó como
 * que esa persona es una de las filas anónimas del ISPA, cuando la misma página
 * dice que esas filas «no se adjudican a nadie». Lo que la tarjeta afirma —sin
 * dedicación, cobra asistencias— lo dice el ACUERDO del pleno, no el ISPA: los
 * catorce concejales sin dedicación y sus importes por sesión están en él. La
 * tarjeta cita el acuerdo y no nombra el ISPA.
 */
const conFila = new Set(dedicacionesPublicadas.byOfficial.map((r) => r.slug))
const sinDedicacion = officialsPublicados.officials.find((o) => !conFila.has(o.slug))

function monta(idioma) {
  localStorage.setItem('cp:lang', idioma)
  installFetchMock({ '/data/dedicaciones.json': dedicacionesPublicadas })
  return render(
    <LocaleProvider>
      <MemoryRouter>
        <RetribucionBadge official={sinDedicacion} />
      </MemoryRouter>
    </LocaleProvider>,
  )
}

describe('tarjeta de /cargos de un concejal sin dedicación', () => {
  it('hay alguien sin fila de dedicación en los datos publicados (la prueba mide algo)', () => {
    expect(sinDedicacion).toBeTruthy()
  })

  for (const idioma of ['es', 'ca']) {
    it(`cita el acuerdo y no el ISPA (${idioma})`, async () => {
      const { container } = monta(idioma)
      const enlace = await screen.findByRole('link', { name: /acuerdo|acord/ })
      expect(enlace.getAttribute('href')).toBe(dedicacionesPublicadas.source.url)
      const tarjeta = container.querySelector('[data-retribucion="sin-dedicacion"]')
      expect(tarjeta, 'la tarjeta pinta el estado sin dedicación').not.toBeNull()
      expect(tarjeta.textContent).not.toMatch(/ISPA/)
      expect(tarjeta.textContent).toMatch(idioma === 'es' ? /según el acuerdo/ : /segons l’acord/)
    })
  }
})
