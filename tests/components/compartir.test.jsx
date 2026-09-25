import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Compartir, { enlacesParaCompartir, SITIO } from '../../src/components/Compartir'
import { LocaleProvider } from '../../src/i18n'

/**
 * Compartir una página por WhatsApp o Telegram, o copiar su enlace.
 *
 * Lo que se comparte es la dirección PÚBLICA de la página, sin consulta ni
 * ancla, y el titular real de lo que se comparte, sin nada redactado encima.
 * Un enlace copiado desde una vista previa o con el filtro de quien lo mandaba
 * no le sirve a quien lo recibe.
 */

const pintar = (entrada, props) =>
  render(
    <LocaleProvider>
      <MemoryRouter initialEntries={[entrada]}>
        <Compartir {...props} />
      </MemoryRouter>
    </LocaleProvider>,
  )

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('enlacesParaCompartir', () => {
  it('comparte la dirección pública, sin consulta ni ancla', () => {
    const { url } = enlacesParaCompartir('T', '/hallazgos/f-1?utm_source=x#arriba')
    expect(url).toBe(`${SITIO}/hallazgos/f-1`)
    expect(SITIO).toBe('https://www.civicpulse.es')
  })

  it('WhatsApp lleva el titular y el enlace; Telegram, cada uno en su parámetro', () => {
    const titulo = 'Pleno · Sesión de 7 de septiembre & más'
    const { url, whatsapp, telegram } = enlacesParaCompartir(titulo, '/plenos/1xmr0do')
    expect(whatsapp).toBe(`https://wa.me/?text=${encodeURIComponent(`${titulo}\n${url}`)}`)
    expect(telegram).toBe(
      `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(titulo)}`,
    )
  })

  // Sin titular no se inventa uno: se comparte el enlace solo.
  it('sin titular, sólo el enlace', () => {
    const { url, whatsapp, telegram } = enlacesParaCompartir(undefined, '/cargos/x')
    expect(whatsapp).toBe(`https://wa.me/?text=${encodeURIComponent(url)}`)
    expect(telegram).toBe(`https://t.me/share/url?url=${encodeURIComponent(url)}`)
  })
})

describe('<Compartir>', () => {
  it('por defecto comparte la página en la que se está', () => {
    pintar('/hallazgos/f-1?filtro=x', { titulo: 'Titular' })
    const esperado = encodeURIComponent(`${SITIO}/hallazgos/f-1`)
    expect(
      screen.getByRole('link', { name: 'Compartir en WhatsApp' }).getAttribute('href'),
    ).toContain(esperado)
    expect(
      screen.getByRole('link', { name: 'Compartir en Telegram' }).getAttribute('href'),
    ).toContain(`url=${esperado}`)
  })

  it('abre fuera sin pasar la página de origen', () => {
    pintar('/cargos/x', { titulo: 'Nombre' })
    for (const nombre of ['Compartir en WhatsApp', 'Compartir en Telegram']) {
      const a = screen.getByRole('link', { name: nombre })
      expect(a.getAttribute('target')).toBe('_blank')
      expect(a.getAttribute('rel')).toBe('noopener noreferrer')
    }
  })

  it('copia el enlace público y lo anuncia; si no puede copiar, no finge', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } })
    pintar('/reportajes/basuras', { titulo: 'Pieza' })
    fireEvent.click(screen.getByRole('button', { name: 'Copiar enlace' }))
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(`${SITIO}/reportajes/basuras`))
    expect(await screen.findByRole('button', { name: 'Enlace copiado' })).toBeTruthy()
    cleanup()

    const falla = vi.fn().mockRejectedValue(new Error('denegado'))
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText: falla } })
    pintar('/reportajes/basuras', { titulo: 'Pieza' })
    fireEvent.click(screen.getByRole('button', { name: 'Copiar enlace' }))
    await waitFor(() => expect(falla).toHaveBeenCalled())
    expect(screen.queryByRole('button', { name: 'Enlace copiado' })).toBeNull()
  })

  it('el menú del sistema sólo aparece donde existe', async () => {
    vi.stubGlobal('navigator', { ...navigator, share: undefined })
    pintar('/plenos/p', { titulo: 'Pleno' })
    expect(screen.queryByRole('button', { name: 'Más opciones' })).toBeNull()
    cleanup()

    const share = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { ...navigator, share })
    pintar('/plenos/p', { titulo: 'Pleno' })
    fireEvent.click(await screen.findByRole('button', { name: 'Más opciones' }))
    await waitFor(() =>
      expect(share).toHaveBeenCalledWith({ title: 'Pleno', url: `${SITIO}/plenos/p` }),
    )
  })
})
